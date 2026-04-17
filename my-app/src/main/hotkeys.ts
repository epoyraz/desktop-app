/**
 * Track B — Pill hotkey (Cmd+K) registration.
 *
 * Cmd+K is now an APP-LOCAL Menu accelerator owned by src/main/index.ts
 * (registerKeyboardShortcuts). Global shortcuts steal focus system-wide,
 * which is undesirable. These functions are retained as no-ops so existing
 * callers in index.ts keep compiling; the accelerator itself lives in the
 * Menu template.
 */

import { globalShortcut } from 'electron';

// ---------------------------------------------------------------------------
// D2 — Dev-only structured logger
// ---------------------------------------------------------------------------

const DEV =
  process.env.NODE_ENV !== 'production' || process.env.AGENTIC_DEV === '1';

const log = {
  debug: DEV
    ? (comp: string, ctx: object) =>
        console.log(JSON.stringify({ ts: Date.now(), level: 'debug', component: comp, ...ctx }))
    : () => {},
  info: DEV
    ? (comp: string, ctx: object) =>
        console.log(JSON.stringify({ ts: Date.now(), level: 'info', component: comp, ...ctx }))
    : () => {},
  warn: (comp: string, ctx: object) =>
    console.warn(JSON.stringify({ ts: Date.now(), level: 'warn', component: comp, ...ctx })),
  error: (comp: string, ctx: object) =>
    console.error(
      JSON.stringify({ ts: Date.now(), level: 'error', component: comp, ...ctx }),
    ),
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HOTKEY_PILL_TOGGLE = 'CommandOrControl+K' as const;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register the Cmd+K global hotkey.
 *
 * @param toggleCallback - called every time Cmd+K fires; toggles pill show/hide
 * @returns true if registration succeeded; false if the shortcut was already
 *          claimed by another app or if Electron rejected the registration
 */
export function registerHotkeys(_toggleCallback: () => void): boolean {
  log.info('hotkeys.registerHotkeys', {
    message: 'Cmd+K is now an app-local Menu accelerator — no globalShortcut registered',
    hotkey: HOTKEY_PILL_TOGGLE,
  });
  return true;
}

/**
 * Unregister the Cmd+K global hotkey.
 * Should be called in the app `will-quit` event handler.
 */
export function unregisterHotkeys(): void {
  log.info('hotkeys.unregisterHotkeys', {
    message: 'Cmd+K is app-local (Menu accelerator) — nothing to unregister',
    hotkey: HOTKEY_PILL_TOGGLE,
  });
}
