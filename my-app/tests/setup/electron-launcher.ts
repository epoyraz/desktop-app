/**
 * Shared Electron launcher helper for Playwright E2E tests.
 *
 * Wraps `_electron.launch()` with:
 * - Correct path to the built artifact
 * - Isolated userData dir per test run (prevents session bleed)
 * - Verbose startup logging
 * - Clean teardown helper
 *
 * Usage in specs:
 *   import { launchApp, teardownApp, AppHandle } from '../setup/electron-launcher';
 *
 *   let app: AppHandle;
 *   test.beforeAll(async () => { app = await launchApp(); });
 *   test.afterAll(async () => { await teardownApp(app); });
 *
 * Track H owns this file.
 */

import { _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { ELECTRON_APP_PATH, MY_APP_DIR } from './playwright.config';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOG_PREFIX = '[ElectronLauncher]';
const LAUNCH_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LaunchOptions {
  /**
   * Override the built app path. Defaults to the value from playwright.config.ts.
   * Useful for integration tests that launch a dev build.
   */
  appPath?: string;
  /**
   * Override userData directory. If not set, a fresh temp dir is created for
   * each launch to provide full test isolation.
   */
  userDataDir?: string;
  /**
   * Extra environment variables to pass to the Electron process.
   */
  env?: Record<string, string>;
  /**
   * Extra args forwarded to the app (after the entry point).
   */
  args?: string[];
}

export interface AppHandle {
  electronApp: ElectronApplication;
  /** First BrowserWindow page (shell or onboarding) */
  firstWindow: Page;
  /** Ephemeral userData dir created for this launch (cleaned up by teardownApp) */
  userDataDir: string;
  /** Whether the userDataDir was created by the launcher (should be deleted on teardown) */
  cleanupUserData: boolean;
}

// ---------------------------------------------------------------------------
// launchApp
// ---------------------------------------------------------------------------

/**
 * Launch the Electron application for E2E testing.
 * Returns an AppHandle with the running ElectronApplication and first window.
 *
 * NOTE: Tests run against the BUILT artifact. Run `npm run make` in my-app/
 * before executing e2e tests. The specs are currently gated with test.skip()
 * until integration is ready (other tracks landed + artifact built).
 */
export async function launchApp(opts: LaunchOptions = {}): Promise<AppHandle> {
  const appPath = opts.appPath ?? ELECTRON_APP_PATH;

  let cleanupUserData = false;
  let userDataDir = opts.userDataDir ?? '';
  if (!userDataDir) {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agb-test-'));
    cleanupUserData = true;
    console.log(`${LOG_PREFIX} Created ephemeral userData: ${userDataDir}`);
  }

  console.log(`${LOG_PREFIX} Launching app: ${appPath}`);
  console.log(`${LOG_PREFIX} userData: ${userDataDir}`);

  const launchEnv: Record<string, string> = {
    ...process.env as Record<string, string>,
    // Force dev mode so agentic://diagnostics is available
    DEV_MODE: '1',
    // Prevent system keychain dialogs in CI
    KEYCHAIN_MOCK: '1',
    // Ensure telemetry writes locally only
    POSTHOG_API_KEY: '',
    ...opts.env,
  };

  const electronApp = await electron.launch({
    executablePath: appPath,
    args: [
      path.join(MY_APP_DIR, '.vite', 'build', 'main.js'),
      `--user-data-dir=${userDataDir}`,
      '--no-sandbox',
      '--disable-gpu',
      '--remote-debugging-port=0',
      ...(opts.args ?? []),
    ],
    env: launchEnv,
    timeout: LAUNCH_TIMEOUT_MS,
    cwd: MY_APP_DIR,
  });

  console.log(`${LOG_PREFIX} App launched. Waiting for first window...`);

  const firstWindow = await electronApp.firstWindow();
  await firstWindow.waitForLoadState('domcontentloaded');

  console.log(
    `${LOG_PREFIX} First window ready. Title: "${await firstWindow.title()}"`,
  );

  return { electronApp, firstWindow, userDataDir, cleanupUserData };
}

// ---------------------------------------------------------------------------
// teardownApp
// ---------------------------------------------------------------------------

/**
 * Gracefully close the Electron app and clean up ephemeral userData.
 */
export async function teardownApp(handle: AppHandle): Promise<void> {
  console.log(`${LOG_PREFIX} Tearing down app...`);
  try {
    await handle.electronApp.close();
  } catch (err) {
    console.warn(`${LOG_PREFIX} Close error (ignored): ${(err as Error).message}`);
  }

  if (handle.cleanupUserData && handle.userDataDir) {
    try {
      fs.rmSync(handle.userDataDir, { recursive: true, force: true });
      console.log(`${LOG_PREFIX} Cleaned up userData: ${handle.userDataDir}`);
    } catch (err) {
      console.warn(`${LOG_PREFIX} Failed to clean userData: ${(err as Error).message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Utility: evaluate in main process
// ---------------------------------------------------------------------------

/**
 * Execute a function in the Electron main process and return its result.
 * Useful for asserting IPC state, reading session files, etc.
 */
export async function evalInMain<T>(
  handle: AppHandle,
  fn: () => T,
): Promise<T> {
  return handle.electronApp.evaluate(fn);
}
