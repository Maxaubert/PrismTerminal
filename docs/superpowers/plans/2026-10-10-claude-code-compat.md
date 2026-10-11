# Plan: Claude Code compatibility fixes (#167 to #177)

Spec: `docs/superpowers/specs/2026-10-10-claude-code-compat-design.md` (section numbers below are
its). Evidence: `C:\Users\Admin\Documents\Claude\research\prism-terminal\2026-10-10-claude-code-compat.md`.
Branch `fix/cc-compat`, worktree `.claude/worktrees/cc-compat`, stacked on `fix/163-link-ink`
(PR #165). Versions: core 0.28.3 to **0.32.0**, app 0.35.3 to **0.38.0**, bumped in G1.

Rules for every task: work only in the worktree, absolute paths for every file write. Test first,
run it RED, then the code (pure logic always gets a unit test). No em-dashes. Comments say WHY,
with the measurement when there was one. `core/` stays lint-walled (relative imports, no
`window.prism`, no `electron`, no host `src/`). `npm test`, `npm run typecheck`, `npm run lint` green
at the end of each group. Commits end with:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FHHaWKR4M5QtW7Wecyuk4t
```

No push, PR or merge. Never close or touch `PrismTerminalStable` or a PrismTerminal you did not
start. **Only the Gate agent runs e2e, one run at a time**; build groups add scenarios and run the
unit suite, typecheck and lint only. The owner is visually impaired and zoomed in: anything visible
(link colour, badge) is checked against the theme's contrast floor, never eyeballed.

## Task 0. Setup (once)

- The worktree has no `node_modules`: `npm ci` in the worktree (never a junction to the main
  checkout's, which another session may be using).
- `npm test`, `npm run typecheck`, `npm run lint` green on the untouched branch; note any
  pre-existing failure in the G1 commit message rather than fixing it here.

## G1. #167, the link painter stall (spec section 2)

1. **Versions.** `core/package.json` 0.32.0; `npm version 0.38.0 --no-git-tag-version` (package.json
   and package-lock.json). Commit `chore: bump core 0.32.0 and app 0.38.0 (#167-#177)`.
2. **Red tests.** `core/renderer/lib/termPathLinks.test.ts`: configure the core with a fake
   `termPathKinds` (see `core/renderer/host.test.ts` for `configureTermCore`/`resetTermCore`), use
   fake timers for `BATCH_MS`:
   - owner A asks `a.txt` (hit), owner B has a listener: A's listener fires, B's does not;
   - A asks `b.txt`, B asks `b.txt` while A's is in flight: both fire once;
   - a miss fires nobody;
   - `takeAsked('A')` is true once after a queuing `linkRanges`, false after a fully cached one.
   New `core/renderer/lib/linkScanPlan.test.ts`: `liveRange`; `sliceRows` with an injected clock
   (+1 ms per line, budget 8) walks a 10,000-line backlog bottom up in slices of at most 8 lines,
   every line once; a cancelled plan yields nothing.
3. **Code.**
   - `termPathLinks.ts`: `listeners` becomes `Map<owner, Set<fn>>`; `queued` holds
     `Map<cwd, Map<path, Set<owner>>>`; `inFlight` `Map<key, Set<owner>>` (a later asker joins the
     key's owners); `flush` collects the owners of the hit keys and calls only theirs;
     `linkRanges(text, cwd, owner?)`; `onPathsFound(owner, fn)`; `takeAsked(owner)`;
     `resetPathCache` clears the new maps. Comment: the measured 2 s stalls (diag log 2026-10-10
     16:58Z) and why an un-asked tab must not hear it.
   - New `core/renderer/lib/linkScanPlan.ts` (pure).
   - `termLinkPaint.ts`: `attachLinkPaint(term, color, find, opts?: { asked?(): boolean })`;
     `waiting` markers (cap 500) recorded in `paintLogical` when `opts.asked?.()` is true;
     `forgetLines(first, last)`; `revisit()` on `LinkPainter`; `startOver` paints the live range now
     and schedules the scrollback backlog via `sliceRows` with `setTimeout(0)` between slices and a
     marker as the slice cursor; a new `startOver` cancels the backlog; `dispose` cancels it.
     Alternate screen: `revisit()` refreshes only rows whose text holds a found path. Keep #163's
     `watchRows` exactly as merged in PR #165.
   - `crumb('link-paint', { ms, lines })` when a slice or the live pass took over 50 ms (no text).
   - `TerminalPanel.tsx`: the painter's `find` becomes `(text) => linkRanges(text, cwdNow, id)`,
     `opts.asked: () => takeAsked(id)`; `:835` becomes `onPathsFound(id, () => links.revisit())`.
4. **e2e** `tools/e2e/run.mjs`, new scenario **`linkPaintStall`** after `pathLinks` (spec section 2
   Tests): two tabs; tab B prints 10,000 dotted lines and settles; a `PerformanceObserver` for
   `longtask` installed with `page.evaluate` records durations on `window.__longTasks`; tab A
   creates `found-167.txt` and prints its name; wait for its span in the link colour; assert no long
   task over 200 ms in the 5 s after; then pick Fawn and back (full passes over B's 10,000 lines):
   no long task over 200 ms, and B's top line's link is painted within 10 s after scrolling to the
   top. Add `linkPaintStall: 300000` to `SLOW` if the 10,000-line print needs it. Note in the
   scenario comment that it FAILED on the pre-fix code (the Gate confirms by running it on the
   parent commit if asked).
5. **Docs.** `docs/regression-rules.md` `#path-links` and `#links-painted`: the two sentences of spec
   section 2 Docs.
6. **Verify and commit** `fix(core): a found path repaints only the tab and lines that asked (#167)`.

## G2. #168 OSC 10/11 and #172 mode 2031 (spec sections 3 and 4)

1. **Measure** (scratchpad, research harness `compat/runclaude.js`, bundled ConPTY): does Claude
   2.1.296 send DECRQM `?2031$p` before trusting 2031? Record yes/no for the commit message.
2. **Red tests.** New `core/renderer/lib/termReplies.test.ts`: `oscColour`, `colourQueryReplies`
   (one query, `?;?`, a SET is null), `groundMode` per preset ground, `dsrThemeReply`,
   `decrqmReply`, `modeParams`, `themePush` (off sends nothing; first change sends; same mode
   again sends nothing; after `?2031l` nothing). `src/renderer/src/lib/chromeTheme.test.ts`: for
   every preset, `groundMode(bg)` (from `@core/renderer/lib/termReplies`) equals `chromeTokens`'s
   `mode`.
3. **Code.**
   - New `core/renderer/lib/termReplies.ts` with the functions above (threshold 0.4, comment naming
     `chromeTheme.ts:108` and rule 15).
   - `TerminalPanel.tsx` `createSession`: OSC 10 and 11 handlers (answer a full query from
     `groundedTheme()`, true; else false); `?h`/`?l` handlers tracking 2031 (return false);
     `?n` handler answering 996 (true; else false); `?$p` handler answering 2031 (true; else
     false). Every reply via `term.input(reply, false)`. `Session.tellTheme(mode)`; `applyLook`
     computes `groundMode` once and calls it for each session, sending through `themePush`.
   - Comment at each: the measurement (xterm answered `rgb:0000/0000/0000`; Claude writes `?2031h`
     and re-queries only on the push) and rule `replies-only-when-asked`.
4. **e2e** new scenario **`termReplies`** (G4 extends it): a node probe `replies-probe.cjs` in the
   world folder, raw stdin, prints every chunk it reads as one line `IN <escaped>` (ESC as `\e`, BEL
   as `\a`), and on start writes `CSI ? 2031 h`, `ESC]11;?BEL`, `ESC]10;?BEL`, `CSI ? 996 n`,
   `CSI ? 2031 $ p`, then `CSI c` (DA1, a sentinel every terminal answers). Keys: `t` writes
   `CSI ? 996 n` again; `q` exits. Assertions on PT Default: the OSC 11 reply is PT Default's ground
   (`rgb:1212/1212/1212`), OSC 10 its text; `?997;1n`; `?2031;1$y` (once `?2031h` was seen); the DA1
   reply comes LAST. Pick Fawn in Settings (as `scrollbar` does): exactly one `IN \e[?997;2n`
   arrives; a new OSC 11 query (key `t` then the probe re-asks) answers Fawn's ground. Back to PT
   Default: one `?997;1n`. A font size change: nothing new arrives within 1 s.
5. **Docs.** `docs/regression-rules.md`: the new `<a id="replies-only-when-asked">` entry (spec
   section 15). `CLAUDE.md` rule 2 one-liner: append "; a program gets only replies to what it
   asked" linking it.
6. **Verify and commit** `fix(core): tell programs the real ground, and push theme changes (#168, #172)`.

## G3. #169 OSC 8 links and #173 FORCE_HYPERLINK (spec sections 5 and 6)

1. **Red tests.** New `core/renderer/lib/termOsc8.test.ts` (spec section 5 Tests).
   `core/main/terminal.test.ts` `ptyEnv`: `FORCE_HYPERLINK` is `'1'`; a user's `'0'` kept; a
   `force_hyperlink` spelling is kept, not duplicated.
2. **Code, #169 first.**
   - New `core/renderer/lib/termOsc8.ts`: `parseOsc8`, `Osc8Spans`, `isWebLink`.
   - `TerminalPanel.tsx`: `linkHandler` option (left click, http(s) only,
     `allowNonHttpProtocols: false`, never `confirm`); OSC 8 handler returning false that records
     spans (positions from `term.buffer.active`, text through `termCells`); spans cleared on
     `onBufferChange` (alternate ones) and `onResize`; `termContextAt` returns a span's uri as
     `link`.
   - `termLinkPaint.ts`: `opts.spans?(first, last)` painted on the normal screen while the text
     matches; the alternate-screen inker inks span cells on drawn rows (cells to text offsets per
     `termCells`, rule 11), only while the text matches.
3. **Then #173.** `core/main/terminal.ts` `ptyEnv`: `FORCE_HYPERLINK=1` unless set (case-blind, the
   spelling already there). **Measure** who reads it: `rg -a FORCE_HYPERLINK` over the Claude
   2.1.296 binary and over the `node_modules` of this repo (as a sample of common node CLIs); list
   the readers in the commit message and in the regression entry.
4. **e2e** new scenario **`osc8Links`** (spec sections 5 and 6 Tests): a `page.on('dialog')` recorder
   (any dialog fails); the pwsh OSC 8 line; colour by position equals the link colour; right click
   shows Copy link, records no opened link; left click records `https://example.com/osc8` once; a
   `file:///C:/x` OSC 8 link records nothing; the alternate-screen probe repeats colour and click;
   `FH-1` printed. Existing **`links`** and **`dropAndMenu`** stay green (the menu over a plain URL is
   unchanged).
5. **Docs.** `docs/regression-rules.md` `#links-painted`: "OSC 8 links (#169) open on a LEFT click,
   http(s) only, never through a confirm; their cells are painted from the stream while their text
   stands; FORCE_HYPERLINK=1 is set for every shell unless the user set it (#173; readers: ...)".
6. **Verify and commit** twice: `fix(core): OSC 8 links open on a left click and wear the link colour (#169)`,
   then `feat(core): advertise hyperlinks to programs in a tab (#173)`.

## G4. #171 XTVERSION, #176 OSC 52, #177 the bell, #174 hidden resize (spec sections 7 to 10)

1. **Measure** (#171): Claude 2.1.296 in a dev build of this branch with `--debug-file`, a minute of
   streaming: `synchronizedOutput=yes`? how many `?2026h`? (After the code in step 3, before the
   commit; numbers go in the commit message and the `replies-only-when-asked` entry.)
2. **Red tests.**
   - `termReplies.test.ts`: `xtversionReply`, its name not starting with `xterm.js`; `bellGate`.
   - New `core/shared/termVersion.test.ts`: `TERM_CORE_VERSION` equals `core/package.json`'s
     version (0.32.0); `XTERM_VERSION` equals `node_modules/@xterm/xterm/package.json`'s (6.0.0).
   - New `core/renderer/lib/termOsc52.test.ts` (spec section 8 Tests).
   - `core/main/ipc.clipboard.test.ts`: the `clipboard:term-write` channel (string, empty,
     non-string, `OSC52_MAX + 1`); `term:bell` calls `attention` when given and is a no-op without.
   - New `src/main/bellFlash.test.ts`.
3. **Code.**
   - New `core/shared/termVersion.ts`. XTVERSION handler `{ prefix: '>', final: 'q' }` in
     `createSession`, via `term.input`.
   - New `core/renderer/lib/termOsc52.ts`; OSC 52 handler (true for every 52, handled or refused,
     so nothing is drawn); `core/shared/channels.ts` `clipboardTerm`, `bell`;
     `core/preload/api.ts` `writeClipboardFromTerm`, `termBell`; `core/renderer/host.ts` `TermApi`
     optional members with comments; `core/main/ipc.ts` the two handlers, `OSC52_MAX`,
     `TermIpcDeps.attention?`. Success raises `announceCopied()`.
   - `term.onBell` through `bellGate` to `termApi().termBell?.(id)`.
   - New `src/main/bellFlash.ts`; `src/main/index.ts` passes `attention`; under `--e2e` it records
     `globalThis.__e2eFlashes` (count) and never calls `flashFrame`.
   - #174, after the e2e below has run red at the Gate (or been recorded as not reproducing): the
     deferred refit in the attach effect (`requestAnimationFrame` then `setTimeout(0)`, cancelled
     in cleanup, `suppressActivity` first), plus `term.refresh(0, rows - 1)` only if the e2e needs
     it. No xterm internals.
4. **e2e.**
   - **`termReplies`** extended: the probe also writes `CSI > q`, `CSI > 0 q`, `CSI > 1 q` before the
     DA1 sentinel; exactly two `\eP>|PrismTerminal 0.32.0 (xterm.js 6.0.0)\e\\` replies arrive, none
     for `> 1 q`.
   - New **`termClipboard`** (spec section 8 Tests; save and restore the clipboard as `paste` does).
   - New **`bell`** (spec section 9 Tests; reads `__e2eFlashes` with `app.evaluate`).
   - New **`hiddenResize`** (spec section 10 Tests; the alternate-screen probe enables `?1049h` and
     `?1000h`/`?1006h`, draws every row, stays alive until `q`).
5. **Docs.** `PRIVACY.md` paragraph (spec section 8 Docs). `core/README.md`: in "The contract", a
   short paragraph: the bell (`attention` in `registerTermIpc`; without it a host is silent), the
   OSC 52 channel (automatic through `createTermApi` / `registerTermIpc`), and under "Releasing the
   core": "bump `core/shared/termVersion.ts` with `core/package.json`; `termVersion.test.ts` fails
   otherwise". `docs/regression-rules.md`: `<a id="bell-flashes">` (spec section 9 Docs); the
   XTVERSION measurement and OSC 52's write-only rule added to `replies-only-when-asked`.
   `docs/two-apps.md` `#terminal-change-in-core` or a new short entry: the bell needs Prism's one
   line (spec section 13).
6. **Verify and commit** four commits, in order: `feat(core): answer XTVERSION so Claude can use synchronized output (#171)`,
   `feat(core): write-only OSC 52 copies through main (#176)`,
   `feat: flash the taskbar on a bell while the window is unfocused (#177)`,
   `fix(core): refit once the renderer resumes after a hidden resize (#174)`.

## G5. #170 the image key and #175 Shift+Enter (spec sections 11 and 12)

1. **Measure** (#175, research harness, bundled ConPTY): for Claude 2.1.296 and codex, `'\\\r'`,
   `'\n'`, `'\x1b\r'` after typing `ab`: newline without submit? stray backslash? Write the table
   into the commit message; pick per the spec's decision rule.
2. **Red tests.** `termPaste.test.ts`: `imagePasteKey` (claude `'\x1bv'`; codex, other, null
   `'\x16'`); `newlineKey` per the table. `agentTitle.test.ts`: `titleAgent` cases (spec section 12
   Tests); every existing `readAgentTitle` and `useAgentIndicator`-backed test unchanged.
3. **Code.**
   - `termPaste.ts`: `imagePasteKey`, `newlineKey` (comments: the binary's `alt+v` on Windows, the
     owner's bindings binding both, why ONE key).
   - `agentTitle.ts`: extract `titleAgent`, `readAgentTitle` uses it.
   - `TerminalPanel.tsx`: `agentKind` beside `agentHere` (from `onTermAgent`'s kind, the resume,
     the title via `titleAgent` on `onTitleChange`; only the poll's "left" clears both);
     `pasteHere` sends `imagePasteKey(agentKind)`; Shift+Enter sends `newlineKey(agentKind)`, still
     inside `attachCustomKeyEventHandler`, with `markTouched` (rule 10 unchanged).
   - `core/shared/help/agents.ts` `claude-paste-image` summary (spec section 11);
     `claude-new-line` summary only if the measured bytes change what it says.
4. **e2e.** New **`imagePaste`** (spec section 11 Tests; clipboard saved and restored). Existing
   **`reviewKeys`** extended (spec section 12 Tests). **`helpPanel`** stays green (the catalogue
   entry's text changed).
5. **Docs.** `docs/regression-rules.md` `#cells-not-characters`: "Shift+Enter sends <measured>
   where an agent runs, armed by the agent's title before the poll (#175); an image on Ctrl+V sends
   the AGENT's key, Alt+V to Claude and ^V otherwise, exactly one (#170)".
6. **Verify and commit** `fix(core): send Claude its own image-paste key (#170)` and
   `fix(core): Shift+Enter's newline, armed by the agent's title (#175)`.

## The Gate

After G5, the Gate agent runs, one at a time, `npm run e2e -- <name>` for each scenario below, then
the whole suite once (`npm run e2e`), and LOOKS at `.e2e-shots/` for any settings or panel shot the
run writes. A red scenario goes back to its group with the failure; a stall of 1 s or more in the
report table against a new scenario is a failure for `linkPaintStall` and a note for the rest.

New: `linkPaintStall`, `termReplies`, `osc8Links`, `termClipboard`, `bell`, `hiddenResize`,
`imagePaste`.
Extended or at risk: `reviewKeys`, `pathLinks`, `links`, `dropAndMenu`, `paste`, `scrollbar`,
`theme`, `themeSwitch`, `pickedGround`, `agentHooks`, `attention`, `helpPanel`, `launchSkeleton`,
`restore`, `diagLog`.

Then, per CLAUDE.md, the last verification is an install of this build (`npm run package`, kill
only `PrismTerminal` and `PrismTerminal-Setup*` processes, silent setup, poll the exe's
LastWriteTime) and a live check with a real Claude in a tab: Fawn theme, Claude `"theme": "auto"`
picks light; switching to PT Default turns Claude dark without a restart; a "PR #nnn" link is blue
and opens on a left click; Ctrl+V with a screenshot attaches it with default Claude keybindings.
The PR (opened by the orchestrator, not here) says the core changes reach Prism and that Prism needs
the one `attention` line for the bell.
