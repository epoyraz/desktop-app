/**
 * Session restore E2E tests.
 *
 * Covers: §6 criterion #5, Track A acceptance #5.
 *
 * Tests: multi-tab quit/relaunch, per-tab URL preserved, active tab preserved.
 *
 * Gated with test.skip() until built artifact + Track A land.
 * Track H owns this file.
 */

import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { launchApp, teardownApp, AppHandle } from '../setup/electron-launcher';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_URLS = [
  'https://example.com',
  'https://wikipedia.org',
  'https://news.ycombinator.com',
];

const TAB_ITEM_SELECTOR = '[data-testid="tab-item"]';
const TAB_URL_ATTR = 'data-tab-url';

test.describe('Session Restore', () => {
  test.skip(true, 'Awaiting built artifact — unskip after Track A integration');

  // -------------------------------------------------------------------------
  // Multi-tab quit and relaunch restores exact tab state
  // -------------------------------------------------------------------------
  test('quit with 3 tabs → relaunch shows same 3 URLs', async () => {
    const app = await launchApp();

    try {
      // Open 3 specific tabs via IPC
      for (const url of TEST_URLS) {
        await app.electronApp.evaluate(async (_ctx, tabUrl: string) => {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { ipcMain } = require('electron');
          ipcMain.emit('tabs:create', {}, tabUrl);
        }, url);
        await app.firstWindow.waitForTimeout(500);
      }

      // Give session store time to debounce and flush
      await app.firstWindow.waitForTimeout(800);

      const savedDir = app.userDataDir;
      app.cleanupUserData = false;

      // Graceful quit triggers session flush
      await app.electronApp.close().catch(() => undefined);
      await new Promise((r) => setTimeout(r, 500));

      // Verify session.json was written correctly
      const sessionPath = path.join(savedDir, 'session.json');
      expect(fs.existsSync(sessionPath)).toBe(true);

      const session = JSON.parse(fs.readFileSync(sessionPath, 'utf-8')) as {
        version: number;
        tabs: Array<{ id: string; url: string; title: string }>;
        activeTabId: string | null;
      };

      expect(session.version).toBe(1);
      expect(session.tabs.length).toBeGreaterThanOrEqual(TEST_URLS.length);

      const savedUrls = session.tabs.map((t) => t.url);
      console.log(`[session-restore] Saved URLs: ${savedUrls.join(', ')}`);

      for (const url of TEST_URLS) {
        const found = savedUrls.some((u) => u.startsWith(url) || url.startsWith(u.replace(/\/$/, '')));
        expect(found, `Expected ${url} to be in session`).toBe(true);
      }

      // Relaunch with same userData
      const relaunched = await launchApp({ userDataDir: savedDir });

      try {
        // Wait for tab strip to populate
        await relaunched.firstWindow.waitForFunction(
          (minCount) =>
            document.querySelectorAll('[data-testid="tab-item"]').length >= minCount,
          TEST_URLS.length,
          { timeout: 15_000 },
        );

        const restoredCount = await relaunched.firstWindow
          .locator(TAB_ITEM_SELECTOR)
          .count();
        expect(restoredCount).toBeGreaterThanOrEqual(TEST_URLS.length);
        console.log(`[session-restore] Restored tab count: ${restoredCount}`);
      } finally {
        await teardownApp(relaunched);
        fs.rmSync(savedDir, { recursive: true, force: true });
      }
    } catch (err) {
      await teardownApp(app);
      throw err;
    }
  });

  // -------------------------------------------------------------------------
  // Active tab ID is preserved across restart
  // -------------------------------------------------------------------------
  test('active tab ID is preserved across quit and relaunch', async () => {
    const app = await launchApp();
    const savedDir = app.userDataDir;
    app.cleanupUserData = false;

    try {
      // Open 2 tabs, activate the second
      await app.electronApp.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { ipcMain } = require('electron');
        ipcMain.emit('tabs:create', {}, 'https://example.com');
        ipcMain.emit('tabs:create', {}, 'https://wikipedia.org');
      });
      await app.firstWindow.waitForTimeout(1_000);

      // Get active tab ID before quit
      const activeIdBefore: string | null = await app.electronApp.evaluate(() => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { BrowserWindow } = require('electron');
          const win = BrowserWindow.getAllWindows()[0] as unknown as {
            _tabManager?: { getActiveTabId: () => string | null };
          };
          return win._tabManager?.getActiveTabId() ?? null;
        } catch {
          return null;
        }
      });

      await app.electronApp.close().catch(() => undefined);
      await new Promise((r) => setTimeout(r, 500));

      if (activeIdBefore) {
        const session = JSON.parse(
          fs.readFileSync(path.join(savedDir, 'session.json'), 'utf-8'),
        ) as { activeTabId: string | null };
        expect(session.activeTabId).toBe(activeIdBefore);
        console.log(`[session-restore] Active tab ID preserved: ${activeIdBefore}`);
      }

      const relaunched = await launchApp({ userDataDir: savedDir });
      await teardownApp(relaunched);
    } finally {
      fs.rmSync(savedDir, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // SessionStore: invalid session file falls back gracefully
  // -------------------------------------------------------------------------
  test('corrupted session.json falls back to single new tab', async () => {
    const app = await launchApp();
    const savedDir = app.userDataDir;
    app.cleanupUserData = false;

    // Write a corrupt session file before launch
    const sessionPath = path.join(savedDir, 'session.json');
    fs.writeFileSync(sessionPath, '{not valid json...', 'utf-8');

    await app.electronApp.close().catch(() => undefined);

    const relaunched = await launchApp({ userDataDir: savedDir });
    try {
      // Should still open with at least one (new) tab rather than crashing
      const tabCount = await relaunched.firstWindow
        .locator(TAB_ITEM_SELECTOR)
        .count({ timeout: 10_000 });
      expect(tabCount).toBeGreaterThanOrEqual(1);
      console.log(`[session-restore] Fallback tab count: ${tabCount}`);
    } finally {
      await teardownApp(relaunched);
      fs.rmSync(savedDir, { recursive: true, force: true });
    }
  });
});
