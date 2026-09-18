# Prism Terminal - design

Date: 2026-09-18. Owner decisions are marked (owner); everything else is Prism behaviour
carried across unchanged. Source of the transplant: `Prism` at commit `4196c3a` (v0.50.3).

## What it is

A standalone Windows terminal built for AI CLIs (Claude Code, Codex): tabs, one shell per tab,
an agent indicator on each tab, and a themeable look. It is Prism's built-in terminal lifted out
of the viewer, with everything that is not the terminal stripped.

- New sibling repo `PrismTerminal`, public on GitHub (owner). Local path
  `C:\Users\Admin\Documents\Claude\Github\PrismTerminal`.
- Prism is NOT touched: the code is copied, Prism keeps its terminal (owner). The two will drift;
  a fix worth having in both is ported by hand.
- Stack: Electron + React 19 + TypeScript + Vite (electron-vite) + Tailwind v4, x64, Windows 10
  1809+ / 11. Runtime dependencies: `react`, `react-dom`, `node-pty`, `@xterm/xterm`,
  `@xterm/addon-fit`, `@xterm/addon-search`, `@xterm/addon-unicode11`, `@xterm/addon-web-links`.
  Nothing else.
- Product name `Prism Terminal`, appId `com.prism.terminal`, exe `PrismTerminal.exe`, installer
  `PrismTerminal-Setup-x64-<version>.exe`, userData `%APPDATA%\PrismTerminal`. First version
  `0.1.0`.

## Scope

### Kept as-is (copied with their tests)

Main process:
- `terminal.ts`: node-pty with the BUNDLED conpty.dll (`useConptyDll: true`; the inbox conhost
  fast-fails the app when a pty dies mid-read), `OutputBatcher`, `ptyEnv` (TERM/COLORTERM set,
  NO_COLOR/FORCE_COLOR dropped, agent session markers stripped by name), spawn / write / resize /
  kill / killAll / livePids, prewarm.
- `shells.ts`: detect pwsh, Windows PowerShell, cmd and each WSL distro; main only spawns what it
  detected.
- `termPrompt.ts`: the OSC 9;9 folder report wrapped around the profile's own `prompt`, cmd's
  PROMPT, PSReadLine forced on with `-EnableScreenReaderMode:$false`, `PS_FILE_STYLE` (folders
  bold blue, the rest plain).
- `agentDetect.ts` and the agent poll from `index.ts`: asks only after a pty printed something,
  backs off 2.5s to 20s, "pid ppid" with the command line only on a prefilter hit.
- Agent resume: `claudeSessions(cwd)` lookup under `~/.claude/projects`, `claude --resume <id>`
  as the shell's STARTUP command (validated id), `codex resume --last` for Codex.
- `shellVerb.ts` (reshaped below), the update check against GitHub Releases, window bounds
  memory, single-instance lock with the foreground raise, `--e2e` mode (unfocusable, parked,
  never writes the verb).

Renderer:
- `TerminalPanel.tsx`: the module-scope session store (one xterm per shell, element reattached on
  tab switch), `fitKeepingCursorLine`, `windowsPty` with a build number, Ctrl+C copies a
  selection, Shift+Enter sends backslash-CR, paste rule (image forwards ^V, files paste as quoted
  paths, text is bracketed), a dropped file types its path, keys heard on `onKey` so xterm's own
  replies never count as typing, Ctrl+scroll per-session zoom, web links.
- `TermFind.tsx`: Ctrl+Shift+F over the scrollback (owner).
- `TabStrip.tsx`: drag-reorder, minimal / full indicator, working and finished colours, the +
  button with its right-click list of recent and pinned folders (owner).
- `lib/`: `agentTitle` (Claude's and Codex's title dialects), `termActivity` (output fallback,
  `markBorn` / `startupOutput`), `agentClock`, `termTheme` (about 40 presets + `legiblePalette`),
  `termLook`, `termAnsi`, `termPaste`, `termBus`, `termPrefs`, `recentRoots`, `reorderTabs`.
- `shared/termCwd.ts`: OSC 9;9 parsing. `cdCommand` and the inside/outside-root decision are
  deleted with the feature that used them.

### Changes shape

**A tab is one shell and its folder** (owner: one shell per tab). No root, no files, no tree, no
panes, no terminal view state.

```ts
interface Tab {
  id: string          // also the pty session id
  kind?: 'settings'   // the Settings page riding the strip; never persisted
  cwd: string         // where the shell was opened, then what it last reported
}
```

- Label: the last segment of `cwd`, following every OSC 9;9 report (owner). Tooltip: full path.
  Two tabs with the same last segment disambiguate with the parent folder, as `tabLabels` does.
  Shells that report nothing (WSL) keep the folder they opened in.
