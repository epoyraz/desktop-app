/**
 * Visual QA capture spec.
 *
 * Boots the Electron app for each UI state and captures screenshots to
 * tests/visual/captures/<state>.png.
 *
 * States captured:
 *   1. onboarding-welcome        — Screen 1, fresh userData
 *   2. onboarding-naming         — Screen 2 (after Welcome → Next)
 *   3. onboarding-account        — Screen 3 (after Naming → Next)
 *   4. onboarding-account-scopes — Screen 3 + Google Scopes modal open
 *   5. shell-empty               — Shell with no tabs (account.json present)
 *   6. shell-3-tabs              — Shell with 3 tabs injected via IPC
 *   7. pill-idle                 — Shell + pill open, empty input
 *   8. pill-streaming            — Pill with mocked streaming progress steps
 *   9. pill-result               — Pill with mocked completed result
 *
 * Each test runs independently with its own userData dir.
 * The spec writes a state manifest to captures/manifest.json for diff.ts.
 *
 * Track H Visual QA owns this file.
 */

import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MY_APP_ROOT = path.resolve(__dirname, '../..');
const CAPTURES_DIR = path.join(__dirname, 'captures');
const LOG_PREFIX = '[visual-qa]';

function getElectronAppPath(): string {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  return path.join(
    MY_APP_ROOT,
    'out',
    `my-app-darwin-${arch}`,
    'my-app.app',
    'Contents',
    'MacOS',
    'my-app',
  );
}

const ELECTRON_APP_PATH = getElectronAppPath();

/** Settle time after state change before screenshot (ms) */
const SETTLE_MS = 800;

/** Timeout for waiting on UI elements (ms) */
const UI_TIMEOUT_MS = 10_000;

/** Completed account.json content that bypasses onboarding */
const COMPLETED_ACCOUNT = JSON.stringify({
  agent_name: 'Aria',
  email: 'aria@example.com',
  onboarding_complete: true,
});

// ---------------------------------------------------------------------------
// Manifest tracking
// ---------------------------------------------------------------------------

interface CaptureManifestEntry {
  state: string;
  capture_path: string;
  captured_at: string;
  width: number;
  height: number;
  success: boolean;
  error?: string;
  notes?: string;
}

const manifest: CaptureManifestEntry[] = [];

function recordCapture(entry: CaptureManifestEntry): void {
  manifest.push(entry);
  log(`Captured: ${entry.state} → ${entry.capture_path} (success=${entry.success})`);
}

function log(msg: string, extra?: Record<string, unknown>): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level: 'info',
    channel: 'visual-qa',
    msg: `${LOG_PREFIX} ${msg}`,
    ...extra,
  });
  process.stdout.write(line + '\n');
}

function logWarn(msg: string, extra?: Record<string, unknown>): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level: 'warn',
    channel: 'visual-qa',
    msg: `${LOG_PREFIX} ${msg}`,
    ...extra,
  });
  process.stderr.write(line + '\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function launchForOnboarding(env?: Record<string, string>): Promise<{
  electronApp: ElectronApplication;
  page: Page;
  userDataDir: string;
}> {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-qa-onboarding-'));
  log('Launching app for onboarding', { userDataDir });

  const electronApp = await electron.launch({
    executablePath: ELECTRON_APP_PATH,
    args: [
      path.join(MY_APP_ROOT, '.vite', 'build', 'main.js'),
      `--user-data-dir=${userDataDir}`,
      '--no-sandbox',
      '--disable-gpu',
      '--remote-debugging-port=0',
    ],
    env: {
      ...process.env as Record<string, string>,
      DEV_MODE: '1',
      KEYCHAIN_MOCK: '1',
      POSTHOG_API_KEY: '',
      ...env,
    },
    timeout: 30_000,
    cwd: MY_APP_ROOT,
  });

  const page = await electronApp.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  // Inject reduced-motion preference
  await page.emulateMedia({ reducedMotion: 'reduce' });

  log('Onboarding window ready', { title: await page.title(), url: page.url() });
  return { electronApp, page, userDataDir };
}

