# Overnight autonomous improvement loop — v1

**Start:** 2026-04-17 ~01:30 local (session resumed)
**Operator:** Claude Opus 4.7 (autonomous loop mode)
**User status:** asleep, authorized ~8h autonomous work
**Budget rules:**
- NEVER force-push, NEVER touch main
- NEVER commit .env or secrets
- ALWAYS run tests after code changes
- Commit at logical checkpoints
- File-based state > chat memory (this file is source of truth)

---

## Iteration log

Append one line per iteration: `[iter N | ISO time | branch | summary | next]`

- [iter 0 | 2026-04-17T01:30Z | feat/agent-wiring | baseline established, status file created | run app, take screenshots, pick first task]

---

## Current branch state

- Branch: `feat/agent-wiring`
- Track 1 (Agent wiring) — **done**, 14 integration tests green
- Track 5 (Settings) — **scaffolded**, renderer missing React entry
- `.env` — **present** (gitignored), contains ANTHROPIC_API_KEY

## Test state

- Full vitest suite: **107 pass / 5 fail** (all 5 fails in `tests/pill/hotkey.spec.ts` — pre-existing, unrelated)
- E2E Playwright-Electron: untested this session, assume unknown
- Python pytest: not run this session

---

## Task queue (ordered by priority)

### P0 — Track 5: Settings UI completion (~2h)
- [ ] Create `my-app/src/renderer/settings/index.tsx` — React entry
- [ ] Create `my-app/src/renderer/settings/SettingsApp.tsx` — main UI component
- [ ] Create sections: API key input+test, agent name edit, theme toggle, OAuth scopes (placeholder), factory reset
- [ ] Wire Settings IPC handlers in `src/main/index.ts` (or `src/main/settings/ipc.ts`)
- [ ] Register settings preload + renderer in `forge.config.ts`
- [ ] Add "Settings…" menu item + Cmd+, accelerator
- [ ] Playwright test: open settings, enter key, save, verify Keychain

### P1 — Track 3: QA harness + visual baselines (~2h)
- [ ] Capture baseline screenshots for every screen (onboarding welcome/naming/account/scopes, shell empty/3-tabs, pill idle/streaming/done, settings)
- [ ] Commit to `tests/visual/references/*.png`
- [ ] HTML review surface under `tests/visual/review.html` (gallery with slider diffs)
- [ ] Un-skip `tests/e2e/pill-flow.spec.ts` now that Track 1 is wired
- [ ] Regression test: `tests/regression/preload-path.spec.ts`
- [ ] Fix the 5 pre-existing hotkey.spec.ts failures

### P2 — Track 2: Design polish per-family (~3h)
- [ ] Onboarding family: welcome, naming, account, scopes, mascot animations
- [ ] Shell chrome: tab hover/active, URL bar focus, loading indicators
- [ ] Pill: backdrop blur, accent glow, streaming step animation
- [ ] Empty/error states: EmptyShellState, EmptyAgentState, ErrorBoundary, OfflineBanner
- [ ] Loading skeletons + consistent KeyHint chips

### P3 — Track 6: Branding assets (~1h)
- [ ] `assets/icon.icns` from `assets/brand/icons/` (if files exist)
- [ ] DMG background from `assets/brand/wordmarks/`
- [ ] Replace any placeholder text "Agentic Browser" with final brand name if present

### P4 — Track 4: Figma sync (~1-2h, may skip if auth friction)
- [ ] Inspect file `AnYunq5B4ekWJMwDmnVMo2` via figma-use skill
- [ ] Create "Agentic Browser" section with design system + screens
- [ ] Push current app screenshots as Figma frames

### P5 — Tech debt + infra
- [ ] Add `tests/e2e` coverage for agent task flow (wikipedia scroll-to-bottom)
- [ ] Add `.github/workflows/qa.yml` that runs lint, type-check, unit, integration, e2e
- [ ] Verbose logging audit: ensure every IPC handler + window lifecycle + daemon event has structured log
- [ ] Add `/var/folders/**/TemporaryItems/NSIRD_screencaptureui_*/**` screenshot read permissions per CLAUDE.md

---

## Blockers encountered

(append as they happen)

---

## Screenshots captured

(append paths as captured — put them under `tests/visual/references/` or `.harness/screenshots/`)

---

## Commits made this loop

(append commit hash + one-line summary)

---

## Decision log

(record non-obvious choices so next iteration understands why)
