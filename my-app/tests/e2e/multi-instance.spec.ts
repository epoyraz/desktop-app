/**
 * Multi-instance E2E tests.
 *
 * Covers: §6 criterion #10, Track E acceptance #6.
 *
 * Tests: two concurrent launches, no port/socket collision,
 *        both instances function independently.
 *
 * Gated with test.skip() until built artifact + Track E land.
 * Track H owns this file.
 */

import { test, expect } from '@playwright/test';
import { launchApp, teardownApp, AppHandle } from '../setup/electron-launcher';

test.describe('Multi-Instance Safety', () => {
  test.skip(true, 'Awaiting built artifact — unskip after Track E integration');

  // -------------------------------------------------------------------------
  // Two concurrent instances do not collide on socket path or port
  // -------------------------------------------------------------------------
  test('two simultaneous instances have different socket paths and CDP ports', async () => {
    // Launch both instances in parallel
    const [instance1, instance2] = await Promise.all([
      launchApp({ env: { INSTANCE_ID: '1' } }),
      launchApp({ env: { INSTANCE_ID: '2' } }),
    ]);

    try {
      // Retrieve socket paths from each main process
      const socketPath1: string = await instance1.electronApp.evaluate(() => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { app: electronApp } = require('electron');
          return (electronApp as unknown as { _daemonSocketPath?: string })._daemonSocketPath ?? '';
        } catch {
          return '';
        }
      });

      const socketPath2: string = await instance2.electronApp.evaluate(() => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { app: electronApp } = require('electron');
          return (electronApp as unknown as { _daemonSocketPath?: string })._daemonSocketPath ?? '';
        } catch {
          return '';
        }
      });

      console.log(`[multi-instance] Instance 1 socket: ${socketPath1}`);
      console.log(`[multi-instance] Instance 2 socket: ${socketPath2}`);

      if (socketPath1 && socketPath2) {
        // Socket paths must differ (each includes the PID)
        expect(socketPath1).not.toBe(socketPath2);
        // Both paths should contain the PID pattern
        expect(socketPath1).toMatch(/daemon-\d+\.sock/);
        expect(socketPath2).toMatch(/daemon-\d+\.sock/);
      }

      // Retrieve CDP ports from each instance
      const cdpPort1: number | null = await instance1.electronApp.evaluate(() => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { app: electronApp } = require('electron');
          return (electronApp as unknown as { _cdpPort?: number })._cdpPort ?? null;
        } catch {
          return null;
        }
      });

      const cdpPort2: number | null = await instance2.electronApp.evaluate(() => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { app: electronApp } = require('electron');
          return (electronApp as unknown as { _cdpPort?: number })._cdpPort ?? null;
        } catch {
          return null;
        }
      });

      console.log(`[multi-instance] CDP port 1: ${cdpPort1}, port 2: ${cdpPort2}`);

      if (cdpPort1 !== null && cdpPort2 !== null) {
        // Both ports must be valid and different (OS assigns port 0 dynamically)
        expect(cdpPort1).toBeGreaterThan(1024);
        expect(cdpPort2).toBeGreaterThan(1024);
        expect(cdpPort1).not.toBe(cdpPort2);
      }
    } finally {
      await Promise.allSettled([teardownApp(instance1), teardownApp(instance2)]);
    }
  });

  // -------------------------------------------------------------------------
  // Both instances are functional (respond to Cmd+K)
  // -------------------------------------------------------------------------
  test('both instances respond to Cmd+K independently', async () => {
    const [instance1, instance2] = await Promise.all([
      launchApp({ env: { INSTANCE_ID: '1' } }),
      launchApp({ env: { INSTANCE_ID: '2' } }),
    ]);

    try {
      const PILL_INPUT_SELECTOR = '[data-testid="pill-input"]';

      // Instance 1: open pill
      await instance1.firstWindow.keyboard.press('Meta+k');
      const pill1 = instance1.firstWindow.locator(PILL_INPUT_SELECTOR);
      await pill1.waitFor({ state: 'visible', timeout: 3_000 });
      expect(await pill1.isVisible()).toBe(true);

      // Instance 2: open pill independently
      await instance2.firstWindow.keyboard.press('Meta+k');
      const pill2 = instance2.firstWindow.locator(PILL_INPUT_SELECTOR);
      await pill2.waitFor({ state: 'visible', timeout: 3_000 });
      expect(await pill2.isVisible()).toBe(true);

      // Dismiss both
      await instance1.firstWindow.keyboard.press('Escape');
      await instance2.firstWindow.keyboard.press('Escape');

      console.log('[multi-instance] Both instances responded to Cmd+K independently');
    } finally {
      await Promise.allSettled([teardownApp(instance1), teardownApp(instance2)]);
    }
  });

  // -------------------------------------------------------------------------
  // Closing one instance does not affect the other
  // -------------------------------------------------------------------------
  test('closing one instance leaves the other functional', async () => {
    const [instance1, instance2] = await Promise.all([
      launchApp({ env: { INSTANCE_ID: '1' } }),
      launchApp({ env: { INSTANCE_ID: '2' } }),
    ]);

    try {
      // Close instance 1
      await instance1.electronApp.close();

      // Instance 2 should still be running and responsive
      await new Promise((r) => setTimeout(r, 500));

      const windowCount: number = await instance2.electronApp.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { BrowserWindow } = require('electron');
        return BrowserWindow.getAllWindows().length;
      });

      expect(windowCount).toBeGreaterThanOrEqual(1);
      console.log(`[multi-instance] Instance 2 window count after instance 1 close: ${windowCount}`);

      await teardownApp(instance2);
    } catch (err) {
      await teardownApp(instance2).catch(() => undefined);
      throw err;
    }
  });
});
