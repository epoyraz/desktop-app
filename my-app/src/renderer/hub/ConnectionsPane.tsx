import React, { useEffect, useState, useCallback } from 'react';

type WaStatus = 'disconnected' | 'connecting' | 'qr_ready' | 'connected' | 'error';

interface ConnectionsPaneProps {
  embedded?: boolean;
}

export function ConnectionsPane({ embedded }: ConnectionsPaneProps): React.ReactElement {
  const [waStatus, setWaStatus] = useState<WaStatus>('disconnected');
  const [waIdentity, setWaIdentity] = useState<string | null>(null);
  const [waDetail, setWaDetail] = useState<string | undefined>();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

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
          <div className="conn-card__service">
            <span className={`conn-card__dot ${statusDotClass}`} />
            <span className="conn-card__name">WhatsApp</span>
          </div>
          <span className="conn-card__status-text">{statusText}</span>
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
    </div>
  );
}

export default ConnectionsPane;
