#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
const files = walk(path.join(root, 'sketchup_plugin')).filter(file => file.endsWith('.rb'));
for (const file of files) {
  const result = spawnSync('ruby', ['-c', file], { encoding: 'utf8' });
  if (result.error || result.status !== 0) { console.error(result.error?.message || result.stderr); process.exit(1); }
}
console.log(`Ruby syntax: ${files.length} files passed.`);
for (const file of fs.readdirSync(path.join(root, 'test')).filter(file => file.endsWith('_test.rb'))) {
  const result = spawnSync('ruby', [path.join(root, 'test', file)], { stdio: 'inherit' });
  if (result.error || result.status !== 0) { console.error(result.error?.message || `Failed: ${file}`); process.exit(1); }
}
