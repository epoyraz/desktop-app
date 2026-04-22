/**
 * Preload for the logs window. Exposes what TerminalPane needs plus a tiny
 * `logsAPI` for close/active-session signalling. Verbose logging so we can
 * see the stream reaching this window when the xterm is empty.
 */

import { contextBridge, ipcRenderer } from 'electron';

// eslint-disable-next-line no-console
console.log('[logs-preload] init');

contextBridge.exposeInMainWorld('electronAPI', {
  sessions: {
    getTermReplay: async (id: string): Promise<string> => {
      console.log('[logs-preload] getTermReplay', { id });
      const replay = await ipcRenderer.invoke('sessions:get-term-replay', id);
      console.log('[logs-preload] getTermReplay result', {
        id,
        length: typeof replay === 'string' ? replay.length : 'non-string',
      });
      return replay;
    },
    revealOutput: (filePath: string): Promise<{ revealed: boolean }> =>
      ipcRenderer.invoke('sessions:reveal-output', filePath),
  },
  on: {
    sessionOutputTerm: (cb: (id: string, bytes: string) => void): (() => void) => {
      console.log('[logs-preload] subscribe sessionOutputTerm');
      const handler = (_e: unknown, id: string, bytes: string) => {
        console.log('[logs-preload] session-output-term received', {
          id,
          byteLen: bytes?.length ?? 0,
        });
        if (typeof id === 'string' && typeof bytes === 'string') cb(id, bytes);
      };
      ipcRenderer.on('session-output-term', handler);
      return () => {
        console.log('[logs-preload] unsubscribe sessionOutputTerm');
        ipcRenderer.removeListener('session-output-term', handler);
      };
    },
  },
});

contextBridge.exposeInMainWorld('logsAPI', {
  close: (): void => {
    console.log('[logs-preload] close');
    ipcRenderer.send('logs:close');
  },
  onActiveSessionChanged: (cb: (sessionId: string | null) => void): (() => void) => {
    console.log('[logs-preload] subscribe onActiveSessionChanged');
    const handler = (_e: unknown, id: string | null) => {
      console.log('[logs-preload] active-session-changed', { id });
      cb(id);
    };
    ipcRenderer.on('logs:active-session-changed', handler);
    return () => ipcRenderer.removeListener('logs:active-session-changed', handler);
  },
});

console.log('[logs-preload] ready');
