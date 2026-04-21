# Plan: user-configurable global command-bar hotkey

## Goal
Promote the `Cmd+Shift+Space` → pill/cmdbar shortcut from a hardcoded `const` in
`src/main/hotkeys.ts` to a persisted, user-configurable accelerator that is
reflected live in the renderer's command-hints bar and editable from the
`SettingsPane` just like the vim-style keybindings.

## Current state
- `src/main/hotkeys.ts` — `HOTKEY_GLOBAL_CMDBAR = 'CommandOrControl+Shift+Space'`
  registered once at boot via `registerHotkeys`. No persistence, no IPC.
- `src/renderer/hub/keybindings.ts` — `action.createPane` has
  `keys: ['Cmd+Shift+Space']` hardcoded separately.
- `src/renderer/hub/useVimKeys.ts` — persists overrides only in memory;
  no IPC bridge to main-process globalShortcut.
- `SettingsPane` already has a working rebind UI for all vim actions.

## Architecture

### 1. Shared accelerator helpers — `src/shared/hotkeys.ts` (new)
- `DEFAULT_GLOBAL_CMDBAR_ACCELERATOR = 'CommandOrControl+Shift+Space'`
- `acceleratorToRenderer(accel)`: converts Electron accelerator syntax to the
  renderer display form (`CommandOrControl+Shift+Space` → `Cmd+Shift+Space`).
- `rendererToAccelerator(combo)`: inverse (`Cmd+Shift+Space` → `CommandOrControl+Shift+Space`).

Both main and renderer import from this file, so there's one source of truth.

### 2. Main-process persistence — update `src/main/hotkeys.ts`
- JSON file at `userData/hotkeys.json` shape: `{ globalCmdbar: string }`.
- `loadAccelerator()` / `saveAccelerator(accel)` helpers.
- `registerHotkeys(callback)` loads the saved accelerator (or default),
  registers it, returns `{ ok, accelerator }`.
- `setGlobalCmdbarAccelerator(accel, callback)`: unregister current, try
  register new; if OK, persist + update module-level state. If not, rollback
  and return failure so renderer can show error.
- `getGlobalCmdbarAccelerator(): string`.

### 3. Main-process IPC — add to `src/main/index.ts`
Near the existing `registerHotkeys` call:
- `ipcMain.handle('hotkeys:get-global', () => getGlobalCmdbarAccelerator())`
- `ipcMain.handle('hotkeys:set-global', (_e, accel) => setGlobalCmdbarAccelerator(accel, togglePillAndNotify))`
  - On success, broadcast `hotkeys:global-changed` to all BrowserWindows so
    renderers stay in sync.

### 4. Preload — update `src/preload/shell.ts`
New namespace on `window.electronAPI`:
```ts
hotkeys: {
  getGlobalCmdbar: () => ipcRenderer.invoke('hotkeys:get-global'),
  setGlobalCmdbar: (accel) => ipcRenderer.invoke('hotkeys:set-global', accel),
},
on: {
  globalCmdbarChanged: (cb) => { /* subscribe + unsubscribe */ },
},
```

### 5. Renderer — update `src/renderer/hub/useVimKeys.ts`
- On mount, `electronAPI.hotkeys.getGlobalCmdbar()` → override
  `action.createPane.keys` with the renderer-display form.
- Subscribe to `globalCmdbarChanged` → refresh same override.
- When `updateBinding('action.createPane', keys)` is called (from SettingsPane),
  intercept: call `electronAPI.hotkeys.setGlobalCmdbar(rendererToAccelerator(keys[0]))`.
  If main reports failure, do NOT apply the override locally. On success,
  the broadcast above will propagate.

### 6. Command bar & settings
No direct changes — both already consume `vim.keybindings`, so the live accel
flows through automatically.

## Files touched
- NEW: `my-app/src/shared/hotkeys.ts`
- `my-app/src/main/hotkeys.ts`
- `my-app/src/main/index.ts` (wire IPC, call setter with callback)
- `my-app/src/preload/shell.ts`
- `my-app/src/renderer/hub/useVimKeys.ts`
- `my-app/src/renderer/hub/keybindings.ts` (remove hardcoded key — will be
  filled in dynamically)
- `my-app/src/renderer/globals.d.ts` (if `electronAPI` type is declared there;
  otherwise skip — renderer already uses optional chaining)

## Explicit non-goals
- No multi-shortcut support (one global accel only).
- No validation UI for "is this already in use by another OS app" beyond the
  `globalShortcut.register` boolean. If rebind fails, we just no-op.
- Keep renderer-only vim keys unchanged (they still persist only in memory as
  before — that's a separate concern).

## Rollout steps
1. Add shared file.
2. Rewrite `hotkeys.ts` with load/save + setter.
3. Wire IPC in `index.ts`.
4. Add preload surface.
5. Update `useVimKeys` to read/write through IPC for `action.createPane`.
6. Remove hardcoded `Cmd+Shift+Space` from `DEFAULT_KEYBINDINGS`.
7. Smoke test: rebind from Settings → verify pill opens on new combo, label
   in command bar updates, and setting persists across relaunch.
