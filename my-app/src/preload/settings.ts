/**
 * Settings preload — contextBridge API for the settings renderer.
 *
 * Exposes a typed API surface on window.settingsAPI:
 *   - API key: save, load, test
 *   - Agent name: get, set
 *   - Theme: get, set
 *   - OAuth scopes: get status, re-consent
 *   - Factory reset
 *   - Window close
 *
 * All IPC channels are namespaced under 'settings:' to avoid collisions.
 *
 * D2 logging: every IPC call logged at debug level. API keys are NEVER logged.
 */

import { contextBridge, ipcRenderer } from 'electron';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApiKeyTestResult {
  success: boolean;
  error?: string;
}

export interface OAuthScopeStatus {
  scope: string;
  label: string;
  granted: boolean;
}

export interface SettingsAPI {
  /** Save API key to Keychain (never logged) */
  saveApiKey: (key: string) => Promise<void>;

  /** Load API key from Keychain (returns masked version for display) */
  loadApiKey: () => Promise<string | null>;

  /** Test API key with a cheap Anthropic API probe */
  testApiKey: (key: string) => Promise<ApiKeyTestResult>;

  /** Get the current agent name */
  getAgentName: () => Promise<string | null>;

  /** Set the agent name */
  setAgentName: (name: string) => Promise<void>;

  /** Get the current theme preference */
  getTheme: () => Promise<string>;

  /** Set the theme preference */
  setTheme: (theme: string) => Promise<void>;

  /** Get OAuth scope grant status for all Google services */
  getOAuthScopes: () => Promise<OAuthScopeStatus[]>;

  /** Re-consent a specific OAuth scope */
  reConsentScope: (scope: string) => Promise<void>;

  /** Perform factory reset — deletes all data, relaunches app */
  factoryReset: () => Promise<void>;

  /** Close the settings window */
  closeWindow: () => void;
}

// ---------------------------------------------------------------------------
// contextBridge exposure
// ---------------------------------------------------------------------------

const api: SettingsAPI = {
  saveApiKey: async (key: string): Promise<void> => {
    console.debug('[settings-preload] saveApiKey', { keyLength: key.length });
    await ipcRenderer.invoke('settings:save-api-key', key);
  },

  loadApiKey: async (): Promise<string | null> => {
    console.debug('[settings-preload] loadApiKey');
    return ipcRenderer.invoke('settings:load-api-key') as Promise<string | null>;
  },

  testApiKey: async (key: string): Promise<ApiKeyTestResult> => {
    console.debug('[settings-preload] testApiKey', { keyLength: key.length });
    return ipcRenderer.invoke('settings:test-api-key', key) as Promise<ApiKeyTestResult>;
  },

  getAgentName: async (): Promise<string | null> => {
    console.debug('[settings-preload] getAgentName');
    return ipcRenderer.invoke('settings:get-agent-name') as Promise<string | null>;
  },

  setAgentName: async (name: string): Promise<void> => {
    console.debug('[settings-preload] setAgentName', { nameLength: name.length });
    await ipcRenderer.invoke('settings:set-agent-name', name);
  },

  getTheme: async (): Promise<string> => {
    console.debug('[settings-preload] getTheme');
    return ipcRenderer.invoke('settings:get-theme') as Promise<string>;
  },

  setTheme: async (theme: string): Promise<void> => {
    console.debug('[settings-preload] setTheme', { theme });
    await ipcRenderer.invoke('settings:set-theme', theme);
  },

  getOAuthScopes: async (): Promise<OAuthScopeStatus[]> => {
    console.debug('[settings-preload] getOAuthScopes');
    return ipcRenderer.invoke('settings:get-oauth-scopes') as Promise<OAuthScopeStatus[]>;
  },

  reConsentScope: async (scope: string): Promise<void> => {
    console.debug('[settings-preload] reConsentScope', { scope });
    await ipcRenderer.invoke('settings:re-consent-scope', scope);
  },

  factoryReset: async (): Promise<void> => {
    console.debug('[settings-preload] factoryReset');
    await ipcRenderer.invoke('settings:factory-reset');
  },

  closeWindow: (): void => {
    console.debug('[settings-preload] closeWindow');
    ipcRenderer.send('settings:close-window');
  },
};

contextBridge.exposeInMainWorld('settingsAPI', api);
