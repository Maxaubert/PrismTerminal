# Claude Code compatibility fixes (#167 to #177)

Status: the owner said "do all these fixes" for the eleven issues (2026-10-10). This spec and the
plan (`docs/superpowers/plans/2026-10-10-claude-code-compat.md`) are written together for one
approval. Where a choice was the owner's and was delegated (#177, the bell) or had to be made to
build at all, it is listed in section 14 as a decision made, with the reason.

Evidence: `C:\Users\Admin\Documents\Claude\research\prism-terminal\2026-10-10-claude-code-compat.md`
(Claude Code 2.1.296 in fullscreen, PT 0.35.1, xterm.js 6.0.0, node-pty 1.2.0-beta.15, bundled
ConPTY). Each issue body links it.

Branch `fix/cc-compat`, worktree `.claude/worktrees/cc-compat`, stacked on `fix/163-link-ink`
(PR #165, alternate-screen link ink in `core/renderer/lib/termLinkPaint.ts`). Versions: core
`0.28.3` to **0.32.0**, app `0.35.3` to **0.38.0** (minor: new behaviour; above every open PR).

**Every change below except the main-process wiring in `src/main/index.ts` is in `core/`, so it is a
change to Prism too** (section 13). The core lint wall holds: relative imports, no `window.prism`,
no `electron`, no host `src/`.

## 1. What the eleven have in common

Claude Code talks to its terminal in-band: it ASKS (OSC 10/11 colours, XTVERSION, DSR 996, DECRQM),
it TELLS (OSC 8 links, OSC 52 copies, BEL, mode 2031) and it reads KEYS (Alt+V, Shift+Enter). PT
answered some of that wrongly (black ground, #168), none of some (#171, #172, #176, #177), and opened
nothing for some (#169, #173). One problem is ours alone (#167, the painter stall). Two are xterm.js
gaps PT works around (#174, #175).

A new must-not-regress rule comes out of it (section 12): **the app answers a program only what it
asked**. Every byte the core writes to a pty without a key is a reply to a query in that pty's own
stream (or the 2031 report the program turned on), never contains CR or LF, and is never counted as
typing.

## 2. #167 (high): one tab's found path rescans every tab

### What exists

- `core/renderer/lib/termPathLinks.ts:29` one module-wide `listeners` set; `onPathsFound` (`:41-46`)
  adds to it; `flush` (`:48-72`) fires EVERY listener when any batch finds a hit (`:67`).
- `core/renderer/components/TerminalPanel.tsx:835` every session subscribes
  `onPathsFound(() => links.repaint())`.
- `core/renderer/lib/termLinkPaint.ts:252` `repaint` is `startOver` (`:233-240`): `forgetFrom(0)`,
  drops the `finished` marker, so the next `scan` (`:206-227`) starts at line 0 and walks the whole
  normal buffer (scrollback 10,000, `TerminalPanel.tsx:605`) cell by cell in ONE task. On the
  alternate screen it also forces `term.refresh(0, rows - 1)`.
- `termPathLinks.ts:21` a "no" expires after 15 s, so the next pass asks again and the loop can
  repeat.
- MEASURED (Stable's diag log, 2026-10-10 16:58Z): `page-stack` 2009 ms and 2046 ms, both in `scan`,
  around `ipc-slow term:path-kinds 2153ms`; page stalls 1.8 to 2.2 s in the same minute.

### The change

1. **Found paths reach only the session that asked.** `linkRanges(text, cwd, owner)` takes the
   session id; `request` records, per queued key (`cwd\npath`), the set of owners that asked.
   `onPathsFound(owner, fn)` registers per owner (a `Map<string, Set<fn>>`); `flush` collects the
   owners of the keys that came back as hits and calls only theirs. An owner that asked for a path
   another owner's batch already has in flight is added to that key's owners, so it hears the
   answer too (`inFlight` becomes a `Map<key, Set<owner>>`).
2. **A hit repaints the lines that asked, not the buffer.** The painter remembers each logical line
   whose `find` call queued a question (a WAITING line): `attachLinkPaint` takes an optional
   `opts.asked?: () => boolean`, which the panel wires to a new `takeAsked(owner)` from
   `termPathLinks` (true when the last `linkRanges` for that owner queued anything; reading it
   clears it). Per waiting line the painter keeps a marker on its first row (cap 500, oldest
   dropped). `LinkPainter` gains `revisit()`: for each waiting marker still alive, forget the
   decorations on THAT logical line only (new `forgetLines(first, last)`) and paint it again;
   lines on the live screen are left to the next ordinary pass (`soon()`), which already repaints
   from `finished` down. On the alternate screen `revisit()` redraws only the rows whose text holds
   one of the found paths (a `term.refresh(row, row)` per row), not the whole screen.
   The panel subscribes `onPathsFound(id, () => links.revisit())`.
3. **No single pass blocks for long.** A FULL pass (`startOver`: resize, theme, buffer change)
   paints the live screen first, synchronously as today (at most `rows` lines), then the
   scrollback from the bottom UP in slices of at most **8 ms** each (`performance.now()` budget,
   checked every logical line), yielding with `setTimeout(0)` between slices. The slice cursor is a
   marker (the buffer trims under it; a disposed marker ends the backlog). A new `startOver`
   cancels the pending backlog. `finished` keeps its meaning (everything above it that is not in
   the backlog has been painted). The incremental pass (`soon` on `onWriteParsed`) is unchanged:
   it covers `finished` to the bottom of the live screen.
4. A crumb: when a slice or the live-screen pass took over 50 ms, `crumb('link-paint', { ms,
   lines })` (the diag log already has `crumb`; it names no text). Lets the next stall report say
   whether the painter is involved.

The pure parts go in a new `core/renderer/lib/linkScanPlan.ts`: `liveRange(baseY, rows, length)`,
`sliceRows(from, to, budgetMs, now)` (the bottom-up walk with a clock passed in) and the owner
bookkeeping in `termPathLinks` itself.

### Tests

- `termPathLinks.test.ts` (failing first on today's code): with a fake `termPathKinds` through
  `configureTermCore`, a hit asked by owner A calls A's listener and NOT B's; a key asked by A and
  then by B while in flight calls both; a "no" calls nobody; `takeAsked` is true once after a
  queuing call and false after a fully cached one.
- `linkScanPlan.test.ts`: the live range; a 10,000-line backlog with a clock that advances 1 ms
  per line comes out in slices of at most 8 lines, bottom up, covering every line once; a cancelled
  plan yields nothing more.
- e2e **`linkPaintStall`** (new, fails on today's code): tab B prints 10,000 lines of dotted text
  (`1..10000 | % { "line $_ see docs/x.md and a.b" }`) and settles; tab A (in front) creates a file
  and prints its name so a path is found. A `PerformanceObserver({ type: 'longtask' })` installed in
  the page before the print records every long task; assert none over **200 ms** within 5 s of the
  path lighting up, and that the path in A is painted (the `pathLinks` way: a span of the link
  colour by position). Also a theme switch with B's 10,000 lines: no long task over 200 ms, and B's
  topmost painted link (scroll to top) is painted within 10 s (the backlog finished).
- Existing **`pathLinks`** and **`links`** stay green (a path still lights up; a scrolled-off path
  still paints once found).

### Docs

`docs/regression-rules.md` `#path-links` and `#links-painted`: add "a found path repaints only the
tab that asked and only the lines that asked (#167); a full pass paints the live screen, then the
scrollback in slices of 8 ms or less, so no paint blocks the page (MEASURED 2 s stalls before)".

## 3. #168 (medium): OSC 10/11 answer transparent black

### What exists

`core/renderer/lib/termXterm.ts:50-52`: where the panel paints the ground (rule 14), xterm's theme
background is `#00000000`; xterm answers `ESC]11;?` itself from that, dropping the alpha:
`rgb:0000/0000/0000` (MEASURED), so Claude's `"theme": "auto"` always picks dark. The panel
registers OSC 9 and 777 only (`TerminalPanel.tsx:746`, `:758`).

### The change

A new pure module `core/renderer/lib/termReplies.ts` (what the terminal answers a program):

- `oscColour(hex)`: `#rrggbb` (alpha dropped, `opaque()` from `colour.ts`) to
  `rgb:rrrr/gggg/bbbb` (each byte doubled, xterm's own form).
- `colourQueryReplies(ident: 10 | 11, data: string, colours: { fg: string; bg: string })`:
  `string[] | null`. OSC 10 and 11 take a list: `10;?;?` asks for 10 then 11. Every item must be `?`
  for this to answer (returns null otherwise, and the handler returns false so xterm handles a SET
  as it always did). Each reply is `ESC ] <n> ; rgb:... ESC \`.
- `groundMode(bg)`: `'light' | 'dark'`, `luminance(opaque(bg)) > 0.4` is light: the SAME
  measurement `src/renderer/src/lib/chromeTheme.ts:108` makes for the chrome (rule 15: measured from
  the ground, never read off a name). The core cannot import the host's file; a comment names it,
  and a unit test pins that both agree on every preset.

In `createSession`: `term.parser.registerOscHandler(10, ...)` and `(11, ...)`: on a full query,
answer with `groundedTheme()`'s `foreground` and `background` (the theme on the ground the panel
really paints, a picked Background included) and return true. Replies go through
`term.input(reply, false)`: the same `onData` path xterm's own replies take, so ordering with a
DA1 sent right after is kept, and `looksTyped` (starts with ESC) never counts it as typing.

In Prism (`paintsGround: false`) the canvas carries the ground unless an acrylic style clears it;
the answer is the same `groundedTheme()` either way, so Prism's answer is right too.

### Tests

- `termReplies.test.ts` (failing first: the module does not exist): `#f5f5f0` gives
  `rgb:f5f5/f5f5/f0f0` (the value MEASURED from xterm on an opaque light ground); `#f5f5f0cc` the
  same; `colourQueryReplies(10, '?;?', ...)` gives two replies, 10 then 11; `(11, 'rgb:00/00/00')`
  is null; `groundMode` is light for the light presets (Fawn, Paper) and dark for PT Default and
  Prism. The core test cannot import the host's chromeTheme (lint wall), so the agreement is pinned
  from the host side: `src/renderer/src/lib/chromeTheme.test.ts` gains a check that
  `groundMode(bg)` from `@core` gives the same mode as `chromeTokens` for every preset's ground.
- e2e **`termReplies`** (new; the probe is described in the plan, G2): the probe asks `ESC]11;?`
  and `ESC]10;?` on PT Default
  and on Fawn; the replies are the themes' grounds and inks, never `rgb:0000/0000/0000` on Fawn.

## 4. #172 (low): a theme switch never reaches Claude (mode 2031)

### What exists

Claude writes `CSI ? 2031 h` (MEASURED) and re-queries OSC 11 only when the terminal pushes
`CSI ? 997 ; 1 n` (dark) or `; 2 n` (light). xterm 6.0.0 has no 2031, 996 or 997. `applyLook`
(`TerminalPanel.tsx:419-433`) restyles each session and tells the program nothing.

### The change

- Per session, in `createSession`: `let themeReports = false; let lastMode: 'dark'|'light'|null`.
  CSI handlers `{ prefix: '?', final: 'h' }` / `'l'` (like `attachClickCaret`'s DECTCEM ones, which
  return false so xterm still applies its own modes) set `themeReports` when the params hold 2031,
  and return false.
- `CSI ? 996 n` (`registerCsiHandler({ prefix: '?', final: 'n' })`, params `[996]`): answer
  `CSI ? 997 ; 1|2 n` from `groundMode(groundedTheme().background)`, set `lastMode`, return true.
  Anything else returns false (xterm keeps DSR 6 and the rest).
- `DECRQM` for 2031 (`{ prefix: '?', intermediates: '$', final: 'p' }`, params `[2031]`): answer
  `CSI ? 2031 ; 1|2 $ y` (set / reset) and return true; anything else false. Claude may probe
  before it trusts 2031; whether it does is MEASURED in the plan (G2 step 1) and the result goes in
  the commit message.
- `Session` gains `tellTheme(mode)`. `applyLook` computes `groundMode` once and calls it for every
  session; it writes `CSI ? 997 ; n n` only when `themeReports` is on AND the mode differs from
  `lastMode` (a font change or a same-mode theme sends nothing). A host style change and a picked
  ground reach it through `applyLook` already (`watchHostStyle`, `onChromeChange`).
- Pure, in `termReplies.ts`: `dsrThemeReply(mode)`, `decrqmReply(mode, set)`,
  `modeParams(params)` (flattens xterm's `(number | number[])[]`), and `themePush(state, mode)`
  returning `{ send: string | null; state }` so the "only on a change, only while on" rule is
  tested.
- `?2031l` stops the pushes; a buffer switch keeps the mode (Claude turns it on once).

### Tests

- `termReplies.test.ts`: `dsrThemeReply('dark') === '\x1b[?997;1n'`, light `;2n`;
  `decrqmReply(2031, true) === '\x1b[?2031;1$y'`; `themePush` sends nothing while off, sends on the
  first change, nothing for the same mode again, nothing after `?2031l`.
- e2e **`termReplies`**: the probe sends `?2031h`, then `?996n` (reply `?997;1n` on PT Default);
  the scenario picks Fawn in Settings; the probe receives `?997;2n` exactly once; back to PT Default
  gives `?997;1n`; a font size change sends nothing.

## 5. #169 (medium): OSC 8 links open nothing

### What exists

`TerminalPanel.tsx:603-623` passes no `linkHandler`. xterm 6.0.0's default for an OSC 8 link is
`confirm()` then a blank `window.open()`, which main denies (not http(s),
`src/main/index.ts:372-375`), for a click of ANY button. OSC 8 cells are not painted: the painter
only finds URLs and paths in text, and Claude's labels ("#165") are neither.

### The change

1. `linkHandler` on the `Terminal` options:
   `{ activate: (e, uri) => { if (e.button === 0 && isWebLink(uri)) termApi().openExternal(uri) },
   allowNonHttpProtocols: false }`. A left click opens; the right one is the menu's (owner,
   2026-09-28, the same rule as the web-links addon at `:637-641`). No confirm, ever. `isWebLink` is
   `/^https?:\/\//i` (the preload and main check again). `file://` and other schemes stay inert:
   xterm ignores them with `allowNonHttpProtocols: false`, and a path in the text still lights up
   through #99's painter.
2. **OSC 8 cells wear the link colour.** xterm keeps a cell's link id internally (`urlId`) with no
   public API, so the panel FOLLOWS the stream: `registerOscHandler(8, ...)` returning **false**
   (xterm still records the link) notes, on an open with an http(s) uri, the cursor's absolute
   position and the buffer, and on the close the end position and the text between (read from the
   cells through `termCells`, rule 11). A span is `{ buffer, start: {line, x}, end: {line, x}, uri,
   text }`. Pure parser and bookkeeping in a new `core/renderer/lib/termOsc8.ts`: `parseOsc8(data)`
   (`params;uri`, empty uri is a close, malformed is null), `Osc8Spans` (add, at(line, x), on a
   row, cap 300, an alternate-screen span replaces an older one over the same cells, cleared on a
   buffer switch and on a resize, since a reflow moves cells).
   - Normal screen: the painter takes the spans through a new optional `opts.spans?(first, last)`
     and paints each like a found link (`paintRow`), ONLY while the cells still hold the recorded
     text (checked on every pass). Spans ride a marker on their start line, so scrollback keeps
     them as it keeps everything else.
   - Alternate screen (Claude's fullscreen view, where the status line's "PR #165" lives):
     `inkDrawn` / `watchRows` ink the cells of each span on a drawn row, columns converted to the
     row's text offsets cell by cell (`termCells`), again only while the text matches.
   - A redraw of the same label without OSC 8 at the same cells keeps the ink until the row
     changes: accepted, it is the same label.
3. The right-click menu: `termContextAt` (`:385-406`) returns the OSC 8 span's uri as `link` when
   the point is inside one, so Copy link and Open link work on "#165" too.

### Tests

- `termOsc8.test.ts` (failing first): `parseOsc8('id=x;https://a.b/c')` gives the uri;
  `';'` is a close; `'garbage'` is null; spans: `at` hits inside, misses outside, a newer alternate
  span replaces an overlapping one, cap holds, a wide character counts two cells.
- e2e **`osc8Links`** (new): a pwsh tab writes
  `[Console]::Write([char]27 + ']8;;https://example.com/osc8' + [char]7 + 'OSC8LABEL' + [char]27 + ']8;;' + [char]7)`.
  A `page.on('dialog')` recorder is armed: no dialog ever. The label's cells wear the link colour
  (found by POSITION, as `links` does). A RIGHT click opens the menu with Copy link and records
  nothing in `__e2eOpenedLinks`; a LEFT click records `https://example.com/osc8` exactly once. Then
  a node probe on the alternate screen (`?1049h`, the label on row 5, kept alive) shows the same
  colour and the same left-click result. A `file:///C:/x` OSC 8 link opens nothing.

## 6. #173 (low): FORCE_HYPERLINK

> **Withdrawn by the review of 2026-10-11.** `supports-hyperlinks` (in claude.exe 2.1.296 and the
> vercel CLI) reads `FORCE_HYPERLINK` BEFORE its `isTTY` test, so set for the whole shell it put raw
> OSC 8 into every pipe and redirect, the commands Claude's own Bash tool runs among them. `ptyEnv`
> no longer sets it; a user's own value passes through. The OSC 8 handler (section 5) stays, and a
> label showing another host's address opens what it shows (`osc8Target`). The plan below is the
> history.

### What exists

`core/main/terminal.ts:161-180` `ptyEnv` sets `TERM` and `COLORTERM` only. Claude emits OSC 8 only
for `FORCE_HYPERLINK`, `WT_SESSION` or a known terminal name; otherwise "label (long url)".

### The change

`env.FORCE_HYPERLINK = '1'` in `ptyEnv`, unless the user's own environment already sets it (any
value, `0` included, is kept: it is their choice). Lands in the SAME build group as #169 and after
its handler, so no link ever becomes a dead confirm box. Who else reads it, to be MEASURED in G3
(grep the Claude binary and a sample of common CLIs' `node_modules` for `FORCE_HYPERLINK`): the
`supports-hyperlinks` npm package (via `terminal-link`, so many node CLIs) switches to OSC 8 too,
which is the point; the list found goes in the commit message and `docs/regression-rules.md`.

### Tests

- `terminal.test.ts` `ptyEnv` (failing first): sets `FORCE_HYPERLINK=1`; keeps a user's `0`; keeps
  the case-blind spelling rule (a `force_hyperlink` already there is not duplicated).
- e2e **`osc8Links`**: `Write-Host "FH-$env:FORCE_HYPERLINK"` prints `FH-1`.

## 7. #171 (low): no XTVERSION reply

### What exists

Claude asks `CSI > 0 q` and turns on synchronized output (`?2026`) only after a reply. xterm 6.0.0
has no handler (MEASURED: `XTVERSION: no reply`, 0 `?2026h`; with a reply added,
`synchronizedOutput=yes`, 4 `?2026h`).

### The change

`registerCsiHandler({ prefix: '>', final: 'q' }, ...)`: params empty or `[0]` answers
`ESC P >| PrismTerminal <core version> (xterm.js <xterm version>) ESC \` through `term.input(...,
false)` and returns true. The name must NOT start with `xterm.js` (Claude then applies its VS Code
scroll tuning). Pure: `xtversionReply(core, xterm)` in `termReplies.ts`.

- The versions are constants in a new `core/shared/termVersion.ts` (`TERM_CORE_VERSION`,
  `XTERM_VERSION`): a JSON import of `package.json` is not possible in Prism, whose renderer
  tsconfig is `composite` and does not include the core's `package.json`. Two unit tests keep them
  honest: `TERM_CORE_VERSION` equals `core/package.json`'s version, and `XTERM_VERSION` equals
  `node_modules/@xterm/xterm/package.json`'s. A core PR that bumps one without the other fails
  `npm test`; `core/README.md`'s release section says so.
- Prism answers with the same name: the terminal emulator IS this core in both apps (decision 5).

### Measure

G4 step 1 runs Claude 2.1.296 in PT with `--debug-file` and records whether
`synchronizedOutput=yes` and how many `?2026h` it writes in a minute of streaming; the numbers go
in the commit message and the regression entry.

### Tests

- `termReplies.test.ts`: `xtversionReply('0.32.0', '6.0.0') === '\x1bP>|PrismTerminal 0.32.0 (xterm.js 6.0.0)\x1b\\'`
  and the reply's name does not start with `xterm.js`.
- `termVersion.test.ts`: the two equalities above.
- e2e **`termReplies`**: the probe sends `CSI > q` and `CSI > 0 q`; each gets the reply once; a
  `CSI > 1 q` gets none.

## 8. #176 (low): OSC 52 writes are dropped

### What exists

No OSC 52 handler in xterm 6.0.0 or PT. The page's `copyText` (`copyNotice.ts`) tries
`navigator.clipboard` (refused without focus) then main's `writeClipboard`, capped at 4000
characters (`core/main/ipc.ts:160`, built for command help).

### The change

- Pure, `core/renderer/lib/termOsc52.ts`: `parseOsc52(data, max)`: `Pc;Pd`. Only `c` or an empty
  selection (Pc may list several letters; it must be exactly `c` or empty). `Pd === '?'` is a READ:
  returns `{ kind: 'read' }`, which the handler swallows (true) and NEVER answers: a program in a
  tab, or a remote host over ssh, must not read the user's clipboard. Base64 checked by shape before
  decoding (an encoded length over `ceil(max / 3) * 4 + 4` is refused unread), decoded as UTF-8
  (`TextDecoder` with `fatal: true`; invalid is refused). Empty Pd (a "clear") is ignored.
  `OSC52_MAX` is **1,048,576** characters of decoded text.
- A new bridge member: `TermApi.writeClipboardFromTerm?(text)` (`createTermApi`, channel
  `CH.clipboardTerm = 'clipboard:term-write'`). Main checks it is a string of 1 to `OSC52_MAX`
  characters (refused, not trimmed, over it) and writes it with the host's `clipboard.writeText`.
  Not `writeClipboard`: its 4000 cap is right for command help and wrong for a program's copy.
  Through main always, so a background tab or an unfocused window still copies.
- The handler raises the "Copied" badge (`announceCopied`) when main says it landed, so a copy a
  program made is never silent.
- `sanitizePaste` still guards the other direction: what OSC 52 put there is pasted like any text.

### Tests

- `termOsc52.test.ts` (failing first): `c;aGVsbG8=` is `hello`; `;aGVsbG8=` too; `p;...` and
  `cs;...` are refused; `c;?` is a read (never a reply); bad base64 and invalid UTF-8 are refused;
  one character over the cap is refused; a UTF-8 `æøå` round-trips.
- `ipc.clipboard.test.ts`: the new channel writes a string, refuses a non-string, empty and
  `OSC52_MAX + 1`.
- e2e **`termClipboard`** (new; the clipboard saved and restored as `paste` does): a pwsh tab writes
  `ESC]52;c;<base64 of "OSC52 æ">BEL`; the clipboard reads `OSC52 æ` and the Copied badge shows; a
  `ESC]52;c;?BEL` read gets no reply (the probe sees nothing within 1 s) and leaves the clipboard
  alone; a `p` selection changes nothing.

### Docs

`PRIVACY.md`, a short "What programs in a tab can do" paragraph: a program running in a tab
(Claude Code's /copy, or anything over ssh) can put text ON the clipboard with the standard OSC 52
sequence, up to 1 MB, and a "Copied" badge shows when it does; nothing in a tab can READ the
clipboard that way. And the terminal tells programs in a tab its name and version (XTVERSION) and
its colours when they ask, which stays on the PC.

## 9. #177 (low): the bell is silent

### What exists

xterm fires `onBell`; nothing in PT listens (grep: comments only). PSReadLine rings on a bad key
(`useAgentIndicator.ts:19`).

### The change (decided under the owner's delegation, decision 1)

On a bell, **flash the taskbar button while the window is NOT focused; nothing while it is; no
sound.** A bell while unfocused cannot be the user's own bad keystroke, and a flash is what Windows
Terminal does; a sound in a tool the owner hears through screen narration would be noise.

- Renderer (core): `term.onBell(() => ...)` calls `termApi().termBell?.(id)`, at most once per
  **1 s** per session (pure `bellGate(last, now)` in `termReplies.ts`; a `cat` of a binary file
  rings hundreds of times).
- Bridge (core): `TermApi.termBell?(id)`, `createTermApi` sends `CH.bell = 'term:bell'`;
  `registerTermIpc` hands it to a new optional `TermIpcDeps.attention?(): void`. **This is a bridge
  member, not a `TermHostConfig` field** (decision 2): the behaviour is the same in both apps; what
  the host supplies is only access to its window, the way it supplies `openExternal` and `paths`.
  A host that passes no `attention` (Prism, until its one-line wiring) stays silent, exactly as
  today.
- Main (PT, `src/main/index.ts`): `attention: () => bellFlash(win)`; new `src/main/bellFlash.ts`
  with the pure `wantsFlash(focused)` and `bellFlash(win)`: `if (!win.isFocused())
  win.flashFrame(true)`, and `win.on('focus', () => win.flashFrame(false))` registered once. Under
  `--e2e` it RECORDS on `globalThis.__e2eFlashes` and flashes nothing (e2e has no side effects).

### Tests

- `termReplies.test.ts`: `bellGate` lets the first bell through, drops one 300 ms later, lets one
  1.1 s later through.
- `src/main/bellFlash.test.ts`: `wantsFlash(false)` true, `(true)` false; `bellFlash` with a fake
  window calls `flashFrame(true)` only unfocused, and `flashFrame(false)` on focus.
- e2e **`bell`** (new): the parked window is never focused, so a `[Console]::Write([char]7)` in a
  tab records one flash; ten bells in 200 ms record one.

### Docs

`docs/regression-rules.md`, new `<a id="bell-flashes">`: the bell flashes the taskbar only while the
window is unfocused, at most once a second per tab, never a sound (owner's delegation, #177).
`core/README.md`: "A host wires the bell by passing `attention` to `registerTermIpc`".

## 10. #174 (low): stale scroll range after a hidden resize (xterm.js #6117)

### What exists

`TerminalPanel.tsx:982-1022`: the attach appends the element and calls `refit()` in the same task.
xterm's viewport syncs its scroll dimensions in a render callback (`Viewport.queueSync`), and the
renderer is paused while the element is detached (`RenderService` IntersectionObserver). A tab
resized while hidden comes back with a wrong slider until a scroll (upstream #6117, open in 6.0.0;
not reproduced in PT yet).

### The change

1. REPRODUCE FIRST in the e2e below; record the slider numbers on today's code.
2. After the attach's `refit()`, a deferred second pass once the renderer has resumed:
   `requestAnimationFrame(() => setTimeout(() => refit(), 0))`, cancelled in the effect's cleanup.
   `fit()` does nothing when the size already matches, so if the e2e still shows the stale slider,
   the second pass also calls `s.term.refresh(0, s.term.rows - 1)` (a full redraw runs the render
   callbacks the viewport sync waits on). Only public xterm API; if neither corrects it, stop,
   record the measurement on #174 and leave the code as step 2 (a no-op cost of one frame).
3. `suppressActivity` covers the second pass like the first (it is us, not the shell working).

### Tests

- No pure logic. e2e **`hiddenResize`** (new): two tabs; tab 2 runs a node probe on the alternate
  screen with mouse tracking on (Claude fullscreen's modes) drawing a full screen; switch to tab 1;
  resize the window (`BrowserWindow.setSize` from `app.evaluate`, 300 px narrower and shorter);
  switch back; hover the panel; the vertical slider (`.xterm-scrollable-element > .scrollbar.vertical
  > .slider`) is either invisible or as tall as its track (the alternate screen has no scrollback),
  and the scroll range (`scrollHeight` of `.xterm-scrollable-element`'s content vs its height)
  matches `rows` lines. Must fail on today's code before step 2 counts as the fix; if it never
  fails, the scenario stays as the guard and the issue notes "not reproduced".

## 11. #170 (medium): image paste sends ^V; Claude on Windows wants Alt+V

### What exists

`termPaste.ts:67-79` `decidePaste` returns `{ kind: 'key' }` for an image; the panel sends `\x16`
(`TerminalPanel.tsx:817-826`). Claude 2.1.296 binds `ctrl+v` to image paste only off Windows; on
Windows AND on WSL it is `alt+v` (read in the binary: `Ie=M==="windows"||M==="wsl"`,
`Me=Ie?"alt+v":"ctrl+v"`; corrected by the review of 2026-10-11, the research report had WSL wrong). The owner's `keybindings.json` binds both, which
hid it. Codex reads the clipboard image on Ctrl+V.

### The change

- Pure, `termPaste.ts`: `imagePasteKey(agent: DetectedAgent | null): string`: `'\x1bv'` (Alt+V)
  for `claude`; `'\x16'` (^V) for everything else (codex, other agents, a plain shell). Claude in
  WSL wants Alt+V too: the poll sees only `wsl.exe`, so a WSL tab sends it once Claude's title has
  armed `claude`, and the shell's prompt report takes that back (`lib/agentArm.ts`). EXACTLY ONE key is sent, never
  both: with the owner's bindings both keys paste, and two would paste the image twice.
- The panel tracks `agentKind: DetectedAgent | null` beside `agentHere`: from `onTermAgent`'s
  `kind` (`:836-838`), from the resume (`agentOfResume`), and from the title (section 12's
  `titleAgent`). `pasteHere` sends `imagePasteKey(agentKind)`.
- Help: `core/shared/help/agents.ts:563-588` `claude-paste-image`: the summary says this terminal
  hands Claude its own image-paste key (Alt+V on Windows) when Ctrl+V is pressed with a picture on
  the clipboard; the Alt+V variant stays as the key itself. `catalogue.test.ts` stays the gate.

### Tests

- `termPaste.test.ts` (failing first): `imagePasteKey('claude') === '\x1bv'`; `'codex'`, `'other'`,
  `null` give `'\x16'`.
- e2e **`imagePaste`** (new; clipboard saved and restored): a node probe saved as a file named
  `claude` (no extension, so the poll's first-token rule sees `...\claude` on its command line and
  reports `claude`) in raw mode prints every byte it reads as hex; the scenario waits for the strip
  to show the agent, puts a 2x2 image on the clipboard (`nativeImage`), presses Ctrl+V, and the
  probe prints `1b 76` and NOT `16`. In a plain pwsh tab the same Ctrl+V sends `16` (PSReadLine
  shows `^V` or nothing; the scenario reads the bytes with the same probe started as `probe.cjs`,
  which the poll does not call an agent).

## 12. #175 (low): Shift+Enter waits for the poll; no extended keys

### What exists

`TerminalPanel.tsx:897-906`: Shift+Enter sends `\` + CR (`'\\\r'`) ONLY while `agentHere`, which is
true from a resume or once the process poll (2.5 to 20 s backoff) reports an agent. Before that
Shift+Enter is Enter and submits. xterm 6.0.0 has no kitty keyboard or modifyOtherKeys and gives no
`CSI ? u` reply (MEASURED), so Ctrl+Enter is Enter. (The task text says the shim sends ESC CR; it
sends `\` CR.)

### The change

1. **MEASURE first** (G5 step 1, with the research harness `compat/runclaude.js` through the bundled
   ConPTY): for Claude 2.1.296 and for codex, send each of `'\\\r'`, `'\n'` (Ctrl+J) and `'\x1b\r'`
   (Alt+Enter) into an empty prompt with text `ab`, and record: newline inserted without submit?
   stray backslash left? Decision rule: use `'\n'` if it inserts a newline in BOTH; else the
   per-agent byte that does (`newlineKey(agent)` in `termPaste.ts`, `'\\\r'` the fallback, today's
   behaviour). Expected from Claude's docs: `\n` is a newline in Claude everywhere; codex is the
   unknown. The table goes in the commit message and the regression entry.
2. **The title turns it on, not only the poll.** A pure, stateless `titleAgent(title):
   'claude' | 'codex' | null` extracted from `readAgentTitle` (`agentTitle.ts:57-86`: a Claude
   half-circle spinner or the idle `✳`, a codex braille spinner or its "Action Required" title),
   which itself then uses it (no change to the indicator's results: its tests stay green). The
   panel's `onTitleChange` sets `agentHere = true` and `agentKind` when a title NAMES an agent; only
   the poll's "left" turns it off (the #73 rule: only the poll takes a title's claim back). So a
   stale `✳ Claude Code` title after Claude exits does not re-arm it, since the title does not
   change again.
3. Keys stay heard on `onKey` (rule 10): the shim is in `attachCustomKeyEventHandler`, sends through
   `termApi().termInput` with `markTouched`, as today. At a plain prompt Shift+Enter is Enter.
4. Extended keys (kitty flag 1) are OUT: xterm.js has no support; a later xterm upgrade is its own
   issue. Noted on #175.

### Tests

- `agentTitle.test.ts` (failing first: `titleAgent` does not exist): `◐ Claude Code` and `✳ Claude
  Code` are claude; a braille spinner is codex; `PS C:\x` is null; `readAgentTitle`'s existing
  cases unchanged.
- `termPaste.test.ts`: `newlineKey` per the measured table.
- e2e **`reviewKeys`** (existing, holds rule 11's Shift+Enter half): extended: a stand-in that
  titles itself `✳ Claude Code` (no process poll yet: assert within 1 s of the title, well inside
  the poll's first 2.5 s) receives the chosen newline bytes for Shift+Enter (probe prints hex); a
  plain pwsh tab's Shift+Enter still runs the line with no `\` on it.

## 13. Prism

Every core change reaches Prism through the core release. What Prism gets with no change of its
own: the painter fix, OSC 10/11, 2031/996, OSC 8 click and paint, FORCE_HYPERLINK (its `ptyEnv` is
the core's), XTVERSION, OSC 52 (its preload uses `createTermApi`, its main `registerTermIpc`), the
hidden-resize refit, the image key, Shift+Enter by title. What Prism needs one line for: the bell
(`attention` in its `registerTermIpc` call). Until then its bell is silent as today. The PR body says
so, and the core-release PR in Prism is where the line lands (a follow-up issue in Prism if the
owner wants it separate). Nothing here conflicts with Prism: no default changes, no new
`TermHostConfig` field.

## 14. Decisions made (owner's to overturn)

1. **The bell** (#177, delegated): flash the taskbar while unfocused, nothing while focused, no sound,
   any tab, at most once a second per tab.
2. **The bell is a bridge member** (`TermApi.termBell?`, `TermIpcDeps.attention?`), not a
   `TermHostConfig` field: the behaviour is identical in both apps; the host only lends its window.
   No new `TermHostConfig` field anywhere in this work.
3. **Image paste sends ONE key, chosen by the agent**: Alt+V to Claude, ^V otherwise (never both,
   which would paste twice under the owner's own bindings).
4. **OSC 52 is write-only, 1 MB, `c` only, through main, with the Copied badge.**
5. **XTVERSION says `PrismTerminal <core version>` in both apps**: the emulator is the core.
6. **FORCE_HYPERLINK=1 unless the user set it**, and only together with the OSC 8 handler.
7. **Shift+Enter's bytes follow the measurement** (section 12's rule), and a title arms it before the
   poll.

## 15. The new must-not-regress rule

`docs/regression-rules.md`, new `<a id="replies-only-when-asked">`: **THE APP ANSWERS A PROGRAM ONLY
WHAT IT ASKED** (#168, #171, #172, #176). Every byte the core writes into a pty that no key produced
is a reply to a query in that pty's own stream (OSC 10/11 `?`, `CSI ? 996 n`, `CSI > q`, DECRQM
2031) or the `?997` report the program turned on with `?2031h`, and only on a change. Replies hold no
CR, LF or printable command, go through `term.input(reply, false)` so `onData` and `looksTyped`
treat them as the replies they are (rule 10), and never read anything private: OSC 52 is write-only
and a read gets no answer. CLAUDE.md's rule 2 one-liner gains "; a program gets only replies to what
it asked" with the link.
