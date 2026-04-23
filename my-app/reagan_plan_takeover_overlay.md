# Takeover Overlay — Plan

## Goal
While a session is running with a live browser view, show a pulsing edge glow over the `WebContentsView` and reveal a "Stop and take over" button on hover. Overlay blocks all mouse/keyboard input to the browser view beneath.

## Architecture
Sibling `WebContentsView` in the hub window's `contentView`, stacked above the session's browser view via `addChildView`. Bounds tracked in hub-local coords using the existing `frameRect` plumbing in `AgentPane.tsx`. One overlay view per session, created lazily.

## Rationale
- Native `WebContentsView` always paints above the hub renderer DOM, so DOM-based overlay is impossible.
- Child `WebContentsView` (vs separate `BrowserWindow` like `logsPill`) avoids screen-coord translation, syncs resize in the same frame as the browser view, and doesn't need alwaysOnTop juggling.
- Input deactivation is implicit: mouse events route to the topmost view at the cursor.

## Files

### NEW
- `my-app/src/main/takeoverOverlay.ts` — module mirroring `BrowserPool` pattern:
  - `show(sessionId, bounds)` — create view if absent, attach above browser view, set bounds
  - `hide(sessionId)` — remove from contentView, destroy view
  - `reraise(sessionId)` — re-add above browser view after `BrowserPool.attach`
  - `destroyAll()` — cleanup on app quit
  - Loads HTML inline via `data:` URL with `nodeIntegration: true, contextIsolation: false, transparent: true` (WebContentsView supports transparency on macOS)
  - Inline HTML contains pulsing glow CSS + hover state + button → `ipcRenderer.invoke('takeover:stop', sessionId)`

### MODIFY
- `my-app/src/main/index.ts` — register IPC handlers:
  - `takeover:show` → `takeoverOverlay.show(sessionId, bounds)`
  - `takeover:hide` → `takeoverOverlay.hide(sessionId)`
  - `takeover:stop` → `sessionManager.cancelSession(id)` + `takeoverOverlay.hide(id)`
  - Teardown on `browser-gone` event
- `my-app/src/main/sessions/BrowserPool.ts` — after `window.contentView.addChildView(entry.view)` in `attachToWindow` and `reattachAll`, call `takeoverOverlay.reraise(sessionId)` so overlay stays on top.
- `my-app/src/preload/shell.ts` — expose:
  - `takeover.show(id, bounds) → Promise<void>`
  - `takeover.hide(id) → Promise<void>`
- `my-app/src/renderer/globals.d.ts` — add `takeover` to `ElectronAPI` type.
- `my-app/src/renderer/hub/AgentPane.tsx` — when `session.status === 'running' && viewMode !== 'output' && frameRect`, call `api.takeover.show(session.id, frameRect)`. Hide on status change, unmount, or viewMode switch to output. Re-call on bounds update (same place as `viewAttach`).

## Effect Design (inline in takeoverOverlay.ts HTML)
- Full-bleed transparent page.
- Idle state (not hovered):
  - Animated inset box-shadow pulsing at ~1.6s cycle, colour `rgba(80,200,255,0.7)` → `rgba(80,200,255,1.0)`.
  - Four L-shaped corner brackets (SVG), fading with pulse.
  - Top-left pill: "● Automating…" with dot scaling 1 ↔ 1.15.
- Hover state:
  - Pulse paused, glow shifts to warm amber (~`rgba(255,180,80,0.9)`).
  - Centre scrim: `rgba(0,0,0,0.35)`.
  - Large centred button: "Stop and take over" (click → IPC).

## Edge cases handled
- Session transitions running → idle/stopped/stuck/error → overlay hides (driven by `AgentPane` effect).
- Pane resize / hub resize → `frameRect` updates → overlay bounds update (piggybacks existing `ResizeObserver`).
- `viewMode` change split ↔ browser ↔ output → show/hide based on rule above.
- `browser-gone` → main forces `takeoverOverlay.hide`.
- App quit → `destroyAll()` in cleanup path.
- Session deletion → hide + destroy per-session view.

## Not included (scope control)
- Animated transitions between idle/hover states beyond CSS.
- Accessibility keyboard shortcut to trigger takeover.
- Multi-session overlay z-order beyond single active pane.

## Test plan
- Start a task with browser → verify pulsing glow appears around browser rect.
- Hover overlay → verify amber glow + button + scrim appears.
- Click button → verify session cancels, overlay disappears, browser view becomes interactive.
- Resize hub window → overlay tracks browser view without lag.
- Drag split divider → overlay resizes with browser rect.
- Switch to Output mode → overlay hides.
- Close session → overlay destroyed, no leaks.
