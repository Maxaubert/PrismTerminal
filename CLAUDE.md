# Prism Terminal

A tabbed Windows terminal for AI CLIs (Claude Code, Codex): one shell per tab, an agent indicator on
every tab, terminal themes that colour the whole window. Electron + React 19 + TypeScript + Vite +
Tailwind v4, node-pty + xterm. x64, Windows 10 1809+ / 11, per-user unsigned NSIS installer,
GitHub Releases.

## This repo is the terminal of TWO apps

**`core/` is the terminal, and Prism embeds it** (owner, 2026-09-19, #15: "this terminal app is just
an extraction of the main Prism app and should therefore be reflected in both apps... all should be
synced, unless it conflicts with one app, then you need to ask me", and "why can't this repo be the
core?"). Read [`core/README.md`](core/README.md) before touching anything under `core/`: it is the
contract. In one paragraph: what IS the terminal lives in `core/` once; what is an app's shell stays
in the app; every place the two apps legitimately differ is a DECLARED field of `TermHostConfig`
(`core/renderer/host.ts`), never a fork, and adding one is an owner decision; defaults are per host
so an update never silently changes what an existing user sees; the bridge to main is written once
(`core/shared/channels.ts`, `core/preload/api.ts`, `core/main/ipc.ts`). This app is one host
(`src/renderer/src/termHost.ts`); Prism is the other.

- **THE TERMINAL'S SETTINGS ARE THE CORE'S TOO** (owner, 2026-09-19: "they shouldn't be synced in
  terms of personalization, but the setting names, types, how they function and so on should be the
  same"). `core/renderer/settings`: the field primitives, `TerminalAppearanceSettings` (theme wall and
  editor, font, size, acrylic, the two indicator colours) and the rows `ShellSetting` /
  `AgentIndicatorSetting`. Each app composes its OWN page round them (`components/Settings.tsx` here
  is only the page plus this app's rows: new tabs, Explorer menu, version). Values are per app (own
  userData), never shared. `settings/options.ts` lists every terminal option by id; a unit test holds
  the list and the sections together, and each app's e2e (`options`) asserts its page shows that
  list and no terminal-looking row of its own. A row outside the list is a fork.
- **A PAGE THAT WORKS IS NOT A PAGE THAT LOOKS RIGHT** (#20, 2026-09-19). Moving the settings into
  `core/` dropped every Tailwind class used only there (`core/` is outside the scanned root; the fix
  is the `@source` line at the top of `index.css`, do not remove it). All 14 e2e scenarios passed over
  a ruined page, because they asserted that rows EXIST. The `options` scenario now MEASURES the
  layout (card width, wall rows, row padding) and writes `.e2e-shots/settings-*.png`. After any change
  that moves UI between `src/` and `core/`, LOOK at those screenshots before calling it done.
- **THE CORE RELEASES ITSELF AND OPENS PRISM'S BUMP** (#23; owner, 2026-09-19: "that compiled copy
  needs to be auto bumped when a new Prism Terminal release or merge to main happens").
  `.github/workflows/core-release.yml`: every push to main that touches `core/` re-splits `core-dist`,
  tags `core-v<core/package.json version>`, and opens a PR in Maxaubert/Prism bumping the pin. OPENED,
  NOT MERGED (the owner's pick): Prism's `npm run e2e:terminal` runs only on the owner's machine, so a
  person runs it and says merge. So: **a PR that changes `core/` MUST bump `core/package.json`'s
  version** (`ci.yml`'s `core-version` job fails the PR otherwise; a released tag is never moved).
  Never split, tag or push `core-dist` by hand on main any more; release candidates for an open PR
  (`core-v0.2.0-rc.N`, cut by hand from the branch) are the one exception. The bump step needs the
  secret `PRISM_BUMP_TOKEN` (fine-grained, Maxaubert/Prism, Contents + Pull requests read/write);
  without it the workflow warns and only releases.
- **A terminal change goes in `core/`**, and is a change to Prism too: say so in the PR, and ask the
  owner when it would conflict with how Prism works. App-shell changes (tabs, start screen, window)
  stay in `src/`.
- **`core/` is lint-walled** (`eslint.config.js`): relative imports only (a consumer resolves
  `@shared` against ITS OWN tree, MEASURED, silently), never `window.prism` (use `termApi()`), never
  a host's `src/`, never `electron`, never `chromeTheme`. The app reaches the core through `@core`.
- **Carry the superset**: a capability only Prism uses (`cdTerm`, `decideFollow`, following the host
  style) lives in `core/` anyway; deleting it here takes it from Prism.
- Prism consumes `core/` as a DEV dependency pinned to a `core-v*` tag of the `core-dist` branch
  (`git subtree split --prefix=core`). Tags: `core-v*` for the core, `v*` for this app.

**History.** Made 2026-09-18 by COPYING Prism's terminal at Prism `4196c3a`, on the recommendation
"new repo, Prism untouched". That copy drifted within a day, which is what the core exists to end.
Prism's CLAUDE.md still holds the long history of WHY the terminal behaves as it does (search it for
the date in a copied comment).

Design spec and plan: `docs/superpowers/specs/2026-09-18-prism-terminal-design.md`,
`docs/superpowers/plans/2026-09-18-prism-terminal.md`. Owner decisions are marked `(owner)` there.

## Scope

In: tabs (a tab is ONE shell and its folder, nothing else), the agent indicator, themes + custom
theme + fonts + acrylic, tab restore with agent resume, the + with ask / fixed-folder modes and its
pinned + recent list, the start screen, find in scrollback, the paste and drop rules, close
confirmation, Explorer verbs, update chip, single instance.

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
- **The indicator is MINIMAL by default and wears the THEME** (owner, 2026-09-18, #4; it was Full
  and a fixed orange in Prism and the first build). `termLook` stores the two colours as CHOICES,
  `''` meaning "follow the theme"; `lib/agentColors.ts` resolves what is in force: working = the
  chrome's own `--p-accent`, finished = the theme's green moved to the contrast floor (the fallback
  green when a palette's green IS its accent, since two states in one colour is no indicator).
  Picking a theme gives both back to the theme; a pick of your own shows a "Follow theme" button.
  Settings calls them "Agent working indicator" and "Agent finished indicator". The finished mark
  is Full's alone, so the e2e turns the volume up before it looks for one.
- **The process poll** (`agentPoll.ts`) asks only after a pty printed something and backs off 2.5s to
  20s. It reports CHANGES, so its first verdict on a shell is said once; the e2e waits for it.
- **The only command the app writes into a shell is the agent resume**, as the shell's STARTUP
  command, with the id shape-checked in main (`validResume`). Never type into a user's shell.
- **Closing the window QUITS; closing the last tab does not** (owner, 2026-09-18, after using the
  first build, which hid the window and stayed resident: "the app should actually close when you
  close it"). The last tab lands on the start screen (`EmptyState`, Tabby's shape by owner
  reference: mark, name, New terminal, the pinned + recent folders, Settings, version). Resume does
  NOT need a live process: it is `tabs.json` plus the agent's own session files at the next launch.
  So `tabs.flush()` and the window-state write both happen synchronously in `close`, and main
  ignores `tabs:changed` until the first restore has answered (a page that has not restored yet
  reports an empty list). Do not reintroduce the resident process without a fresh decision.
- **New tab is Ctrl+T and opens in the user's folder** (owner, 2026-09-18, reversing the first
  build's Ctrl+Shift+T and its "ask" default). `newTabPrefs`: mode `folder` is the default and a
  folder of `''` means the user's own, which main resolves (`homeDir()`); `ask` is the option.
  Ctrl+T is therefore taken from whatever runs in the shell (Claude Code's task list), knowingly.
  **Ctrl+W closes a tab, in BOTH apps** (owner, 2026-09-19, reversing the first build's
  Ctrl+Shift+W, which still works). Known cost, accepted: the shell loses delete-word on that chord;
  Ctrl+Backspace does the same job.
- **The window's edge is a faint hairline that follows the theme** (owner, same day;
  `windowEdge.ts` + Prism's `dwmHelper.ts`). DWM's border is always one physical pixel, so it cannot
  be thinner; what reads as thickness is contrast, so it is drawn a small step off the theme's own
  ground, and removed when maximized or fullscreen. Chromium rewrites the DWM attributes when the
  backdrop changes, so it is re-applied, debounced, after every material or ground change. Off
  under `--e2e` (the helper is a PowerShell that compiles a P/Invoke per launch).
- **THE CLOSE QUESTION IS ONE RULE, NOT A SETTING** (owner, 2026-09-19, #15: "remove the setting but
  just have it on smart mode by default, so it won't ask if you're in a normal shell but if you're
  working with an agent it will ask"). `core/renderer/lib/agentClose.ts`, the same in Prism: a plain
  shell closes unasked; a tab whose shell HOSTS an agent asks, working or idle (an agent waiting at
  its own prompt is still a conversation the close ends), and names it and how long it has worked;
  closing the WINDOW is held only while one is mid-answer, since idle agents come back at the next
  launch. It replaced this app's on/off switch and Prism's three modes. Proved by the e2e `closeAsk`.
- **The title bar has a settings cog and NO menu** (owner, same day: a menu of Settings + Quit was
  cut to the cog). Nothing in the UI needs to quit the app any more; the X does.
- **The theme drives the chrome** through the real `--p-*` tokens (`lib/chromeTheme.ts`). Every ink is
  moved to a contrast floor, and light/dark is MEASURED from the ground, never read off a name.
  The `:root` fallbacks in `index.css` are `chromeTokens` output for the `prism` preset; recompute
  them if either changes.
- **The terminal panel paints the ground; xterm's canvas is CLEAR** (2026-09-19, #6, owner
  screenshot: a grey bar under a black terminal). xterm sizes itself in whole rows (MEASURED: 604px
  in a 611px box), so the strip under the last row is never its to paint; with the ground on the
  canvas and a transparent box round it, that strip showed the native window background. So
  `TerminalPanel`'s box is `bg-[var(--p-bg)]` and `currentTermTheme()` hands xterm
  `background: #00000000` plus a named `cursorAccent` (it defaults to the background, which would
  make the character under a block cursor a hole). Exactly ONE coat per pixel, which also matters
  on acrylic: two translucent coats are a visibly darker panel, so App's own container behind the
  panel stays unpainted. The e2e `theme` scenario measures the strip, and fails on the old code.
- **Links are PAINTED, not only underlined on hover** (owner, 2026-09-19, #10). xterm's link addon
  marks a link only under the pointer, so `lib/termLinkPaint.ts` lays a DECORATION on each row a
  link sits on: the link colour as its foreground, a faint underline as its element, never in the
  way of a click. `lib/termLinks.ts` is the pure half: `findLinks` (a sentence's full stop and a
  bracket the link never opened are given back) and `linkColor`, which is `LINK_BLUE` moved only as
  far as the ground needs to reach 4.5:1, so it adapts to every preset and to a custom background,
  and is tested for all of them. WHAT IS SCANNED is the design: scrollback is immutable, so its
  links are painted once and ride a marker; the LIVE screen is redrawn in place by TUIs, so every
  pass throws away what it painted from the last finished line down and paints that again (a
  decoration left on a rewritten row is a blue smear over words that were never a link). Rebuilt
  on a resize (reflow) and on a theme change; not on the alternate screen. Columns are counted in
  CELLS, since a wide character is one character and two cells. xterm splits a row into spans as
  it likes, so the e2e finds a link's span by POSITION, never by its text.
- **A file dropped on the terminal types its quoted path, and the terminal answers a right-click**
  (2026-09-19, #16). Both lived in Prism's `TermDock.tsx`, the split dock, and went with it when
  the dock was stripped, while the README, the spec and PR #3 went on listing the drop as shipped
  for a day: NOTHING IN A FEATURE LIST IS TRUE UNTIL A TEST HAS DONE IT. They are on App's terminal
  host now (`data-term-host`): the drop goes through `quotePaths` and `termInput`, never Enter, and
  only over a shell; the menu is Paste (the terminal's own paste rule, via `pasteInto`), Find in
  scrollback and Close tab, with no Copy row because xterm owns its selection. The e2e performs a
  REAL drop with Chromium's drag events (`Input.dispatchDragEvent` carrying a file path): a
  synthetic DataTransfer holds a File with no path and proves nothing about `getPathForFile`.
  When a Prism component is stripped, grep what ELSE it owned before calling a feature kept.
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

`core/` (the terminal, shared with Prism: see above). `src/main` (index.ts is wiring only;
planRestore, tabsStore, windowState, material, windowEdge, dwmHelper, verbSwitch, shellVerb,
update, argv),
`src/preload`, `src/shared` (termCwd, types), `src/renderer/src` (App.tsx owns the tab list and the
keys; components/; lib/ is pure and tested). One responsibility per file; aliases `@shared`,
`@renderer`. No new runtime dependency without a reason; today there are eight.

## Build, test, release

- `npm run dev`, `npm test` (vitest), `npm run typecheck`, `npm run lint`.
- `npm run e2e` builds and drives the app through Playwright over CDP, PARKED offscreen and
  unfocusable (`--e2e`), each scenario in its own profile and reaping its processes (the app is
  single-instance, so a stray one takes every later launch's folder and exits it).
  `npm run e2e -- <name>` runs the scenarios whose name contains `<name>`. Under `--e2e`: no verb write, no updater, and
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
