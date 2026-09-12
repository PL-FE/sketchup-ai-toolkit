#!/usr/bin/env node
// Copyright 2026. Licensed under the Apache License, Version 2.0.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PROJECT_ROOT, isMainModule } from './setup.mjs';

function exists(file) {
  try { fs.lstatSync(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

export function skillInstallPlan(target, { projectRoot = PROJECT_ROOT } = {}) {
  if (!target) throw new Error('--target is required; use the Skills directory supported by your AI client.');
  const destination = path.resolve(target);
  const source = path.join(projectRoot, 'skills');
  if (destination === source || destination.startsWith(`${source}${path.sep}`)) throw new Error('Skills target cannot be the source skills folder or a folder inside it.');
  if (fs.existsSync(destination) && !fs.statSync(destination).isDirectory()) throw new Error(`Skills target is not a directory: ${destination}`);
  const skills = fs.readdirSync(source, { withFileTypes: true }).filter(entry => entry.isDirectory() && fs.existsSync(path.join(source, entry.name, 'SKILL.md'))).map(entry => entry.name).sort();
  if (!skills.length) throw new Error(`No skills containing SKILL.md were found in ${source}`);
  return { source, destination, skills, collisions: skills.filter(name => exists(path.join(destination, name))) };
}

export function installSkills(plan) {
  fs.mkdirSync(plan.destination, { recursive: true });
  const staging = fs.mkdtempSync(path.join(plan.destination, '.sketchup-skills-staging-'));
  const collisions = plan.skills.filter(name => exists(path.join(plan.destination, name)));
  let backupDirectory = null;
  let replacementStarted = false;
  try {
    for (const name of plan.skills) fs.cpSync(path.join(plan.source, name), path.join(staging, name), { recursive: true });
    if (collisions.length) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      backupDirectory = path.join(plan.destination, `.sketchup-skills-backup-${stamp}-${crypto.randomBytes(4).toString('hex')}`);
      fs.mkdirSync(backupDirectory);
      for (const name of collisions) fs.cpSync(path.join(plan.destination, name), path.join(backupDirectory, name), { recursive: true });
    }
    replacementStarted = true;
    for (const name of plan.skills) {
      fs.rmSync(path.join(plan.destination, name), { recursive: true, force: true });
      fs.renameSync(path.join(staging, name), path.join(plan.destination, name));
    }
    return { destination: plan.destination, skills: plan.skills, backupDirectory };
  } catch (error) {
    if (replacementStarted) {
      try {
        for (const name of plan.skills) fs.rmSync(path.join(plan.destination, name), { recursive: true, force: true });
        for (const name of collisions) fs.cpSync(path.join(backupDirectory, name), path.join(plan.destination, name), { recursive: true });
      } catch (restoreError) {
        throw new Error(`Skill installation failed: ${error.message}. Restore failed: ${restoreError.message}. Backup: ${backupDirectory}.`, { cause: error });
      }
    }
    throw new Error(`Skill installation failed: ${error.message}${backupDirectory ? `. Backup: ${backupDirectory}` : ''}`, { cause: error });
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

export const HELP = `Usage: node scripts/install-skills.mjs --target PATH [--dry-run | --install]

  --target PATH  Explicit AI client Skills directory; copies each skills/* folder here.
  --dry-run      Show the plan without changing files (default).
  --install      Install; first back up any existing skill folders with the same names.
  --help, -h     Show this help.

The target is never inferred. Other skills and client configuration are left alone.
Reload Skills or restart the AI client after installation.
`;

export function runInstallSkills(args, { log = console.log, ...context } = {}) {
  let target;
  let mode;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--help' || args[index] === '-h') { log(HELP); return null; }
    if (args[index] === '--target') {
      target = args[++index];
      if (!target || target.startsWith('--')) throw new Error('--target requires a path.');
    } else if (args[index] === '--install' || args[index] === '--dry-run') {
      if (mode && mode !== args[index]) throw new Error('Use either --install or --dry-run.');
      mode = args[index];
    } else throw new Error(`Unknown argument: ${args[index]}. Run --help for usage.`);
  }
  const plan = skillInstallPlan(target, context);
  log(`${mode === '--install' ? 'Install' : 'DRY RUN (no files changed)'} skills: ${plan.skills.join(', ')}`);
  log(`Target: ${plan.destination}`);
  log(plan.collisions.length ? `Existing skills: ${plan.collisions.join(', ')}; a unique dated backup will be created.` : 'Existing skills with matching names: none.');
  let installation = null;
  if (mode === '--install') {
    installation = installSkills(plan);
    log(`Installed: ${installation.skills.join(', ')}`);
    if (installation.backupDirectory) log(`Backup: ${installation.backupDirectory}`);
    log('Reload Skills or restart your AI client.');
  } else log('Run again with --install to apply this plan.');
  return { plan, installation };
}

if (isMainModule(import.meta.url)) {
  try { runInstallSkills(process.argv.slice(2)); }
  catch (error) { console.error(`Skills setup error: ${error.message}`); process.exitCode = 1; }
}
