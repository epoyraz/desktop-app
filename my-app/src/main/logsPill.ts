/**
 * Logs window — a small always-on-top BrowserWindow that overlays the
 * embedded browser view, anchored to the pane rect supplied by the renderer.
 * Hosts a single xterm for whichever session the user has targeted.
 * Distinct from the command pill.
 */

import { BrowserWindow } from 'electron';
import path from 'node:path';
import { mainLogger } from './logger';

const log = {
  info: (c: string, x: object) => mainLogger.info(c, x as Record<string, unknown>),
  warn: (c: string, x: object) => mainLogger.warn(c, x as Record<string, unknown>),
  error: (c: string, x: object) => mainLogger.error(c, x as Record<string, unknown>),
  debug: (c: string, x: object) => mainLogger.debug(c, x as Record<string, unknown>),
};

const LOGS_WIDTH = 380;
const LOGS_HEIGHT = 220;
const LOGS_MARGIN = 10;

export interface PaneAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

let logsWindow: BrowserWindow | null = null;
let logsReady = false;
const pendingMessages: Array<{ channel: string; args: unknown[] }> = [];
let activeSessionId: string | null = null;
let anchorWindow: BrowserWindow | null = null;
let lastAnchor: PaneAnchor | null = null;
let wasVisibleBeforeBlur = false;

function safeSend(channel: string, ...args: unknown[]): void {
  if (!logsWindow || logsWindow.isDestroyed()) {
    log.warn('logs.safeSend.no-window', { channel });
    return;
  }
  if (!logsReady) {
    pendingMessages.push({ channel, args });
    log.info('logs.safeSend.queued', { channel, pendingCount: pendingMessages.length });
    return;
  }
  log.debug('logs.safeSend', { channel });
  logsWindow.webContents.send(channel, ...(args as [unknown, ...unknown[]]));
}

function flushPending(): void {
  if (!logsWindow || logsWindow.isDestroyed()) return;
  if (pendingMessages.length === 0) return;
  log.info('logs.flushPending', { count: pendingMessages.length });
  for (const { channel, args } of pendingMessages) {
    logsWindow.webContents.send(channel, ...(args as [unknown, ...unknown[]]));
  }
  pendingMessages.length = 0;
}

/**
 * Compute logs-window bounds anchored to the renderer-supplied pane rect
 * (viewport coords inside the hub). Falls back to hub-wide bottom-right if
 * no anchor was supplied.
 */
function computeLogsBounds(
  hub: BrowserWindow,
  anchor: PaneAnchor | null,
): { x: number; y: number; width: number; height: number } {
  const hubContent = hub.getContentBounds();
  if (anchor) {
    const width = Math.min(LOGS_WIDTH, Math.max(200, anchor.width - LOGS_MARGIN * 2));
    const height = Math.min(LOGS_HEIGHT, Math.max(120, anchor.height - LOGS_MARGIN * 2));
    const x = Math.round(hubContent.x + anchor.x + anchor.width - width - LOGS_MARGIN);
    const y = Math.round(hubContent.y + anchor.y + anchor.height - height - LOGS_MARGIN);
    log.debug('logs.computeBounds.anchored', {
      hubContent, anchor, computed: { x, y, width, height },
    });
    return { x, y, width, height };
  }
  const width = Math.min(LOGS_WIDTH, Math.max(200, hubContent.width - LOGS_MARGIN * 2));
  const height = LOGS_HEIGHT;
  const x = hubContent.x + hubContent.width - width - LOGS_MARGIN;
  const y = hubContent.y + hubContent.height - height - LOGS_MARGIN;
  log.debug('logs.computeBounds.fallback', { hubContent, computed: { x, y, width, height } });
  return { x, y, width, height };
}

export function createLogsWindow(): BrowserWindow {
  if (logsWindow && !logsWindow.isDestroyed()) {
    log.info('logs.create.existing', {});
    return logsWindow;
  }

  log.info('logs.create', { width: LOGS_WIDTH, height: LOGS_HEIGHT });

  logsWindow = new BrowserWindow({
    width: LOGS_WIDTH,
    height: LOGS_HEIGHT,
    transparent: false,
    frame: false,
    alwaysOnTop: true,
    hasShadow: true,
    resizable: false,
    backgroundColor: '#0b0d10',
    roundedCorners: true,
    skipTaskbar: true,
    show: false,
    type: 'panel',
    webPreferences: {
      preload: path.join(__dirname, 'logs.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  logsWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  logsWindow.setAlwaysOnTop(true, 'screen-saver');

  const preloadPath = path.join(__dirname, 'logs.js');
  log.info('logs.preload.path', { preloadPath });

  if (typeof LOGS_VITE_DEV_SERVER_URL !== 'undefined' && LOGS_VITE_DEV_SERVER_URL) {
    const devUrl = `${LOGS_VITE_DEV_SERVER_URL}/logs.html`;
    log.info('logs.load.dev', { url: devUrl });
    logsWindow.loadURL(devUrl);
  } else {
    const htmlPath = path.join(__dirname, '../renderer/logs/logs.html');
    log.info('logs.load.file', { htmlPath });
    logsWindow.loadFile(htmlPath);
  }

  logsWindow.webContents.setZoomFactor(1);
  logsWindow.webContents.setVisualZoomLevelLimits(1, 1);

  logsWindow.webContents.on('did-start-loading', () => log.info('logs.did-start-loading', {}));
  logsWindow.webContents.on('dom-ready', () => log.info('logs.dom-ready', {}));
  logsWindow.webContents.on('did-finish-load', () => {
    log.info('logs.did-finish-load', { activeSessionId });
    logsReady = true;
    // Re-broadcast the active session so the renderer, if any, picks it up.
    if (activeSessionId) {
      logsWindow?.webContents.send('logs:active-session-changed', activeSessionId);
    }
    flushPending();
  });
  logsWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    log.error('logs.did-fail-load', { code, desc, url });
  });
  logsWindow.webContents.on('render-process-gone', (_e, details) => {
    log.error('logs.render-process-gone', { reason: details.reason, exitCode: details.exitCode });
  });
  logsWindow.webContents.on('preload-error', (_e, preloadPath, err) => {
    log.error('logs.preload-error', { preloadPath, error: (err as Error).message });
  });
  logsWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    log.info('logs.console', { level, message, line, sourceId });
  });

  logsWindow.on('closed', () => {
    log.info('logs.closed', {});
    logsWindow = null;
    logsReady = false;
    activeSessionId = null;
    pendingMessages.length = 0;
  });

  return logsWindow;
}

