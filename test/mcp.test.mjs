import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

test('real MCP stdio: discovery, input preflight, mock courtyard and live guard', { timeout: 30000 }, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sketchup-mcp-smoke-'));
  const server = fileURLToPath(new URL('../src/mcp-server.mjs', import.meta.url));
  const child = spawn(process.execPath, [server], { env: { ...process.env, ALMA_SKETCHUP_YEAR: '2020', ALMA_SKETCHUP_STATE_DIR: root, ALMA_SKETCHUP_AGENT_ALLOWED_RUNTIMES: 'mock,queue', ALMA_SKETCHUP_AGENT_ALLOW_QUEUE_MUTATION: '1' }, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '', id = 0;
  const pending = new Map();
  child.stderr.on('data', chunk => { stderr += chunk; });
  const lines = readline.createInterface({ input: child.stdout });
  lines.on('line', line => {
    const response = JSON.parse(line);
    const waiting = pending.get(response.id);
    if (waiting) { pending.delete(response.id); clearTimeout(waiting.timer); waiting.resolve(response); }
  });
  const ended = new Promise(resolve => child.once('exit', resolve));
  t.after(async () => {
    child.kill(); await ended; lines.close();
    for (const wait of pending.values()) clearTimeout(wait.timer);
    await fs.rm(root, { recursive: true, force: true });
  });
  function request(method, params) {
    const requestId = ++id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`MCP timed out: ${method}\n${stderr}`)), 10000);
      pending.set(requestId, { resolve, timer });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params })}\n`);
    });
  }
  const call = (name, args = {}) => request('tools/call', { name, arguments: args });
  const initial = await request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'acceptance-test', version: '1' } });
  assert.equal(initial.result.serverInfo.name, 'sketchup-ai-toolkit');
  assert.deepEqual((await request('ping')).result, {});
  const tools = (await request('tools/list')).result.tools;
  assert(tools.some(tool => tool.name === 'preflight_design_brief'));
  assert(tools.some(tool => tool.name === 'get_supported_versions'));
  assert.equal((await call('get_supported_versions')).result.structuredContent.selected.year, 2020);
  const parameters = [{ name: 'width', value: 12, unit: 'm', required: true, source: 'assumed', status: 'pending' }];
  let result = await call('preflight_design_brief', { brief: { instruction: '建庭院', units: 'm', parameters } });
  assert.equal(result.result.structuredContent.ready_for_modeling, false);
  assert.equal(result.result.structuredContent.needs_confirmation.length, 1);
  assert.equal(result.result.structuredContent.consent_verified, false);
  result = await call('preflight_design_brief', { brief: { instruction: 'x', units: 'm', parameters }, approved: true });
  assert.equal(result.error.data.code, 'INVALID_ARGUMENT');
  const code = await fs.readFile(new URL('../examples/courtyard.dsl.json', import.meta.url), 'utf8');
  result = await call('build_model', { code, runtime: 'mock' });
  assert(!result.error, JSON.stringify(result.error));
  const snapshot = result.result.structuredContent.snapshot;
  assert(snapshot.groups.length >= 20);
  assert.equal(snapshot.groups.find(group => group.name === 'courtyard_path').bounding_box.d, 1500);
  const info = await call('get_model_info', { runtime: 'mock' });
  assert(!info.error, JSON.stringify(info.error));
  const guard = await call('build_model', { code, runtime: 'queue' });
  assert(guard.error, 'Live build must not run without session authorization');
  const diagnostics = await call('queue_diagnostics');
  assert.equal(diagnostics.result.structuredContent.queue.count, 0);
  const discovered = await call('start_agent_task', { intent: 'discover', instruction: 'Discover modeling workflow', inputs: { topic: 'start' } });
  assert(!discovered.error, JSON.stringify(discovered.error));
  const resetMock = await call('reset_model', { runtime: 'mock' });
  assert(!resetMock.error, JSON.stringify(resetMock.error));
  const createArgs = { intent: 'create_model', instruction: 'Offline courtyard smoke test', inputs: { code, runtime: 'mock' }, idempotency_key: 'courtyard-smoke-once' };
  const created = await call('start_agent_task', createArgs);
  assert(!created.error, JSON.stringify(created.error));
  const createdTask = created.result.structuredContent;
  assert(createdTask.task_id, JSON.stringify(createdTask));
  assert.equal(createdTask.ok, true, JSON.stringify(createdTask.error));
  const replay = (await call('start_agent_task', createArgs)).result.structuredContent;
  assert.equal(replay.task_id, createdTask.task_id, 'Stable key must recover the original task');
  assert.equal(replay.idempotent_replay, true);
  const resumed = await call('resume_agent_task', { task_id: createdTask.task_id });
  assert(!resumed.error, JSON.stringify(resumed.error));
  assert.equal(resumed.result.structuredContent.task_id, createdTask.task_id);
  const afterGateway = (await call('inspect_model', { runtime: 'mock', includeSnapshot: true })).result.structuredContent;
  assert.equal(afterGateway.snapshot.groups.length, snapshot.groups.length, 'Gateway adds once; replay and resume must not duplicate geometry');
  assert.equal(stderr, '');
});
