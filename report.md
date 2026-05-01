# Cross-Platform Battle Plan: Windows Port

**Date:** 2026-05-01  
**Status:** macOS-only today. Windows cannot run the app in its current state.

---

## Technology Stack Summary

| Layer | Technology | Cross-Platform? |
|-------|-----------|----------------|
| Shell | Electron 41.2.1 | Yes |
| Build | Electron Forge + Vite 5 | Yes |
| UI | React 19 + xterm.js | Yes |
| DB | better-sqlite3 | Yes (native rebuild needed) |
| Credentials | keytar 7.9 | Yes (uses Windows Credential Manager) |
| Terminal | node-pty 1.1 | Yes (uses conpty on Windows) |
| Installer | MakerSquirrel | Yes (but unconfigured) |
| Signing/Notarization | Apple-only pipeline | No |

**Verdict:** The core stack (Electron + React + native modules) is cross-platform. The blockers are all in application code, not framework limitations.

---

## Deal-Breakers (App Won't Launch)

### 1. Unix Domain Sockets — `harnessless/daemon.js`

Hardcoded `/tmp/bh-*.sock` paths. Windows doesn't have `/tmp` and Unix domain sockets behave differently. Must switch to **named pipes** (`\\.\pipe\bh-NAME`) or **localhost TCP**.

```
daemon.js:19  → const SOCK = `/tmp/bh-${NAME}.sock`
daemon.js:20  → const LOG  = `/tmp/bh-${NAME}.log`
daemon.js:21  → const PID  = `/tmp/bh-${NAME}.pid`
AccountStore.ts:61 → fallback to '/tmp/agentic-browser'
```

**Fix:** Use `os.tmpdir()` for temp files. Replace Unix sockets with TCP or named pipes.

### 2. POSIX Signal Handlers — `harnessless/daemon.js`

`SIGTERM`/`SIGINT` handlers never fire on Windows. The daemon won't clean up PID/socket files on exit.

**Fix:** Use `process.on('exit')` as universal cleanup + Windows-specific `CTRL_C_EVENT` handling.

### 3. PATH Enrichment — `src/main/hl/engines/pathEnrich.ts`

Defaults to `/bin/zsh`, uses `-ilc` shell flags, splits PATH on `:`, and hardcodes `/opt/homebrew/bin` etc. All of this breaks on Windows.

**Fix:** Platform-branch the entire function. On Windows, read PATH from registry or use `process.env.PATH` directly (no login-shell trick needed). Split on `;`.

### 4. Chrome Profile Paths — `src/main/chrome-import/profiles.ts`

Hardcoded `~/Library/Application Support/Google/Chrome`. Windows Chrome lives at `%LOCALAPPDATA%\Google\Chrome\User Data`.

**Fix:** Platform switch:
- macOS: `~/Library/Application Support/Google/Chrome`
- Windows: `%LOCALAPPDATA%\Google\Chrome\User Data`
- Linux: `~/.config/google-chrome`

### 5. Chrome Binary Paths — `src/main/chrome-import/cookies.ts`

Only macOS `/Applications/Google Chrome.app/...` paths. Windows: `Program Files/Google/Chrome/Application/chrome.exe` or registry lookup.

---

## Difficult but Solvable

### 6. MakerSquirrel Configuration — `forge.config.ts:168`

Currently `new MakerSquirrel({})` — no icon, no shortcuts, no signing. Needs:
- App icon (`.ico` format, not `.icns`)
- Code signing certificate (Authenticode, not Apple Developer ID)
- Start Menu / Desktop shortcuts
- `electron-squirrel-startup` is already a dependency (handles first-run shortcuts)

**Effort:** ~1 day

### 7. Editor Detection — `src/main/editors.ts`

Returns `[]` on non-macOS. Windows editors live in `Program Files`, `AppData\Local\Programs`, or are discoverable via registry (`HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths`).

**Effort:** ~1 day

### 8. Terminal Auth Flow — `src/main/identity/onboardingHandlers.ts`

Uses AppleScript to open Terminal.app. Windows equivalent: spawn `cmd.exe` or `powershell.exe` with the auth command, or use `start cmd /k "claude auth login"`.

