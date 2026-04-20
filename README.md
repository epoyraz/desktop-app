# The Browser

A Chromium-based desktop app for running AI browser agents in isolation. Built on Electron so agents get real browser contexts without interfering with your daily Chrome session.

## Why this exists

Browser automation agents need a real Chromium environment — headless won't cut it for many sites. But running them in your personal Chrome breaks your workflow and theirs. This app gives each agent its own isolated browser context (separate cookies, storage, history) while you keep working undisturbed.

## What it does

**Agent Hub** — Launch browser automation tasks from a command bar, watch agents work in real time, and intervene when they get stuck. Grid view (tmux-style split panes) for active monitoring, list view (Linear-style table) for managing many sessions at once.

**Full browser** — When agents aren't running, it's a complete Chromium browser with tabs, bookmarks, history, downloads, extensions, passwords, autofill, and every keyboard shortcut you'd expect from Chrome.

## Agent Hub

The hub is the primary interface. You type a task, hit enter, and an agent starts working in its own browser.

### Session lifecycle

| State | Indicator | Meaning |
|---|---|---|
| draft | grey dot | Prompt entered, not submitted |
| running | green dot, pulsing | Agent executing |
| stuck | amber dot | No progress, needs attention |
| stopped | blue-grey dot | Finished or cancelled |

### What you can do

- **Watch** — see the agent's browser working in real time, one click from the pane
- **Intervene** — take over the browser to solve a captcha, log in, or click something
- **Resume** — hand control back to the agent seamlessly
- **Re-run** — copy a prompt and fire it again
- **Dismiss** — hide completed sessions from the grid without deleting data

Sessions persist to SQLite so conversation history survives app restarts.

### Views

- **Grid** — auto-layout split panes (1 = full, 2 = 2-col, 3 = 3-col, 4 = 2x2)
- **List** — compact table with status, prompt, and elapsed time

## Browser features