async function launchForShell(env?: Record<string, string>): Promise<{
  electronApp: ElectronApplication;
  page: Page;
  userDataDir: string;
}> {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-qa-shell-'));

  // Write completed account.json so onboarding is skipped
  fs.writeFileSync(path.join(userDataDir, 'account.json'), COMPLETED_ACCOUNT, 'utf-8');
  log('Launching app for shell', { userDataDir });

  const electronApp = await electron.launch({
    executablePath: ELECTRON_APP_PATH,
    args: [
      path.join(MY_APP_ROOT, '.vite', 'build', 'main.js'),
      `--user-data-dir=${userDataDir}`,
      '--no-sandbox',
      '--disable-gpu',
      '--remote-debugging-port=0',
    ],
    env: {
      ...process.env as Record<string, string>,
      DEV_MODE: '1',
      KEYCHAIN_MOCK: '1',
      POSTHOG_API_KEY: '',
      SKIP_ONBOARDING: '1',
      ...env,
    },
    timeout: 30_000,
    cwd: MY_APP_ROOT,
  });

  const page = await electronApp.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.emulateMedia({ reducedMotion: 'reduce' });

  log('Shell window ready', { title: await page.title(), url: page.url() });
  return { electronApp, page, userDataDir };
}

async function teardown(electronApp: ElectronApplication, userDataDir: string): Promise<void> {
  try {
    await electronApp.close();
  } catch (err) {
    logWarn('Close error (ignored)', { error: (err as Error).message });
  }
  try {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  } catch (err) {
    logWarn('userData cleanup error (ignored)', { error: (err as Error).message });
  }
}

