// Read-only input preflight. It does not inspect images, infer dimensions, or grant consent.
const UNITS = ['mm', 'cm', 'm', 'in', 'ft'];
const SOURCES = ['user', 'image', 'derived', 'assumed'];
const STATUSES = ['confirmed', 'pending', 'missing'];
const textSchema = (maxLength) => ({ type: 'string', minLength: 1, maxLength, pattern: '\\S' });
const scalarSchema = { anyOf: [{ type: 'number' }, { type: 'boolean' }, textSchema(2048)] };

export const DESIGN_BRIEF_TOOL = {
  name: 'preflight_design_brief',
  description: 'Check declared design parameters before modeling. Report missing values and unconfirmed image-derived or assumed data without inventing defaults. This read-only tool cannot establish design completeness or verify human consent; confirmed means declared confirmed only. It does not inspect reference images or authorize a model mutation.',
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: {
    type: 'object', additionalProperties: false, required: ['brief'],
    properties: {
      brief: {
        type: 'object', additionalProperties: false, required: ['instruction', 'units', 'parameters'],
        properties: {
          instruction: textSchema(10000),
          units: { type: 'string', enum: UNITS, description: 'Explicit design length units; no scale or unit conversion is inferred. Geometry DSL must separately be converted to millimeters.' },
          parameters: {
            type: 'array', maxItems: 128,
            items: {
              type: 'object', additionalProperties: false,
              required: ['name', 'value', 'source', 'status', 'required'],
              properties: {
                name: textSchema(128),
                value: { anyOf: [...scalarSchema.anyOf, { type: 'null' }, { type: 'array', minItems: 1, maxItems: 64, items: scalarSchema }] },
                unit: textSchema(32),
                source: { type: 'string', enum: SOURCES },
                status: { type: 'string', enum: STATUSES },
                required: { type: 'boolean' },
                notes: textSchema(2000)
              },
              allOf: [{
                if: { properties: { status: { const: 'missing' } }, required: ['status'] },
                then: { properties: { value: { type: 'null' } } },
                else: { properties: { value: { not: { type: 'null' } } } }
              }]
            }
          },
          reference_images: { type: 'array', maxItems: 20, items: textSchema(2048), description: 'Reference identifiers only. Never opened or analyzed by this tool.' },
          constraints: { type: 'array', maxItems: 64, items: textSchema(2000) }
        }
      }
    }
  }
};

export class DesignBriefValidationError extends TypeError {
  constructor(path, message) {
    super(`${path || '/'}: ${message}`);
    this.name = 'DesignBriefValidationError';
    this.code = 'INVALID_ARGUMENT';
    this.details = { issues: [{ path, message }] };
  }
}

/**
 * Validate structural and declared readiness only. The calling AI must check the
 * actual conversation for confirmation and assess missing design requirements.
 * Numeric values and unit labels are preserved exactly, including 0 and false.
 */