### Tabs
- Tab strip with shrink-to-fit overflow
- Audio indicator with per-tab mute (click favicon)
- Hover card with live thumbnail
- Tab search (Cmd+Shift+A) with fuzzy matching
- Pin, duplicate, mute, close, close others, close to right
- Reopen closed tab (Cmd+Shift+T) with full history stack
- Switch tabs: Cmd+1-8, Cmd+9 for last, Cmd+Shift+]/[

### Navigation
- Omnibox autocomplete with history, bookmarks, and open tab suggestions
- URL elision (strips `https://`, `www.`, trailing slash)
- Typo correction for misspelled hostnames
- Back/forward long-press menus
- Find-in-page (Cmd+F)
- Per-site zoom (Cmd+=/Cmd+-) with persistent store
- Status bar on link hover

### Security and privacy
- HTTPS-First mode with upgrade interstitial
- HSTS store per origin
- Secure DNS (DNS-over-HTTPS)
- Safe Browsing with three-tier settings
- Do Not Track and Global Privacy Control headers
- Privacy Sandbox toggles
- Branded error pages (DNS failure, cert errors, timeouts)

### Bookmarks, history, downloads
- Bookmark bar (Cmd+Shift+B), bookmark manager, import/export
- History with date grouping, search, and journey clusters
- Download manager with progress ring, Dock badge, and per-item actions

### Passwords and autofill
- Save-password prompts with breach detection
- Biometric unlock (Touch ID)
- Address and payment autofill

### Extensions
- Manifest V3 runtime
- Extension manager with enable/disable, details drawer, developer mode
- Toolbar pin/unpin and keyboard shortcuts

### Permissions
- Camera, microphone, MIDI, USB, Bluetooth, serial with picker UI
- Per-site content toggles (JavaScript, images, cookies, pop-ups, notifications)
- Auto-revoke for unused permissions

### Developer tools
- DevTools (Cmd+Alt+I) with dock modes
- View source, JavaScript console, remote debugging via chrome://inspect

### Media
- Picture-in-Picture (Cmd+Shift+P)
- Global Media Controls (Cmd+Shift+M)
- Screen reader / ARIA passthrough

## Keyboard shortcuts

### Navigation
| Action | macOS | Windows/Linux |
|---|---|---|
| Focus address bar | Cmd+L | Ctrl+L |
| Back / Forward | Cmd+[ / Cmd+] | Alt+Left / Alt+Right |
| Reload | Cmd+R | Ctrl+R |
| Hard reload | Cmd+Shift+R | Ctrl+Shift+R |
| Find in page | Cmd+F | Ctrl+F |

### Tabs and windows
| Action | macOS | Windows/Linux |
|---|---|---|
| New tab | Cmd+T | Ctrl+T |
| Close tab | Cmd+W | Ctrl+W |
| Reopen closed tab | Cmd+Shift+T | Ctrl+Shift+T |
| Tab search | Cmd+Shift+A | Ctrl+Shift+A |
| Next / Previous tab | Cmd+Shift+] / [ | Ctrl+Shift+] / [ |
| Switch to tab 1-8 | Cmd+1-8 | Ctrl+1-8 |
| Last tab | Cmd+9 | Ctrl+9 |
| New window | Cmd+N | Ctrl+N |
| Incognito window | Cmd+Shift+N | Ctrl+Shift+N |
| Fullscreen | Ctrl+Cmd+F | F11 |

### Tools
| Action | macOS | Windows/Linux |
|---|---|---|
| Agent Hub | Cmd+K | Ctrl+K |
| Bookmark page | Cmd+D | Ctrl+D |
| Toggle bookmark bar | Cmd+Shift+B | Ctrl+Shift+B |
| History | Cmd+Y | Ctrl+Y |
| Downloads | Cmd+Shift+J | Ctrl+Shift+J |
| DevTools | Cmd+Alt+I | Ctrl+Shift+I |
| Print | Cmd+P | Ctrl+P |
| Zoom in / out / reset | Cmd+= / - / 0 | Ctrl+= / - / 0 |
| Settings | Cmd+, | Ctrl+, |

## Internal pages

| URL | Description |
|---|---|
| chrome://version | App, Electron, Chromium, Node, V8 versions |
| chrome://gpu | Graphics and driver info |
| chrome://downloads | Download history |
| chrome://history | Browsing history with journeys |
| chrome://bookmarks | Bookmark manager |
| chrome://settings | Settings |
| chrome://extensions | Extension manager |
| chrome://inspect | Remote debugging targets |

## Project structure

```
my-app/
  src/
    main/                  # Main process (Electron + Node)
      index.ts             # App entry, menu, IPC
      window.ts            # BrowserWindow lifecycle
      sessions/            # Agent session manager, SQLite persistence, browser pool
      daemon/              # Background agent daemon
      tabs/                # TabManager, SessionStore, ZoomStore
      omnibox/             # Autocomplete, typo correction
      bookmarks/           # Bookmark store, import/export
      history/             # History store, journey clusters
      downloads/           # Download manager
      extensions/          # MV3 runtime
      passwords/           # Password manager, breach detection
      permissions/         # Permission framework, auto-revoke
      https/               # HTTPS-First, HSTS
      privacy/             # DNT, GPC, Safe Browsing
      devices/             # Device API pickers
      devtools/            # DevTools panel
      ...

    preload/               # Context bridge scripts
      shell.ts
      settings.ts
      extensions.ts

    renderer/              # React renderer processes
      hub/                 # Agent Hub (dashboard, grid, list, command bar)
      shell/               # Browser chrome (toolbar, tabs, URL bar, bars)
      settings/            # chrome://settings
      bookmarks/           # chrome://bookmarks
      downloads/           # chrome://downloads
      history/             # chrome://history
      extensions/          # chrome://extensions
      pill/                # Agent pill overlay
      ...

  docker/
    agent/                 # Containerized agent runtime

  tests/
    unit/                  # Vitest
    integration/           # Vitest
    e2e/                   # Playwright
    parity/                # Chrome-parity checks
    visual/                # Screenshot diffing
```

## Development

```bash
# Install
yarn install

# Start
yarn start

# Lint + typecheck + test
yarn qa

# End-to-end tests
yarn e2e

# Chrome-parity checks
yarn parity

# Visual QA (capture + diff)
yarn visual:qa
```

## Tech stack

- **Electron 41** — Chromium with context isolation and renderer sandbox
- **React 19** — Vite 5 renderer bundles
- **TypeScript 5.4** — main, preload, and renderer
- **SQLite** (better-sqlite3) — session persistence
- **Electron Forge 7** — packaging (DMG, DEB, RPM, ZIP, Squirrel)
- **Vitest + Playwright** — unit, integration, and e2e tests
- **Anthropic SDK** — AI agent integration
- **keytar** — OS keychain (Touch ID, password storage)

## License

MIT
