# Plan: Editable Anthropic API key in Settings + error CTA

## Goal
1. Add a "Anthropic API key" card to Settings → Connections so users can update the key without touching Keychain.
2. When a session fails with an api-key-related error, show an "Open Settings" CTA.

## Steps
1. **Main — new IPC handlers** (`src/main/settings/apiKeyIpc.ts`, new file):
   - `settings:get-api-key-masked` → returns `sk-ant-...xyz4` or `null`.
   - `settings:save-api-key` → writes to keytar under `com.agenticbrowser.anthropic` / `default`.
   - `settings:test-api-key` → POST a `max_tokens:1` ping to api.anthropic.com.
   - `settings:delete-api-key`.
   - Register/unregister from `src/main/index.ts` inside `openShellAndWire`.
2. **Preload** (`src/preload/shell.ts`): add `settings.apiKey.{getMasked,save,test,delete}`.
3. **ConnectionsPane**: add second card "Anthropic API key" with
   - masked display,
   - "Change" → reveals input + Save/Cancel,
   - live test on save,
   - status dot green when key present, red when missing.
4. **AgentPane**: detect api-key error via the same `friendlyError` keywords and, when present, render an "Open Settings" button alongside "Rerun task". Accept new optional `onOpenSettings` prop.
5. **HubApp**: pass `onOpenSettings={() => setSettingsOpen(true)}` to AgentPane.

## Non-goals
- No UI to view the current key in clear (only masked).
- No change to the onboarding flow.

## Files touched
- `src/main/settings/apiKeyIpc.ts` (new)
- `src/main/index.ts`
- `src/preload/shell.ts`
- `src/renderer/hub/ConnectionsPane.tsx`
- `src/renderer/hub/AgentPane.tsx`
- `src/renderer/hub/HubApp.tsx`
- `src/renderer/hub/hub.css` (connections-pane rows, new input styles)
