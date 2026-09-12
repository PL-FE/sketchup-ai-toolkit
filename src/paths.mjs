// Modified 2026-09-12: isolate bridge, task and mock state by SketchUp year.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getVersionProfile, stateDirectoryForYear } from './sketchup-versions.mjs';

export const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
export const targetVersionProfile = getVersionProfile();
export const defaultStateDir = path.resolve(process.env.ALMA_SKETCHUP_STATE_DIR || stateDirectoryForYear(targetVersionProfile.year));
export const sessionDir = path.join(defaultStateDir, 'mock');
export const mockSessionPath = path.join(sessionDir, 'mock-model.json');
export const defaultQueueDir = path.resolve(process.env.ALMA_SKETCHUP_QUEUE_DIR || path.join(defaultStateDir, 'queue'));
export const defaultResponseDir = path.resolve(process.env.ALMA_SKETCHUP_RESPONSE_DIR || path.join(defaultStateDir, 'responses'));
