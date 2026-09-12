#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
const files = walk(path.join(root, 'sketchup_plugin')).filter(file => file.endsWith('.rb'));
function fail(file, result) {
  const message = result.error?.message || result.stderr?.trim() || result.stdout?.trim() || `Failed: ${file}`;
  console.error(message);
  if (process.env.GITHUB_ACTIONS === 'true') {
    const escaped = message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
    console.error(`::error file=${path.relative(root, file).split(path.sep).join('/')},title=Ruby compatibility check::${escaped}`);
  }
  process.exit(1);
}
for (const file of files) {
  const result = spawnSync('ruby', ['-c', file], { encoding: 'utf8' });
  if (result.error || result.status !== 0) fail(file, result);
}
console.log(`Ruby syntax: ${files.length} files passed.`);
for (const file of fs.readdirSync(path.join(root, 'test')).filter(file => file.endsWith('_test.rb'))) {
  const absoluteFile = path.join(root, 'test', file);
  const result = spawnSync('ruby', [absoluteFile], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.error || result.status !== 0) fail(absoluteFile, result);
  if (result.stderr) process.stderr.write(result.stderr);
}