export function preflightDesignBrief(input) {
  validateObject(input, '', ['brief'], ['brief']);
  const brief = input.brief;
  validateObject(brief, '/brief', ['instruction', 'units', 'parameters', 'reference_images', 'constraints'], ['instruction', 'units', 'parameters']);
  validateText(brief.instruction, '/brief/instruction', 10000);
  validateEnum(brief.units, '/brief/units', UNITS);
  validateArray(brief.parameters, '/brief/parameters', 128);
  const names = new Set();
  for (const [index, parameter] of brief.parameters.entries()) {
    const path = `/brief/parameters/${index}`;
    validateObject(parameter, path, ['name', 'value', 'unit', 'source', 'status', 'required', 'notes'], ['name', 'value', 'source', 'status', 'required']);
    validateText(parameter.name, `${path}/name`, 128);
    const canonicalName = parameter.name.trim().normalize('NFKC').toLowerCase();
    if (names.has(canonicalName)) fail(`${path}/name`, 'must be unique (ignoring case, outer whitespace, and Unicode presentation variants)');
    names.add(canonicalName);
    validateEnum(parameter.source, `${path}/source`, SOURCES);
    validateEnum(parameter.status, `${path}/status`, STATUSES);
    if (typeof parameter.required !== 'boolean') fail(`${path}/required`, 'must be a boolean');
    if (Object.hasOwn(parameter, 'unit')) validateText(parameter.unit, `${path}/unit`, 32);
    if (Object.hasOwn(parameter, 'notes')) validateText(parameter.notes, `${path}/notes`, 2000);
    if (parameter.status === 'missing') {
      if (parameter.value !== null) fail(`${path}/value`, 'must be null when status is missing; do not include an unstated default');
    } else if (Array.isArray(parameter.value)) {
      validateArray(parameter.value, `${path}/value`, 64, 1);
      for (const [valueIndex, value] of parameter.value.entries()) validateScalar(value, `${path}/value/${valueIndex}`);
    } else {
      validateScalar(parameter.value, `${path}/value`);
    }
  }
  for (const [field, maxItems, maxLength] of [['reference_images', 20, 2048], ['constraints', 64, 2000]]) {
    if (!Object.hasOwn(brief, field)) continue;
    validateArray(brief[field], `/brief/${field}`, maxItems);
    for (const [index, value] of brief[field].entries()) validateText(value, `/brief/${field}/${index}`, maxLength);
  }
  // Individual field limits above are also enforced by the MCP JSON Schema.
  // A total limit prevents clients packing every bounded field to its maximum.
  if (new TextEncoder().encode(JSON.stringify(input)).length > 262144) fail('', 'brief exceeds the 256 KiB serialized UTF-8 limit');

  const copy = (parameter) => ({ ...parameter, value: Array.isArray(parameter.value) ? [...parameter.value] : parameter.value });
  const missing = brief.parameters.filter((parameter) => parameter.status === 'missing').map(copy);
  const needsConfirmation = brief.parameters.filter((parameter) => parameter.status === 'pending').map(copy);
  const proposedParameters = brief.parameters.filter((parameter) => parameter.status !== 'missing').map(copy);
  const notes = [
    'Readiness applies to declared_parameters_only. The calling AI must assess whether instruction, dimensions, scale, elevations, hidden geometry, and intended accuracy are sufficiently specified.',
    'Confirmed status records a declaration only. This tool cannot verify human consent or approve model changes. The calling AI must check actual user confirmation for image-derived, calculated, or assumed values.',
    'No defaults, dimensions, reference scale, unit conversion, or missing geometry have been inferred. Per-parameter unit labels are preserved; the design length unit does not establish a photo scale.',
    'Reference images and constraints are recorded as context only, without image analysis or constraint validation.'
  ];
  if (proposedParameters.length === 0) notes.push('At least one explicit design parameter with a value is needed; an instruction alone or only unknown optional values cannot establish declared readiness.');
  if (missing.some((parameter) => !parameter.required)) notes.push('Optional missing parameters are explicit omissions. They have no generated value and do not block declared readiness.');
  if (brief.reference_images?.length) notes.push('For image-based modeling, establish at least one reliable dimension or explicitly review a proposed concept scale. Single-image dimensions and hidden geometry are not verified by this tool.');

  return {
    ready_for_modeling: proposedParameters.length > 0 && !missing.some((parameter) => parameter.required) && needsConfirmation.length === 0,
    assessment_scope: 'declared_parameters_only',
    consent_verified: false,
    instruction: brief.instruction,
    units: brief.units,
    missing,
    needs_confirmation: needsConfirmation,
    proposed_parameters: proposedParameters,
    reference_images: [...(brief.reference_images || [])],
    constraints: [...(brief.constraints || [])],
    notes
  };
}

function fail(path, message) { throw new DesignBriefValidationError(path, message); }

function validateObject(value, path, allowed, required) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(path, 'must be a plain object');
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`${path}/${key}`, 'unknown field');
  for (const key of required) if (!Object.hasOwn(value, key)) fail(`${path}/${key}`, 'is required');
}

function validateText(value, path, maxLength) {
  if (typeof value !== 'string' || !value.trim()) fail(path, 'must be a nonblank string');
  if ([...value].length > maxLength) fail(path, `must contain at most ${maxLength} characters`);
}

function validateEnum(value, path, allowed) {
  if (!allowed.includes(value)) fail(path, `must be one of: ${allowed.join(', ')}`);
}

function validateArray(value, path, maxItems, minItems = 0) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) fail(path, `must be an array containing ${minItems} to ${maxItems} items`);
}

function validateScalar(value, path) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(path, 'must be a finite number');
    return;
  }
  if (typeof value === 'boolean') return;
  if (typeof value === 'string') return validateText(value, path, 2048);
  fail(path, 'must be a finite number, nonblank string, or boolean; use status missing and value null for unknown data. Nested values are not supported');
}
