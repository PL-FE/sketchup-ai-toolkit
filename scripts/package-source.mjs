#!/usr/bin/env node
// Copyright 2026. Licensed under the Apache License, Version 2.0.
import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT, LEGAL_FILES, readRegistry, isMainModule } from './setup.mjs';
import { storedZip } from './package-plugin.mjs';

const REQUIRED_FILES = ['package.json', 'package-lock.json', ...LEGAL_FILES];
const OPTIONAL_FILES = ['README.md', 'CHANGELOG.md', '.gitignore', '.gitattributes'];
const SOURCE_DIRECTORIES = ['src', 'schema', 'config', 'sketchup_plugin', 'skills', 'docs', 'examples', 'scripts', 'test', 'bin', '.github'];
const EXCLUDED_PARTS = new Set(['node_modules', '.git', '.session', '.cache', 'dist', 'work', 'outputs', 'state', 'runtime', 'queue', 'processing', 'responses', 'coverage']);

function collectSource(directory, relative) {
  return fs.readdirSync(path.join(directory, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    if (EXCLUDED_PARTS.has(entry.name) || entry.name === '.DS_Store' || entry.name.startsWith('.env') || entry.name.endsWith('.log') || entry.name.endsWith('.skp') || entry.name.endsWith('.skb')) return [];
    const name = `${relative}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`Source archive cannot contain symlinks: ${name}`);
    if (entry.isDirectory()) return collectSource(directory, name);
    if (!entry.isFile()) throw new Error(`Unsupported source file: ${name}`);
    return [{ name, data: fs.readFileSync(path.join(directory, name)) }];
  });
}

export function sourceEntries(projectRoot = PROJECT_ROOT) {
  readRegistry(projectRoot);
  const entries = REQUIRED_FILES.map(name => ({ name, data: fs.readFileSync(path.join(projectRoot, name)) }));
  for (const name of OPTIONAL_FILES) {
    if (fs.existsSync(path.join(projectRoot, name))) entries.push({ name, data: fs.readFileSync(path.join(projectRoot, name)) });
  }
  for (const name of SOURCE_DIRECTORIES) {
    if (!fs.existsSync(path.join(projectRoot, name))) continue;
    if (!fs.lstatSync(path.join(projectRoot, name)).isDirectory()) throw new Error(`Expected source directory: ${name}`);
    entries.push(...collectSource(projectRoot, name));
  }
  // The distributed plugin must use the current central registry, even before packaging an RBZ.
  const registry = entries.find(entry => entry.name === 'config/sketchup-versions.json');
  const pluginRegistry = entries.find(entry => entry.name === 'sketchup_plugin/alma_sketchup_mcp/sketchup-versions.json');
  if (pluginRegistry) pluginRegistry.data = registry.data;
  else entries.push({ name: 'sketchup_plugin/alma_sketchup_mcp/sketchup-versions.json', data: registry.data });
  assertLocalImportsIncluded(entries);
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

export function assertLocalImportsIncluded(entries) {
  const included = new Set(entries.map(entry => entry.name));
  const missing = [];
  // Every static local ESM import and literal dynamic import must survive packaging.
  const importPattern = /(?:\b(?:import|export)\s+(?:(?:[^;]*?)\s+from\s*)?|\bimport\s*\(\s*)['"](\.[^'"]+)['"]/g;
  for (const entry of entries.filter(file => /\.[cm]?js$/.test(file.name))) {
    for (const match of entry.data.toString('utf8').matchAll(importPattern)) {
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(entry.name), match[1]));
      if (!included.has(resolved)) missing.push(`${entry.name} -> ${match[1]}`);
    }
  }
  if (missing.length) throw new Error(`Source archive is missing local imports:\n${missing.join('\n')}`);
}

export function packageSource({ projectRoot = PROJECT_ROOT, output } = {}) {
  const entries = sourceEntries(projectRoot).map(entry => ({ ...entry, name: `sketchup-ai-toolkit/${entry.name}` }));
  const archive = storedZip(entries);
  const outputPath = path.resolve(output ?? path.join(projectRoot, 'dist', 'sketchup-ai-toolkit-source.zip'));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, archive);
  return { outputPath, files: entries.length, bytes: archive.length };
}

export function runPackageSource(args, { log = console.log, ...context } = {}) {
  let output;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--help' || args[index] === '-h') {
      log('Usage: node scripts/package-source.mjs [--output PATH]\n\nCreates dist/sketchup-ai-toolkit-source.zip. Includes source, Ruby plugin, docs, skills, examples, tests and licenses. Excludes dependencies, local state, models and build outputs.');
      return null;
    }
    if (args[index] !== '--output') throw new Error(`Unknown argument: ${args[index]}`);
    output = args[++index];
    if (!output || output.startsWith('--')) throw new Error('--output requires a path.');
  }
  const result = packageSource({ ...context, output });
  log(`Created ${result.outputPath} (${result.files} files, ${result.bytes} bytes).`);
  return result;
}

if (isMainModule(import.meta.url)) {
  try { runPackageSource(process.argv.slice(2)); }
  catch (error) { console.error(`Package error: ${error.message}`); process.exitCode = 1; }
}
