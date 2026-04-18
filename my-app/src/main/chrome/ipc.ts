/**
 * IPC handlers for chrome:// internal pages.
 * Exposes version, GPU, accessibility, and sandbox info to the renderer.
 */

import { app, ipcMain } from 'electron';
import { mainLogger } from '../logger';

const CHANNELS = [
  'chrome:version-info',
  'chrome:gpu-info',
  'chrome:accessibility-info',
  'chrome:sandbox-info',
  'chrome:open-page',
] as const;

export function registerChromeHandlers(
  openInternalPage: (page: string) => void,
  openSettingsWindow: () => void,
  openExtensionsWindow: () => void,
): void {
  mainLogger.info('chrome.ipc.register');

  ipcMain.handle('chrome:version-info', () => {
    mainLogger.debug('chrome.ipc.versionInfo');
    return {
      appName: app.getName(),
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron ?? 'unknown',
      chromeVersion: process.versions.chrome ?? 'unknown',
      nodeVersion: process.versions.node ?? 'unknown',
      v8Version: process.versions.v8 ?? 'unknown',
      osArch: process.arch,
      osPlatform: process.platform,
      osVersion: process.getSystemVersion(),
      userData: app.getPath('userData'),
      execPath: app.getPath('exe'),
      locale: app.getLocale(),
    };
  });

  ipcMain.handle('chrome:gpu-info', async () => {
    mainLogger.debug('chrome.ipc.gpuInfo');
    try {
      const info = await app.getGPUInfo('complete');
      return info;
    } catch (err) {
      mainLogger.warn('chrome.ipc.gpuInfo.failed', { error: String(err) });
      return { error: String(err) };
    }
  });

  ipcMain.handle('chrome:accessibility-info', () => {
    mainLogger.debug('chrome.ipc.accessibilityInfo');
    return {
      accessibilitySupportEnabled: app.accessibilitySupportEnabled,
    };
  });

  ipcMain.handle('chrome:sandbox-info', () => {
    mainLogger.debug('chrome.ipc.sandboxInfo');
    return {
      sandboxed: process.sandboxed ?? false,
      contextIsolated: true,
      nodeIntegration: false,
    };
  });

  ipcMain.handle('chrome:open-page', (_event, page: string) => {
    mainLogger.info('chrome.ipc.openPage', { page });
    if (page === 'settings') {
      openSettingsWindow();
    } else if (page === 'extensions') {
      openExtensionsWindow();
    } else {
      openInternalPage(page);
    }
  });
}

export function unregisterChromeHandlers(): void {
  mainLogger.info('chrome.ipc.unregister');
  for (const ch of CHANNELS) {
    ipcMain.removeHandler(ch);
  }
}
