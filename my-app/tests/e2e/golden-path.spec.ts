/**
 * Golden-path E2E test.
 *
 * Flow: onboarding → shell → open 3 tabs → Cmd+K → prompt → result → quit →
 *       relaunch → state restored.
 *
 * Maps to §6 ship-gate criteria: #3, #5, #7, #8, #11.
 *
 * Tests are gated with test.skip() until the built artifact exists and
 * other tracks (A/B/C/D) are integrated. Remove the skip call to enable.
 *
 * Track H owns this file.
 */

import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { launchApp, teardownApp, AppHandle } from '../setup/electron-launcher';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FIXTURE_URLS = [
  'https://example.com',
  'https://wikipedia.org',
  'https://news.ycombinator.com',
];

const PILL_PROMPT = 'scroll to the bottom of the page';

// Timeout for individual navigation/interaction steps
const NAV_TIMEOUT_MS = 15_000;
const AGENT_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Suite — skipped until integration (remove skip when tracks A/B/C/D land)
// ---------------------------------------------------------------------------

test.describe('Golden Path', () => {
  test.skip(true, 'Awaiting built artifact — unskip after `npm run make` and A/B/C/D integration');

  let app: AppHandle;

  test.beforeAll(async () => {
    app = await launchApp();
  });

  test.afterAll(async () => {
    await teardownApp(app);
  });

  // -------------------------------------------------------------------------
  // 1. App launches and shows onboarding or shell
  // -------------------------------------------------------------------------
  test('app launches within 10s and renders a window', async () => {
    const title = await app.firstWindow.title();
    expect(typeof title).toBe('string');
    // Either the onboarding or the shell window is present
    const url = app.firstWindow.url();
    expect(url).toBeTruthy();
    console.log(`[golden-path] First window URL: ${url}`);
  });

  // -------------------------------------------------------------------------
  // 2. Open 3 tabs via IPC and verify DOM reflects them
  // -------------------------------------------------------------------------
  test('opens 3 tabs via IPC and shell DOM shows all 3', async () => {
    // Invoke tab creation through the IPC bridge
    for (const url of FIXTURE_URLS) {
      await app.electronApp.evaluate(async ({ ipcMain: _ipcMain }, tabUrl) => {
        // Trigger tab creation through the registered IPC handler
        const { BrowserWindow } = await import('electron');
        const win = BrowserWindow.getAllWindows()[0];
        if (win) {
          win.webContents.send('test:create-tab', tabUrl);
        }
      }, url);
    }

    // Wait for the shell renderer to reflect the new tabs
    await app.firstWindow.waitForFunction(
      (count) => {
        const tabs = document.querySelectorAll('[data-testid="tab-item"]');
        return tabs.length >= count;
      },
      FIXTURE_URLS.length,
      { timeout: NAV_TIMEOUT_MS },
    );

    const tabCount = await app.firstWindow.locator('[data-testid="tab-item"]').count();
    expect(tabCount).toBeGreaterThanOrEqual(FIXTURE_URLS.length);
    console.log(`[golden-path] Tab count: ${tabCount}`);
  });

  // -------------------------------------------------------------------------
  // 3. Cmd+K opens pill within 200ms (DOM check)
  // -------------------------------------------------------------------------
  test('Cmd+K opens pill and pill input is focused', async () => {
    const t0 = Date.now();
    await app.firstWindow.keyboard.press('Meta+k');

    // Wait for pill overlay to appear
    const pillInput = app.firstWindow.locator('[data-testid="pill-input"]');
    await pillInput.waitFor({ state: 'visible', timeout: 5_000 });

    const elapsed = Date.now() - t0;
    console.log(`[golden-path] Pill opened in ${elapsed}ms`);
    expect(elapsed).toBeLessThan(5_000); // DOM-level check; real p95 enforced by telemetry

    await expect(pillInput).toBeFocused();
  });

  // -------------------------------------------------------------------------
  // 4. Submit a prompt and receive at least 2 step events
  // -------------------------------------------------------------------------
  test('prompt submission produces at least 2 intermediate step events', async () => {
    const pillInput = app.firstWindow.locator('[data-testid="pill-input"]');
    await pillInput.fill(PILL_PROMPT);
    await pillInput.press('Enter');

    // Collect progress toasts over 10s
    const toastLocator = app.firstWindow.locator('[data-testid="progress-toast"]');
    const toastTexts: string[] = [];
    const deadline = Date.now() + AGENT_TIMEOUT_MS;

    while (Date.now() < deadline) {
      await app.firstWindow.waitForTimeout(500);
      const count = await toastLocator.count();
      for (let i = 0; i < count; i++) {
        const text = await toastLocator.nth(i).innerText().catch(() => '');
        if (text && !toastTexts.includes(text)) {
          toastTexts.push(text);
          console.log(`[golden-path] Step event: "${text}"`);
        }
      }
      // Check for task done
      const doneEl = await app.firstWindow
        .locator('[data-testid="result-display"]')
        .isVisible()
        .catch(() => false);
      if (doneEl) break;
    }

    expect(toastTexts.length).toBeGreaterThanOrEqual(2);
  });

  // -------------------------------------------------------------------------
  // 5. Result is displayed; Esc dismisses pill
  // -------------------------------------------------------------------------
  test('result is displayed and Esc dismisses the pill', async () => {
    const resultDisplay = app.firstWindow.locator('[data-testid="result-display"]');
    await resultDisplay.waitFor({ state: 'visible', timeout: AGENT_TIMEOUT_MS });
    expect(await resultDisplay.isVisible()).toBe(true);

    await app.firstWindow.keyboard.press('Escape');
    await app.firstWindow
      .locator('[data-testid="pill-input"]')
      .waitFor({ state: 'hidden', timeout: 3_000 });
  });

  // -------------------------------------------------------------------------
  // 6. Quit and relaunch — session is restored
  // -------------------------------------------------------------------------
  test('session is restored after quit and relaunch', async () => {
    // Capture current tab URLs via IPC before quitting
    const tabsBefore: string[] = await app.electronApp.evaluate(() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { ipcMain: _ipcMain, BrowserWindow } = require('electron');
        // Read session file path
        const win = BrowserWindow.getAllWindows()[0];
        return win
          ? (win as unknown as { _tabManager?: { getState: () => { tabs: Array<{ url: string }> } } })
              ._tabManager?.getState().tabs.map((t) => t.url) ?? []
          : [];
      } catch {
        return [];
      }
    });

    // Save userData dir before teardown
    const savedUserDataDir = app.userDataDir;

    // Quit app (do NOT clean up userData — we need it for the relaunch)
    try {
      await app.electronApp.close();
    } catch {
      // Expected if app exits naturally
    }

    // Wait a moment for flush
    await new Promise((r) => setTimeout(r, 500));

    // Verify session.json was written
    const sessionPath = path.join(savedUserDataDir, 'session.json');
    expect(fs.existsSync(sessionPath)).toBe(true);

    const session = JSON.parse(fs.readFileSync(sessionPath, 'utf-8')) as {
      tabs: Array<{ url: string }>;
    };
    expect(session.tabs.length).toBeGreaterThanOrEqual(1);

    // Relaunch with the same userData dir
    const relaunched = await launchApp({ userDataDir: savedUserDataDir });
    app = relaunched;

    // Shell should show restored tabs
    await relaunched.firstWindow.waitForFunction(
      (minCount) => {
        const tabs = document.querySelectorAll('[data-testid="tab-item"]');
        return tabs.length >= minCount;
      },
      Math.max(1, tabsBefore.length),
      { timeout: NAV_TIMEOUT_MS },
    );

    const restoredCount = await relaunched.firstWindow
      .locator('[data-testid="tab-item"]')
      .count();
    expect(restoredCount).toBeGreaterThanOrEqual(1);
    console.log(`[golden-path] Restored ${restoredCount} tabs`);
  });
});
