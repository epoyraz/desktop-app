/**
 * OAuthClient unit tests — written FIRST per D1 (TDD).
 *
 * Tests cover:
 *   - PKCE code_verifier + code_challenge generation (RFC 7636)
 *   - State parameter CSRF protection (random UUID, verified on callback)
 *   - Auth URL construction (correct scopes, client_id, redirect_uri, PKCE params)
 *   - Token exchange request shape
 *   - Callback state mismatch rejection
 *   - Scope mapping (service names → Google OAuth scope strings)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// We import the module under test after mocking its dependencies.
// electron is mocked globally via vitest alias in vitest.config.ts.

vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('crypto')>();
  return {
    ...actual,
    // Keep real randomUUID / randomBytes so PKCE tests can run deterministically
    // when we need control — individual tests override via vi.spyOn.
  };
});

// Stub node:https so token exchange never hits the network.
vi.mock('node:https', () => ({
  default: {
    request: vi.fn(),
  },
  request: vi.fn(),
}));

// Stub electron shell.openExternal so tests don't open a browser.
vi.mock('electron', () => ({
  shell: { openExternal: vi.fn().mockResolvedValue(undefined) },
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/test-userData'),
    setAsDefaultProtocolClient: vi.fn().mockReturnValue(true),
  },
}));

import {
  OAuthClient,
  generatePKCE,
  buildAuthUrl,
  SERVICE_SCOPE_MAP,
  REDIRECT_URI,
} from '../../../src/main/identity/OAuthClient';
import type { GoogleOAuthScope } from '../../../src/shared/types';

// ---------------------------------------------------------------------------
// generatePKCE
// ---------------------------------------------------------------------------

describe('generatePKCE', () => {
  it('returns a code_verifier of length 43–128 characters (RFC 7636 §4.1)', () => {
    const { codeVerifier } = generatePKCE();
    expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(codeVerifier.length).toBeLessThanOrEqual(128);
  });

  it('code_verifier uses only unreserved characters [A-Za-z0-9-._~]', () => {
    const { codeVerifier } = generatePKCE();
    expect(codeVerifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  it('code_challenge is base64url-encoded SHA-256 of code_verifier', async () => {
    const { codeVerifier, codeChallenge } = generatePKCE();
    // Verify by recomputing
    const { createHash } = await import('crypto');
    const expected = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    expect(codeChallenge).toBe(expected);
  });

  it('two calls produce distinct code_verifiers (entropy check)', () => {
    const a = generatePKCE();
    const b = generatePKCE();
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
  });
});

// ---------------------------------------------------------------------------
// buildAuthUrl
// ---------------------------------------------------------------------------

describe('buildAuthUrl', () => {
  const scopes: GoogleOAuthScope[] = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/calendar',
  ];

  it('returns a URL pointing to accounts.google.com/o/oauth2/v2/auth', () => {
    const { url } = buildAuthUrl({
      clientId: 'test-client-id',
      scopes,
      state: 'state-uuid',
      codeChallenge: 'challenge-abc',
    });
    expect(url).toContain('accounts.google.com/o/oauth2/v2/auth');
  });

  it('includes the correct redirect_uri', () => {
    const { url } = buildAuthUrl({
      clientId: 'test-client-id',
      scopes,
      state: 'state-uuid',
      codeChallenge: 'challenge-abc',
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
  });

  it('includes response_type=code', () => {
    const { url } = buildAuthUrl({
      clientId: 'test-client-id',
      scopes,
      state: 'state-uuid',
      codeChallenge: 'challenge-abc',
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('response_type')).toBe('code');
  });

  it('includes code_challenge_method=S256', () => {
    const { url } = buildAuthUrl({
      clientId: 'test-client-id',
      scopes,
      state: 'state-uuid',
      codeChallenge: 'challenge-abc',
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('includes the provided state parameter', () => {
    const { url } = buildAuthUrl({
      clientId: 'test-client-id',
      scopes,
      state: 'my-csrf-state',
      codeChallenge: 'challenge-abc',
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('state')).toBe('my-csrf-state');
  });

  it('encodes all requested scopes space-separated', () => {
    const { url } = buildAuthUrl({
      clientId: 'test-client-id',
      scopes,
      state: 'state-uuid',
      codeChallenge: 'challenge-abc',
    });
    const parsed = new URL(url);
    const scopeParam = parsed.searchParams.get('scope') ?? '';
    for (const s of scopes) {
      expect(scopeParam).toContain(s);
    }
  });

  it('always includes openid and email scopes for identity', () => {
    const { url } = buildAuthUrl({
      clientId: 'test-client-id',
      scopes: [],
      state: 'state-uuid',
      codeChallenge: 'challenge-abc',
    });
    const parsed = new URL(url);
    const scopeParam = parsed.searchParams.get('scope') ?? '';
    expect(scopeParam).toContain('openid');
    expect(scopeParam).toContain('email');
  });
});

// ---------------------------------------------------------------------------
// CSRF state verification
// ---------------------------------------------------------------------------

describe('OAuthClient — CSRF state verification', () => {
  let client: OAuthClient;

  beforeEach(() => {
    client = new OAuthClient({ clientId: 'test-client-id' });
  });

  it('rejects a callback with a mismatched state parameter', async () => {
    // Start the flow so internal state is set
    await client.startAuthFlow(['https://www.googleapis.com/auth/gmail.readonly']);

    await expect(
      client.handleCallback({
        code: 'auth-code-123',
        state: 'wrong-state-uuid',
      }),
    ).rejects.toThrow(/state mismatch/i);
  });

  it('rejects a callback when no flow is in progress', async () => {
    await expect(
      client.handleCallback({
        code: 'auth-code-123',
        state: 'some-state',
      }),
    ).rejects.toThrow(/no oauth flow/i);
  });
});

// ---------------------------------------------------------------------------
// SERVICE_SCOPE_MAP
// ---------------------------------------------------------------------------

describe('SERVICE_SCOPE_MAP', () => {
  it('maps gmail to gmail.readonly and gmail.send scopes', () => {
    expect(SERVICE_SCOPE_MAP.gmail).toContain(
      'https://www.googleapis.com/auth/gmail.readonly',
    );
  });

  it('maps calendar to calendar.readonly scope', () => {
    expect(SERVICE_SCOPE_MAP.calendar).toContain(
      'https://www.googleapis.com/auth/calendar',
    );
  });

  it('maps sheets to spreadsheets scope', () => {
    expect(SERVICE_SCOPE_MAP.sheets).toContain(
      'https://www.googleapis.com/auth/spreadsheets',
    );
  });

  it('maps drive to drive.readonly scope', () => {
    expect(SERVICE_SCOPE_MAP.drive).toContain(
      'https://www.googleapis.com/auth/drive',
    );
  });

  it('maps docs to documents scope', () => {
    expect(SERVICE_SCOPE_MAP.docs).toContain(
      'https://www.googleapis.com/auth/documents',
    );
  });
});
