/**
 * apiKeyIpc.ts — IPC handlers for managing Anthropic auth from the hub
 * Settings pane. Supports both API keys and Claude Code OAuth credentials.
 *
 * Security invariant: raw key/token values are NEVER logged.
 */

import { ipcMain } from 'electron';
import { mainLogger } from '../logger';
import { assertString } from '../ipc-validators';
import { saveApiKey, saveOAuth, clearAuth, API_KEY_SERVICE, OAUTH_SERVICE } from '../identity/authStore';
import { readClaudeCodeCredentials } from '../identity/claudeCodeAuth';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const TEST_MODEL = 'claude-haiku-4-5-20251001';
const TEST_TIMEOUT_MS = 8000;

const CH_GET_STATUS = 'settings:api-key:get-status';
const CH_GET_MASKED = 'settings:api-key:get-masked';
const CH_SAVE = 'settings:api-key:save';
const CH_TEST = 'settings:api-key:test';
const CH_DELETE = 'settings:api-key:delete';
const CH_CC_AVAILABLE = 'settings:claude-code:available';
const CH_CC_USE = 'settings:claude-code:use';

const ACCOUNT = 'default';

interface KeytarLike {
  getPassword(service: string, account: string): Promise<string | null>;
}

function loadKeytar(): KeytarLike | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('keytar') as KeytarLike;
  } catch {
    return null;
  }
}

function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return `${key.slice(0, 7)}...${key.slice(-4)}`;
}

export interface AuthStatus {
  type: 'oauth' | 'apiKey' | 'none';
  masked?: string;
  subscriptionType?: string | null;
  expiresAt?: number;
}

async function handleGetStatus(): Promise<AuthStatus> {
  const keytar = loadKeytar();
  if (!keytar) return { type: 'none' };

  try {
    const oauthRaw = await keytar.getPassword(OAUTH_SERVICE, ACCOUNT);
    if (oauthRaw) {
      const parsed = JSON.parse(oauthRaw) as { subscriptionType?: string; expiresAt?: number; accessToken?: string };
      return {
        type: 'oauth',
        subscriptionType: parsed.subscriptionType ?? null,
        expiresAt: parsed.expiresAt,
        masked: parsed.accessToken ? maskKey(parsed.accessToken) : undefined,
      };
    }
  } catch (err) {
    mainLogger.warn('apiKeyIpc.getStatus.oauthError', { error: (err as Error).message });
  }

  try {
    const raw = await keytar.getPassword(API_KEY_SERVICE, ACCOUNT);
    if (raw) return { type: 'apiKey', masked: maskKey(raw) };
  } catch (err) {
    mainLogger.warn('apiKeyIpc.getStatus.apiKeyError', { error: (err as Error).message });
  }

  return { type: 'none' };
}

/** Legacy — kept for existing ConnectionsPane callers until they migrate. */
async function handleGetMasked(): Promise<{ present: boolean; masked: string | null }> {
  const status = await handleGetStatus();
  if (status.type === 'none') return { present: false, masked: null };
  return { present: true, masked: status.masked ?? null };
}

async function handleSave(_e: Electron.IpcMainInvokeEvent, key: string): Promise<void> {
  const validated = assertString(key, 'key', 500);
  mainLogger.info('apiKeyIpc.save', { keyLength: validated.length });
  await saveApiKey(validated);
  mainLogger.info('apiKeyIpc.save.ok');
}

async function handleTest(
  _e: Electron.IpcMainInvokeEvent,
  key: string,
): Promise<{ success: boolean; error?: string }> {
  const validated = assertString(key, 'key', 500);
  mainLogger.info('apiKeyIpc.test', { keyLength: validated.length });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': validated,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: TEST_MODEL,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    clearTimeout(timeoutId);
    if (response.ok) return { success: true };
    let errorMsg = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      if (body?.error?.message) errorMsg = body.error.message;
    } catch { /* ignore */ }
    mainLogger.warn('apiKeyIpc.test.failed', { status: response.status, error: errorMsg });
    return { success: false, error: errorMsg };
  } catch (err) {
    clearTimeout(timeoutId);
    const msg = (err as Error).message ?? 'Network error';
    mainLogger.warn('apiKeyIpc.test.exception', { error: msg });
    return { success: false, error: msg };
  }
}

async function handleDelete(): Promise<void> {
  mainLogger.info('apiKeyIpc.delete');
  await clearAuth();
}

async function handleClaudeCodeAvailable(): Promise<{ available: boolean; subscriptionType?: string | null }> {
  const creds = await readClaudeCodeCredentials();
  if (!creds) return { available: false };
  if (!creds.scopes.includes('user:inference')) return { available: false };
  return { available: true, subscriptionType: creds.subscriptionType ?? null };
}

async function handleUseClaudeCode(): Promise<{ subscriptionType: string | null }> {
  const creds = await readClaudeCodeCredentials();
  if (!creds) throw new Error('Claude Code credentials not found');
  if (!creds.scopes.includes('user:inference')) {
    throw new Error('Claude Code token missing user:inference scope');
  }
  await saveOAuth(creds);
  return { subscriptionType: creds.subscriptionType ?? null };
}

export function registerApiKeyHandlers(): void {
  ipcMain.handle(CH_GET_STATUS, handleGetStatus);
  ipcMain.handle(CH_GET_MASKED, handleGetMasked);
  ipcMain.handle(CH_SAVE, handleSave);
  ipcMain.handle(CH_TEST, handleTest);
  ipcMain.handle(CH_DELETE, handleDelete);
  ipcMain.handle(CH_CC_AVAILABLE, handleClaudeCodeAvailable);
  ipcMain.handle(CH_CC_USE, handleUseClaudeCode);
  mainLogger.info('apiKeyIpc.register.ok');
}

export function unregisterApiKeyHandlers(): void {
  ipcMain.removeHandler(CH_GET_STATUS);
  ipcMain.removeHandler(CH_GET_MASKED);
  ipcMain.removeHandler(CH_SAVE);
  ipcMain.removeHandler(CH_TEST);
  ipcMain.removeHandler(CH_DELETE);
  ipcMain.removeHandler(CH_CC_AVAILABLE);
  ipcMain.removeHandler(CH_CC_USE);
}
