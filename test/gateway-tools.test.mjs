import test from 'node:test';
import assert from 'node:assert/strict';
import { SketchUpBridge, callTool } from '../src/bridge.mjs';
import { ValidatedToolDispatcher } from '../src/validated-tool-dispatcher.mjs';
import { getVersionProfile, versionRegistry } from '../src/sketchup-versions.mjs';

const brief = {
  instruction: 'Review courtyard dimensions before making a model.',
  units: 'm',
  parameters: [
    { name: 'site_width', value: 12, unit: 'm', source: 'user', status: 'confirmed', required: true },
    { name: 'pergola_height', value: 2.8, unit: 'm', source: 'assumed', status: 'pending', required: true }
  ]
};

test('registered version discovery works through the default validated dispatcher', async () => {
  const dispatcher = new ValidatedToolDispatcher();
  const result = await dispatcher.dispatch('get_supported_versions', {});
  assert.deepEqual(result.selected, getVersionProfile());
  assert.deepEqual(result.profiles, versionRegistry.profiles);
  assert.equal(result.host_verification_required, true);
  // An in-process caller must not be able to modify the shared adapter registry.
  result.profiles['2020'].native_pbr = true;
  assert.equal((await dispatcher.dispatch('get_supported_versions', {})).profiles['2020'].native_pbr, false);
});

test('brief preflight works through the same registered dispatcher without host access', async () => {
  const bridge = new SketchUpBridge();
  bridge.selectRuntime = () => { throw new Error('Read-only input preflight must not access SketchUp or mock state.'); };
  const dispatcher = new ValidatedToolDispatcher({ bridge });
  const result = await dispatcher.dispatch('preflight_design_brief', { brief });
  assert.equal(result.ready_for_modeling, false);
  assert.equal(result.consent_verified, false);
  assert.equal(result.assessment_scope, 'declared_parameters_only');
  assert.deepEqual(result.needs_confirmation, [brief.parameters[1]]);
  assert.deepEqual(result, await callTool('preflight_design_brief', { brief }, bridge));
  assert.equal((await dispatcher.dispatch('get_supported_versions')).selected.year, getVersionProfile().year);
});

test('unified dispatch preserves input validation instead of accepting confirmation bypass fields', async () => {
  const dispatcher = new ValidatedToolDispatcher();
  for (const [name, args] of [
    ['preflight_design_brief', { brief, approved: true }],
    ['preflight_design_brief', { brief: { ...brief, parameters: [{ ...brief.parameters[1], status: 'approved' }] } }],
    ['get_supported_versions', { approved: true }]
  ]) {
    await assert.rejects(dispatcher.dispatch(name, args), (error) => error.code === 'INVALID_ARGUMENT');
  }
});
