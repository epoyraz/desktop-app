import React, { useEffect, useState } from 'react';
import { TerminalPane } from '../hub/TerminalPane';

declare global {
  interface Window {
    logsAPI: {
      close: () => void;
      onActiveSessionChanged: (cb: (id: string | null) => void) => () => void;
    };
  }
}

export function LogsApp(): React.ReactElement {
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    console.log('[LogsApp] mount, subscribing to active-session-changed');
    const unsub = window.logsAPI.onActiveSessionChanged((id) => {
      console.log('[LogsApp] active session changed', { id });
      setSessionId(id);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        console.log('[LogsApp] Esc -> close');
        e.preventDefault();
        window.logsAPI.close();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    console.log('[LogsApp] render for session', { sessionId });
  }, [sessionId]);

  return (
    <div className="logs-root">
      {sessionId ? (
        <TerminalPane sessionId={sessionId} />
      ) : (
        <div className="logs-empty">waiting for session…</div>
      )}
    </div>
  );
}

export default LogsApp;
