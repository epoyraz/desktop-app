/**
 * Preload script for the pill renderer.
 *
 * Exposes a safe contextBridge API for:
 * - Submitting agent tasks (pill:submit)
 * - Listening to agent events (pill:event)
 * - Dismissing the pill (pill:hide)
 * - Getting active tab CDP URL (forwarded from Track A preload)
 *
 * D2: Verbose dev-only logging on IPC events.
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { AgentEvent } from '../shared/types';

// ---------------------------------------------------------------------------
// D2 — Dev-only structured logger
// ---------------------------------------------------------------------------

const DEV =
  process.env.NODE_ENV !== 'production' || process.env.AGENTIC_DEV === '1';

const log = {
  debug: DEV
    ? (comp: string, ctx: object) =>
        console.log(
          JSON.stringify({ ts: Date.now(), level: 'debug', component: comp, ...ctx }),
        )
    : () => {},
  info: DEV
    ? (comp: string, ctx: object) =>
        console.log(
          JSON.stringify({ ts: Date.now(), level: 'info', component: comp, ...ctx }),
        )
    : () => {},
  warn: (comp: string, ctx: object) =>
    console.warn(JSON.stringify({ ts: Date.now(), level: 'warn', component: comp, ...ctx })),
  error: (comp: string, ctx: object) =>
    console.error(
      JSON.stringify({ ts: Date.now(), level: 'error', component: comp, ...ctx }),
    ),
};

log.info('preload.pill', { message: 'Pill preload script initializing' });

// ---------------------------------------------------------------------------
// contextBridge API
// ---------------------------------------------------------------------------

contextBridge.exposeInMainWorld('pillAPI', {
  /**
   * Submit a prompt to the agent.
   * Main process handles: get active CDP URL, generate task_id, send to daemon.
   */
  submit: (prompt: string): Promise<{ task_id: string }> => {
    log.info('preload.pill.submit', {
      message: 'Invoking pill:submit',
      promptLength: prompt.length,
    });
    return ipcRenderer.invoke('pill:submit', { prompt });
  },

  /**
   * Hide the pill window (Esc key or close button).
   */
  hide: (): void => {
    log.info('preload.pill.hide', { message: 'Invoking pill:hide' });
    ipcRenderer.invoke('pill:hide');
  },

  /**
   * Subscribe to agent events forwarded from the main process.
   * Returns an unsubscribe function.
   */
  onEvent: (callback: (event: AgentEvent) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, event: AgentEvent) => {
      log.debug('preload.pill.onEvent', {
        message: 'Received agent event',
        eventType: event.event,
        task_id: event.task_id,
      });
      callback(event);
    };

    ipcRenderer.on('pill:event', handler);
    log.debug('preload.pill.onEvent.subscribe', {
      message: 'Subscribed to pill:event channel',
    });

    return () => {
      ipcRenderer.removeListener('pill:event', handler);
      log.debug('preload.pill.onEvent.unsubscribe', {
        message: 'Unsubscribed from pill:event channel',
      });
    };
  },

  /**
   * Subscribe to hide requests from main (e.g., after task_done + 5s timer).
   * Returns an unsubscribe function.
   */
  onHideRequest: (callback: () => void): (() => void) => {
    const handler = () => {
      log.info('preload.pill.onHideRequest', {
        message: 'Hide request received from main process',
      });
      callback();
    };

    ipcRenderer.on('pill:hide-request', handler);

    return () => {
      ipcRenderer.removeListener('pill:hide-request', handler);
    };
  },

  /**
   * Subscribe to task queue notifications (Cmd+K pressed during active run).
   * Returns an unsubscribe function.
   */
  onQueuedTask: (callback: (data: { prompt: string; task_id: string }) => void): (() => void) => {
    const handler = (
      _e: Electron.IpcRendererEvent,
      data: { prompt: string; task_id: string },
    ) => {
      log.info('preload.pill.onQueuedTask', {
        message: 'Task was queued (pill was visible during Cmd+K)',
        task_id: data.task_id,
      });
      callback(data);
    };

    ipcRenderer.on('pill:task-queued', handler);

    return () => {
      ipcRenderer.removeListener('pill:task-queued', handler);
    };
  },
});

log.info('preload.pill.ready', {
  message: 'Pill preload script ready — pillAPI exposed to renderer',
});
