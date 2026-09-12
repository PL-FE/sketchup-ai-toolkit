#!/usr/bin/env node
import fs from 'node:fs';
import { getVersionProfile } from '../src/sketchup-versions.mjs';
const args = process.argv.slice(2);
let live = false;
try {
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--year') { const value = args[++i]; if (!value) throw new Error('--year requires a value.'); const profile = getVersionProfile(value); process.env.ALMA_SKETCHUP_YEAR = String(profile.year); }
    else if (args[i] === '--live') live = true;
    else if (args[i] === '--help') { console.log('Usage: node scripts/doctor.mjs [--year 2020|2026] [--live]\nDefault: local dependencies and paths. --live: read-only host handshake, up to 5 seconds.'); process.exit(0); }
    else throw new Error(`Unknown argument: ${args[i]}`);
  }
  const profile = getVersionProfile();
  const { defaultStateDir, defaultQueueDir } = await import('../src/paths.mjs');
  const report = { node: process.version, node_supported: Number(process.versions.node.split('.')[0]) === 24, platform: process.platform, year_profile: profile, state_dir: defaultStateDir, queue_dir: defaultQueueDir, queue_exists: fs.existsSync(defaultQueueDir), dependencies: {}, host: { checked: false } };
  for (const name of ['ajv', 'acorn', 'sharp']) {
    try { await import(name); report.dependencies[name] = 'ok'; }
    catch (error) { report.dependencies[name] = error.message; }
  }
  if (live) {
    try {
      const { QueueRuntime } = await import('../src/queue-runtime.mjs');
      const result = await new QueueRuntime({ timeoutMs: 5000 }).getCapabilities();
      report.host = { checked: true, connected: true, plugin: result.plugin, year_profile: result.year_profile };
    } catch (error) { report.host = { checked: true, connected: false, error: error.message, next_step: 'Open the selected SketchUp year; enable or start Alma SketchUp MCP. Check installation and file access.' }; }
  }
  report.ok = report.node_supported && Object.values(report.dependencies).every(value => value === 'ok') && (!live || report.host.connected);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
