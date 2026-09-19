# prism-term-core

What **Prism Terminal** and **Prism** share. One copy, two apps.

This folder is the terminal, and since 2026-09-19 (#28) the few other things the
two apps must show identically: today that is the update chip and the window it
opens. Prism Terminal is an app built around it; Prism is a media viewer that
embeds it. Both compile this same TypeScript source, so a feature or fix in here
is written once and reaches both.

## Why it exists

Prism Terminal began (2026-09-18) as a COPY of Prism's built-in terminal. A copy
drifts from the first commit: within a day, links highlighting, a painting fix,
a themed indicator and a paste rule each existed in only one of the two apps.
The owner's rule (2026-09-19, issue #15): *"this terminal app is just an
extraction of the main Prism app and should therefore be reflected in both
apps... all should be synced, unless it conflicts with one app, then you need to
ask me."* And: *"why can't this repo be the core?"* It can, and this is it.

## The contract

1. **What is the terminal lives here, once.** The pty and shells, the prompt
   bootstrap, agent detection / poll / resume, the panel, find, link painting,
   the agent indicator's rules and colours, the close question, the paste rule,
   the theme and look stores, **and the terminal's SETTINGS UI** (`renderer/settings`):
   the owner's rule is that the two apps' terminal settings are the same
   settings, "the setting names, types, how they function", while the personal
   VALUES stay per app (each has its own storage; nothing is shared).
2. **What is an app's shell stays in the app.** Prism: roots and the wall, the
   sidebar, the split dock, several shells per tab, app styles. Prism Terminal:
   folder tabs, the start screen, window chrome from the theme, the lifecycle.
   Dictation (#13) is in here too, whole: the key, the microphone, the engine,
   the model store, the pill, the tab mark and its Settings page. A host wires
   it with four lines: `registerDictationIpc` in main, `createDictationApi` in
   the preload, the `dictation` field of its host config, and
   `useDictationArm` + `<DictationPill>` where its terminal is drawn. It also
   runs `core/tools/fetch-whisper.mjs <dir>` at build time and ships that folder
   as `resources/bin/whisper`, and grants its own window the `media` permission
   (audio only).
   **AND WHAT THE TWO APPS MUST SHOW IDENTICALLY, TERMINAL OR NOT** (#28, owner,
   2026-09-19). This WIDENS the core, on purpose, from "the terminal" to "what
   the two apps share". Asked to build the update window (*"when you click the
   Update badge, it opens like a pop window, which shows the change log or like
   patch notes for the new update, and then you can choose cancel or install"*)
   and to show it in both apps, the question was whether to write it twice; the
   owner's answer: *"yes keep the core"*. So these live here although none is
   terminal: `shared/updateTypes.ts` (the offer), `shared/releaseNotes.ts` (a
   release body as SAFE plain entries), `main/updatePreview.ts` (the
   `--preview-update` fake), `renderer/lib/updateFlow.ts` + `useUpdateFlow.ts`
   (the rules and the hook) and `renderer/components/UpdateChip.tsx` +
   `UpdateDialog.tsx`. The bar for anything further is the same: both apps would
   otherwise write it, and it must look and behave the same in both. An app's
   own shell still does not come in (rule 2). A host wires the update with: the
   release body as `notes` in its own update check, `wantsPreview` /
   `previewUpdate` / `runPreviewInstall` in main, `useUpdateFlow(bridge, guard)`
   where its title bar is drawn, `<UpdateChip>` in the bar and ONE
   `<UpdateDialog>` at the root. The `guard` is the host's own question before
   an install, which ends in the app quitting: Prism Terminal asks about a
   working agent, Prism about unsaved text as well.
   Two rules travel with it. **The notes are plain text**: they are text off the
   network in a window that can reach the bridge, so they are parsed to strings
   and printed as text nodes; never HTML, never rendered markdown, never an
   anchor. **The chip never changes width**, in any phase: every label is laid
   out in one cell and only the current one is visible.
3. **A difference between the apps is DECLARED, never forked.** Every place the
   two legitimately differ is a field of `TermHostConfig` in
   [`renderer/host.ts`](renderer/host.ts): the default each untouched setting
   reads as, whether there is a host style to follow, who paints the ground,
   what an unpicked indicator colour resolves to, what "acrylic" means as a
   terminal setting, which chords the app owns. If a difference is not on that page, it is a fork,
   and a fork is what this exists to end. Adding a field is an owner decision.
4. **Defaults are per host on purpose.** An update must never silently change
   what an existing user sees. Where the owner picks one value for both apps,
   both hosts pass it and the difference disappears.
5. **The bridge to main is written once.** [`shared/channels.ts`](shared/channels.ts)
   names every IPC channel; [`preload/api.ts`](preload/api.ts) is the preload
   half and [`main/ipc.ts`](main/ipc.ts) the main half. A host passes in its own
   `ipcRenderer` / `ipcMain` / clipboard; the core imports nothing from
   `electron`.

## Rules for code in here (lint-enforced in Prism Terminal's `eslint.config.js`)

- **Relative imports only.** No `@shared` / `@renderer` / `@core` aliases: a
  consumer's bundler resolves an alias against ITS OWN tree. Measured: the core
  silently ran Prism's copy of a file, with no error anywhere.
- **Never `window.prism`.** Reach main through `termApi()`.
- **Never import from a host's `src/`**, never import `electron`, never import
  Prism Terminal's `chromeTheme` (inside Prism it would overwrite the app's
  styles).
- **Carry the superset.** If one app needs a capability the other does not
  (`cdTerm`, `decideFollow`, following the host style), it lives here and the
  other app simply does not call it. Deleting it here takes it from both.
- **Components outside the terminal take PROPS ONLY.** The update chip and its
  dialog never reach for a bridge, not even `termApi()`: a host hands the hook
  the three preload members it needs (`UpdateBridge`), so the same components
  drop into a host whose terminal is not even mounted.
- CSS: the core uses Tailwind utilities and the `--p-*` tokens both apps define,
  plus the classes `.p-agent-run` and `.p-scroll` and the `.xterm` rules in each
  app's `index.css`. A new token or class needed here must be added to BOTH.

## How each app consumes it

**Prism Terminal** (this repo): directly, through the app-side alias `@core`,
plus ONE line in `src/renderer/src/index.css`: `@source '../../../core';`. Tailwind
scans from the renderer root down and `core/` is outside it, so without the line
a utility used only in here is never generated, silently (#20: it took the whole
Settings page apart, with every functional test green).
The app's tests, lint and the e2e scenarios are the core's gate.

**Prism**: as a dev dependency pinned to a tag of the `core-dist` branch, which
is this folder on its own (`git subtree split --prefix=core`), so the package is
small, has no install scripts and carries no app files:

```jsonc
// Prism/package.json
"devDependencies": { "prism-term-core": "github:Maxaubert/PrismTerminal#core-v0.1.0" }
```

A DEV dependency on purpose: electron-vite bundles dev dependencies into the app
and externalises production ones, so the core is compiled in and nothing extra
ships. Prism's build needs three lines, all measured:

```ts
// electron.vite.config.ts, renderer: a linked checkout otherwise brings a second React
resolve: { dedupe: ['react', 'react-dom'] }, optimizeDeps: { exclude: ['prism-term-core'] }
```
```css
/* src/renderer/src/index.css: Tailwind generates nothing from a dependency until told to look */
@source '../../../node_modules/prism-term-core';
```

`react`, `node-pty` and `@xterm/*` must stay at compatible versions in both apps
so npm keeps ONE copy of each; the core is verified against Prism Terminal's
lockfile but ships against Prism's.

## Releasing the core

Nobody does, by hand (PrismTerminal #23; owner, 2026-09-19: "that compiled copy
needs to be auto bumped when a new Prism Terminal release or merge to main
happens"). Land the change through a PR in Prism Terminal, WITH a bump of
`core/package.json`'s version (CI fails the PR otherwise: a released tag is never
moved). On merge, `.github/workflows/core-release.yml`:

1. re-splits this folder into `core-dist` and tags `core-v<version>`. Tags are
   `core-v*` for the core and `v*` for the app, since this repo is both;
2. opens a PR in Prism bumping the pin and Prism's own version;
3. waits for that PR's checks, which include Prism's TERMINAL GATE on a GitHub
   runner (`terminal-gate.yml` there): the built app driven through every
   scenario the terminal can break, real dictation included. Prism has the larger
   footprint and so more ways to break, which is why the proof runs there;
4. merges it, if the owner has set the repo variable `PRISM_AUTO_MERGE` to
   `true`, and Prism releases itself; otherwise the green PR waits for a person.
   A red check never merges.

The one thing still cut by hand is a RELEASE CANDIDATE for an open PR
(`core-v0.2.0-rc.N`, split from the PR's branch), so Prism's half can be built
and tested before the core's half merges. The core's lint and unit tests run
only here; Prism's gate on it is its compiler, its unit suite and that e2e.
**Keep Prism's gate runner-safe:** nothing in those scenarios may assume one
particular machine.

## Status (2026-09-19)

Prism Terminal runs entirely on this core. Prism's adoption is written and
waiting on the owner's review as three stacked draft PRs (Prism #155, #156 and
the step-3 PR): identical files, then the panel / look stores / bridge, then the
settings, the indicator's rules and the close question. Until this branch merges
Prism pins a release candidate (`core-v0.1.0-rc.N`); the first real tag,
`core-v0.1.0`, is cut from `main` after the merge and Prism is repointed at it.
Issue #15 holds the decisions and what is left.
