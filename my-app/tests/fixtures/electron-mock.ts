/**
 * Minimal Electron module mock for unit tests running outside Electron.
 *
 * Required because telemetry.ts and logger.ts try to import `electron`
 * to call app.getPath('userData'). Both modules have fallbacks to os.tmpdir()
 * when electron is unavailable — this mock ensures the require() doesn't throw.
 *
 * Track H owns this file.
 */

import * as os from 'node:os';
import * as path from 'node:path';

const userDataPath = path.join(os.tmpdir(), 'AgenticBrowser-test');

export const app = {
  getPath: (name: string): string => {
    if (name === 'userData') return userDataPath;
    if (name === 'logs') return path.join(userDataPath, 'logs');
    if (name === 'temp') return os.tmpdir();
    return userDataPath;
  },
  getVersion: (): string => '0.1.0-test',
  getName: (): string => 'AgenticBrowser',
  isReady: (): boolean => true,
  whenReady: (): Promise<void> => Promise.resolve(),
};

export const ipcMain = {
  handle: () => undefined,
  removeHandler: () => undefined,
  on: () => undefined,
  off: () => undefined,
  emit: () => false,
};

export const BrowserWindow = {
  getAllWindows: () => [],
  getFocusedWindow: () => null,
};

export const globalShortcut = {
  register: () => false,
  unregister: () => undefined,
  unregisterAll: () => undefined,
};

export const screen = {
  getAllDisplays: () => [
    { bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
  ],
  getPrimaryDisplay: () => ({
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workAreaSize: { width: 1920, height: 1080 },
  }),
};

export const nativeImage = {
  createEmpty: () => ({}),
  createFromPath: () => ({}),
};

export const shell = {
  openExternal: (_url: string) => Promise.resolve(),
};

export default {
  app,
  ipcMain,
  BrowserWindow,
  globalShortcut,
  screen,
  nativeImage,
  shell,
};
