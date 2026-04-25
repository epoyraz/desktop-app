/**
 * Stores all auth credentials (Anthropic API key + OAuth, OpenAI API key,
 * active auth-mode flag) under ONE macOS Keychain entry, JSON-encoded.
 *
 * Why one entry: each separate keychain entry triggers its own "allow"
 * prompt the first time an unsigned/ad-hoc-signed binary touches it.
 * Pre-consolidation we had four entries — and four prompts on first launch.
 * Now we have one prompt that decrypts everything; subsequent reads in the
 * same process come from the in-memory cache and never touch keychain again.
 *
 * Storage layout in macOS Keychain (via keytar):
 *   service = "com.browser-use.desktop.credentials"
 *   account = "default"
 *   password = JSON.stringify(Credentials)
 *
 * On first load we attempt to migrate from the legacy 4-entry layout
 * (com.browser-use.desktop.{anthropic, anthropic-oauth, openai, auth-mode})
 * for users who upgrade from the pre-consolidation build. After a successful
 * migration we delete the legacy entries so future launches go straight
 * through the consolidated path.
 */

import { mainLogger } from '../logger';
import {
  refreshClaudeOAuth,
  isExpiringSoon,
  type ClaudeOAuthCredentials,
} from './claudeCodeAuth';

const CREDENTIALS_SERVICE = 'com.browser-use.desktop.credentials';
const DEFAULT_ACCOUNT = 'default';

// Legacy services — read once on migration, deleted afterwards. Kept here so
// any external code that references them (e.g. for diagnostic dumps) still
// has a name to import. New code should NOT call keytar directly with these.
export const API_KEY_SERVICE = 'com.browser-use.desktop.anthropic';
export const OPENAI_KEY_SERVICE = 'com.browser-use.desktop.openai';
export const OAUTH_SERVICE = 'com.browser-use.desktop.anthropic-oauth';
const AUTH_MODE_SERVICE = 'com.browser-use.desktop.auth-mode';

export type AuthMode = 'apiKey' | 'claudeCode';

export type ResolvedAuth =
  | { type: 'apiKey'; value: string }
  | { type: 'oauth'; value: string; subscriptionType?: string }
  | null;

interface KeytarLike {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

function getKeytar(): KeytarLike | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('keytar') as KeytarLike;
  } catch {
    return null;
  }
}

interface Credentials {
  authMode: AuthMode | null;
  anthropicApiKey: string | null;
  anthropicOAuth: ClaudeOAuthCredentials | null;
  openaiApiKey: string | null;
}

function emptyCredentials(): Credentials {
  return { authMode: null, anthropicApiKey: null, anthropicOAuth: null, openaiApiKey: null };
}

// In-memory cache. Populated on first read; mutated by save/clear functions
// and persisted via persistCache. Lifetime = process; cleared if/when the
// app quits. Renderer never sees this — it goes through IPC handlers.
let cached: Credentials | null = null;
let loadingPromise: Promise<Credentials> | null = null;

function safeParseOAuth(raw: string): ClaudeOAuthCredentials | null {
  try { return JSON.parse(raw) as ClaudeOAuthCredentials; }
  catch (err) {
    mainLogger.warn('authStore.parseOAuth.failed', { error: (err as Error).message });
    return null;
  }
}

/**
 * Resolve and cache the full credentials blob. Concurrent calls reuse the
 * same in-flight load so we never hit keychain twice.
 */
