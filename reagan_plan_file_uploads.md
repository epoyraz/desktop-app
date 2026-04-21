# File upload support — implementation plan

## Goal
User drag-drops or picks files in the composer → files are sent to Claude as multimodal input (images + PDFs) or inlined text.

## Scope
- **Accept**: images (png/jpeg/gif/webp), PDF, text-ish (txt/md/json/csv/log/code).
- **Reject**: everything else with a clear UI error.
- **Store**: bytes in SQLite (`session_attachments` table, BLOB column). No filesystem.
- **Per-file caps**: 5MB image / 32MB PDF / 1MB text.
- **Per-message caps**: 10 files, 50MB total.

## Touchpoints

### 1. `src/main/sessions/db-constants.ts`
- Bump `DB_SCHEMA_VERSION` → 5.
- Add mime allowlist + size constants.

### 2. `src/main/sessions/SessionDb.ts`
- Migration v5: `CREATE TABLE session_attachments`.
- Prepared statements: `insertAttachment`, `getAttachmentsBySession`, `getAttachmentBytes`.
- Public methods: `saveAttachment()`, `getAttachments()` (metadata), `loadAttachmentBytes(id)`.

### 3. `src/main/hl/agent.ts`
- Extend `RunAgentOptions` with `attachments?: Attachment[]`.
- On first iteration, replace the `{role: 'user', content: prompt}` string with a content-block array:
  - image/PDF → native blocks with base64
  - text → `<file name="X">...</file>` prepended to prompt text
- Attachments only included in the initial user message; tool loop continues unchanged.

### 4. `src/main/index.ts`
- Extend `sessions:create` to accept `{prompt, attachments?: UploadPayload[]}` where each payload is `{name, mime, bytes: Uint8Array}`.
- Validate at boundary (mime allowlist, size caps); reject with typed error.
- Persist via `SessionDb.saveAttachment()` before returning the session id.
- Thread into `runAgent` options in `startSessionWithAgent` and `rerunSession`.
- Same for `sessions:resume` (follow-up).

### 5. `src/preload/shell.ts` + `src/renderer/globals.d.ts`
- Update `sessions.create / resume` signature to accept attachments.

### 6. `src/renderer/hub/` (composer)
- Drag-drop handlers on the composer root.
- `<button>` with hidden `<input type="file" multiple>`.
- Read files via `FileReader` / `.arrayBuffer()` → `Uint8Array`.
- Show attachment chips above textarea with filename, size, ✕ to remove.
- Client-side pre-validation (size + mime) before IPC.

## Gotchas to handle
1. `messages` JSON should **not** store image base64 — replace with `{type: 'attachment_ref', attachment_id}`. On rerun-with-context, rehydrate from DB.
   - *v1 simplification*: just drop attachments from persisted `messages` entirely. Rerun-with-context won't re-send the bytes, but the assistant's text response already references them. Ship this first.
2. Size limits enforced at 3 layers: UI pre-check → IPC validator → SessionDb (throw on oversize).
3. Log only metadata (name, mime, size, session_id). Never log bytes.
4. Reject empty/corrupt files early (check mime sniffing vs extension).

## Build order
1. DB schema + SessionDb methods (+ constants)
2. runAgent integration (unit-testable without UI)
3. IPC + preload
4. Renderer composer UI
5. Smoke test: upload an image, ask "what do you see", verify claude sees it.
