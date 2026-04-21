/**
 * Claude Code OAuth token bridge.
 *
 * Reads the OAuth credentials that Claude Code (the CLI) stores in the
 * macOS Keychain under service "Claude Code-credentials". Supports refresh
 * via the Anthropic OAuth token endpoint.
 *
 * This is undocumented — Anthropic could change storage/format/behavior at
 * any time. Use as an opportunistic onboarding shortcut, not a core path.
 *
 * Required headers when using the access token against the Messages API:
 *   Authorization: Bearer <accessToken>
 *   anthropic-beta: oauth-2025-04-20
 */

import { mainLogger } from '../logger';

// Public Claude Code OAuth client id (from the Claude Code install).
// Not a secret — this is the identifier Anthropic uses to scope the flow.
const CLAUDE_CODE_OAUTH_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const OAUTH_TOKEN_ENDPOINT = 'https://console.anthropic.com/v1/oauth/token';
const CLAUDE_CODE_KEYCHAIN_SERVICE = 'Claude Code-credentials';

export interface ClaudeOAuthCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;            // Unix ms
  scopes: string[];
  subscriptionType?: string;    // "max" | "pro" | etc.
}

interface KeytarLike {
  getPassword(service: string, account: string): Promise<string | null>;
  findGenericPassword?: (service: string) => Promise<{ account: string; password: string } | null>;
  findCredentials?: (service: string) => Promise<Array<{ account: string; password: string }>>;
}

function getKeytar(): KeytarLike | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('keytar') as KeytarLike;
  } catch {
    return null;
  }
}

/**
 * Read Claude Code's OAuth credentials from the local Keychain.
 * Returns null if Claude Code isn't installed or has never been signed in.
 */
export async function readClaudeCodeCredentials(): Promise<ClaudeOAuthCredentials | null> {
  const keytar = getKeytar();
  if (!keytar || !keytar.findCredentials) {
    mainLogger.debug('claudeCodeAuth.read.noKeytar');
    return null;
  }

  let items: Array<{ account: string; password: string }>;
  try {
    items = await keytar.findCredentials(CLAUDE_CODE_KEYCHAIN_SERVICE);
  } catch (err) {
    mainLogger.debug('claudeCodeAuth.read.findCredentialsFailed', {
      error: (err as Error).message,
    });
    return null;
  }

  if (!items || items.length === 0) return null;

  const raw = items[0].password;
  try {
    const parsed = JSON.parse(raw) as {
      claudeAiOauth?: {
        accessToken?: string;
        refreshToken?: string;
        expiresAt?: number;
        scopes?: string[];
        subscriptionType?: string;
      };
    };
    const oauth = parsed.claudeAiOauth;
    if (!oauth?.accessToken || !oauth?.refreshToken || !oauth?.expiresAt) {
      mainLogger.debug('claudeCodeAuth.read.missingFields');
      return null;
    }
    mainLogger.info('claudeCodeAuth.read.ok', {
      expiresAt: oauth.expiresAt,
      subscriptionType: oauth.subscriptionType,
      scopeCount: (oauth.scopes ?? []).length,
    });
    return {
      accessToken: oauth.accessToken,
      refreshToken: oauth.refreshToken,
      expiresAt: oauth.expiresAt,
      scopes: oauth.scopes ?? [],
      subscriptionType: oauth.subscriptionType,
    };
  } catch (err) {
    mainLogger.warn('claudeCodeAuth.read.parseFailed', {
      error: (err as Error).message,
    });
    return null;
  }
}

/**
 * Refresh an expired/expiring access token using the refresh token.
 * Returns the new credentials (new accessToken and expiresAt; refreshToken
 * may be rotated too).
 */
export async function refreshClaudeOAuth(
  refreshToken: string,
): Promise<ClaudeOAuthCredentials> {
  mainLogger.info('claudeCodeAuth.refresh');
  const res = await fetch(OAUTH_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLAUDE_CODE_OAUTH_CLIENT_ID,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    mainLogger.error('claudeCodeAuth.refresh.failed', {
      status: res.status,
      body: body.slice(0, 200),
    });
    throw new Error(`OAuth refresh failed: ${res.status}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };

  const now = Date.now();
  const creds: ClaudeOAuthCredentials = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: now + data.expires_in * 1000,
    scopes: data.scope ? data.scope.split(' ') : [],
  };

  mainLogger.info('claudeCodeAuth.refresh.ok', {
    expiresAt: creds.expiresAt,
    rotated: data.refresh_token !== undefined,
  });

  return creds;
}

/**
 * True if the token expires in < 5 minutes.
 */
export function isExpiringSoon(creds: ClaudeOAuthCredentials, buffer_ms = 5 * 60 * 1000): boolean {
  return creds.expiresAt - Date.now() < buffer_ms;
}
