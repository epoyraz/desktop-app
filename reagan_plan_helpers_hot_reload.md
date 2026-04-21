# Hot-reloadable helpers.js — implementation plan

## Goal
Move tool implementations out of compiled TS into a plain JS file at
`userData/harness/helpers.js` that the agent can edit mid-task and have
the next iteration see the new code.

## Invariants to preserve

- Every helper signature stays: `(ctx, ...args) => Promise<unknown>`.
- `HlContext` is still typed and provided by the TS loader.
- Tool schemas stay JSON (not TS), so the agent can add new helpers by
  writing JS + appending to `TOOLS.json` in the same turn.
- Anthropic-side tool definitions are rebuilt every iteration from
  `TOOLS.json` so newly-added helpers are immediately callable.

## File layout (runtime)

```
<userData>/harness/
  helpers.js       # plain JS, CommonJS, module.exports = { helperName: fn, ... }
  TOOLS.json       # [{ name, description, input_schema }, ...]
  VERSION          # integer, bumped on stock refresh by app update
```

## Bootstrapping

- On SessionManager init (or first run of any session):
  - If `userData/harness/` missing → copy `src/main/hl/stock/{helpers.js,TOOLS.json,VERSION}` from app bundle.
  - If `userData/harness/VERSION` < app-bundled VERSION → user has customizations → leave alone, log warning.
  - Never overwrite user-edited helpers silently on app update. User hits "Reset harness" in settings if they want stock.

## Hot-reload mechanism

Every `runAgent` iteration:
1. `delete require.cache[require.resolve(helpersPath)]`
2. `const helpers = require(helpersPath)`
3. Re-read `TOOLS.json` from disk.
4. Pass `tools` array to Anthropic API.
5. On `tool_use` block, dispatch via `helpers[toolName](ctx, toolArgs)`.
6. Tool errors caught, surfaced as `tool_result` with `is_error: true`.

## Contract for the agent

System prompt update:
> "Your helpers live at `<absolute path>/helpers.js`. If a helper is missing
>  or broken, edit it with `patch_file` or `write_file` and add the
>  corresponding tool schema to `TOOLS.json` in the same turn. Both take
>  effect on the next iteration. Always export functions via
>  `module.exports.<name> = ...`."

## What breaks

- `hl/helpers.ts` is deleted.
- `hl/tools.ts` schema list is replaced by dynamic load from TOOLS.json.
  The `HL_TOOLS` and `HL_TOOL_BY_NAME` constant exports go away.
- Existing imports of `H.click(ctx, ...)` and similar from `helpers.ts`
  across the codebase need to be rewritten to go through the dynamic
  loader, OR — cleaner — those imports are only used *inside* helpers.ts
  itself (internal cross-calls like `await js(ctx, ...)` from `click`).
  Audit needed.
- `reagan_plan_file_uploads.md` — attachments plan still valid, no conflict.

## Pre-work: test scaffold cleanup

Broken test files reference deleted modules (bookmarks, history, etc.).
Before adding new tests, either:
- Delete dead tests wholesale (~30 files).
- Exclude them via vitest config.

Delete is simpler and matches the nuclear-pivot direction. No code loss
since those modules are already gone.

## New tests

Behavioral, against a real ephemeral userData dir:

1. **bootstrap-fresh**: empty userData → `helpers.js` and `TOOLS.json` copied from stock.
2. **bootstrap-preserve**: userData has edited helpers → stock refresh does NOT overwrite.
3. **hot-reload-basic**: tool call A → edit helpers.js to change A's behavior via write_file → next tool call A uses new behavior.
4. **hot-reload-new-helper**: agent adds new helper + TOOLS.json entry → next API call includes it in tools list → model can call it.
5. **malformed-helpers**: invalid JS in helpers.js → tool call returns `is_error: true` with the SyntaxError, loop continues.
6. **tool-throws**: helper throws at runtime → caught, surfaced as `is_error: true`.
7. **missing-helper**: TOOLS.json references a helper that doesn't exist in module.exports → graceful error.
8. **schema-drift**: helper exists but TOOLS.json schema stale → API-level validation caught via Anthropic 400; surfaced to user.

## Work order

1. Clean broken tests (delete dead files).
2. Extract `hl/helpers.ts` body → port to plain JS, save as `stock/helpers.js`.
3. Extract tool schemas from `hl/tools.ts` → `stock/TOOLS.json`.
4. Bootstrap logic: `src/main/hl/bootstrapHarness.ts` — copies stock to userData on init.
5. Runtime loader: `src/main/hl/loadHarness.ts` — `require.cache` invalidate + reload.
6. `hl/agent.ts` tool dispatch rewrite to use loader.
7. System prompt update.
8. Settings: "Reset harness" button.
9. Tests (see above).
10. Verify by editing helpers.js mid-task and confirming next iter uses new code.

## Risks

- **Bundling stock files**: `src/main/hl/stock/*` needs to be included in the Vite main-process build output and resolvable at runtime. Likely needs a `copy-plugin` entry in forge/vite config.
- **Closures**: if TS code anywhere captures a helper function reference at module load time, those references go stale. Must dispatch `helpers[name]` at call time, never cache the function.
- **Permission surface**: editable JS in userData with a `shell` helper is total code execution. Already the case today (Claude has shell tool), but the editable surface makes it easier for a prompt-injected response to write a malicious helpers.js. Mitigation: none beyond what exists — user trusts the agent.