**Effort:** ~2 hours

### 9. File Permissions (chmod) — `scripts/chmod-node-pty-helpers.mjs`

The script already documents itself as a no-op on Windows ("Non-POSIX platforms have no spawn-helper"). `daemon.js:209` calls `chmod` on the socket file — irrelevant if sockets are replaced with named pipes.

**Effort:** Already handled / N/A after socket fix.

### 10. Build Scripts — `Taskfile.yml`

All tasks assume bash, macOS paths (`$HOME/Library/Application Support/...`), and Unix tools. Need Windows-equivalent tasks or cross-platform scripts (Node.js scripts instead of bash).

**Effort:** ~1 day

---

## CI/CD: Windows Release Pipeline

Currently only macOS CI exists. A Windows release pipeline needs:

| Requirement | macOS (exists) | Windows (needed) |
|------------|----------------|-------------------|
| Runner | macos-13/14 | windows-latest |
| Signing | Developer ID (Apple) | Authenticode (EV cert or Azure SignTool) |
| Notarization | xcrun notarytool | N/A (SmartScreen reputation) |
| Installer | DMG | Squirrel/NSIS/MSI |
| Auto-update | electron-updater ✓ | electron-updater ✓ (already works with Squirrel) |

**Note:** `electron-updater` + `electron-squirrel-startup` are already dependencies — auto-update plumbing exists. The release workflow (`.github/workflows/release.yml`) needs a Windows matrix job.

**Effort:** ~2 days (including code signing setup)

---

## Priority Order (Battle Plan)

### Phase 1: Make It Launch (3-5 days)

| # | Task | Files | Severity |
|---|------|-------|----------|
| 1 | Replace `/tmp` with `os.tmpdir()`, Unix sockets with TCP/named pipes | `daemon.js`, `AccountStore.ts` | Blocker |
| 2 | Fix PATH enrichment for Windows | `pathEnrich.ts` | Blocker |
| 3 | Add Windows Chrome profile/binary paths | `profiles.ts`, `cookies.ts` | Blocker |
| 4 | Replace POSIX signal handlers with cross-platform cleanup | `daemon.js` | Blocker |
| 5 | Add `.ico` icon asset | `assets/` | Blocker (build fails) |

### Phase 2: Make It Usable (2-3 days)

| # | Task | Files |
|---|------|-------|
| 6 | Configure MakerSquirrel (icon, shortcuts, signing) | `forge.config.ts` |
| 7 | Implement Windows editor detection | `editors.ts` |
| 8 | Fix terminal auth flow for Windows | `onboardingHandlers.ts` |
| 9 | Test node-pty with PowerShell/cmd.exe as default shell | `SessionManager.ts`, PTY config |

### Phase 3: Ship It (2-3 days)

| # | Task |
|---|------|
| 10 | Add Windows job to CI workflow |
| 11 | Add Windows job to release workflow with Authenticode signing |
| 12 | Cross-platform Taskfile or replace with Node.js scripts |
| 13 | End-to-end testing on Windows |

---

## What's Already Cross-Platform (Good News)

- **Electron + React + Vite** — framework is platform-neutral
- **better-sqlite3** — works on Windows with `@electron/rebuild`
- **keytar** — uses Windows Credential Manager natively
- **node-pty** — uses Windows conpty API natively
- **electron-updater** — Squirrel.Windows support built-in
- **electron-squirrel-startup** — already a dependency
- **xterm.js** — browser-based, platform-independent
- **All renderer/UI code** — no platform-specific logic in React components

---

## Estimated Total Effort

| Phase | Days | Risk |
|-------|------|------|
| Phase 1: Launch | 3-5 | Low — straightforward platform branching |
| Phase 2: Usable | 2-3 | Low — known patterns |
| Phase 3: Ship | 2-3 | Medium — signing/CI requires cert procurement |
| **Total** | **7-11 days** | |

The codebase is well-structured and the platform-specific code is concentrated in ~10 files. No architectural changes needed — this is a porting task, not a rewrite.