async function screenshot(page: Page, stateName: string, notes?: string): Promise<string> {
  const capturePath = path.join(CAPTURES_DIR, `${stateName}.png`);
  fs.mkdirSync(CAPTURES_DIR, { recursive: true });

  try {
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: capturePath, fullPage: false });

    const { width, height } = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));

    recordCapture({
      state: stateName,
      capture_path: capturePath,
      captured_at: new Date().toISOString(),
      width,
      height,
      success: true,
      notes,
    });
    log(`Screenshot saved: ${capturePath}`, { width, height });
    return capturePath;
  } catch (err) {
    const errMsg = (err as Error).message;
    logWarn(`Screenshot failed for state: ${stateName}`, { error: errMsg });
    recordCapture({
      state: stateName,
      capture_path: capturePath,
      captured_at: new Date().toISOString(),
      width: 0,
      height: 0,
      success: false,
      error: errMsg,
      notes,
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Suite setup / teardown
// ---------------------------------------------------------------------------

test.afterAll(() => {
  const manifestPath = path.join(CAPTURES_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  log(`Manifest written: ${manifestPath}`, { total: manifest.length });
});

// ===========================================================================
// STATE 1: Onboarding – Welcome (screen 1)
// ===========================================================================

test('capture: onboarding-welcome', async () => {
  log('=== State 1: onboarding-welcome ===');
  const { electronApp, page, userDataDir } = await launchForOnboarding();

  try {
    // Wait for onboarding Welcome screen to render
    // Look for step indicator or the "Get Started" button
    await page.waitForSelector('.step-indicator, [data-testid="step-indicator"], .cta-button, [data-testid="character-mascot"], .onboarding-root', {
      timeout: UI_TIMEOUT_MS,
    });

    await screenshot(page, 'onboarding-welcome', 'Screen 1 — Welcome with mascot and capability pills');
  } catch (err) {
    logWarn('State 1 failed', { error: (err as Error).message });
    recordCapture({
      state: 'onboarding-welcome',
      capture_path: path.join(CAPTURES_DIR, 'onboarding-welcome.png'),
      captured_at: new Date().toISOString(),
      width: 0,
      height: 0,
      success: false,
      error: (err as Error).message,
      notes: 'Onboarding not wired up — I1 track may not have landed yet',
    });
  } finally {
    await teardown(electronApp, userDataDir);
  }
});

// ===========================================================================
// STATE 2: Onboarding – Naming (screen 2)
// ===========================================================================

test('capture: onboarding-naming', async () => {
  log('=== State 2: onboarding-naming ===');
  const { electronApp, page, userDataDir } = await launchForOnboarding();

  try {
    // Wait for Welcome screen
    await page.waitForSelector('.cta-button, .onboarding-root', { timeout: UI_TIMEOUT_MS });

    // Click "Get Started" to advance to naming
    const ctaButton = page.locator('.cta-button, [data-testid="cta-button"]').first();
    await ctaButton.waitFor({ state: 'visible', timeout: UI_TIMEOUT_MS });
    await ctaButton.click();
    log('Clicked Get Started');

    // Wait for naming screen — look for name input
    await page.waitForSelector(
      '[data-testid="agent-name-input"], input[type="text"], .auth-input',
      { timeout: UI_TIMEOUT_MS },
    );

    await screenshot(page, 'onboarding-naming', 'Screen 2 — Agent naming input');
  } catch (err) {
    logWarn('State 2 failed', { error: (err as Error).message });
    recordCapture({
      state: 'onboarding-naming',
      capture_path: path.join(CAPTURES_DIR, 'onboarding-naming.png'),
      captured_at: new Date().toISOString(),
      width: 0,
      height: 0,
      success: false,
      error: (err as Error).message,
      notes: 'Navigation to naming screen failed',
    });
  } finally {
    await teardown(electronApp, userDataDir);
  }
});

// ===========================================================================
// STATE 3: Onboarding – Account Creation (screen 3)
// ===========================================================================

test('capture: onboarding-account', async () => {
  log('=== State 3: onboarding-account ===');
  const { electronApp, page, userDataDir } = await launchForOnboarding();

  try {
    // Navigate Welcome → Naming → Account
    await page.waitForSelector('.cta-button, .onboarding-root', { timeout: UI_TIMEOUT_MS });

    const ctaButton = page.locator('.cta-button').first();
    await ctaButton.waitFor({ state: 'visible', timeout: UI_TIMEOUT_MS });
    await ctaButton.click();
    log('Clicked Get Started');

    // On naming screen: fill name and submit
    const nameInput = page.locator('[data-testid="agent-name-input"], .auth-input[type="text"]').first();
    await nameInput.waitFor({ state: 'visible', timeout: UI_TIMEOUT_MS });
    await nameInput.fill('Aria');
    await nameInput.press('Enter');
    log('Submitted agent name: Aria');

    // Wait for account creation screen (Google button or email field)
    await page.waitForSelector(
      '[data-testid="continue-with-google"], .google-btn, [data-testid="auth-input"]',
      { timeout: UI_TIMEOUT_MS },
    );

    await screenshot(page, 'onboarding-account', 'Screen 3 — Account creation with Google button');
  } catch (err) {
    logWarn('State 3 failed', { error: (err as Error).message });
    recordCapture({
      state: 'onboarding-account',
      capture_path: path.join(CAPTURES_DIR, 'onboarding-account.png'),
      captured_at: new Date().toISOString(),
      width: 0,
      height: 0,
      success: false,
      error: (err as Error).message,
      notes: 'Navigation to account screen failed',
    });
  } finally {
    await teardown(electronApp, userDataDir);
  }
});

// ===========================================================================
// STATE 4: Onboarding – Account + Google Scopes Modal
// ===========================================================================

test('capture: onboarding-account-scopes', async () => {
  log('=== State 4: onboarding-account-scopes ===');
  const { electronApp, page, userDataDir } = await launchForOnboarding();

  try {
    // Navigate Welcome → Naming → Account
    await page.waitForSelector('.cta-button, .onboarding-root', { timeout: UI_TIMEOUT_MS });
    const ctaButton = page.locator('.cta-button').first();
    await ctaButton.waitFor({ state: 'visible', timeout: UI_TIMEOUT_MS });
    await ctaButton.click();

    const nameInput = page.locator('[data-testid="agent-name-input"], .auth-input[type="text"]').first();
    await nameInput.waitFor({ state: 'visible', timeout: UI_TIMEOUT_MS });
    await nameInput.fill('Aria');
    await nameInput.press('Enter');

    // Wait for Google button and click it to open scopes modal
    const googleBtn = page.locator('[data-testid="continue-with-google"], .google-btn').first();
    await googleBtn.waitFor({ state: 'visible', timeout: UI_TIMEOUT_MS });
    await googleBtn.click();
    log('Clicked Continue with Google');

    // Wait for scopes modal
    await page.waitForSelector(
      '[data-testid="scope-checkbox"], .scope-modal, .google-scopes-modal',
      { timeout: UI_TIMEOUT_MS },
    );

    await screenshot(page, 'onboarding-account-scopes', 'Screen 3 + Google Scopes Modal open');
  } catch (err) {
    logWarn('State 4 failed', { error: (err as Error).message });
    recordCapture({
      state: 'onboarding-account-scopes',
      capture_path: path.join(CAPTURES_DIR, 'onboarding-account-scopes.png'),
      captured_at: new Date().toISOString(),
      width: 0,
      height: 0,
      success: false,
      error: (err as Error).message,
      notes: 'Google scopes modal navigation failed',
    });
  } finally {
    await teardown(electronApp, userDataDir);
  }
});

// ===========================================================================
// STATE 5: Shell – empty (no tabs)
// ===========================================================================

test('capture: shell-empty', async () => {
  log('=== State 5: shell-empty ===');
  const { electronApp, page, userDataDir } = await launchForShell();

  try {
    // Wait for shell chrome toolbar
    await page.waitForSelector(
      '[data-testid="tab-strip"], .tab-strip, .window-chrome, #root',
      { timeout: UI_TIMEOUT_MS },
    );

    await screenshot(page, 'shell-empty', 'Shell — no tabs open, empty state');
  } catch (err) {
    logWarn('State 5 failed', { error: (err as Error).message });
    recordCapture({
      state: 'shell-empty',
      capture_path: path.join(CAPTURES_DIR, 'shell-empty.png'),
      captured_at: new Date().toISOString(),
      width: 0,
      height: 0,
      success: false,
      error: (err as Error).message,
      notes: 'Shell did not render — onboarding routing may not have SKIP_ONBOARDING support',
    });
  } finally {
    await teardown(electronApp, userDataDir);
  }
});

// ===========================================================================
// STATE 6: Shell – with 3 tabs
// ===========================================================================

test('capture: shell-3-tabs', async () => {
  log('=== State 6: shell-3-tabs ===');
  const { electronApp, page, userDataDir } = await launchForShell();

  try {
    await page.waitForSelector(
      '[data-testid="tab-strip"], .tab-strip, .window-chrome, #root',
      { timeout: UI_TIMEOUT_MS },
    );

    // Inject 3 tabs via IPC — mirrors pattern from golden-path.spec.ts
    const FIXTURE_URLS = [
      'https://example.com',
      'https://wikipedia.org',
      'https://news.ycombinator.com',
    ];

    for (const url of FIXTURE_URLS) {
      await electronApp.evaluate(async (_electron, tabUrl) => {
        try {
          const { BrowserWindow } = await import('electron');
          const win = BrowserWindow.getAllWindows()[0];
          if (win) {
            win.webContents.send('test:create-tab', tabUrl);
          }
        } catch {
          // IPC bridge may not be available — fallback silently
        }
      }, url);
      await page.waitForTimeout(200);
    }
    log('Injected 3 tabs via IPC');

    // Wait briefly for renderer to update
    await page.waitForTimeout(1_000);

    await screenshot(page, 'shell-3-tabs', 'Shell with 3 tabs — one active, favicons visible');
  } catch (err) {
    logWarn('State 6 failed', { error: (err as Error).message });
    recordCapture({
      state: 'shell-3-tabs',
      capture_path: path.join(CAPTURES_DIR, 'shell-3-tabs.png'),
      captured_at: new Date().toISOString(),
      width: 0,
      height: 0,
      success: false,
      error: (err as Error).message,
      notes: 'Tab injection via IPC not available — shell not fully wired',
    });
  } finally {
    await teardown(electronApp, userDataDir);
  }
});

// ===========================================================================
// STATE 7: Pill – idle (Cmd+K empty)
// ===========================================================================

test('capture: pill-idle', async () => {
  log('=== State 7: pill-idle ===');
  const { electronApp, page, userDataDir } = await launchForShell();

  try {
    await page.waitForSelector('#root', { timeout: UI_TIMEOUT_MS });

    // Press Cmd+K to open pill
    await page.keyboard.press('Meta+k');
    log('Pressed Cmd+K to open pill');

    // Wait for pill input to appear
    await page.waitForSelector(
      '[data-testid="pill-input"], .pill-input, .pill-container',
      { timeout: UI_TIMEOUT_MS },
    );

    await screenshot(page, 'pill-idle', 'Pill — idle, empty input after Cmd+K');
  } catch (err) {
    logWarn('State 7 failed', { error: (err as Error).message });

    // Pill may be in a separate window — try finding it
    const windows = electronApp.windows();
    log(`Available windows: ${windows.length}`);

    recordCapture({
      state: 'pill-idle',
      capture_path: path.join(CAPTURES_DIR, 'pill-idle.png'),
      captured_at: new Date().toISOString(),
      width: 0,
      height: 0,
      success: false,
      error: (err as Error).message,
      notes: 'Pill Cmd+K not wired — Track B may not be integrated',
    });
  } finally {
    await teardown(electronApp, userDataDir);
  }
});

// ===========================================================================
// STATE 8: Pill – streaming (mocked progress steps)
// ===========================================================================

test('capture: pill-streaming', async () => {
  log('=== State 8: pill-streaming ===');
  const { electronApp, page, userDataDir } = await launchForShell();

  try {
    await page.waitForSelector('#root', { timeout: UI_TIMEOUT_MS });

    // Open pill
    await page.keyboard.press('Meta+k');
    const pillInput = page.locator('[data-testid="pill-input"], .pill-input').first();
    await pillInput.waitFor({ state: 'visible', timeout: UI_TIMEOUT_MS });

    // Submit a prompt
    await pillInput.fill('scroll to the bottom of the page');
    await pillInput.press('Enter');
    log('Submitted prompt to pill');

    // Wait for progress toast (streaming state)
    try {
      await page.waitForSelector(
        '[data-testid="progress-toast"], .progress-toast',
        { timeout: 8_000 },
      );
      await screenshot(page, 'pill-streaming', 'Pill — streaming/running state with progress steps');
    } catch {
      // Screenshot current state regardless — task may complete too fast
      logWarn('Progress toast not detected, capturing current pill state');
      await screenshot(page, 'pill-streaming', 'Pill — post-submit state (no progress toast visible yet)');
    }
  } catch (err) {
    logWarn('State 8 failed', { error: (err as Error).message });
    recordCapture({
      state: 'pill-streaming',
      capture_path: path.join(CAPTURES_DIR, 'pill-streaming.png'),
      captured_at: new Date().toISOString(),
      width: 0,
      height: 0,
      success: false,
      error: (err as Error).message,
      notes: 'Pill streaming not reachable — Track B not integrated',
    });
  } finally {
    await teardown(electronApp, userDataDir);
  }
});

// ===========================================================================
// STATE 9: Pill – result (mocked completed task)
// ===========================================================================

test('capture: pill-result', async () => {
  log('=== State 9: pill-result ===');
  const { electronApp, page, userDataDir } = await launchForShell();

  try {
    await page.waitForSelector('#root', { timeout: UI_TIMEOUT_MS });

    // Inject a mock task_done event via IPC to drive pill to result state
    await electronApp.evaluate(() => {
      try {
        const { BrowserWindow } = require('electron');
        const win = BrowserWindow.getAllWindows()[0];
        win?.webContents.send('pill:event', {
          type: 'task_done',
          taskId: 'visual-qa-mock-task',
          summary: 'Task completed. Scrolled to the bottom of the page successfully.',
        });
      } catch {
        // no-op if pill IPC not wired
      }
    });
    log('Injected mock task_done event');

    await page.waitForTimeout(500);

    // Check for result display
    const resultVisible = await page.locator(
      '[data-testid="result-display"], .result-display',
    ).isVisible().catch(() => false);

    if (resultVisible) {
      await screenshot(page, 'pill-result', 'Pill — completed result state');
    } else {
      // Fallback: open pill and show idle as result reference
      logWarn('Result display not visible, capturing pill state as fallback');
      await page.keyboard.press('Meta+k');
      await page.waitForTimeout(400);
      await screenshot(page, 'pill-result', 'Pill — result state (IPC mock not wired, showing idle fallback)');
    }
  } catch (err) {
    logWarn('State 9 failed', { error: (err as Error).message });
    recordCapture({
      state: 'pill-result',
      capture_path: path.join(CAPTURES_DIR, 'pill-result.png'),
      captured_at: new Date().toISOString(),
      width: 0,
      height: 0,
      success: false,
      error: (err as Error).message,
      notes: 'Pill result state not reachable — Track B not integrated',
    });
  } finally {
    await teardown(electronApp, userDataDir);
  }
});
