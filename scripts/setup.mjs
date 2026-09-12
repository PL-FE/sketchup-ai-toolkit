#!/usr/bin/env node
// Copyright 2026. Licensed under the Apache License, Version 2.0.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PLUGIN_ENTRIES = ['alma_sketchup_mcp.rb', 'alma_sketchup_mcp'];
export const LEGAL_FILES = ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md'];

export function isMainModule(moduleUrl) {
  if (!process.argv[1]) return false;
  try { return moduleUrl === pathToFileURL(fs.realpathSync(process.argv[1])).href; }
  catch { return false; }
}

export function readRegistry(projectRoot = PROJECT_ROOT) {
  const registry = JSON.parse(fs.readFileSync(path.join(projectRoot, 'config', 'sketchup-versions.json'), 'utf8'));
  if (registry.schema_version !== 1 || !registry.profiles || Array.isArray(registry.profiles)) {
    throw new Error('Invalid config/sketchup-versions.json: expected schema_version 1 and profiles.');
  }
  return registry;
}

export function validateYear(year, registry) {
  const value = String(year ?? '');
  if (!/^20\d{2}$/.test(value) || !Object.hasOwn(registry.profiles, value)) {
    throw new Error(`Unsupported SketchUp year ${JSON.stringify(value)}. Available years: ${Object.keys(registry.profiles).join(', ')}.`);
  }
  return value;
}

export function pluginsDirectory(year, { platform = process.platform, homeDirectory = os.homedir(), env = process.env } = {}) {
  if (!/^20\d{2}$/.test(String(year))) throw new Error('SketchUp year must contain four digits.');
  if (platform === 'darwin') {
    return path.posix.join(homeDirectory, 'Library', 'Application Support', `SketchUp ${year}`, 'SketchUp', 'Plugins');
  }
  if (platform === 'win32') {
    if (!env.APPDATA) throw new Error('APPDATA is unavailable. Supply --plugins-dir with the SketchUp Plugins directory.');
    return path.win32.join(env.APPDATA, 'SketchUp', `SketchUp ${year}`, 'SketchUp', 'Plugins');
  }
  throw new Error(`Automatic SketchUp installation is supported on Windows and macOS; received ${platform}. Supply --plugins-dir for a custom destination.`);
}

export function mcpConfiguration(year, { projectRoot = PROJECT_ROOT, executable = process.execPath } = {}) {
  const name = `sketchup-${year}`;
  const server = {
    command: executable,
    args: [path.resolve(projectRoot, 'src', 'mcp-server.mjs')],
    env: {
      ALMA_SKETCHUP_YEAR: String(year),
      ALMA_SKETCHUP_AGENT_ALLOWED_RUNTIMES: 'mock,queue',
      ALMA_SKETCHUP_AGENT_ALLOW_QUEUE_MUTATION: '1',
    },
  };
  const toml = [
    `[mcp_servers.${name}]`,
    `command = ${JSON.stringify(server.command)}`,
    `args = ${JSON.stringify(server.args)}`,
    '',
    `[mcp_servers.${name}.env]`,
    ...Object.entries(server.env).map(([key, value]) => `${key} = ${JSON.stringify(value)}`),
  ].join('\n');
  return { json: { mcpServers: { [name]: server } }, toml };
}

