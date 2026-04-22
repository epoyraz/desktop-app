# Plan — Browser-only Panes + Pill-hosted Logs Overlay

## Goal

Keep the embedded Chromium browser at full "desktop" size at all times. Move the
session logs (xterm output) out of the hub renderer and into the existing
always-on-top **pill** `BrowserWindow`, which can float over the browser without
forcing `WebContentsView.setBounds(...)` to shrink.

Trigger: clicking the (repurposed) "split" action in `AgentPane` now toggles the
pill into a **logs overlay** for the focused session.

## Why

- `WebContentsView` cannot be layered over HTML content — anything overlapping
  it visually must live in a separate `BrowserWindow`.
- Current split view shrinks the browser to a sub-rect → broken layouts on real
  sites (`my-app/src/renderer/hub/AgentPane.tsx:893-921`).
- The pill is already a floating `type: 'panel'`, `alwaysOnTop` window
  (`my-app/src/main/pill.ts:127-150`) — perfect host for a transient log panel.

## Current state (reference)

- `HubApp.tsx`: `gridColumns` toggles 1 / 4 / 9 (1x1, 2x2, 3x3).
  - State: `useState(4)` at line 149; buttons at lines 492-510ish.
  - Auto-clamp logic lines 314-321, 367-373.
- `AgentPane.tsx`: `viewMode: 'output' | 'split' | 'browser'`.
  - Toolbar at lines 1000-1024.
  - Cycle handler lines 859-877.
  - Bounds math & `viewAttach`/`viewResize` lines 883-955.
  - `<TerminalPane sessionId=...>` rendered inline at line 1117.
- `pill.ts`: single mode (command-bar). Height driven by renderer via
  `pillAPI.setExpanded(px)` (see `pill.ts:352`, `Pill.tsx:146`).
- `TerminalPane.tsx`: xterm, subscribes to `sessionOutputTerm` IPC (line 140),
  replays via `getTermReplay` (line 151). Already self-contained.

## Target state

1. Hub grid supports **only 1x1** — one session visible at a time.
2. `AgentPane` pane modes: **`output` | `browser`** (split removed). Browser
   mode is always full pane rect — never shrunk to a sub-region.
3. **Two separate floating windows** — they coexist:
   - **Command pill** (existing `pillWindow`, unchanged) — centered-top
     command palette, toggled by Cmd+Shift+Space. Closes with Esc. Used to
     start new sessions / search existing ones.
   - **Logs pill** (new `logsWindow`) — a second `BrowserWindow`, also
     `type: 'panel'`, `alwaysOnTop: 'screen-saver'`, `showInactive()`,
     anchored bottom-right of the hub. Hosts the xterm for the focused
     session.
   - Both can be open simultaneously. Pressing Cmd+Shift+Space while logs
     are open pops the command pill on top without touching the logs pill.
     Submitting a session from the command pill keeps the logs pill open —
     it just re-targets to the new session via `pill:active-session-changed`.
   - Each has its own Esc handler (closes only itself).
   - Both hide together on app-switch (OS-level blur) and restore together
     when the hub regains focus.
4. New button in pane header ("Logs" — reuses the old split slot) toggles the
   pill into `logs` mode for that session. Cmd+L (or reuse Cmd+K chord) also
   works.

## Changes

### Main process

1. **`my-app/src/main/logsPill.ts`** *(new — mirror of `pill.ts`)*
   - Owns a second `BrowserWindow` (`logsWindow`), independent of the command
     pill. Same window flags: `type: 'panel'`, `alwaysOnTop: 'screen-saver'`,
     `frame: false`, `transparent: true`, `showInactive()`.
   - Loads a new renderer entry (`logs.html` / `logs.tsx`) — NOT the existing
     pill renderer. Keeps command-pill code untouched.
   - New constants: `PILL_LOGS_WIDTH = 380`, `PILL_LOGS_HEIGHT = 240`,
     `PILL_LOGS_MARGIN = 12`. Small on purpose — it's a glance panel, not a
     focus area.
   - **Anchored to the hub window, not the display.** `hubWindow.getBounds()`
     → pin pill to bottom-right of the hub's content area minus margin.
     - Listen to hub `resize` + `move` + `enter-full-screen` → recompute pill
       bounds while logs mode is active. Coalesce via `setImmediate` or a
       single rAF-equivalent to avoid flicker.
     - When hub minimizes/hides → hide pill. Restore when hub restores.
     - **App switch → fully disappear** (not dim, not behind — gone).
       Use `app.on('browser-window-blur')` + check `BrowserWindow.getFocusedWindow()`
       to detect when no app window is focused → `pillWindow.hide()`.
       On `app.on('browser-window-focus')` for the hub, if logs mode was
       active → re-show. Because the pill uses `showInactive()`, clicking the
       embedded browser does NOT blur the hub — so this only fires on real
       OS-level app switches (Cmd+Tab, clicking another app).
   - `showLogs(sessionId: string)`:
     - Computes bounds from current hub window rect.
     - `showInactive()` so the browser keeps focus.
     - Sends `pill:mode-changed` + `pill:active-session` IPC to the pill
       renderer.
   - Exports: `createLogsWindow()`, `showLogs(sessionId)`, `hideLogs()`,
     `toggleLogs(sessionId)`, `setActiveSession(sessionId)`,
     `repositionLogs()` (called by hub resize/move listeners).
   - New IPC: `logs:open`, `logs:close`, `logs:toggle` (session-scoped),
     exposed via `window.electronAPI.logs.*` from the hub preload.
   - **`my-app/src/main/pill.ts` is NOT modified** — command pill stays as-is.