- A shell that exits closes its tab.
- `tabs.json` (userData, debounced 400ms, flushed on close): `{ tabs: [{ cwd, agent? }], active }`.
  Restore respawns each tab in its folder, drops a tab whose folder is gone without a word, and
  resumes claude / codex tabs (owner). Two claude tabs in one folder take the newest and
  second-newest session, as Prism's `taken` map does.
- Every restored tab's shell spawns AT LAUNCH, in front or not (`ensureTermSession`), which is
  Prism's behaviour: every conversation resumes at launch, not when its tab is first visited.

**New tab** (owner, REVISED 2026-09-18 after using the first build, where `ask` was the default):
Settings > General offers two modes.
- `folder` (default): a tab opens at once. With no folder chosen it is the user's own folder; a
  folder picked in Settings replaces it, and "Use my user folder" gives it back. A folder that has
  gone falls back to the user's folder at spawn.
- `ask`: the folder chooser opens, parented to the window; cancel opens nothing.
- The +, Ctrl+T (owner, revised from Ctrl+Shift+T, which still works) and the start screen's "New
  terminal" all follow the mode. Right-click on + lists
  pinned then recent folders (last five, deduped, read fresh) and opens a tab there directly.
- Prewarm runs only in `folder` mode, where the folder is known before the click.

**The window's edge** (owner, 2026-09-18): a faint hairline a small step off the theme's ground,
as in Prism, in place of DWM's default grey border; none when maximized or fullscreen.

**Closing the window quits; the last tab closing lands on the start screen** (owner, REVISED
2026-09-18 after using the first build. The first decision, "window closes, process stays
resident", was built and reversed: "the app should actually close when you close it". Resume is
unaffected, since it works from `tabs.json` and the agent's session files at the next launch.)
The start screen follows Tabby's, the owner's reference: the mark and the name, New terminal, the
pinned and recent folders (one press each), Settings, a footer with GitHub and the version.
Closing the WINDOW passes the close confirmation, flushes `tabs.json`, kills every shell and ends
the process. A tray icon is NOT added. The title bar carries a settings cog and NO menu (owner, after using
the first build: a menu holding Settings and Quit was cut to the cog alone), so nothing in the UI
quits the resident process; the installer and uninstaller end it, and `app:quit` stays in the
preload for the e2e. Relaunch with no argument restores
`tabs.json`; with a folder argument it restores and adds that folder's tab.

**Second open** (owner): single instance. A folder handed over (verb, argv, a second launch)
ALWAYS becomes a new tab in the running window, even if another tab sits in that folder, and the
window is raised past the foreground lock. A FILE argument opens a tab in the file's folder. No
argument and a visible window: just raise it.

**Explorer verbs** (owner): classic HKCU verbs via `reg.exe` (argv only), on `Directory`
("Open in Prism Terminal", `%1`) and `Directory\Background` ("Open Prism Terminal here", `%V`).
NO verb under `*`. Key name `PrismTerminal`, distinct from Prism's. On by default, applied once
(marker file in userData), switchable in Settings, reports what the REGISTRY says, never in dev
or under `--e2e`. The NSIS uninstall macro deletes both keys, and a parity test asserts every key
`shellVerb.ts` writes is one the uninstaller deletes.

**The theme drives everything** (owner). Prism's app styles and "follow the app style" are gone.
- `lib/chromeTheme.ts` (new, pure, tested) derives the `--p-*` tokens from the resolved terminal
  theme: `--p-bg` = theme bg, `--p-text` = theme fg, surfaces = fg mixed into bg at fixed steps,
  `--p-accent` = the theme's ANSI blue lifted to 3:1 against bg if it falls short (else the
  cursor colour, else Prism indigo `#5b5bd6`), light/dark decided by MEASURED bg luminance.
- Default theme: Prism's dark look as a preset (`prism`, near-black + indigo), so first launch
  looks like Prism's terminal does today.
- Custom theme, 15 fonts, size steps, agent working/finished colours, indicator volume: unchanged.

**Acrylic works with any theme** (owner). Appearance gets "Acrylic background" and an opacity
slider (30-100%, stored as a NUMBER and read defensively: never-set is 100, not 0). On: main sets
`backgroundMaterial: 'acrylic'`, the theme's bg is painted at that alpha in the terminal canvas
and the chrome alike. Windows 10, where the material does not exist, shows the toggle disabled
with the reason. The window is created the way Prism creates it (not `frame: false`, because DWM
refuses to composite the material behind a frameless window).

**Settings** rides the strip as a tab. General: new tab mode + folder, shell, Explorer verb,
close confirmation, agent indicator volume, version + update. Appearance: theme grid, custom
theme, font, size, acrylic, agent colours.

**Close confirmation** (owner): closing a tab, or the window, while an agent is WORKING asks
first and names the agent and how long it has run (`agentClock`). Off means off.

