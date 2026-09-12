import test from 'node:test';
import assert from 'node:assert/strict';
import { preflightDesignBrief, DESIGN_BRIEF_TOOL, DesignBriefValidationError } from '../src/design-brief.mjs';

const parameter = (overrides = {}) => ({ name: 'path_width', value: 1.5, unit: 'm', source: 'user', status: 'confirmed', required: true, ...overrides });
const input = (parameters = [parameter()], overrides = {}) => ({ brief: { instruction: 'Create an editable courtyard concept.', units: 'm', parameters, ...overrides } });
const invalid = (value, pattern) => assert.throws(() => preflightDesignBrief(value), (error) => error instanceof DesignBriefValidationError && error.code === 'INVALID_ARGUMENT' && (!pattern || pattern.test(error.message)));

test('a missing image scale blocks readiness without inventing geometry', () => {
  const brief = input([
    parameter({ name: 'reference_width', value: null, source: 'image', status: 'missing' }),
    parameter({ source: 'assumed', status: 'pending' })
  ], { reference_images: ['courtyard-front.jpg'] });
  const result = preflightDesignBrief(brief);
  assert.equal(result.ready_for_modeling, false);
  assert.deepEqual(result.missing, [brief.brief.parameters[0]]);
  assert.deepEqual(result.needs_confirmation, [brief.brief.parameters[1]]);
  assert.deepEqual(result.proposed_parameters, [brief.brief.parameters[1]]);
  assert.match(result.notes.join(' '), /reliable dimension/);
  assert.equal(result.assessment_scope, 'declared_parameters_only');
});

test('every pending source requires confirmation, including user input', () => {
  for (const source of ['user', 'image', 'derived', 'assumed']) {
    const result = preflightDesignBrief(input([parameter({ source, status: 'pending' })]));
    assert.equal(result.ready_for_modeling, false, source);
    assert.equal(result.needs_confirmation[0].source, source);
    assert.equal(result.needs_confirmation[0].value, 1.5);
  }
});

test('declared confirmation never certifies human consent or design adequacy', () => {
  const result = preflightDesignBrief(input([parameter({ source: 'assumed' })]));
  assert.equal(result.ready_for_modeling, true);
  assert.equal(result.consent_verified, false);
  assert.equal(result.assessment_scope, 'declared_parameters_only');
  assert.match(result.notes.join(' '), /cannot verify human consent/);
  assert.match(result.notes.join(' '), /calling AI must assess/);
});

test('empty parameters cannot claim readiness, and omitted structure fails validation', () => {
  assert.equal(preflightDesignBrief(input([])).ready_for_modeling, false);
  for (const value of [undefined, null, {}, { brief: {} }, { brief: { instruction: 'Build' } }]) invalid(value);
  for (const field of ['instruction', 'units', 'parameters']) {
    const value = input();
    delete value.brief[field];
    invalid(value, /is required/);
  }
});

test('optional unknown parameters stay explicit omissions and gain no default', () => {
  const result = preflightDesignBrief(input([parameter(), parameter({ name: 'backside_detail', value: null, source: 'image', status: 'missing', required: false })]));
  assert.equal(result.ready_for_modeling, true);
  assert.equal(result.missing[0].value, null);
  assert.equal(result.missing[0].required, false);
  assert.deepEqual(result.proposed_parameters.map((item) => item.name), ['path_width']);
  assert.match(result.notes.join(' '), /explicit omissions/);
});

test('optional proposed values still require confirmation', () => {
  const result = preflightDesignBrief(input([parameter(), parameter({ name: 'pergola_height', required: false, source: 'derived', status: 'pending' })]));
  assert.equal(result.ready_for_modeling, false);
  assert.equal(result.needs_confirmation.length, 1);
});

test('all-optional unknowns have no readiness: at least one usable parameter is needed', () => {
  const result = preflightDesignBrief(input([parameter({ required: false, value: null, status: 'missing' })]));
  assert.equal(result.ready_for_modeling, false);
});

