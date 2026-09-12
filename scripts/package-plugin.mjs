#!/usr/bin/env node
// Copyright 2026. Licensed under the Apache License, Version 2.0.
import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT, PLUGIN_ENTRIES, LEGAL_FILES, readRegistry, isMainModule } from './setup.mjs';

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
});

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

// RBZ is a standard ZIP archive. Store entries uncompressed to avoid dependencies.
export function storedZip(entries) {
  if (entries.length > 65535) throw new Error('Too many entries for a ZIP32 archive.');
  const localRecords = [];
  const centralRecords = [];
  let offset = 0;
  for (const entry of entries) {
    if (!entry.name || entry.name.startsWith('/') || entry.name.split('/').includes('..') || entry.name.includes('\\')) {
      throw new Error(`Unsafe archive entry: ${entry.name}`);
    }
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.from(entry.data);
    if (name.length > 65535 || data.length > 0xffffffff) throw new Error('ZIP32 entry is too large.');
    const checksum = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6); // UTF-8 filenames.
    header.writeUInt16LE(33, 12); // Reproducible DOS date: 1980-01-01.
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(33, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    localRecords.push(header, name, data);
    centralRecords.push(central, name);
    offset += header.length + name.length + data.length;
    if (offset > 0xffffffff) throw new Error('ZIP32 archive is too large.');
  }
  const centralData = Buffer.concat(centralRecords);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralData.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localRecords, centralData, end]);
}

function collectFiles(directory, relative = '') {
  return fs.readdirSync(path.join(directory, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return collectFiles(directory, name);
    if (!entry.isFile()) throw new Error(`Plugin package contains an unsupported file type: ${name}`);
    return [{ name, data: fs.readFileSync(path.join(directory, name)) }];
  });
}

export function packagePlugin({ projectRoot = PROJECT_ROOT, output } = {}) {
  readRegistry(projectRoot);
  const pluginRoot = path.join(projectRoot, 'sketchup_plugin');
  const moduleDirectory = path.join(pluginRoot, 'alma_sketchup_mcp');
  fs.copyFileSync(path.join(projectRoot, 'config', 'sketchup-versions.json'), path.join(moduleDirectory, 'sketchup-versions.json'));
  const entries = [];
  for (const entry of PLUGIN_ENTRIES) {
    if (fs.lstatSync(path.join(pluginRoot, entry)).isDirectory()) {
      entries.push(...collectFiles(path.join(pluginRoot, entry)).map(file => ({ ...file, name: `${entry}/${file.name}` })));
    } else {
      if (!fs.lstatSync(path.join(pluginRoot, entry)).isFile()) throw new Error(`Unsupported plugin source: ${entry}`);
      entries.push({ name: entry, data: fs.readFileSync(path.join(pluginRoot, entry)) });
    }
  }
  for (const entry of LEGAL_FILES) {
    const name = `alma_sketchup_mcp/${entry}`;
    const existing = entries.findIndex(file => file.name === name);
    if (existing !== -1) entries.splice(existing, 1);
    entries.push({ name, data: fs.readFileSync(path.join(projectRoot, entry)) });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  const outputPath = path.resolve(output ?? path.join(projectRoot, 'dist', 'sketchup-ai-toolkit.rbz'));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const archive = storedZip(entries);
  fs.writeFileSync(outputPath, archive);
  return { outputPath, files: entries.length, bytes: archive.length };
}

export function runPackage(args, { log = console.log, ...context } = {}) {
  let output;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--help' || args[index] === '-h') {
      log('Usage: node scripts/package-plugin.mjs [--output PATH]\n\nCreates dist/sketchup-ai-toolkit.rbz with all registered SketchUp profiles.\nSynchronizes the shared version registry into the Ruby plugin and preserves license notices.');
      return null;
    }
    if (args[index] !== '--output') throw new Error(`Unknown argument: ${args[index]}`);
    output = args[++index];
    if (!output || output.startsWith('--')) throw new Error('--output requires a path.');
  }
  const result = packagePlugin({ ...context, output });
  log(`Created ${result.outputPath} (${result.files} files, ${result.bytes} bytes).`);
  return result;
}

if (isMainModule(import.meta.url)) {
  try { runPackage(process.argv.slice(2)); }
  catch (error) { console.error(`Package error: ${error.message}`); process.exitCode = 1; }
}