async function getAll(): Promise<Credentials> {
  if (cached) return cached;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    const keytar = getKeytar();
    if (!keytar) {
      cached = emptyCredentials();
      return cached;
    }
    try {
      const blob = await keytar.getPassword(CREDENTIALS_SERVICE, DEFAULT_ACCOUNT);
      if (blob) {
        try {
          const parsed = JSON.parse(blob) as Partial<Credentials>;
          cached = {
            authMode: parsed.authMode === 'apiKey' || parsed.authMode === 'claudeCode' ? parsed.authMode : null,
            anthropicApiKey: parsed.anthropicApiKey ?? null,
            anthropicOAuth: parsed.anthropicOAuth ?? null,
            openaiApiKey: parsed.openaiApiKey ?? null,
          };
          return cached;
        } catch (err) {
          mainLogger.warn('authStore.parseBlob.failed', { error: (err as Error).message });
        }
      }
      // No blob yet — try the legacy 4-entry layout. This path runs at most
      // once per install: after migration we save the new blob and delete
      // the old entries.
      const [authModeRaw, apiKeyRaw, oauthRaw, openaiRaw] = await Promise.all([
        keytar.getPassword(AUTH_MODE_SERVICE, DEFAULT_ACCOUNT),
        keytar.getPassword(API_KEY_SERVICE, DEFAULT_ACCOUNT),
        keytar.getPassword(OAUTH_SERVICE, DEFAULT_ACCOUNT),
        keytar.getPassword(OPENAI_KEY_SERVICE, DEFAULT_ACCOUNT),
      ]);
      cached = {
        authMode: authModeRaw === 'apiKey' || authModeRaw === 'claudeCode' ? authModeRaw : null,
        anthropicApiKey: apiKeyRaw ?? null,
        anthropicOAuth: oauthRaw ? safeParseOAuth(oauthRaw) : null,
        openaiApiKey: openaiRaw ?? null,
      };
      const hasLegacyData =
        cached.authMode !== null ||
        cached.anthropicApiKey !== null ||
        cached.anthropicOAuth !== null ||
        cached.openaiApiKey !== null;
      if (hasLegacyData) {
        mainLogger.info('authStore.migration.start', {
          hasAuthMode: cached.authMode !== null,
          hasApiKey: cached.anthropicApiKey !== null,
          hasOAuth: cached.anthropicOAuth !== null,
          hasOpenAi: cached.openaiApiKey !== null,
        });
        await persistCache();
        await Promise.all([
          keytar.deletePassword(AUTH_MODE_SERVICE, DEFAULT_ACCOUNT).catch(() => false),
          keytar.deletePassword(API_KEY_SERVICE, DEFAULT_ACCOUNT).catch(() => false),
          keytar.deletePassword(OAUTH_SERVICE, DEFAULT_ACCOUNT).catch(() => false),
          keytar.deletePassword(OPENAI_KEY_SERVICE, DEFAULT_ACCOUNT).catch(() => false),
        ]);
        mainLogger.info('authStore.migration.complete');
      }
      return cached;
    } catch (err) {
      mainLogger.warn('authStore.getAll.failed', { error: (err as Error).message });
      cached = emptyCredentials();
      return cached;
    }
  })();
  try {
    return await loadingPromise;
  } finally {
    loadingPromise = null;
  }
}

async function persistCache(): Promise<void> {
  if (!cached) return;
  const keytar = getKeytar();
  if (!keytar) return;
  try {
    await keytar.setPassword(CREDENTIALS_SERVICE, DEFAULT_ACCOUNT, JSON.stringify(cached));
  } catch (err) {
    mainLogger.warn('authStore.persist.failed', { error: (err as Error).message });
  }
}

// ---------------------------------------------------------------------------
// Public API — same surface as before; backed by the consolidated blob.
// ---------------------------------------------------------------------------

export async function setAuthMode(mode: AuthMode): Promise<void> {
  const c = await getAll();
  c.authMode = mode;
  await persistCache();
  mainLogger.info('authStore.setAuthMode', { mode });
}

async function getAuthMode(): Promise<AuthMode | null> {
  return (await getAll()).authMode;
}

export async function saveApiKey(key: string): Promise<void> {
  const c = await getAll();
  c.anthropicApiKey = key;
  c.anthropicOAuth = null;
  c.authMode = 'apiKey';
  await persistCache();
  mainLogger.info('authStore.saveApiKey.ok');
}

export async function saveOpenAIKey(key: string): Promise<void> {
  const c = await getAll();
  c.openaiApiKey = key;
  await persistCache();
  mainLogger.info('authStore.saveOpenAIKey.ok');
}

export async function loadOpenAIKey(): Promise<string | null> {
  return (await getAll()).openaiApiKey;
}

export async function deleteOpenAIKey(): Promise<void> {
  const c = await getAll();
  c.openaiApiKey = null;
  await persistCache();
  mainLogger.info('authStore.deleteOpenAIKey.ok');
}