**Keys**: Ctrl+T new tab, Ctrl+Shift+W close tab, Ctrl+Tab / Ctrl+Shift+Tab and Ctrl+1-9
switch, Ctrl+Shift+F find, Ctrl+, settings, F11 fullscreen. Plain Ctrl+W stays delete-word and
Escape stays the shell's. Ctrl+` is no longer claimed (there is no panel to hide).

**What the app writes into a shell**: the agent resume startup command, and nothing else. The
`Set-Location` write of Prism #99 goes with the sidebar it served.

### Stripped

Every viewer and converter, the sidebar, search, archives, comics, the phone server, ffmpeg /
7-Zip / FluidSynth and their fetch tools, file associations and per-extension icons, the split
dock and pinned panes, several shells per tab, "Open terminal here", cwd/sidebar sync, positions,
undo, `fsmedia://` / `fsaudio://`, the root wall (there are no renderer-named file reads left;
`dialog:pick-folder` and the verb are main's own).

## Architecture

```
src/main/       index.ts (window, resident lifecycle, IPC, agent poll), terminal.ts, shells.ts,
                termPrompt.ts, agentDetect.ts, agentResume.ts, tabsStore.ts, shellVerb.ts,
                update.ts, argv.ts, windowState.ts
src/preload/    index.ts   (window.prism: term*, tabs, pickFolder, verb, update, window, acrylic)
src/shared/     termCwd.ts, types.ts
src/renderer/   App.tsx (new, target under 400 lines), components/ (TitleBar, TabStrip,
                TerminalPanel, TermFind, Settings, ContextMenu, ConfirmDialog, EmptyState,
                UpdateChip), lib/ (tabs.ts new and pure, chromeTheme.ts new, and the copied libs)
```

`index.ts` in Prism is 3000+ lines; here the resume lookup, tab store, update check and window
state each get their own file so `index.ts` is wiring only. `lib/tabs.ts` is rewritten, pure and
tested: add, close, reorder, relabel on cwd, restore from saved state. `App.tsx` owns the tab
list, the agent sets (`workingIds`, `doneIds`, `agentIds`) and the keys, and reports tabs to main.

IPC surface: `term:shells|spawn|input|resize|kill|prewarm`, `term:data|agent|exit` events,
`tabs:changed`, `tabs:restore`, `open:folder` event (verb / second instance), `dialog:pick-folder`,
`shell:verb-status|verb-set`, `update:*`, `window:*` (min/max/close/fullscreen/quit),
`window:acrylic`, `clipboard:kind` for the paste rule, `shell:open-external` (http/https only).

Security: `contextIsolation` on, sandboxed renderer, no `nodeIntegration`; `will-navigate` and
the window-open handler refuse everything but http(s) handed to `openExternal`; `term:spawn`
validates the shell id against detected shells, the cwd as an existing directory, and the resume
argument against the id pattern.

## Icon

Owner: needs a mockup round before anything ships, likely through Codex's image / vector
generation. So the icon is its own task with its own approval: candidates at 16 / 32 / 48 / 256
on light and dark grounds, the owner picks, then the pick is drawn per size (whole-pixel layout
at 16px) into `build/icon.ico`. Until then development builds carry a plain placeholder tile, and
no release is published with the placeholder.

## Verification

- Unit (vitest): every copied test, plus new tests for `lib/tabs.ts`, `chromeTheme.ts`
  (every preset yields text >= 4.5:1 and accent >= 3:1 on its own bg), `tabsStore`, `argv`,
  new-tab prefs, verb/uninstaller parity.
- e2e (Playwright over CDP against the built app, parked offscreen, `--e2e`, own profile dir,
  reaps its processes): `spawn` (a tab opens, echo round-trips), `cwdLabel` (cd renames the tab),
  `indicator` (title glyph lights and clears the tab, via `$Host.UI.RawUI.WindowTitle`),
  `theme` (a light preset turns the chrome light; measured off computed styles), `restore`
  (relaunch brings tabs back in their folders), `handoff` (a second launch with a folder adds a
  tab), `lastTab` (closing it hides the window, process alive), `promptLayout` (copied),
  `verbGuard` (no registry write under `--e2e`).
- CI: `ci.yml` typecheck + lint + unit on PR and push to main. `release.yml` builds and publishes
  `v<version>` on push to main, refuses to overwrite a version. Unsigned; the PR says so.
- Last step every time: `npm run package`, kill running instances and setups, install `/S`,
  poll `PrismTerminal.exe` LastWriteTime until it moves, launch, report the version.

## Out of scope for v1

Split panes, several shells per tab, profiles per shell, a tray icon, settings sync with Prism,
SSH management, multiple windows, a light/dark app style separate from the terminal theme.
