/**
 * Harness directory bootstrap: seeds `<userData>/harness/` with the stock
 * `helpers.js` + `SKILL.md`. The agent (Claude Code subprocess) reads and
 * edits these files freely. No tool schema, no dispatcher — helpers.js is
 * a plain Node library that the agent invokes from its own shell tool.
 *
 * Stock content is bundled via Vite's `?raw` import modifier.
 */

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { mainLogger } from '../logger';

import STOCK_HELPERS_JS from './stock/helpers.js?raw';
import STOCK_TOOLS_JSON from './stock/TOOLS.json?raw';
import STOCK_SKILL_MD from './stock/AGENTS.md?raw';

export function harnessDir(): string {
  return path.join(app.getPath('userData'), 'harness');
}

export function helpersPath(): string { return path.join(harnessDir(), 'helpers.js'); }
export function toolsPath(): string { return path.join(harnessDir(), 'TOOLS.json'); }
export function skillPath(): string { return path.join(harnessDir(), 'AGENTS.md'); }

/**
 * Ensure `<userData>/harness/` exists and contains the stock files.
 * - Writes helpers.js if missing OR if the on-disk version is the legacy
 *   dispatcher-style (didn't export `createContext`).
 * - Writes SKILL.md if missing.
 * - Writes TOOLS.json if missing (retained for the legacy Anthropic-SDK
 *   agent loop; safe to ignore under the claude-subprocess path).
 * User edits to the up-to-date helpers.js / SKILL.md are preserved.
 */
export function bootstrapHarness(): void {
  const dir = harnessDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    mainLogger.error('harness.bootstrap.mkdir.failed', { dir, error: (err as Error).message });
    throw err;
  }

  const hp = helpersPath();
  const needsHelpers = !fs.existsSync(hp) || (() => {
    try { return !fs.readFileSync(hp, 'utf-8').includes('createContext'); }
    catch { return true; }
  })();
  if (needsHelpers) {
    fs.writeFileSync(hp, STOCK_HELPERS_JS as string, 'utf-8');
    mainLogger.info('harness.bootstrap.wroteHelpers', { path: hp, bytes: (STOCK_HELPERS_JS as string).length });
  }

  const sp = skillPath();
  const needsSkill = !fs.existsSync(sp) || (() => {
    try { return !fs.readFileSync(sp, 'utf-8').includes('Uploads and outputs'); }
    catch { return true; }
  })();
  if (needsSkill) {
    fs.writeFileSync(sp, STOCK_SKILL_MD as string, 'utf-8');
    mainLogger.info('harness.bootstrap.wroteSkill', { path: sp, bytes: (STOCK_SKILL_MD as string).length });
  }

  const tp = toolsPath();
  if (!fs.existsSync(tp)) {
    fs.writeFileSync(tp, STOCK_TOOLS_JSON as string, 'utf-8');
    mainLogger.info('harness.bootstrap.wroteTools', { path: tp, bytes: (STOCK_TOOLS_JSON as string).length });
  }
}