2. **`my-app/src/main/index.ts`**
   - Register the new IPC handlers and expose through the preload surface.
   - When pane view mode change events fire, we no longer call
     `viewResize` to a sub-rect — browser always gets the full pane bounds.
     Remove the split-specific paths (keep the full-bounds path).
   - Ensure `sessionOutputTerm` IPC is already forwarded to the pill window
     (it's forwarded to all renderers today via `webContents.send` — verify in
     `my-app/src/main/index.ts` around the session streaming code; if it's
     targeted only at the hub `BrowserWindow`, broadcast it or duplicate to
     `pillWindow.webContents`).

3. **`my-app/src/main/sessions/BrowserPool.ts`**
   - Nothing structural — but remove any split-aware sizing helpers if present
     (grep shows `setBounds` at 80 / 141 / 145 — those are fine, they get the
     full pane bounds from the renderer).

### Preload

4. **`my-app/src/preload/logs.ts`** *(new)*
   - Exposes `window.logsAPI = { close, onActiveSessionChanged,
     onSessionOutputTerm, getTermReplay, revealOutput }`.
   - Mirrors the xterm-stream surface the hub preload already provides.

5. **`my-app/src/preload/shell.ts`** (hub preload)
   - Add `logs.open(sessionId)`, `logs.close()`, `logs.toggle(sessionId)`.

6. **`my-app/src/preload/pill.ts`** — unchanged.

### Renderer — Logs window

7. **New entry: `my-app/src/renderer/logs/logs.html`, `logs.tsx`,
   `LogsApp.tsx`, `logs.css`**
   - `LogsApp` subscribes to `logsAPI.onActiveSessionChanged` and renders
     **only** `<TerminalPane sessionId={activeId} />`.
   - **No chrome.** No header, no title, no close button, no status dot.
     Just the xterm, edge-to-edge in the window.
   - Esc key handler on the document → `logsAPI.close()`. That's it.
   - Closing otherwise: click the Logs button in the hub pane, switch pane
     to output mode, or Cmd+Tab away (auto-hide).
   - `TerminalPane` moves to `src/renderer/shared/TerminalPane.tsx` so both
     the hub and the logs window can import it.
   - CSS: small, dark, matches pill aesthetic (no Inter, no !important, no
     sparkles icon, no left outline).
   - Add `logs.html` as a Vite renderer input in the Forge config.

### Renderer — Hub

9. **`my-app/src/renderer/hub/HubApp.tsx`**
   - Remove `gridColumns` state + the 1/4/9 density toggle.
   - Remove `gridPage`, `gridTotalPages`, page nav keybindings
     (`grid.nextPage`, `grid.prevPage`).
   - `viewMode` type: drop `'grid'` → keep `'dashboard' | 'list' | 'agent'`
     (or consolidate). 1x1 is just "the focused agent" — render a single
     `AgentPane` full-bleed.
   - `goto.agents` now goes to the single-agent view on the focused session.
   - Keep list view for session picking.
   - Update the view-mode toolbar (remove grid density block lines 492-510).

