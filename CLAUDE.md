# Prism Terminal

A tabbed Windows terminal for AI CLIs (Claude Code, Codex): one shell per tab, an agent indicator on
every tab, terminal themes that colour the whole window. Electron + React 19 + TypeScript + Vite +
Tailwind v4, node-pty + xterm. x64, Windows 10 1809+ / 11, per-user unsigned NSIS installer,
GitHub Releases.

## This repo is the terminal of TWO apps

`core/` is what this app and Prism share, and Prism embeds it (pinned to a `core-v*` tag of the
`core-dist` branch). The full background, and the rules for the shared features (dictation, the
update window, command help, themes, the menu, settings), are in
[`docs/two-apps.md`](docs/two-apps.md). The short version:

- Read [`core/README.md`](core/README.md) before touching anything under `core/`: it is the contract.
  Every way the two apps differ is a declared `TermHostConfig` field, never a fork, and adding one is
  an owner decision. ([more](docs/two-apps.md))
- A terminal change goes in `core/` and is a change to Prism too: say so in the PR, ask the owner
  when it would conflict with Prism. App-shell changes stay in `src/`.
  ([more](docs/two-apps.md#terminal-change-in-core))
- `core/` is lint-walled: relative imports only, never `window.prism`, a host's `src/`, `electron`
  or `chromeTheme`. Carry the superset: what only Prism uses still lives in `core/`.
  ([more](docs/two-apps.md#core-lint-wall))
- A PR that changes `core/` bumps `core/package.json`; merging to main ships to BOTH apps, and a bug
  a core change caused becomes a failing test first, then the fix. ([more](docs/two-apps.md#merging-ships))
- This is a product for other people: a feature bundles or fetches what it needs and works on a
  fresh Windows install. ([more](docs/two-apps.md#product-for-others))
- A page that works is not a page that looks right: after moving UI between `src/` and `core/`,
  LOOK at the `.e2e-shots/settings-*.png` screenshots. ([more](docs/two-apps.md#page-looks-right))

## Scope

In: tabs (a tab is ONE shell and its folder, nothing else), the agent indicator, themes + custom
theme + fonts + acrylic, tab restore with agent resume, the + with ask / fixed-folder modes and its
pinned + recent list, the start screen, find in scrollback, the paste and drop rules, close
confirmation, Explorer verbs, the update chip and its window, command help (#12), single instance.

Out, each a fresh owner decision and not a natural next step: split panes, several shells per tab,
per-shell profiles, a tray icon, multiple windows, SSH management, app styles separate from the
terminal theme, anything that reads or shows files. (OPENING a path in the app Windows gives it is in:
the owner's own call, #99.)

## Rules that must not regress

All measured in Prism, not assumed. The most important, each a one-liner; the full entry (the
measurement, the owner's words, the test that holds it) is behind its link. Every other rule is in
[`docs/regression-rules.md`](docs/regression-rules.md) and [`docs/two-apps.md`](docs/two-apps.md):
read the full entry before changing anything it names.

1. [What reaches a shell is inert until the user acts](docs/regression-rules.md#inert-input): pastes
   go through `sanitizePaste`, paths through `quotePath` per shell, Windows tools by full path.
2. [The only command the app writes into a shell is the agent resume](docs/regression-rules.md#only-command-is-resume),
   as the STARTUP command with a validated id. Never type into a user's shell.
3. [Main installs only what main offered](docs/regression-rules.md#main-installs-only-offered):
   `update:install` refuses any url but `pendingUpdate.url`; state files are written atomically.
4. [Renderer is sandboxed](docs/regression-rules.md#renderer-sandboxed): `sandbox: true`, context
   isolation, http(s) only for navigation and window-open.
5. [Bundled ConPTY](docs/regression-rules.md#bundled-conpty): `useConptyDll: true`; `node-pty` stays
   `asarUnpack`ed and `npmRebuild: false`.
6. [The quit waits for every shell to be gone](docs/regression-rules.md#quit-waits-for-shells): every
   kill goes through `killPty`, `will-quit` holds on `shellsGone`; `node-pty` pinned `1.2.0-beta.15`.
7. [Closing the window QUITS; closing the last tab does not](docs/regression-rules.md#closing-window-quits):
   `tabs.flush()` and the window-state write are synchronous in `close`. No resident process.
8. [The indicator is the agent's own word](docs/regression-rules.md#indicator-agent-word): the
   terminal title first, output scoring only as the fallback; rules live in `useAgentIndicator.ts`.
9. [Claude Code's hooks are its word, above the title](docs/regression-rules.md#claude-hooks): the
   plugin's OSC 777 signal wins; a hooked session is never scored from output.
10. [Typing is heard on `onKey`, never `onData`](docs/regression-rules.md#typing-on-onkey): xterm's
    own replies to the pty must not count as the user typing.
11. [Cells are not characters, and a key is its physical key](docs/regression-rules.md#cells-not-characters):
    cell-to-text goes through `lib/termCells.ts`; Ctrl+C and Ctrl+V match `e.code` too.
12. [`titleBarStyle: 'hidden'`, never `frame: false`](docs/regression-rules.md#title-bar-style-hidden),
    and [material before colour](docs/regression-rules.md#material-before-colour): or acrylic breaks.
13. [ConPTY sends nothing on a resize](docs/regression-rules.md#conpty-resize):
    `fitKeepingCursorLine` carries the prompt line; `windowsPty` declares a build number.
14. [The terminal panel paints the ground; xterm's canvas is CLEAR](docs/regression-rules.md#panel-paints-ground):
    exactly one coat per pixel.
15. [The theme drives the chrome](docs/regression-rules.md#theme-drives-chrome): every ink moved to a
    contrast floor, light/dark measured from the ground, never read off a name.

## Layout

`core/` (the terminal, shared with Prism: see above). `src/main` (index.ts is wiring only;
planRestore, tabsStore, windowState, material, windowEdge, dwmHelper, verbSwitch, shellVerb,
update, argv),
`src/preload`, `src/shared` (termCwd, types, windowEdges), `src/renderer/src` (App.tsx owns the tab list and the
keys; components/; lib/ is pure and tested). One responsibility per file; aliases `@shared`,
`@renderer`. No new runtime dependency without a reason; today there are eight.

## Build, test, release

- `npm run dev`, `npm test` (vitest), `npm run typecheck`, `npm run lint`.
- **THE DIAGNOSTICS LOG** (#140; owner, 2026-10-07: "robust logging and debugging ... especially to
  catch stalls"). Both apps write `<userData>\logs\diag.jsonl` (PT `%APPDATA%\PrismTerminal\logs`,
  the stable copy `%APPDATA%\PrismTerminalStable\logs`, Prism `%APPDATA%\Prism\logs`): stalls with
  the scripts and the page stack, slow IPC, errors, crumbs. When the owner says something stalled or
  failed, READ IT FIRST: `npm run diag -- --app stable --since 10m` (a `mark` line is their Mark
  button). Schema, kinds and how to read them: [`docs/diagnostics.md`](docs/diagnostics.md). Local
  only, never sent (`PRIVACY.md`); typed text, the clipboard and audio are never written.
- **A test run leaves nothing in %TEMP%** (2026-09-28): `vitest.global.ts` points the whole run's
  TEMP at one folder and removes it afterwards (14 `pt-*` folders a run leaked before; Prism's suite
  had left 40,000, which is what made its tree stall). A new test may mkdtemp freely.
- `npm run e2e` builds and drives the app through Playwright over CDP, PARKED offscreen and
  unfocusable (`--e2e`), each scenario in its own profile and reaping its processes (the app is
  single-instance, so a stray one takes every later launch's folder and exits it).
  `npm run e2e -- <name>` runs the scenarios whose name contains `<name>`. Under `--e2e`: nothing opens outside the app (a link is recorded on `globalThis.__e2eOpenedLinks`, never sent to the owner's browser, #64; no Explorer window), no verb write, no updater
  (unless `--preview-update` asks for the fake one, or `PT_E2E_UPDATE_OFFER` hands over a
  real-shaped offer that cannot download), and `PT_E2E_PICK` answers the folder chooser. An app whose stand-in agent is "working" will hold
  `app.close()` on the close question; end scenarios idle. Scenarios close through `closeApp`
  (kills after 15 s), each has a time limit (180 s, longer in `SLOW`), its profile folder is removed
  after it, and a shell standing in for Claude waits for `polled` (the poll's first verdict), never
  a fixed sleep (#71).
- CI hardening (#71): `release.yml` tags the commit it BUILT (`--target`); `core-release` releases
  from main only, merges a Prism bump only once `terminal-gate` itself is green (by name, not a
  count), and opens an issue when a core change on main could not be released; `core-version`
  also requires the core version to be above the base's. **main is PROTECTED** (owner, 2026-09-28):
  a PR must be up to date with main and pass `check` and `core-version` (admins may bypass), which
  closes the two-PRs-one-core-version gap. A PR that falls behind is updated
  (`gh pr update-branch`) and its checks run again before it merges.
- CI (`ci.yml`): typecheck + lint + unit on PR and push to main. The e2e is the local pre-push gate.
- **Code signing is PREPARED, not enrolled** (2026-09-28): `release.yml` signs the installer through
  SignPath once the secret `SIGNPATH_API_TOKEN` exists, and skips it until then. The owner's steps,
  the application answers and the eligibility check are in `docs/code-signing.md`. `PRIVACY.md` is
  the privacy statement the signing policy links: a new network request changes it in the same PR.
- Shipping follows the global rules: issue, branch, PR, squash-merge, never commit to main, never
  merge without the owner's explicit approval of that PR. Bump the version inside the PR.
- **The app icon** is `build/icon.ico` (app, installer, uninstaller; 16-256 px frames) with its
  source `build/icon-source.png`, and `assets/prism-terminal-icon.png` (256 px) for the README.
  Since #136 (owner, 2026-10-07) it is the rainbow shapes on a black rounded badge with a faint
  #202020 edge, Wind's taskbar badge ("give it a outer border just like wind has since i have a black
  taskbar so we need a faint border"). `tools/make-icon.py` draws the badge per frame from the artwork,
  the edge one physical pixel wide and snapped to the frame's pixels. Before: "folded ribbons" (#129).
- **Installing is the last verification step.** `npm run package`, kill every `PrismTerminal` and
  `PrismTerminal-Setup*` process, run `dist/PrismTerminal-Setup-x64-<version>.exe /S`, then POLL
  `%LOCALAPPDATA%\Programs\PrismTerminal\PrismTerminal.exe` until its LastWriteTime moves (it goes
  missing mid-install). Launch only after setup has gone, and report the installed version.
- **THE OWNER WORKS IN A STABLE COPY; NEVER CLOSE IT** (2026-09-28: "install prism terminal somewhere
  safe, a duplicate version, just so i can code with claude or codex in there without it closing").
  `npm run install:stable` (`tools/install-stable.ps1`) copies the installed app to `%LOCALAPPDATA%\PrismTerminalStable`
  as `PrismTerminalStable.exe`, profile `%APPDATA%\PrismTerminalStable` (`--user-data-dir`, its own
  lock and tabs, `shell-verb-off` so it never writes the Explorer verbs), Start menu "Prism Terminal
  (Stable)". Install steps close processes named `PrismTerminal` ONLY: never `PrismTerminalStable`,
  never by path or window title. The copy moves to a new version only when the owner runs the script
  or clicks its OWN update chip (#104): run as `PrismTerminalStable.exe`, the update handoff
  (`src/main/updateHandoff.ts`) installs, waits for the copy to exit, mirrors the installed app into
  the copy's folder and restarts it with its `--user-data-dir`; every restart keeps the profile it had.
  **NEVER UNDER `Programs\`** (#88): the NSIS installer also stops every process whose path STARTS
  WITH its install folder, and `Programs\PrismTerminal` prefixes `Programs\PrismTerminalStable\`, so
  every install killed the copy. No folder the copy lives in may start with an install folder.

## Style

No em-dashes anywhere. Match the comment density of the copied code: comments say WHY, with the
measurement when there was one.

## Docs

- [`docs/regression-rules.md`](docs/regression-rules.md): every must-not-regress rule in full.
- [`docs/two-apps.md`](docs/two-apps.md): the core shared with Prism, its features' rules, release
  automation, history.
- [`core/README.md`](core/README.md): the core's contract.
- [`docs/diagnostics.md`](docs/diagnostics.md), [`docs/code-signing.md`](docs/code-signing.md),
  `PRIVACY.md`.
- Specs and plans: `docs/superpowers/specs/`, `docs/superpowers/plans/` (the first:
  `2026-09-18-prism-terminal-design.md`; owner decisions marked `(owner)`). Reviews: `docs/reviews/`.
  Research: `docs/research/`.
- Prism's CLAUDE.md still holds the long history of WHY the terminal behaves as it does.