function exists(file) {
  try { fs.lstatSync(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

export function createSetupPlan(options, context = {}) {
  const projectRoot = path.resolve(context.projectRoot ?? PROJECT_ROOT);
  const registry = readRegistry(projectRoot);
  const year = validateYear(options.year, registry);
  const customDirectory = options.pluginsDir !== undefined;
  const destination = customDirectory ? path.resolve(options.pluginsDir) : pluginsDirectory(year, context);
  if (!customDirectory && !fs.existsSync(destination)) {
    throw new Error(`SketchUp ${year} Plugins directory does not exist: ${destination}. Launch that SketchUp version once, or supply an explicit --plugins-dir.`);
  }
  if (fs.existsSync(destination) && !fs.statSync(destination).isDirectory()) {
    throw new Error(`Plugins destination is not a directory: ${destination}`);
  }
  for (const entry of PLUGIN_ENTRIES) {
    if (!fs.existsSync(path.join(projectRoot, 'sketchup_plugin', entry))) {
      throw new Error(`Plugin source is missing: sketchup_plugin/${entry}`);
    }
  }
  for (const entry of LEGAL_FILES) {
    if (!fs.existsSync(path.join(projectRoot, entry))) throw new Error(`Required license notice is missing: ${entry}`);
  }
  return {
    year,
    profile: registry.profiles[year],
    projectRoot,
    destination,
    stateDirectory: path.join(context.homeDirectory ?? os.homedir(), '.sketchup-mcp', 'versions', year),
    entries: [...PLUGIN_ENTRIES],
    collisions: PLUGIN_ENTRIES.filter(entry => exists(path.join(destination, entry))),
    configurations: mcpConfiguration(year, { projectRoot, executable: context.executable }),
  };
}

export function installPlugin(plan) {
  fs.mkdirSync(plan.destination, { recursive: true });
  const staging = fs.mkdtempSync(path.join(plan.destination, '.alma-sketchup-mcp-staging-'));
  let backupDirectory = null;
  let replacementStarted = false;
  const collisions = PLUGIN_ENTRIES.filter(entry => exists(path.join(plan.destination, entry)));
  try {
    for (const entry of PLUGIN_ENTRIES) {
      fs.cpSync(path.join(plan.projectRoot, 'sketchup_plugin', entry), path.join(staging, entry), { recursive: true });
    }
    const moduleDirectory = path.join(staging, 'alma_sketchup_mcp');
    fs.copyFileSync(path.join(plan.projectRoot, 'config', 'sketchup-versions.json'), path.join(moduleDirectory, 'sketchup-versions.json'));
    for (const entry of LEGAL_FILES) fs.copyFileSync(path.join(plan.projectRoot, entry), path.join(moduleDirectory, entry));
    if (collisions.length) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      backupDirectory = path.join(plan.destination, `.alma-sketchup-mcp-backup-${stamp}-${crypto.randomBytes(4).toString('hex')}`);
      fs.mkdirSync(backupDirectory);
      for (const entry of collisions) fs.cpSync(path.join(plan.destination, entry), path.join(backupDirectory, entry), { recursive: true });
    }
    replacementStarted = true;
    for (const entry of PLUGIN_ENTRIES) {
      fs.rmSync(path.join(plan.destination, entry), { recursive: true, force: true });
      fs.renameSync(path.join(staging, entry), path.join(plan.destination, entry));
    }
    return { destination: plan.destination, backupDirectory };
  } catch (error) {
    if (replacementStarted) {
      try {
        for (const entry of PLUGIN_ENTRIES) fs.rmSync(path.join(plan.destination, entry), { recursive: true, force: true });
        for (const entry of collisions) fs.cpSync(path.join(backupDirectory, entry), path.join(plan.destination, entry), { recursive: true });
      } catch (restoreError) {
        throw new Error(`Installation failed: ${error.message}. Automatic restore failed: ${restoreError.message}. Original files are in ${backupDirectory}.`, { cause: error });
      }
    }
    throw new Error(`Installation failed: ${error.message}${backupDirectory ? `. Backup: ${backupDirectory}` : ''}`, { cause: error });
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

export function parseArguments(args) {
  const options = { install: false };
  let mode;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--year' || argument === '--plugins-dir' || argument === '--format') {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`);
      options[argument === '--year' ? 'year' : argument === '--format' ? 'format' : 'pluginsDir'] = value;
    } else if (argument === '--config-only') {
      options.configOnly = true;
    } else if (argument === '--install' || argument === '--dry-run') {
      if (mode && mode !== argument) throw new Error('Use either --install or --dry-run.');
      mode = argument;
      options.install = argument === '--install';
    } else throw new Error(`Unknown argument: ${argument}. Run --help for usage.`);
  }
  if (!options.help && !options.year) throw new Error('--year is required. Run --help for usage.');
  if (options.configOnly && (options.install || options.pluginsDir !== undefined)) throw new Error('--config-only cannot be combined with --install or --plugins-dir.');
  if (options.format && !['json', 'toml'].includes(options.format)) throw new Error('--format must be json or toml.');
  if (options.format && !options.configOnly) throw new Error('--format requires --config-only.');
  return options;
}

export const HELP = `Usage: node scripts/setup.mjs --year YEAR [--dry-run | --install] [--plugins-dir PATH]
       node scripts/setup.mjs --year YEAR --config-only [--format json|toml]

  --year YEAR         Select a year registered in config/sketchup-versions.json.
  --dry-run           Print the installation plan and MCP configurations (default).
  --install           Copy the plugin; back up existing plugin files before replacement.
  --plugins-dir PATH  Explicit destination, including a directory not created yet.
  --config-only       Print MCP configurations without requiring SketchUp or changing files.
  --format json|toml  With --config-only, emit only the selected configuration format.
  --help, -h          Show this help.

Default Plugins locations:
  Windows: %APPDATA%\\SketchUp\\SketchUp YEAR\\SketchUp\\Plugins
  macOS:   ~/Library/Application Support/SketchUp YEAR/SketchUp/Plugins

Close the target SketchUp application before --install and reopen it afterwards.
The bridge starts automatically by default. If auto-start is disabled, use
Extensions / Alma SketchUp MCP / Start Bridge.
The generated client configuration uses this Node executable and this source folder.
MCP client configuration files are never edited automatically.
`;

export function runSetup(args, { log = console.log, ...context } = {}) {
  const options = parseArguments(args);
  if (options.help) { log(HELP); return null; }
  if (options.configOnly) {
    const projectRoot = path.resolve(context.projectRoot ?? PROJECT_ROOT);
    const year = validateYear(options.year, readRegistry(projectRoot));
    const configurations = mcpConfiguration(year, { projectRoot, executable: context.executable });
    if (options.format === 'json') log(JSON.stringify(configurations.json, null, 2));
    else if (options.format === 'toml') log(configurations.toml);
    else {
      log(`MCP JSON configuration:\n${JSON.stringify(configurations.json, null, 2)}`);
      log(`\nCodex TOML configuration:\n${configurations.toml}`);
    }
    return { plan: null, installation: null, configurations };
  }
  const plan = createSetupPlan(options, context);
  log(`${options.install ? 'Install' : 'DRY RUN (no files changed)'}: SketchUp ${plan.year}`);
  log(`Plugins: ${plan.destination}`);
  log(`State: ${plan.stateDirectory}`);
  log(`Host validation: ${plan.profile.validation ?? 'pending-host-test'}`);
  log(`Copy: ${plan.entries.join(', ')} (including version registry and license notices)`);
  log(plan.collisions.length ? `Existing plugin: ${plan.collisions.join(', ')}; a unique dated backup will be created before replacement.` : 'Existing plugin: none.');
  let installation = null;
  if (options.install) {
    installation = installPlugin(plan);
    log(`Installed: ${installation.destination}`);
    if (installation.backupDirectory) log(`Backup: ${installation.backupDirectory}`);
    log('Reopen SketchUp; the bridge starts automatically by default. If auto-start is disabled, choose Extensions / Alma SketchUp MCP / Start Bridge.');
  } else log('Run again with --install to apply this plan.');
  log(`\nMCP JSON configuration:\n${JSON.stringify(plan.configurations.json, null, 2)}`);
  log(`\nCodex TOML configuration:\n${plan.configurations.toml}`);
  log('\nClient configurations above are for manual review; no client configuration was edited.');
  return { plan, installation };
}

if (isMainModule(import.meta.url)) {
  try { runSetup(process.argv.slice(2)); }
  catch (error) { console.error(`Setup error: ${error.message}`); process.exitCode = 1; }
}
