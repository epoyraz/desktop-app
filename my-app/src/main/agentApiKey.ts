/**
 * Returns the credential to use when calling the Anthropic Messages API.
 * Delegates to authStore which handles both API keys and Claude Code OAuth
 * bearer tokens (with auto-refresh).
 *
 * Callers get back just a string — API key (sk-ant-api03-...) or OAuth
 * access token (sk-ant-oat01-...). Downstream code branches on the
 * prefix to choose between x-api-key and Bearer.
 */

import { mainLogger } from './logger';
import { resolveAuth, type ResolvedAuth } from './identity/authStore';

export const API_KEY_KEYCHAIN_SERVICE = 'com.agenticbrowser.anthropic';

export interface KeytarLike {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

export interface GetApiKeyOptions {
  keytarModule?: KeytarLike;
  accountEmail?: string;
}

export async function resolveAgentAuth(): Promise<ResolvedAuth> {
  return resolveAuth();
}

/**
 * Legacy getter: returns the raw token string. Kept for existing callers that
 * pass it to runAgent({ apiKey }); agent detects OAuth by the sk-ant-oat prefix.
 */
export async function getApiKey(_opts: GetApiKeyOptions = {}): Promise<string | null> {
  const auth = await resolveAuth();
  if (!auth) {
    mainLogger.warn('agentApiKey.getApiKey.none');
    return null;
  }
  mainLogger.info('agentApiKey.getApiKey.ok', {
    authType: auth.type,
    length: auth.value.length,
  });
  return auth.value;
}
