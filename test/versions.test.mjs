import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getVersionProfile, stateDirectoryForYear, VERSION_TRANSPORT } from '../src/sketchup-versions.mjs';
import { QueueRuntime } from '../src/queue-runtime.mjs';

test('registered profiles isolate state and reject unregistered years', () => {
  assert.equal(getVersionProfile(2020).native_pbr, false);
  assert.equal(getVersionProfile(2026).native_pbr, true);
  assert.notEqual(stateDirectoryForYear(2020), stateDirectoryForYear(2026));
  assert.throws(() => getVersionProfile(2024), /Unsupported/);
  assert.throws(() => getVersionProfile('../2020'), /Unsupported/);
  assert.throws(() => getVersionProfile(2020, { schema_version: 1, profiles: { 2020: { sketchup_major: 26 } } }), /invalid/);
});

test('queue capabilities exclude newer native environment API for 2020', () => {
  const moduleUrl = new URL('../src/capabilities.mjs', import.meta.url).href;
  for (const year of [2020, 2026]) {
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `import {getRuntimeCapabilities} from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify(getRuntimeCapabilities('queue')));`], { env: { ...process.env, ALMA_SKETCHUP_YEAR: String(year) }, encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
    const result = JSON.parse(child.stdout);
    assert.equal(result.year_profile.year, year);
    assert.equal(result.supported_operations.includes('environment_activate'), year === 2026);
    assert(result.supported_operations.includes('box'));
  }
});

async function fakeHost(t, { year = 2020, envelope = true } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sketchup-queue-test-'));
  const queueDir = path.join(root, 'queue');
  const responseDir = path.join(root, 'responses');
  await fs.mkdir(queueDir); await fs.mkdir(responseDir);
  let active = true;
  const requests = [];
  const loop = (async () => {
    while (active) {
      for (const name of await fs.readdir(queueDir)) {
        if (!name.endsWith('.json')) continue;
        let request;
        try { request = JSON.parse(await fs.readFile(path.join(queueDir, name), 'utf8')); }
        catch { continue; }
        requests.push(request);
        await fs.unlink(path.join(queueDir, name));
        const reply = { result: { kind: 'test_result', year }, ...(envelope ? { bridge: { protocol: VERSION_TRANSPORT, year } } : {}) };
        const temporary = path.join(responseDir, `${name}.tmp`);
        await fs.writeFile(temporary, JSON.stringify(reply));
        await fs.rename(temporary, path.join(responseDir, name));
      }
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  })();
  t.after(async () => { active = false; await loop; await fs.rm(root, { recursive: true, force: true }); });
  return { requests, runtime: new QueueRuntime({ targetYear: 2020, queueDir, responseDir, pollIntervalMs: 10, timeoutMs: 1500 }), root };
}

test('versioned queue request reaches matching host and cleans transport files', async t => {
  const { runtime, requests, root } = await fakeHost(t);
  assert.equal((await runtime.getCapabilities()).year, 2020);
  assert.equal(requests[0].target_year, 2020);
  assert.equal(requests[0].transport_version, VERSION_TRANSPORT);
  assert.deepEqual(await fs.readdir(path.join(root, 'responses')), []);
  assert.equal((await runtime.diagnostics()).target_year, 2020);
});

for (const config of [{ year: 2026 }, { envelope: false }]) {
  test(`wrong or legacy bridge cannot receive a mutating command: ${JSON.stringify(config)}`, async t => {
    const { runtime, requests } = await fakeHost(t, config);
    await assert.rejects(runtime.resetModel(), { code: 'SKETCHUP_YEAR_MISMATCH' });
    assert.deepEqual(requests.map(request => request.method), ['get_capabilities']);
  });
}

test('version probe preserves the session guard for the Ruby host to verify', async t => {
  const { runtime, requests } = await fakeHost(t);
  const guard = { session_id: 'session-test', document_id: 'document-test', model_revision: 'revision-test', model_modified: false };
  await runtime.withMutationGuard(guard, () => runtime.resetModel());
  assert.deepEqual(requests.map(request => request.method), ['get_capabilities', 'reset_model']);
  assert.deepEqual(requests[1].params._session_guard, guard);
});