export function attachToHub(hub: BrowserWindow): void {
  anchorWindow = hub;
  log.info('logs.attachToHub', { hubId: hub.id });

  const reposition = (): void => {
    if (!logsWindow || logsWindow.isDestroyed()) return;
    if (!logsWindow.isVisible()) return;
    if (!anchorWindow || anchorWindow.isDestroyed()) return;
    const bounds = computeLogsBounds(anchorWindow, lastAnchor);
    log.debug('logs.reposition', { bounds });
    logsWindow.setBounds(bounds);
  };

  hub.on('resize', reposition);
  hub.on('move', reposition);
  hub.on('enter-full-screen', reposition);
  hub.on('leave-full-screen', reposition);
  hub.on('minimize', () => {
    log.info('logs.hub.minimize', {});
    if (logsWindow && !logsWindow.isDestroyed()) logsWindow.hide();
  });
  hub.on('restore', () => {
    log.info('logs.hub.restore', { wasVisibleBeforeBlur, activeSessionId });
    if (logsWindow && !logsWindow.isDestroyed() && activeSessionId && wasVisibleBeforeBlur) {
      showLogs(activeSessionId, lastAnchor);
    }
  });

  hub.on('blur', () => {
    setTimeout(() => {
      if (!logsWindow || logsWindow.isDestroyed()) return;
      const focused = BrowserWindow.getFocusedWindow();
      log.debug('logs.hub.blur', { focusedWindowId: focused?.id ?? null });
      if (focused === null) {
        wasVisibleBeforeBlur = logsWindow.isVisible();
        if (wasVisibleBeforeBlur) {
          log.info('logs.autohide.appBlur', {});
          logsWindow.hide();
        }
      }
    }, 50);
  });

  hub.on('focus', () => {
    if (!logsWindow || logsWindow.isDestroyed()) return;
    if (wasVisibleBeforeBlur && activeSessionId) {
      log.info('logs.autoshow.appFocus', { activeSessionId });
      showLogs(activeSessionId, lastAnchor);
      wasVisibleBeforeBlur = false;
    }
  });
}

export function showLogs(sessionId: string, anchor: PaneAnchor | null = null): void {
  if (!logsWindow || logsWindow.isDestroyed()) {
    log.warn('logs.show.no-window', {});
    return;
  }
  activeSessionId = sessionId;
  if (anchor) lastAnchor = anchor;
  log.info('logs.show', { sessionId, anchor: anchor ?? lastAnchor, ready: logsReady });
  if (anchorWindow && !anchorWindow.isDestroyed()) {
    logsWindow.setBounds(computeLogsBounds(anchorWindow, lastAnchor));
  }
  logsWindow.showInactive();
  logsWindow.setAlwaysOnTop(true, 'screen-saver');
  safeSend('logs:active-session-changed', sessionId);
}

export function hideLogs(): void {
  if (!logsWindow || logsWindow.isDestroyed()) return;
  log.info('logs.hide', { activeSessionId });
  logsWindow.hide();
  activeSessionId = null;
  wasVisibleBeforeBlur = false;
}

export function toggleLogs(sessionId: string, anchor: PaneAnchor | null = null): boolean {
  if (!logsWindow || logsWindow.isDestroyed()) {
    log.warn('logs.toggle.no-window', {});
    return false;
  }
  const visible = logsWindow.isVisible();
  log.info('logs.toggle', { sessionId, visible, activeSessionId, anchor });
  if (visible && activeSessionId === sessionId) {
    hideLogs();
    return false;
  }
  showLogs(sessionId, anchor);
  return true;
}

export function isLogsVisible(): boolean {
  if (!logsWindow || logsWindow.isDestroyed()) return false;
  return logsWindow.isVisible();
}

export function sendToLogs(channel: string, payload: unknown): void {
  safeSend(channel, payload);
}

export function getLogsWindow(): BrowserWindow | null {
  return logsWindow;
}

export function getActiveLogsSession(): string | null {
  return activeSessionId;
}
