/**
 * BrowserWindow lifecycle and bounds persistence.
 * Saves/restores window position and size to userData/window-bounds.json.
 */

import { BrowserWindow, app, screen } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

const BOUNDS_FILE_NAME = 'window-bounds.json';
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 800;
const MIN_WIDTH = 800;
const MIN_HEIGHT = 600;
const DEBOUNCE_MS = 500;

interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

function getBoundsPath(): string {
  return path.join(app.getPath('userData'), BOUNDS_FILE_NAME);
}

function loadBounds(): WindowBounds {
  try {
    const raw = fs.readFileSync(getBoundsPath(), 'utf-8');
    const parsed = JSON.parse(raw) as WindowBounds;
    // Validate the bounds are on a visible display
    const displays = screen.getAllDisplays();
    const isVisible = displays.some((d) => {
      if (parsed.x === undefined || parsed.y === undefined) return false;
      return (
        parsed.x >= d.bounds.x &&
        parsed.y >= d.bounds.y &&
        parsed.x < d.bounds.x + d.bounds.width &&
        parsed.y < d.bounds.y + d.bounds.height
      );
    });
    if (!isVisible) {
      console.log('[window] Saved bounds off-screen, using defaults');
      return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
    }
    return parsed;
  } catch {
    return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  }
}

function saveBounds(win: BrowserWindow): void {
  try {
    const bounds = win.getBounds();
    fs.writeFileSync(getBoundsPath(), JSON.stringify(bounds), 'utf-8');
    console.log('[window] Bounds saved:', bounds);
  } catch (err) {
    console.error('[window] Failed to save bounds:', err);
  }
}

export function createShellWindow(): BrowserWindow {
  const bounds = loadBounds();
  console.log('[window] Creating shell window with bounds:', bounds);

  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0d0d0d',
    webPreferences: {
      preload: path.join(__dirname, 'shell.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Load the shell renderer
  if (
    typeof SHELL_VITE_DEV_SERVER_URL !== 'undefined' &&
    SHELL_VITE_DEV_SERVER_URL
  ) {
    const shellDevUrl = `${SHELL_VITE_DEV_SERVER_URL}/src/renderer/shell/shell.html`;
    console.log('[window] Loading dev server URL:', shellDevUrl);
    win.loadURL(shellDevUrl);
    win.webContents.on('did-fail-load', (_e, code, desc, url) => {
      console.error('[window] did-fail-load', { code, desc, url });
    });
    win.webContents.on('did-finish-load', () => {
      console.log('[window] did-finish-load', { url: win.webContents.getURL() });
    });
    win.webContents.on('console-message', (_e, level, message, line, source) => {
      console.log(`[shell-renderer:${level}] ${source}:${line} ${message}`);
    });
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    const htmlPath = path.join(
      __dirname,
      `../../renderer/shell/index.html`,
    );
    console.log('[window] Loading file:', htmlPath);
    win.loadFile(htmlPath);
  }

  // Debounced bounds persistence
  let boundsTimer: ReturnType<typeof setTimeout> | null = null;
  const debouncedSave = () => {
    if (boundsTimer) clearTimeout(boundsTimer);
    boundsTimer = setTimeout(() => saveBounds(win), DEBOUNCE_MS);
  };

  win.on('resize', debouncedSave);
  win.on('move', debouncedSave);
  win.on('close', () => {
    if (boundsTimer) clearTimeout(boundsTimer);
    saveBounds(win);
  });

  return win;
}
