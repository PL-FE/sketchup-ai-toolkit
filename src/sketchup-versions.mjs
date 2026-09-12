// Added 2026-09-12: shared year profiles and isolated multi-version transport.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const VERSION_TRANSPORT = 'sketchup-year-queue.v1';
export const versionRegistry = JSON.parse(fs.readFileSync(new URL('../config/sketchup-versions.json', import.meta.url), 'utf8'));

export function getVersionProfile(year = process.env.ALMA_SKETCHUP_YEAR || '2020', registry = versionRegistry) {
  const key = String(year);
  const profile = registry.profiles?.[key];
  if (registry.schema_version !== 1 || !/^20\d{2}$/.test(key) || !profile ||
      profile.sketchup_major !== Number(key) - 2000 || !/^\d+\.\d+\.\d+$/.test(profile.minimum_ruby) ||
      typeof profile.native_pbr !== 'boolean' || typeof profile.native_environments !== 'boolean') {
    throw new Error(`Unsupported or invalid SketchUp year profile: ${key}. Registered years: ${Object.keys(registry.profiles || {}).join(', ')}`);
  }
  return Object.freeze({ ...profile, year: Number(key) });
}

export function stateDirectoryForYear(year, home = os.homedir()) {
  return path.join(home, '.sketchup-mcp', 'versions', String(getVersionProfile(year).year));
}

export function assertVersionResponse(response, year) {
  if (response?.bridge?.protocol !== VERSION_TRANSPORT || response?.bridge?.year !== Number(year)) {
    const error = new Error(`SketchUp ${year} bridge required; received ${response?.bridge?.year ?? 'an unversioned bridge'}. Check the selected year and install the matching multi-version Ruby bridge.`);
    error.code = 'SKETCHUP_YEAR_MISMATCH';
    throw error;
  }
}
