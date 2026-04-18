/**
 * Preload script for chrome:// internal pages.
 * Exposes a safe contextBridge API for system info, downloads, and navigation.
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('chromeAPI', {
  getPage: (): string => {
    const hash = window.location.hash.replace('#', '');
    return hash || 'about';
  },

  getVersionInfo: (): Promise<Record<string, string>> =>
    ipcRenderer.invoke('chrome:version-info'),

  getGpuInfo: (): Promise<Record<string, unknown>> =>
    ipcRenderer.invoke('chrome:gpu-info'),

  getDownloads: (): Promise<Array<Record<string, unknown>>> =>
    ipcRenderer.invoke('downloads:get-all'),

  getAccessibilityInfo: (): Promise<Record<string, unknown>> =>
    ipcRenderer.invoke('chrome:accessibility-info'),

  getSandboxInfo: (): Promise<Record<string, unknown>> =>
    ipcRenderer.invoke('chrome:sandbox-info'),

  navigateTo: (url: string): Promise<void> =>
    ipcRenderer.invoke('tabs:navigate-active', url),

  openInternalPage: (page: string): Promise<void> =>
    ipcRenderer.invoke('chrome:open-page', page),
});
