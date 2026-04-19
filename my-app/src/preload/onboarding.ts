import { contextBridge, ipcRenderer } from 'electron';

export interface ChromeProfile {
  directory: string;
  name: string;
  email: string;
  avatarIcon: string;
}

export interface CookieImportResult {
  total: number;
  imported: number;
  failed: number;
  skipped: number;
}

const onboardingAPI = {
  detectChromeProfiles: (): Promise<ChromeProfile[]> =>
    ipcRenderer.invoke('chrome-import:detect-profiles'),

  importChromeProfileCookies: (profileDir: string): Promise<CookieImportResult> =>
    ipcRenderer.invoke('chrome-import:import-cookies', profileDir),

  saveApiKey: (key: string): Promise<void> =>
    ipcRenderer.invoke('onboarding:save-api-key', key),

  testApiKey: (key: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('onboarding:test-api-key', key),

  complete: (): Promise<void> =>
    ipcRenderer.invoke('onboarding:complete'),
};

contextBridge.exposeInMainWorld('onboardingAPI', onboardingAPI);

export type OnboardingAPI = typeof onboardingAPI;
