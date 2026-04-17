/**
 * Unit tests for hotkeys.ts — globalShortcut registration/unregistration.
 * D1 (TDD): these tests are written before implementation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock electron — all mock fns defined INSIDE the factory (vi.mock hoisting)
// ---------------------------------------------------------------------------
vi.mock('electron', () => ({
  globalShortcut: {
    register: vi.fn().mockReturnValue(true),
    unregister: vi.fn(),
    unregisterAll: vi.fn(),
    isRegistered: vi.fn().mockReturnValue(false),
  },
  app: {
    getPath: () => '/tmp/test-userData',
    on: vi.fn(),
  },
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn(),
    on: vi.fn(),
  },
}));

import { globalShortcut } from 'electron';

describe('HotkeyManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(globalShortcut.register).mockReturnValue(true);
    vi.mocked(globalShortcut.isRegistered).mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Test: registerHotkeys registers Cmd+K
  // -------------------------------------------------------------------------
  it('registerHotkeys registers CommandOrControl+K', async () => {
    const toggleCb = vi.fn();
    const { registerHotkeys } = await import('../../src/main/hotkeys');

    registerHotkeys(toggleCb);

    expect(globalShortcut.register).toHaveBeenCalledWith(
      'CommandOrControl+K',
      expect.any(Function),
    );
  });

  // -------------------------------------------------------------------------
  // Test: toggle callback is invoked when hotkey fires
  // -------------------------------------------------------------------------
  it('calls toggleCallback when Cmd+K hotkey fires', async () => {
    const toggleCb = vi.fn();
    const { registerHotkeys } = await import('../../src/main/hotkeys');

    registerHotkeys(toggleCb);

    // Extract the registered callback and invoke it
    const calls = vi.mocked(globalShortcut.register).mock.calls;
    const registeredCallback = calls[0]?.[1] as (() => void) | undefined;
    expect(registeredCallback).toBeDefined();
    registeredCallback!();

    expect(toggleCb).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Test: unregisterHotkeys unregisters Cmd+K
  // -------------------------------------------------------------------------
  it('unregisterHotkeys unregisters CommandOrControl+K', async () => {
    const toggleCb = vi.fn();
    const { registerHotkeys, unregisterHotkeys } = await import('../../src/main/hotkeys');

    registerHotkeys(toggleCb);
    unregisterHotkeys();

    expect(globalShortcut.unregister).toHaveBeenCalledWith('CommandOrControl+K');
  });

  // -------------------------------------------------------------------------
  // Test: registerHotkeys returns false if registration fails
  // -------------------------------------------------------------------------
  it('registerHotkeys returns false when globalShortcut.register returns false', async () => {
    vi.mocked(globalShortcut.register).mockReturnValue(false);
    const toggleCb = vi.fn();
    const { registerHotkeys } = await import('../../src/main/hotkeys');

    const result = registerHotkeys(toggleCb);

    expect(result).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Test: registerHotkeys returns true on success
  // -------------------------------------------------------------------------
  it('registerHotkeys returns true when registration succeeds', async () => {
    vi.mocked(globalShortcut.register).mockReturnValue(true);
    const toggleCb = vi.fn();
    const { registerHotkeys } = await import('../../src/main/hotkeys');

    const result = registerHotkeys(toggleCb);

    expect(result).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test: double-register is skipped when already registered
  // -------------------------------------------------------------------------
  it('does not register the same hotkey twice when already registered', async () => {
    // First call: not registered
    vi.mocked(globalShortcut.isRegistered).mockReturnValue(false);
    const toggleCb = vi.fn();
    const { registerHotkeys } = await import('../../src/main/hotkeys');

    registerHotkeys(toggleCb);

    // Second call: simulate already registered by a prior call
    vi.mocked(globalShortcut.isRegistered).mockReturnValue(true);
    registerHotkeys(toggleCb);

    // register should only have been called once (second call bailed out)
    expect(globalShortcut.register).toHaveBeenCalledTimes(1);
  });
});
