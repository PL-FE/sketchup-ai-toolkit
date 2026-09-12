#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
let count = 0;
for (const directory of ['src', 'scripts']) {
  for (const file of walk(path.join(root, directory)).filter(file => file.endsWith('.mjs'))) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`${file}: ${result.stderr}`);
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?:from\s+|import\s*\(\s*)['"](\.[^'"]+)['"]/g)) {
      if (!fs.existsSync(path.resolve(path.dirname(file), match[1]))) throw new Error(`Missing relative import in ${file}: ${match[1]}`);
    }
    count += 1;
  }
}
const plugin = path.join(root, 'sketchup_plugin', 'alma_sketchup_mcp');
const manifest = fs.readFileSync(path.join(plugin, 'runtime_source_manifest.rb'), 'utf8');
for (const [file, key] of [['boolean_operations.rb', 'BOOLEAN_OPERATIONS_SHA256'], ['model_revision.rb', 'MODEL_REVISION_SHA256']]) {
  const actual = createHash('sha256').update(fs.readFileSync(path.join(plugin, file))).digest('hex');
  const declared = manifest.match(new RegExp(`${key}\\s*=\\s*'([0-9a-f]{64})'`))?.[1];
  if (actual !== declared) throw new Error(`Runtime source attestation mismatch: ${file}`);
}
const registry = fs.readFileSync(path.join(root, 'config', 'sketchup-versions.json'), 'utf8');
if (registry !== fs.readFileSync(path.join(plugin, 'sketchup-versions.json'), 'utf8')) throw new Error('Plugin year registry needs synchronization from config/sketchup-versions.json.');
console.log(`Checked ${count} JavaScript modules, relative imports, runtime source hashes and year registry synchronization.`);
