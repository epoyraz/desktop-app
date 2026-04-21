import React, { useEffect, useState, useCallback } from 'react';
import anthropicLogo from './anthropic-logo.svg';
import claudeCodeLogo from './claude-code-logo.svg';

type WaStatus = 'disconnected' | 'connecting' | 'qr_ready' | 'connected' | 'error';
type AuthType = 'oauth' | 'apiKey' | 'none';
interface AuthStatus {
  type: AuthType;
  masked?: string;
  subscriptionType?: string | null;
  expiresAt?: number;
}

interface ConnectionsPaneProps {
  embedded?: boolean;
}

export function ConnectionsPane({ embedded }: ConnectionsPaneProps): React.ReactElement {
  const [waStatus, setWaStatus] = useState<WaStatus>('disconnected');
  const [waIdentity, setWaIdentity] = useState<string | null>(null);
  const [waDetail, setWaDetail] = useState<string | undefined>();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const [authStatus, setAuthStatus] = useState<AuthStatus>({ type: 'none' });
  const [claudeCodeAvailable, setClaudeCodeAvailable] = useState<{ available: boolean; subscriptionType?: string | null }>({ available: false });
  const [editing, setEditing] = useState(false);
  const [draftKey, setDraftKey] = useState('');
  const [keyStatus, setKeyStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [keyError, setKeyError] = useState<string | null>(null);

  const refreshKey = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.settings?.apiKey) return;
    const status = await api.settings.apiKey.getStatus();
    setAuthStatus(status);
    const cc = await api.settings.claudeCode?.available();
    if (cc) setClaudeCodeAvailable(cc);
  }, []);

  const handleUseClaudeCode = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.settings?.claudeCode) return;
    try {
      await api.settings.claudeCode.use();
      await refreshKey();
    } catch (err) {
      setKeyError((err as Error).message);
    }
  }, [refreshKey]);

  useEffect(() => {
    refreshKey();
  }, [refreshKey]);

  const handleSaveKey = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.settings?.apiKey) return;
    const trimmed = draftKey.trim();
    if (!trimmed) return;
    setKeyStatus('testing');
    setKeyError(null);
    const test = await api.settings.apiKey.test(trimmed);
    if (!test.success) {
      setKeyStatus('error');
      setKeyError(test.error ?? 'Key rejected by Anthropic');
      return;
    }
    await api.settings.apiKey.save(trimmed);
    setKeyStatus('ok');
    setDraftKey('');
    setEditing(false);
    await refreshKey();
  }, [draftKey, refreshKey]);

  const handleDeleteKey = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.settings?.apiKey) return;
    await api.settings.apiKey.delete();
    setKeyStatus('idle');
    setKeyError(null);
    await refreshKey();
  }, [refreshKey]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    api.channels?.whatsapp.status().then((res) => {
      setWaStatus(res.status as WaStatus);
      setWaIdentity(res.identity);
    }).catch(() => {});

    const unsubStatus = api.on?.channelStatus?.((channelId, status, detail) => {
      if (channelId !== 'whatsapp') return;
      setWaStatus(status as WaStatus);
      setWaDetail(detail);
      if (status === 'connected' && detail) {
        setWaIdentity(detail);
        setQrDataUrl(null);
      }
      if (status === 'disconnected' || status === 'error') {
        setQrDataUrl(null);
      }
    });

    const unsubQr = api.on?.whatsappQr?.((dataUrl) => {
      setQrDataUrl(dataUrl);
    });

    return () => {
      unsubStatus?.();
      unsubQr?.();
    };
  }, []);

  const handleConnect = useCallback(async () => {
    const api = window.electronAPI;
    if (!api) return;
    setQrDataUrl(null);
    await api.channels.whatsapp.connect();
  }, []);

  const handleDisconnect = useCallback(async () => {
    const api = window.electronAPI;
    if (!api) return;
    await api.channels.whatsapp.clearAuth();
    setWaIdentity(null);
    setQrDataUrl(null);
  }, []);

  const handleCancel = useCallback(async () => {
    const api = window.electronAPI;
    if (!api) return;
    await api.channels.whatsapp.disconnect();
    setQrDataUrl(null);
  }, []);

  const statusDotClass =
    waStatus === 'connected' ? 'conn-card__dot--connected' :
    waStatus === 'connecting' || waStatus === 'qr_ready' ? 'conn-card__dot--connecting' :
    waStatus === 'error' ? 'conn-card__dot--error' :
    'conn-card__dot--disconnected';

  const statusText =
    waStatus === 'connected' ? `Connected as ${waIdentity ?? 'unknown'}` :
    waStatus === 'connecting' ? 'Connecting...' :
    waStatus === 'qr_ready' ? 'Waiting for scan...' :
    waStatus === 'error' ? (waDetail ?? 'Connection error') :
    'Not connected';

  return (
    <div className={embedded ? 'conn-section' : 'conn-pane'}>
      {!embedded && <span className="conn-pane__title">Connections</span>}

      <div className="conn-card">
        <div className="conn-card__header">
          <img
            className="conn-card__icon"
            src={authStatus.type === 'oauth' ? claudeCodeLogo : anthropicLogo}
            alt=""
          />
          <div className="conn-card__info">
            <div className="conn-card__title-row">
              <span className="conn-card__name">Anthropic</span>
              <span className={`conn-card__dot ${authStatus.type !== 'none' ? 'conn-card__dot--connected' : 'conn-card__dot--disconnected'}`} />
            </div>
            <span className="conn-card__subtitle">
              {editing
                ? 'Enter a new key — it will be tested before saving'
                : authStatus.type === 'oauth'
                ? `Signed in with Claude ${authStatus.subscriptionType === 'max' ? 'Max' : authStatus.subscriptionType === 'pro' ? 'Pro' : 'subscription'}`
                : authStatus.type === 'apiKey' && authStatus.masked
                ? `API key · ${authStatus.masked}`
                : 'Not connected'}
            </span>
          </div>
          <div className="conn-card__actions">
            {!editing && authStatus.type === 'none' && claudeCodeAvailable.available && (
              <button className="conn-card__btn conn-card__btn--primary" onClick={handleUseClaudeCode}>
                Sign in with Claude
              </button>
            )}
            {!editing && authStatus.type === 'none' && (
              <button
                className="conn-card__btn conn-card__btn--secondary"
                onClick={() => { setEditing(true); setDraftKey(''); setKeyStatus('idle'); setKeyError(null); }}
              >
                Add API key
              </button>
            )}
            {!editing && authStatus.type === 'apiKey' && (
              <button
                className="conn-card__btn conn-card__btn--primary"
                onClick={() => { setEditing(true); setDraftKey(''); setKeyStatus('idle'); setKeyError(null); }}
              >
                Change
              </button>
            )}
            {!editing && authStatus.type !== 'none' && (
              <button className="conn-card__btn conn-card__btn--secondary" onClick={handleDeleteKey}>
                Sign out
              </button>
            )}
            {editing && (
              <button
                className="conn-card__btn conn-card__btn--secondary"
                onClick={() => { setEditing(false); setDraftKey(''); setKeyError(null); setKeyStatus('idle'); }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
        {editing && (
          <div className="conn-card__api-key-edit">
            <input
              type="password"
              className="conn-card__api-key-input"
              placeholder="sk-ant-..."
              value={draftKey}
              onChange={(e) => { setDraftKey(e.target.value); setKeyStatus('idle'); setKeyError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveKey(); }}
              autoFocus
            />
            <button
              className="conn-card__btn conn-card__btn--primary"
              onClick={handleSaveKey}
              disabled={!draftKey.trim() || keyStatus === 'testing'}
            >
              {keyStatus === 'testing' ? 'Testing...' : 'Save'}
            </button>
            {keyStatus === 'error' && keyError && (
              <span className="conn-card__api-key-error">{keyError}</span>
            )}
          </div>
        )}
      </div>

      <div className="conn-card">
        <div className="conn-card__header">
          <img
            className="conn-card__icon"
            src="https://static.whatsapp.net/rsrc.php/v3/yP/r/rYZqPCBaG70.png"
            alt=""
          />
          <div className="conn-card__info">
            <div className="conn-card__title-row">
              <span className="conn-card__name">WhatsApp</span>
              <span className={`conn-card__dot ${statusDotClass}`} />
            </div>
            <span className="conn-card__subtitle">
              {waStatus === 'connected' && waIdentity
                ? `+${waIdentity.replace(/(\d{1})(\d{3})(\d{3})(\d{4})/, '$1 ($2) $3-$4')}`
                : statusText}
            </span>
          </div>
          <div className="conn-card__actions">
            {waStatus === 'disconnected' && (
              <button className="conn-card__btn conn-card__btn--primary" onClick={handleConnect}>
                Connect
              </button>
            )}
            {(waStatus === 'qr_ready' || waStatus === 'connecting') && (
              <button className="conn-card__btn conn-card__btn--secondary" onClick={handleCancel}>
                Cancel
              </button>
            )}
            {waStatus === 'connected' && (
              <button className="conn-card__btn conn-card__btn--secondary" onClick={handleDisconnect}>
                Disconnect
              </button>
            )}
            {waStatus === 'error' && (
              <button className="conn-card__btn conn-card__btn--primary" onClick={handleConnect}>
                Reconnect
              </button>
            )}
          </div>
        </div>

        {(waStatus === 'qr_ready' || qrDataUrl) && (
          <div className="conn-card__qr">
            {qrDataUrl ? (
              <img
                className="conn-card__qr-img"
                src={qrDataUrl}
                alt="WhatsApp QR code"
              />
            ) : (
              <div className="conn-card__qr-loading">Generating QR...</div>
            )}
            <p className="conn-card__qr-hint">
              Open WhatsApp on your phone, go to Linked Devices, and scan this code
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ConnectionsPane;
