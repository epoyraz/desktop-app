/**
 * Electron apps on macOS launched from the Dock/Finder inherit a minimal
 * PATH like `/usr/bin:/bin:/usr/sbin:/sbin` that excludes most places
 * where CLIs are installed (Homebrew, Volta, npm-global, bun, asdf, etc.).
 * Probing via `spawn('codex', ['--version'])` then falsely reports
 * "not installed" even when the binary exists in the user's shell PATH.
 *
 * `enrichedPath()` returns a colon-joined PATH string that adds the
 * common user-level binary directories on top of whatever PATH the
 * process was given.
 */

import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * Spawn the user's login shell once and capture its PATH. Catches custom
 * dirs set in ~/.zshrc / ~/.bashrc / chruby / mise / asdf / etc. that
 * hard-coded lists can never anticipate.
 *
 * Cached for process lifetime — shells take 50–200 ms and we don't want
 * to pay that on every probe.
 */
let cachedShellPath: string | null = null;
let cachedShellPathTried = false;

function queryLoginShellPath(): string | null {
  if (cachedShellPathTried) return cachedShellPath;
  cachedShellPathTried = true;
  const sh = process.env.SHELL || '/bin/zsh';
  try {
    // -i (interactive) so aliases/function-setting init files run;
    // -l (login) so profile files like .zprofile / .bash_profile run.
    // `echo -n` avoids a trailing newline we'd then have to strip.
    const r = spawnSync(sh, ['-ilc', 'printf %s "$PATH"'], {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (r.status === 0 && typeof r.stdout === 'string' && r.stdout.length > 0) {
      cachedShellPath = r.stdout.trim();
    }
  } catch { /* ignore — fall through to hardcoded list */ }
  return cachedShellPath;
}

const EXTRA_DIRS_FNS: Array<() => string> = [
  () => '/opt/homebrew/bin',
  () => '/opt/homebrew/sbin',
  () => '/usr/local/bin',
  () => '/usr/local/sbin',
  () => path.join(os.homedir(), '.npm-global', 'bin'),
  () => path.join(os.homedir(), '.volta', 'bin'),
  () => path.join(os.homedir(), '.nvm', 'versions', 'node'),
  () => path.join(os.homedir(), '.bun', 'bin'),
  () => path.join(os.homedir(), '.deno', 'bin'),
  () => path.join(os.homedir(), '.cargo', 'bin'),
  () => path.join(os.homedir(), '.local', 'bin'),
  () => path.join(os.homedir(), '.yarn', 'bin'),
  () => path.join(os.homedir(), 'bin'),
];

export function enrichedPath(base = process.env.PATH ?? ''): string {
  const existing = base.split(':').filter(Boolean);
  const set = new Set(existing);
  const out = [...existing];

  // First: anything the user's login shell knows about — covers custom
  // setups like chruby, asdf, mise, direnv, or ad-hoc PATH exports.
  const shellPath = queryLoginShellPath();
  if (shellPath) {
    for (const dir of shellPath.split(':').filter(Boolean)) {
      if (!set.has(dir)) {
        set.add(dir);
        out.push(dir);
      }
    }
  }

  // Second: a conservative safety net of common binary dirs in case the
  // shell query failed (rare, e.g. user has no SHELL and no /bin/zsh).
  for (const fn of EXTRA_DIRS_FNS) {
    const dir = fn();
    if (!set.has(dir)) {
      set.add(dir);
      out.push(dir);
    }
  }
  return out.join(':');
}

export function enrichedEnv(baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return { ...baseEnv, PATH: enrichedPath(baseEnv.PATH) };
}
