# Prism Terminal

A tabbed Windows terminal for AI CLIs (Claude Code, Codex): one shell per tab, an agent indicator on
every tab, terminal themes that colour the whole window. Electron + React 19 + TypeScript + Vite +
Tailwind v4, node-pty + xterm. x64, Windows 10 1809+ / 11, per-user unsigned NSIS installer,
GitHub Releases.

## Where it came from

Lifted out of **Prism** (`../Prism`) at commit `4196c3a` (v0.50.3), 2026-09-18, owner decision.
The code was COPIED: Prism keeps its own terminal and is never edited from here. The two drift; a
fix worth having in both is ported by hand. Prism's CLAUDE.md holds the long history of WHY the
terminal behaves as it does (search it for the date in a copied comment).

Design spec and plan: `docs/superpowers/specs/2026-09-18-prism-terminal-design.md`,
`docs/superpowers/plans/2026-09-18-prism-terminal.md`. Owner decisions are marked `(owner)` there.

## Scope

In: tabs (a tab is ONE shell and its folder, nothing else), the agent indicator, themes + custom
theme + fonts + acrylic, tab restore with agent resume, the + with ask / fixed-folder modes and its
pinned + recent list, find in scrollback, the paste and drop rules, close confirmation, Explorer
verbs, update chip, resident single instance.

Out, each a fresh owner decision and not a natural next step: split panes, several shells per tab,
per-shell profiles, a tray icon, multiple windows, SSH management, app styles separate from the
terminal theme, anything that reads or shows files.

## Rules that must not regress (all measured in Prism, not assumed)

- **Bundled ConPTY.** Shells spawn with `useConptyDll: true`; the inbox conhost fast-fails the whole
  app (0xc0000409) when a pty is killed mid-read. `node-pty` stays `asarUnpack`ed and
  `npmRebuild: false` (it ships N-API prebuilds; a rebuild dies in node-gyp).
- **`titleBarStyle: 'hidden'`, never `frame: false`**: DWM will not composite acrylic behind a
  frameless window.
- **Material before colour** (`material.ts`, measured on Electron 43): `setBackgroundMaterial('none')`
  rewrites the window background to white, so the colour is set AFTER the material.
- **ConPTY sends nothing on a resize**, so `fitKeepingCursorLine` carries the prompt line across by
  hand, and `windowsPty` is declared WITH a build number (without one xterm turns reflow off).
- **Typing is heard on `onKey`**, never `onData`: xterm answers the pty on its own (focus reports,
  device attributes) and those replies must not count as the user typing.
- **The indicator is the agent's own word.** Claude and Codex write their state into the terminal
  title (`lib/agentTitle.ts`); a titled session is never scored from its output. A spinner before the
  first idle title is the agent STARTING, not working. Output scoring (`termActivity`) is only the
  fallback, and an agent's startup paint is not work (`markBorn` / `startupOutput`). The rules live in
  `lib/useAgentIndicator.ts`; change them there, with Prism's reasoning in hand.
- **The process poll** (`agentPoll.ts`) asks only after a pty printed something and backs off 2.5s to
  20s. It reports CHANGES, so its first verdict on a shell is said once; the e2e waits for it.
- **The only command the app writes into a shell is the agent resume**, as the shell's STARTUP
  command, with the id shape-checked in main (`validResume`). Never type into a user's shell.
- **Resident lifecycle.** Closing the window (or the last tab) hides it and kills the shells; the
  process stays. Main IGNORES `tabs:changed` from the hide until the next restore answers, or the
  renderer's emptied list overwrites `tabs.json`. The renderer reports the emptied list BEFORE it
  asks for the close when the user closed the last tab, which is what makes that tab stay closed.
  The installer kills the process itself (`build/installer.nsh`), since a close only hides it.
- **The theme drives the chrome** through the real `--p-*` tokens (`lib/chromeTheme.ts`). Every ink is
  moved to a contrast floor, and light/dark is MEASURED from the ground, never read off a name. No
  container behind `TerminalPanel` may paint `--p-bg`: on acrylic that is a second translucent coat.
  The `:root` fallbacks in `index.css` are `chromeTokens` output for the `prism` preset; recompute
  them if either changes.
- **Opacity is a number read defensively** (`termOpacity`): `Number(null)` is 0, and never-set must
  read as opaque.
- **Explorer verbs**: HKCU, `reg.exe` with argv only, on `Directory` and `Directory\Background`, no
  `*`. On by default but APPLIED ONCE (marker file), never in dev and never under `--e2e`, and the
  Settings switch reports what the REGISTRY says. `shellVerbParity.test.ts` asserts the uninstaller
  deletes every key the app writes.
- **Renderer is sandboxed** (`sandbox: true`, context isolation on). The preload reaches the
  clipboard through main for that reason. `will-navigate` and window-open allow http(s) only.
- The preload global is `window.prism` and localStorage keys are `prism.term.*`, kept from Prism so
  copied code needs no renaming. The app has its own userData (`%APPDATA%\PrismTerminal`).

## Layout

`src/main` (index.ts is wiring only; terminal, shells, termPrompt, agentDetect, agentPoll,
agentResume, tabsStore, windowState, material, verbSwitch, shellVerb, update, argv),
`src/preload`, `src/shared` (termCwd, types), `src/renderer/src` (App.tsx owns the tab list and the
keys; components/; lib/ is pure and tested). One responsibility per file; aliases `@shared`,
`@renderer`. No new runtime dependency without a reason; today there are eight.

## Build, test, release

- `npm run dev`, `npm test` (vitest), `npm run typecheck`, `npm run lint`.
- `npm run e2e` builds and drives the app through Playwright over CDP, PARKED offscreen and
  unfocusable (`--e2e`), each scenario in its own profile and reaping its processes (the app is
  resident, so a "closed" app still holds the single-instance lock). `npm run e2e -- <name>` runs the
  scenarios whose name contains `<name>`. Under `--e2e`: no verb write, no updater, and
  `PT_E2E_PICK` answers the folder chooser. An app whose stand-in agent is "working" will hold
  `app.close()` on the close question; end scenarios idle.
- CI (`ci.yml`): typecheck + lint + unit on PR and push to main. The e2e is the local pre-push gate.
- Shipping follows the global rules: issue, branch, PR, squash-merge, never commit to main, never
  merge without the owner's explicit approval of that PR. Bump the version inside the PR.
- `release.yml` arrives with the icon PR (#2): no release is published with the placeholder icon
  (`build/icon.ico` is currently Prism's).
- **Installing is the last verification step.** `npm run package`, kill every `PrismTerminal` and
  `PrismTerminal-Setup*` process, run `dist/PrismTerminal-Setup-x64-<version>.exe /S`, then POLL
  `%LOCALAPPDATA%\Programs\PrismTerminal\PrismTerminal.exe` until its LastWriteTime moves (it goes
  missing mid-install). Launch only after setup has gone, and report the installed version.

## Style

No em-dashes anywhere. Match the comment density of the copied code: comments say WHY, with the
measurement when there was one.