export async function saveOAuth(creds: ClaudeOAuthCredentials): Promise<void> {
  const c = await getAll();
  c.anthropicOAuth = creds;
  c.anthropicApiKey = null;
  await persistCache();
  mainLogger.info('authStore.saveOAuth.ok', {
    subscriptionType: creds.subscriptionType,
    expiresAt: creds.expiresAt,
  });
}

export async function clearAuth(): Promise<void> {
  const c = await getAll();
  c.anthropicApiKey = null;
  c.anthropicOAuth = null;
  await persistCache();
  mainLogger.info('authStore.clearAuth');
}

async function loadOAuth(): Promise<ClaudeOAuthCredentials | null> {
  return (await getAll()).anthropicOAuth;
}

async function loadApiKey(): Promise<string | null> {
  return (await getAll()).anthropicApiKey;
}

/** Read the stored Claude OAuth credential's subscriptionType ("max" | "pro"
 *  | ...) without touching active auth mode. Used at session-spawn time to
 *  label a session with the subscription tier that actually ran it. Returns
 *  null if no OAuth creds are stored or the field is missing. */
export async function loadClaudeSubscriptionType(): Promise<string | null> {
  return (await loadOAuth())?.subscriptionType ?? null;
}

/** Aggregated status surface for the Settings UI — replaces the per-key
 *  keytar reads that used to live in apiKeyIpc.ts. Returning everything
 *  in one shape keeps the consolidated cache hot and lets the renderer
 *  render its full state from a single round trip. */
export interface CredentialStatus {
  anthropic:
    | { type: 'oauth'; masked: string | undefined; subscriptionType: string | null; expiresAt: number | undefined }
    | { type: 'apiKey'; masked: string }
    | { type: 'none' };
  openai: { present: boolean; masked?: string };
}

function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return `${key.slice(0, 7)}...${key.slice(-4)}`;
}

export async function getCredentialStatus(): Promise<CredentialStatus> {
  const c = await getAll();
  const anthropic: CredentialStatus['anthropic'] = c.anthropicOAuth
    ? {
        type: 'oauth',
        masked: c.anthropicOAuth.accessToken ? maskKey(c.anthropicOAuth.accessToken) : undefined,
        subscriptionType: c.anthropicOAuth.subscriptionType ?? null,
        expiresAt: c.anthropicOAuth.expiresAt,
      }
    : c.anthropicApiKey
      ? { type: 'apiKey', masked: maskKey(c.anthropicApiKey) }
      : { type: 'none' };
  const openai: CredentialStatus['openai'] = c.openaiApiKey
    ? { present: true, masked: maskKey(c.openaiApiKey) }
    : { present: false };
  return { anthropic, openai };
}

/**
 * Resolve the current auth. Prefers OAuth (if stored and refreshable), falls
 * back to API key, then environment ANTHROPIC_API_KEY.
 *
 * Behaviour matches the pre-consolidation version exactly: only returns a
 * non-null value when authStore mode is 'apiKey'; in 'claudeCode' (or unset)
 * mode we let the Claude CLI's own keychain entry win.
 */
export async function resolveAuth(): Promise<ResolvedAuth> {
  const mode = await getAuthMode();
  if (mode !== 'apiKey') {
    mainLogger.info('authStore.resolveAuth.claudeCodeMode', { mode: mode ?? 'default' });
    return null;
  }

  const oauth = await loadOAuth();
  if (oauth) {
    let current = oauth;
    if (isExpiringSoon(current)) {
      mainLogger.info('authStore.resolveAuth.refreshing', {
        expiresAt: current.expiresAt,
      });
      try {
        current = await refreshClaudeOAuth(current.refreshToken);
        await saveOAuth(current);
      } catch (err) {
        mainLogger.warn('authStore.resolveAuth.refreshFailed', {
          error: (err as Error).message,
        });
      }
    }
    return {
      type: 'oauth',
      value: current.accessToken,
      subscriptionType: current.subscriptionType,
    };
  }

  const apiKey = await loadApiKey();
  if (apiKey) return { type: 'apiKey', value: apiKey };

  const envKey = process.env.ANTHROPIC_API_KEY;
  if (envKey) return { type: 'apiKey', value: envKey };

  return null;
}