test('numeric zero, booleans, and flat vectors survive unchanged without conversion', () => {
  const params = [parameter({ name: 'height', value: 0 }), parameter({ name: 'use_roof', value: false, unit: 'boolean' }), parameter({ name: 'origin', value: [1.25, -2, 0] })];
  for (const units of ['mm', 'cm', 'm', 'in', 'ft']) {
    const result = preflightDesignBrief(input(params, { units }));
    assert.equal(result.units, units);
    assert.deepEqual(result.proposed_parameters, params);
    assert.equal(result.ready_for_modeling, true);
  }
});

test('unknown fields and tampered statuses or sources fail closed', () => {
  invalid({ ...input(), approved: true }, /unknown field/);
  invalid(input([parameter({ approved: true })]), /unknown field/);
  invalid(input([], { approved: true }), /unknown field/);
  for (const status of ['approved', 'CONFIRMED', '', null, 1]) invalid(input([parameter({ status })]));
  for (const source of ['ai', 'measured', null]) invalid(input([parameter({ source })]));
  invalid(input([parameter({ required: 'true' })]));
});

test('missing data uses null, and proposed values cannot be blank or nested', () => {
  for (const value of [null, undefined, '', ' \n\t', [], {}, [1, null], [1, ' '], [[1, 2]], [false, {}], NaN, Infinity, -Infinity, [NaN]]) {
    invalid(input([parameter({ value })]));
  }
  for (const value of [1.5, '', [], false]) invalid(input([parameter({ status: 'missing', value })]), /must be null/);
});

test('units, names, and context have explicit bounds and cannot be blank', () => {
  invalid(input([], { units: 'meters' }));
  invalid(input([], { instruction: ' ' }));
  invalid(input([parameter({ unit: ' ' })]));
  invalid(input([parameter({ name: ' ' })]));
  invalid(input([parameter({ name: 'a'.repeat(129) })]));
  invalid(input([], { constraints: [''] }));
  invalid(input([], { reference_images: [' '] }));
  invalid(input(Array.from({ length: 129 }, (_, index) => parameter({ name: `p${index}` }))));
  invalid(input([parameter({ value: Array(65).fill(1) })]));
  invalid(input([], { reference_images: Array(21).fill('a.png') }));
});

test('duplicate names cannot present conflicting measurements as independent inputs', () => {
  for (const name of ['path_width', ' PATH_WIDTH ', 'ｐａｔｈ＿ｗｉｄｔｈ']) invalid(input([parameter(), parameter({ name, value: 3 })]), /must be unique/);
});

test('total size limit prevents maximal field packing', () => {
  invalid(input(Array.from({ length: 5 }, (_, index) => parameter({ name: `p${index}`, value: Array(64).fill('中'.repeat(2048)) }))), /256 KiB/);
});

test('preflight is deterministic, does not mutate input, and returns detached arrays', () => {
  const brief = input([parameter({ value: [1, 2, 3], status: 'pending' })], { reference_images: ['a.jpg'], constraints: ['Retain the existing tree.'] });
  const original = structuredClone(brief);
  const first = preflightDesignBrief(brief);
  assert.deepEqual(first, preflightDesignBrief(brief));
  first.proposed_parameters[0].value[0] = 999;
  first.reference_images.push('b.jpg');
  first.constraints[0] = 'Changed';
  assert.deepEqual(brief, original);
  assert.equal(first.needs_confirmation[0].value[0], 1);
});

test('MCP tool is explicitly read-only with closed input objects and no defaults', () => {
  assert.equal(DESIGN_BRIEF_TOOL.name, 'preflight_design_brief');
  assert.equal(DESIGN_BRIEF_TOOL.annotations.readOnlyHint, true);
  const schema = DESIGN_BRIEF_TOOL.inputSchema;
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.brief.additionalProperties, false);
  assert.equal(schema.properties.brief.properties.parameters.items.additionalProperties, false);
  assert.equal(JSON.stringify(schema).includes('"default":'), false);
});