10. **`my-app/src/renderer/hub/AgentPane.tsx`**
    - `PaneViewMode` shrinks from `'output' | 'split' | 'browser'` to
      **`'output' | 'browser'`**. Split is gone.
    - Toolbar: remove Split button. Keep Output and Browser buttons.
      Add a third **Logs** button that calls
      `window.electronAPI.logs.toggle(session.id)` — this opens/closes the
      floating logs window (NOT a pane mode).
    - Remove all split-specific branches in bounds effect, remove
      `splitPaddingLeft`. Browser mode = full pane rect. Output mode = no
      browser attached (existing logic retained).
    - **Mutual exclusion:** inline output pane and floating logs window show
      the same xterm stream — don't show both.
      - When user switches pane to `output` → call `logs.close()`.
      - When user opens floating logs → if pane is in `output`, switch it to
        `browser`.
      - Subscribe to `logs.onVisibilityChanged` in the pane to reflect the
        Logs button's active state.
    - Remove `pane:cycle-view` handler entirely (no cycling — two discrete
      buttons + a separate Logs toggle).
    - `computeBounds` simplifies to: full pane rect when `browser`, no attach
      when `output`.

11. **`my-app/src/renderer/hub/keybindings.ts`** (if that file owns chords)
    - Remove `grid.*` bindings.
    - Add `pane.toggleLogs` → Cmd+L (or `l` in normal mode), dispatches to the
      focused session.

12. **`my-app/src/renderer/hub/hub.css`**
    - Drop `.pane__output--split`, `.pane__browser-frame` split-specific rules,
      `.hub-grid--cols-*`.
    - Ensure `.pane` fills the shell content area.

## IPC contract (new)

```
Renderer (hub)  → main : logs:toggle  { sessionId }
Renderer (hub)  → main : logs:open    { sessionId }
Renderer (hub)  → main : logs:close
main            → logs : logs:active-session-changed { sessionId | null }
main            → logs : session-output-term { sessionId, bytes }    (broadcast)
Renderer (logs) → main : logs:close                                   (Esc / close button)
Renderer (logs) → main : sessions:getTermReplay { sessionId }         (reuse existing)
```

Command-pill IPC is unchanged.

## Out of scope (intentionally)

- Multi-session simultaneous viewing. If the user wants to see two logs, they
  switch focus — the pill re-targets.
- User-resizable pill. Size is fixed (380×240) and only auto-shrinks if the
  hub window is narrower than `PILL_LOGS_WIDTH + 2*MARGIN` (clamp to
  `hubWidth - 2*MARGIN`).
- **File outputs** relocation — handled in a future "Files" button pass.
- Persisting pill logs across app restarts (terminal replay already handles it).

## Verification steps

1. Start a session → browser renders full-width inside hub content area.
2. Click Logs (or Cmd+L) → pill slides in bottom-right showing live xterm
   output. Browser is NOT resized.
3. Submit follow-up from hub → new bytes appear in the pill.
4. Esc in pill logs → pill closes, browser untouched.
5. Cmd+K → pill switches to command mode (command palette replaces logs).
6. Switch focused session in hub → pill logs retarget to new session.
7. Browser-dead session → Logs button still works; browser pane shows "Browser
   ended" empty state full-size.

## File touch list

- `my-app/src/main/logsPill.ts`                             *(new)*
- `my-app/src/main/index.ts`
- `my-app/src/preload/logs.ts`                              *(new)*
- `my-app/src/preload/shell.ts`
- `my-app/src/renderer/logs/logs.html`                      *(new)*
- `my-app/src/renderer/logs/logs.tsx`                       *(new)*
- `my-app/src/renderer/logs/LogsApp.tsx`                    *(new)*
- `my-app/src/renderer/logs/logs.css`                       *(new)*
- `my-app/src/renderer/shared/TerminalPane.tsx`             *(moved from hub/)*
- `my-app/src/renderer/hub/HubApp.tsx`
- `my-app/src/renderer/hub/AgentPane.tsx`
- `my-app/src/renderer/hub/keybindings.ts`
- `my-app/src/renderer/hub/hub.css`
- `my-app/forge.config.ts` (or vite config — register `logs.html` renderer)

**Untouched:** `my-app/src/main/pill.ts`, `my-app/src/preload/pill.ts`,
`my-app/src/renderer/pill/*` — command pill behaves exactly as today.

## Commit slicing (per-feature-branch rule)

Branch: `feat/pill-logs-overlay` off `main`. Suggested commits:

1. `refactor(hub): remove grid density (2x2/3x3) — single-agent layout`
2. `refactor(agentpane): drop split/output modes — browser always full-size`
3. `feat(pill): add logs mode with xterm view`
4. `feat(hub): Logs button + Cmd+L toggles pill logs`
5. `chore(ipc): wire pill:toggle-logs / session-output-term broadcast`
