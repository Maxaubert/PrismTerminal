# prism-term-core

The terminal shared by **Prism Terminal** and **Prism**. One copy, two apps.

This folder is the terminal. Prism Terminal is an app built around it; Prism is a
media viewer that embeds it. Both compile this same TypeScript source, so a
terminal feature or fix is written once and reaches both.

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
   the agent indicator's rules, the paste rule, the theme and look stores.
2. **What is an app's shell stays in the app.** Prism: roots and the wall, the
   sidebar, the split dock, several shells per tab, app styles. Prism Terminal:
   folder tabs, the start screen, window chrome from the theme, the lifecycle.
3. **A difference between the apps is DECLARED, never forked.** Every place the
   two legitimately differ is a field of `TermHostConfig` in
   [`renderer/host.ts`](renderer/host.ts): the default each untouched setting
   reads as, whether there is a host style to follow, who paints the ground,
   which chords the app owns. If a difference is not on that page, it is a fork,
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
- CSS: the core uses Tailwind utilities and the `--p-*` tokens both apps define,
  plus the classes `.p-agent-run` and `.p-scroll` and the `.xterm` rules in each
  app's `index.css`. A new token or class needed here must be added to BOTH.

## How each app consumes it

**Prism Terminal** (this repo): directly, through the app-side alias `@core`.
The app's tests, lint and the 13 e2e scenarios are the core's gate.

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

1. Land the change in Prism Terminal (PR, the app's full gate).
2. Bump `core/package.json`'s version. Publish: `git subtree split --prefix=core -b core-dist`,
   tag `core-v<version>`, push the branch and the tag. Tags are `core-v*` for the
   core and `v*` for the app, since this repo is both.
3. In Prism: bump the pin, run Prism's own gate (typecheck, unit, its terminal
   e2e), install, PR. The core's lint and unit tests run only here; Prism's gate
   on it is its compiler and its e2e.

## Status (2026-09-19)

Prism Terminal runs entirely on this core. Prism's adoption is in progress and
deliberately incremental: see issue #15 for what has moved, what is waiting on
an owner answer, and the questions themselves.
