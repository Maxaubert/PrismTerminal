# Rules that must not regress (all measured in Prism, not assumed)

Moved verbatim from `CLAUDE.md` on 2026-10-09, with anchors added; `CLAUDE.md` keeps the most
important as one-liners linking here. More rules of the same weight, for the shared core and its
features, are in [two-apps.md](two-apps.md). A new rule gets an `<a id>` anchor here, and a
one-liner in `CLAUDE.md` only if it is among the most important.

- <a id="inert-input"></a>**WHAT REACHES A SHELL IS INERT UNTIL THE USER ACTS** (code review 2026-09-24, #67; the review is
  `docs/reviews/2026-09-24-code-review.md`). A paste is stripped of every ESC and C0 control but
  tab, newline and CR (`sanitizePaste`), so clipboard text cannot end the bracketed paste and run
  what follows. A path is quoted for the SHELL it goes to (`quotePath`): single quotes for
  PowerShell and bash, which expand nothing, curly quotes doubled too; double for cmd and for a
  caller that names no shell. `cdCommand` doubles every quote PowerShell reads as one, and writes
  nothing to cmd for a path with `%` or `"`. Windows' own tools are started by their FULL PATH
  (`core/main/sysTools.ts`, pwsh by `where`'s answer minus the current folder), and main leaves its
  launch folder at startup: a bare name is searched for in the current folder first.
- <a id="main-installs-only-offered"></a>**MAIN INSTALLS ONLY WHAT MAIN OFFERED** (#67). `update:install` installs `pendingUpdate.url`
  and refuses any other url; the close question is pre-answered at the QUIT, not when the download
  starts; the installer handoff waits for PowerShell to start (an 'error' keeps the app running)
  and removes its temp folder after the install. `tabs.json` and `window.json` are written
  atomically (`atomicWrite.ts`). A command-line path is resolved against the folder it was typed
  in (`workingDirectory` for a handoff) and saved absolute; a drive root's `C:"` is `C:\` again.
- <a id="cells-not-characters"></a>**CELLS ARE NOT CHARACTERS, AND A KEY IS ITS PHYSICAL KEY** (#69, code review part 2). Anything
  that turns a screen cell into a place in the line's TEXT goes through `lib/termCells.ts`
  (`cellText`'s index), never by counting cells or `text.length`: the resize carry and link
  hit-testing were each one off after a trailing space, a wide character or an emoji. Ctrl+C and
  Ctrl+V match `e.code` too (a Russian layout's C is 'с'). Shift+Enter sends a newline ONLY where an
  agent runs, at a plain prompt it is Enter: Ctrl+J to Claude and the `\` continuation otherwise
  (`newlineKey`, measured: Codex 0.153.2 drops a bare LF), armed by Claude's title glyphs or Codex's
  Action Required before the poll, never a bare braille spinner, and disarmed by the poll (#175), or
  by the shell's prompt report when only a title armed it (`lib/agentArm.ts`: a WSL tab's poll sees
  wsl.exe and never says left). An image on Ctrl+V sends the AGENT's key, Alt+V to Claude (on WSL
  too) and ^V otherwise, exactly one, since a
  keybindings.json binding both would paste twice (`imagePasteKey`, #170). The panel's attach is keyed on the
  session alone (a `cd` must not re-attach it and take the focus). Under a question or the update
  window the tab chords do nothing (Ctrl+W keeps its rule). A kill while a spawn is pending wins,
  and a warm shell's exit removes only itself. A stop during transcribing is not heard, so a clip is
  pasted once. The `reviewKeys` e2e holds the renderer half.
- <a id="settings-ask-nothing"></a>**SETTINGS ASK NOTHING NOBODY CHANGED** (#71, code review part 3). A hex field commits only a
  typed draft that names another colour (`hexCommit`): tabbing through a row that follows the
  theme must not pin it. The colour editor saves the WHOLE setup into Custom (palette plus font,
  size, agent colours, acrylic) and is a theme pick (`onThemePicked`); it takes the focus, traps
  Tab and hears Escape from the window. A dialog registers its listener once and reads its
  callback through a ref. The dictation key is never a key that types or a chord the terminal
  owns (`usableHotkey`, checked on capture AND on read).

- <a id="bundled-conpty"></a>**Bundled ConPTY.** Shells spawn with `useConptyDll: true`; the inbox conhost fast-fails the whole
  app (0xc0000409) when a pty is killed mid-read. `node-pty` stays `asarUnpack`ed and
  `npmRebuild: false` (it ships N-API prebuilds; a rebuild dies in node-gyp).
- <a id="quit-waits-for-shells"></a>**THE QUIT WAITS FOR EVERY SHELL TO BE GONE** (#127, 2026-10-04; owner's screenshot of node-pty's
  "Assertion failed! remove_pty_baton" dialog). Two crashes at quit, both MEASURED: node-pty 1.1.0's
  exit threads race on an unlocked vector (fixed upstream in #922, so `node-pty` is pinned to
  `1.2.0-beta.15`, the owner's pick); and an exit callback that lands while Node tears down throws and
  Electron aborts, 0xc0000409, about one quit in four with ten shells (WER dump: `FreeEnvironment` ->
  `ThreadSafeFunction::CallJS` -> abort). So every kill goes through `killPty` and `will-quit` holds
  the quit on `shellsGone` (3 s cap). It waits for the agent's `exitCode`, set by the native callback,
  not the exit EVENT, which lags 1-2.7 s for a pwsh killed mid-start (a warm shell). `quitManyShells`.
  The pin was LOST once (#159, 2026-10-10): an icon PR's merge put `^1.1.0` back and the dialog
  returned for the owner. `src/main/nodePtyPin.test.ts` now fails on any build without the pin.
- <a id="title-bar-style-hidden"></a>**`titleBarStyle: 'hidden'`, never `frame: false`**: DWM will not composite acrylic behind a
  frameless window.
- <a id="material-before-colour"></a>**Material before colour** (`material.ts`, measured on Electron 43): `setBackgroundMaterial('none')`
  rewrites the window background to white, so the colour is set AFTER the material.
- <a id="conpty-resize"></a>**ConPTY sends nothing on a resize**, so `fitKeepingCursorLine` carries the prompt line across by
  hand, and `windowsPty` is declared WITH a build number (without one xterm turns reflow off).
- <a id="caret-follows-typing"></a>**THE CARET FOLLOWS TYPING, NOT A STREAMING AGENT** (#101; owner via the Wind session, 2026-09-29;
  spec `docs/superpowers/specs/2026-09-29-caret-follows-typing-design.md`). Magnifiers, screen readers
  and the IME window follow xterm's helper textarea, which xterm puts on the cursor after every write.
  MEASURED: Claude's INLINE view ends every streaming frame with the cursor on the output row, above
  its input line (its fullscreen view does not; neither view hides the cursor or draws a caret). On the
  normal screen `termCaretHold` holds the textarea on the caret the last key produced (the LOWEST
  position its echo reached) while the cursor is parked above it; at or below, on the alternate
  screen, scrolled back or after a resize, xterm's placement stands. Only the textarea moves. The
  `caretHold` e2e holds it.
- <a id="typing-on-onkey"></a>**Typing is heard on `onKey`**, never `onData`: xterm answers the pty on its own (focus reports,
  device attributes) and those replies must not count as the user typing.
- <a id="indicator-agent-word"></a>**The indicator is the agent's own word.** Claude and Codex write their state into the terminal
  title (`lib/agentTitle.ts`); a titled session is never scored from its output. A spinner before the
  first idle title is the agent STARTING, not working. Output scoring (`termActivity`) is only the
  fallback, and an agent's startup paint is not work (`markBorn` / `startupOutput`). The rules live in
  `lib/useAgentIndicator.ts`; change them there, with Prism's reasoning in hand.
- <a id="claude-hooks"></a>**CLAUDE CODE'S HOOKS ARE ITS WORD, ABOVE THE TITLE** (#131; owner, 2026-10-05: "go ahead and build
  that"; spec `docs/superpowers/specs/2026-10-05-agent-hooks-design.md`, evidence in the research
  folder's `prism-terminal/2026-10-05-agent-hooks-inventory.md`). `core/claude-plugin` is a Claude Code
  plugin: each hook in `hooks/hooks.json` runs `hook.cmd`, a static echo (blocking events wait for it;
  MEASURED 20-100 ms, so no node), in EXEC FORM (`cmd.exe` + `args` `/d /c call <root>/hook.cmd`): a
  command string runs through PowerShell where Git Bash is missing and is a ParserError there, and
  without `call` a plugin folder with brackets fails (both MEASURED, review of #131). Its `terminalSequence` Claude writes into its OWN terminal as
  `ESC]777;prism-agent;state=working|question|done|failed[;kind=<StopFailure error>]BEL`. In-band: no
  listener, no tab ids, and `claude -p` / SDK runs never write it (MEASURED). SessionStart/End are left
  out (their bytes reached the pty 1 of 3 and 0 of 3). Main hands a shell the plugin through
  `CLAUDE_CODE_PLUGIN_DIRS` (`ptyEnv`, the user's value kept, an inherited copy of ours dropped:
  `claudePlugin.ts`), only where the host passes `claudePluginDir` (this app: `resources\claude-plugin`,
  extraResources; dev reads the core's copy) AND the page's "Exact status from Claude Code"
  (`agent-hooks`, on) is on; a warm shell is adopted only with the same answer. Prism passes no dir, so
  nothing changes there until it ships the files. The reader: `lib/agentHookSignal` (parse, our prefix
  only, else `false` so other OSC 777 users are untouched), termBus, `lib/agentHookState` (the pure
  rules), `useAgentIndicator`. A HOOKED session is never scored from output; its screen is read
  only to HOLD a Question its hooks raised, while the box is on screen, never to raise one. Its title
  says an Esc (no hook fires on one, MEASURED: idle title 72 ms after): an idle title
  after `working` with no Stop is idle with NO Finished line, and a Stop that lands after it still
  finishes. The poll still decides presence. **A SPINNER AFTER A QUESTION IS THE WORK THE YES
  APPROVED** (#148; spec `docs/superpowers/specs/2026-10-10-permission-indicator-design.md`): no
  hook fires between the answer and PostToolUse (MEASURED, Claude Code 2.1.296: spinner title 34 ms
  after Yes, PostToolUse 26 s later for a 25 s sleep; the tab showed nothing all that time), so a
  `working-title` in phase `question` or `stopped` is Working; never in `done` or `failed`, and never
  from the answer key (Enter on No is Enter on Yes; after No or Esc the title stays `✳`). The first
  spinner lands 6 ms BEFORE the repaint erasing the box, so one held by the box is read again 250 ms
  later. **WHILE THE BOX IS ON SCREEN, THE QUESTION STANDS** (#148): subagents' hooks write the same
  signal, and a sibling's PreToolUse / PostToolUse or the main turn's Stop took a pending Question
  down 1 to 4 s after it went up (MEASURED, case G2: up 3.9 s of the 14 s the box waited); so with
  phase `question` and `looksLikeQuestion` seeing the box, `working` and `working-title` change
  nothing and `done` raises Finished UNDER the Question (`screenDecides`, `hookStep`'s `seen`). The
  measured timelines are replayed in `agentHookState.timelines.test.ts`. Finished too early while
  background agents still run is #149, not this rule. **Failed** is a third line (`agent-failed-on`, on), the
  theme's red apart from the accent by hue (`marksApart`), over Finished and under Question, counted by
  the badge, its kind on the tab's tooltip ("Failed: rate limit"); it raises Finished under it, so
  with the switch off the tab reads as before. Sessions that never send a signal (Codex, an older
  claude, an untrusted folder, plugins blocked by policy) keep the old method whole. Codex's
  `[ ! ] Action Required` title is its Question. The `agentHooks` e2e holds it (it fails on main).
- <a id="finished-and-question"></a>**FINISHED AND QUESTION ARE LINES, EACH OPTIONAL; EVERY WORKING TAB HAS ITS OWN BAR; THE TASKBAR
  COUNTS** (owner, 2026-09-28; spec `docs/superpowers/specs/2026-09-28-attention-and-warm-dictation-design.md`).
  A tab whose agent finished, or waits on you, while you were NOT LOOKING (another tab in front, or
  the window unfocused) gets a static 3 px line along its bottom: Finished colour, or Question
  colour (default blue) which outranks it; each behind its own switch (`agent-done-on`,
  `agent-question-on`, both on). Opening the tab clears Finished (and Failed). **A QUESTION LASTS
  UNTIL IT IS ANSWERED** (#144; owner, 2026-10-09: "if you go on that tab and then just move to
  another tab without answering the question, the blue bar shouldn't disappear ... it should only
  disappear if you actually answered the question"): it goes up on the tab in front too
  (`raisedWhileSeen`), a look never takes it down, and the badge counts it until it goes: work
  again (a hook or title; another agent's signal does not count while the box shows, #148), another hook state, the agent leaving, the tab closing, or a key that
  settles the box (Enter, Esc, Ctrl+C, a digit; `answersQuestion`) with the box gone after it, the
  one way a "No" or an Esc is heard, since no hook fires for those. Since #143 (below) a question BREATHES
  (fades to the ground and back, 2 s) and a finish is the icon's flowing rainbow, in every style.
  CLAUDE GIVES NO SIGNAL FOR A QUESTION (MEASURED in a pty: the title is `✳` exactly as when done, no
  bell, no OSC 9), so `agentQuestion.looksLikeQuestion` reads the last text rows of the screen
  (through termBus, never by importing the panel) for its footer when the title goes idle and as
  output arrives while idle; a rewording in a Claude update is a change there. In Minimal, EVERY working tab draws its OWN bar (owner, 2026-10-03, reverting the
  2026-09-28 shared bar across neighbours: "i want that to be one for each tab, like it was
  before"). The taskbar button's overlay icon shows
  how many tabs carry a mark (`taskbarBadge.ts`, `window:badge`, Settings > Agents switch, on):
  a dark disc with a white number, whatever the marks (owner, 2026-09-29: "too big and it's
  green, it should be grey with white number"; 2026-10-01, beside ChatGPT's: "so much clearer and high
  res, fix that", #108). Drawn at the display's PHYSICAL size (`badgePixels`, 36 at 225%) and handed
  to main as a PLAIN picture (a 2.25x-marked one was shrunk to 16 px), the reference's own
  near-black `#25242c` filling the overlay, a large regular-weight number. IT STAYS AN OVERLAY:
  drawn onto the window icon it was crisp in a bare window, but the INSTALLED app's taskbar button
  wears its Start menu shortcut's icon (same app id) and showed nothing (MEASURED 2026-10-03); a
  window icon only shows with an app id no shortcut has, which breaks pinning. The installed app's WINDOW icon is the exe's own (no `icon:`
  in a packaged build): Windows then picks the .ico frame drawn for the size it needs, where the
  explicit 256px frame was shrunk twice and came out soft (MEASURED, side by side at 48px).
  Tab names are centred in both widths, and a Dynamic tab is never under four characters wide.
  The `attention` e2e holds all of it.
- <a id="indicator-minimal"></a>**The indicator is MINIMAL by default and wears the THEME** (owner, 2026-09-18, #4; it was Full
  and a fixed orange in Prism and the first build). `termLook` stores the two colours as CHOICES,
  `''` meaning "follow the theme"; `lib/agentColors.ts` resolves what is in force: working = the
  chrome's own `--p-accent`, finished = the theme's green moved to the contrast floor (the fallback
  green when a palette's green IS its accent, since two states in one colour is no indicator).
  Picking a theme gives both back to the theme; a pick of your own shows a "Follow theme" button.
  Settings calls them "Agent working indicator" and "Agent finished indicator". The finished mark
  is Full's alone, so the e2e turns the volume up before it looks for one.
- <a id="process-poll"></a>**The process poll** (`agentPoll.ts`) asks only after a pty printed something and backs off 2.5s to
  20s. It reports CHANGES, so its first verdict on a shell is said once; the e2e waits for it.
  A title that claims an agent the poll has not reported asks for a look NOW (`termAgentLook`,
  `pollAgentsNow`, #73): only the poll takes a title's claim back, and a claude opened and quit
  inside the 20s backoff was never seen, so its mark stayed. The detector matches the program as
  the FIRST token too: a native `claude.exe` started by bare name has the command line `claude`.
- <a id="only-command-is-resume"></a>**The only command the app writes into a shell is the agent resume**, as the shell's STARTUP
  command, with the id shape-checked in main (`validResume`). Never type into a user's shell.
- <a id="replies-only-when-asked"></a>**THE APP ANSWERS A PROGRAM ONLY WHAT IT ASKED** (#168, #171, #172, #176; spec
  `docs/superpowers/specs/2026-10-10-claude-code-compat-design.md` section 15). Every byte the core writes into a pty that
  no key produced is a reply to a query in that pty's own stream (OSC 10/11 `?`, `CSI ? 996 n`, `CSI > q`, DECRQM 2031)
  or the `?997` report the program turned on with `?2031h`, only on a change and only while that program is there:
  the shell's prompt report, the poll's "agent left" and RIS turn the reports off (review 2026-10-11: a push after a
  killed Claude reached PSReadLine as ESC, RevertLine, then typed `[?997;1n`). Replies hold no CR, LF or printable
  command, go through `term.input(reply, false)` so `onData` and `looksTyped` treat them as the replies they are
  ([typing on onKey](#typing-on-onkey)), and never read anything private: OSC 52 is write-only and a read gets no
  answer. The pure half is `core/renderer/lib/termReplies.ts` (tested); the light/dark it reports is the chrome's own
  measurement (`chromeTheme.test.ts` pins the two agree on every preset). MEASURED (Claude Code 2.1.296, 2026-10-10):
  xterm had answered OSC 11 from the clear canvas as `rgb:0000/0000/0000`, so Claude was dark on every ground; Claude
  writes `?2031h` without a DECRQM probe, never asks `?996n` or OSC 10, and on a pushed `?997;2n` re-asks OSC 11 and
  turns light. XTVERSION (#171) answers `CSI > q` and `CSI > 0 q` only, as `PrismTerminal <core version> (xterm.js
  <version>)` (the constants in `core/shared/termVersion.ts`, held to the package files by `termVersion.test.ts`); the
  name must NOT start with `xterm.js`, which Claude reads as VS Code's terminal. MEASURED (Claude Code 2.1.296 --model
  haiku, bundled ConPTY, one streamed answer, 2026-10-11): no reply, `synchronizedOutput=no` and 0 `?2026h`; with the
  reply, `synchronizedOutput=yes` and 65 frames wrapped in `?2026h`/`?2026l`. OSC 52 (#176) is WRITE-ONLY: only the
  `c` (or empty) selection, base64 of strict UTF-8, at most 1 MB (`OSC52_MAX`), through main
  (`clipboard:term-write`, its own channel and cap, opaque to the diagnostics log), with the Copied badge; a read
  (`?`) is swallowed and never answered, a clear is ignored, every OSC 52 is handled so none is drawn.
- <a id="bell-flashes"></a>**The bell flashes the taskbar only while the window is unfocused** (#177; decided under the
  owner's delegation, spec decision 1). At most one bell a second per tab reaches main (`bellGate`), which flashes
  the taskbar button (`src/main/bellFlash.ts`) only while the window is NOT focused, stops it on focus, and never
  makes a sound: a bell while focused is most often the user's own bad key (PSReadLine rings on one). A bridge
  member (`TermApi.termBell?`, `TermIpcDeps.attention?`), not a `TermHostConfig` field; a host that passes no
  `attention` (Prism, until its one line) stays silent. Under `--e2e` it is counted on `__e2eFlashes`, never
  flashed (e2e `bell`).
- <a id="closing-window-quits"></a>**Closing the window QUITS; closing the last tab does not** (owner, 2026-09-18, after using the
  first build, which hid the window and stayed resident: "the app should actually close when you
  close it"). The last tab lands on the start screen (`EmptyState`, Tabby's shape by owner
  reference: mark, name, New terminal, the pinned + recent folders, Settings, version). Resume does
  NOT need a live process: it is `tabs.json` plus the agent's own session files at the next launch.
  So `tabs.flush()` and the window-state write both happen synchronously in `close`, and main
  ignores `tabs:changed` until the first restore has answered (a page that has not restored yet
  reports an empty list). Do not reintroduce the resident process without a fresh decision.
- <a id="new-tab-ctrl-t"></a>**New tab is Ctrl+T and opens in the user's folder** (owner, 2026-09-18, reversing the first
  build's Ctrl+Shift+T and its "ask" default). `newTabPrefs`: mode `folder` is the default and a
  folder of `''` means the user's own, which main resolves (`homeDir()`); `ask` is the option.
  Ctrl+T is therefore taken from whatever runs in the shell (Claude Code's task list), knowingly.
  **Ctrl+W closes a tab, in BOTH apps** (owner, 2026-09-19, reversing the first build's
  Ctrl+Shift+W, which still works). Known cost, accepted: the shell loses delete-word on that chord;
  Ctrl+Backspace does the same job.
- <a id="window-edge-hairline"></a>**The window's edge is a faint hairline that follows the theme** (owner, same day;
  `windowEdge.ts` + Prism's `dwmHelper.ts`). DWM's border is always one physical pixel, so it cannot
  be thinner; what reads as thickness is contrast, so it is drawn a small step off the theme's own
  ground, and removed when maximized or fullscreen. Chromium rewrites the DWM attributes when the
  backdrop changes, so it is re-applied, debounced, after every material or ground change. Off
  under `--e2e` (the helper is a PowerShell that compiles a P/Invoke per launch). How BIG the step
  is now follows the Edges setting below (2026-09-19, #27): the hairline is the default and is the
  step it always was.
- <a id="edges-setting"></a>**EDGES ARE A SETTING, AND THE DEFAULT IS THE WINDOW AS IT WAS** (owner, 2026-09-19, #27: "add
  the option to specify the edges that you have in the Terminal app, like we have in the main app,
  where you can choose like Hairline, Faint, or like Solid edges, or even No edges"). Settings >
  Appearance > Edges (`window-edges`, localStorage `prism.window.edges`, store `lib/edgesPrefs.ts`).
  The control runs WEAKEST TO STRONGEST (None, Faint, Hairline, Solid), the order of Prism's own
  Edges row: a segmented scale reads as one only in order, and the order the owner said the words
  in was a sentence, not a layout. THIS APP'S row, not the core's: the edges are the window's chrome, which in Prism belongs to the
  app style and has an Edges row of its own there, so it is in the `options` e2e's closed list of
  this app's rows and its key is not `prism.term.*`. EVERY edge in the window reads one of two
  tokens (`--p-divider`, the chrome's line; `--p-line`, the list's), core's components included, so
  the choice is applied ONCE, where `chromeTokens` derives those two, and no component knows the
  setting exists. The numbers are in `src/shared/windowEdges.ts` (shared because main reads them
  too): hairline is 7/10% and 9/12% (dark/light), EXACTLY what was hard-coded before, so nobody's
  window changed; faint (2.2/3.5%) and solid (16/18%) are Prism's `faint` and `strong`, the owner's
  word for the latter being Solid; none is alpha 00, still a colour, so a border keeps its width
  and nothing shifts (the e2e compares the layout across all four). Unlike Prism, `--p-line`
  follows too: the owner asked for every edge, and "no edges" with ruled settings rows is half a
  setting. The DWM border round the window follows as well (`window:edges` tells main, which
  validates it; `edgeFor` scales its step, and none is DWMWA_COLOR_NONE, what a maximized window
  already gets). That half is unit-tested only: the DWM helper is off under `--e2e`, so the e2e
  asserts what main HEARD, and how the border looks is on the hands-on list. The `edges` e2e
  measures real edges (a tab separator, the title bar's rule, the settings rail, a settings row),
  WAITING for each to arrive, since the strip's border colour transitions over 550ms.
- <a id="accent-and-background"></a>**THE ACCENT AND THE BACKGROUND ARE SETTINGS, AND UNSET IS THE THEME'S** (owner, 2026-09-22:
  "an accent colour option which would pick the accents you see, like the blue highlight effect
  and tab effect"; "let background colour be a setting ... move those settings, bg and accent, to
  the top of the list right under font and font size"). Settings > Appearance > Background colour
  and Accent colour (`window-background`, `window-accent`; localStorage `prism.window.background`
  / `.accent`; stores `lib/backgroundPrefs.ts` / `accentPrefs.ts`, both `lib/colourPref.ts`). Each
  shows the theme's own colour until one is picked, then a plain **Reset** word (the core's
  `RESET_LINK`, Prism's own style) forgets it. This app's rows, for the edges' reason (in Prism the
  window's colours are the app style's); a theme sets them, so they sit right under the theme wall
  (`TerminalAppearanceSettings`' `afterTheme`; Prism passes nothing). Applied ONCE, in `paintChrome`:
  the background replaces the theme's before `chromeTokens` measures it, so the mode, every ink and
  the accent's floor follow; the terminal follows too because the panel paints its ground from the
  same token (`paintsGround`). The TERMINAL follows too (2026-09-28, the owner's "do all those"):
  the host's `terminalGround` hands the core the picked background, and `onGround` floors the text
  (4.5:1), the cursor and the sixteen (3:1) against it; `onChromeChange` restyles running shells.
  A chosen accent is KEPT where the ground can show it and only MOVED to the 3:1 floor where it
  cannot, and an unpicked Agent working indicator wears it (`themeAgentColors` reads both picks).
  Prism passes neither field and is unchanged. The `pickedGround` e2e measures both.
  The `accent` e2e measures the active tab's rule, the row order and the ground.
- <a id="settings-controls-neutral"></a>**SETTINGS CONTROLS ARE NEUTRAL; ONLY SAVE WEARS THE ACCENT** (#42; owner, 2026-09-23: "i dont
  want settings buttons to be affected by the accent colour... grey based on the bg colour ... same
  colours as the drop down menus"; "the only ones to keep accented are the save buttons"; both
  apps). This narrows the accent rule above: row buttons (`ROW_BUTTON`, the dropdown's look), the
  pressed segment (`SEGMENT_ON`) and dictation's buttons are greys from the theme's own tokens, in
  `core/` so Prism follows. Save changes and Save as Custom keep the accent. **AN ON SWITCH WEARS
  THE THEME'S ACCENT** (#138; owner, 2026-10-07: "toggles differ in look i like the teal with black
  not the green and white", then "yes option 1 but it should depend on the theme so only teal on the
  teal theme"). This narrows #42 for switches only: `SWITCH_ON` is `--p-sel-bg` (the accent as a
  fill, moved until `--p-on-accent` clears 4.5:1 on it, the update chip's pair) and
  `SWITCH_KNOB_ON` is `--p-on-accent` (near-black on a bright accent, white on a dark one); dimmed
  when disabled, lifted on hover; off is the grey track and white knob as before. Still accented, since they are not
  buttons: Reset links, the chosen theme card, the dropdown's chosen item, the badges, progress, the
  hotkey capture while it listens, a found row's flash. NOT the rail's chosen page any more (#134,
  owner: no accent bar): a grey `--p-hover-hi` fill; and focus in the new rows is a fill and a
  lighter edge, not an accent ring (Prism #272). `neutralControls.test.ts` holds the
  source; the `accent` e2e asserts a picked accent moves neither the row button nor the segment, and that an
  on switch is `--p-sel-bg` with an `--p-on-accent` knob on PT Default, a picked accent and Paper.
- <a id="pt-default-theme"></a>**PT DEFAULT IS THE DEFAULT THEME HERE, AND FIRST IN THE WALL** (owner, 2026-09-22, handing over the palette he had saved as
  Custom: "let this be the default theme ... for prism terminal"): Wombat's colours on #121212, the
  two blacks lifted, the icon's orange `#fe8f34` as the accent. A core preset like any other, and
  this host's `defaults.theme`, so anyone who never picked a theme moves to it with the update.
  **CUSTOM COMES BEFORE IT** (#60; owner, 2026-09-23: "custom should come before default"): the
  wall is Custom, then the host's default (PT Default here, Follow style in Prism), then the rest.
- <a id="theme-switch-colours"></a>**A THEME SWITCH TAKES THE WINDOW'S COLOURS WITH IT, AND ASKS WHEN SOMETHING IS UNSAVED** (#60;
  owner, 2026-09-23: "when you change a colour away from the preset and then switch theme it
  doesn't change the altered bg and accent colours, though it should. if you have altered some
  settings like font or anything that would make it so you have to save you should get prompted on
  theme change ... otherwise just change theme including things like accent and bg"). Every card
  pick, Custom included, goes through the core's `pick`: with Save changes lit it shows
  `ThemeSwitchAsk` (Save as Custom, the accent / Discard / Cancel; Escape and a press outside are
  Cancel), else it lands at once. Landing calls the host's `onThemePicked`; this app forgets its
  picked Background and Accent there (set to null, as Reset does). Prism passes nothing, having no
  such rows. `themeSwitch` e2e drives all of it.
- <a id="close-question"></a>**THE CLOSE QUESTION IS ONE RULE, NOT A SETTING** (owner, 2026-09-19, #15: "remove the setting but
  just have it on smart mode by default, so it won't ask if you're in a normal shell but if you're
  working with an agent it will ask"). `core/renderer/lib/agentClose.ts`, the same in Prism: a plain
  shell closes unasked; a tab whose shell HOSTS an agent asks, working or idle (an agent waiting at
  its own prompt is still a conversation the close ends), and names it and how long it has worked;
  closing the WINDOW is held only while one is mid-answer, since idle agents come back at the next
  launch. It replaced this app's on/off switch and Prism's three modes. Proved by the e2e `closeAsk`.
- <a id="settings-cog-no-menu"></a>**The title bar has a settings cog and NO menu** (owner, same day: a menu of Settings + Quit was
  cut to the cog). Nothing in the UI needs to quit the app any more; the X does.
- <a id="theme-drives-chrome"></a>**The theme drives the chrome** through the real `--p-*` tokens (`lib/chromeTheme.ts`). Every ink is
  moved to a contrast floor, and light/dark is MEASURED from the ground, never read off a name.
  The `:root` fallbacks in `index.css` are `chromeTokens` output for the `prism` preset; recompute
  them if either changes.
- <a id="panel-paints-ground"></a>**The terminal panel paints the ground; xterm's canvas is CLEAR** (2026-09-19, #6, owner
  screenshot: a grey bar under a black terminal). xterm sizes itself in whole rows (MEASURED: 604px
  in a 611px box), so the strip under the last row is never its to paint; with the ground on the
  canvas and a transparent box round it, that strip showed the native window background. So
  `TerminalPanel`'s box is `bg-[var(--p-bg)]` and `currentTermTheme()` hands xterm
  `background: #00000000` plus a named `cursorAccent` (it defaults to the background, which would
  make the character under a block cursor a hole). Exactly ONE coat per pixel, which also matters
  on acrylic: two translucent coats are a visibly darker panel, so App's own container behind the
  panel stays unpainted. The e2e `theme` scenario measures the strip, and fails on the old code.
- <a id="links-painted"></a>**Links are PAINTED, not only underlined on hover** (owner, 2026-09-19, #10). xterm's link addon
  marks a link only under the pointer, so `lib/termLinkPaint.ts` lays a DECORATION on each row a
  link sits on: the link colour as its foreground, a faint underline as its element, never in the
  way of a click. `lib/termLinks.ts` is the pure half: `findLinks` (a sentence's full stop and a
  bracket the link never opened are given back) and `linkColor`, which is `LINK_BLUE` moved only as
  far as the ground needs to reach 4.5:1, so it adapts to every preset and to a custom background,
  and is tested for all of them. WHAT IS SCANNED is the design: scrollback is immutable, so its
  links are painted once and ride a marker; the LIVE screen is redrawn in place by TUIs, so every
  pass throws away what it painted from the last finished line down and paints that again (a
  decoration left on a rewritten row is a blue smear over words that were never a link). Rebuilt
  on a resize (reflow) and on a theme change. **THE ALTERNATE SCREEN TOO** (#97; owner, 2026-09-28:
  a link in Claude Code's fullscreen view "is not blue ... it seems to know it's a link"): markers,
  so decorations, do not exist there, so each row xterm DRAWS there (`onRender`) has its link text
  wrapped in a span of the link colour; xterm replaces a row's contents when it draws it, so a
  rewritten row starts clean. Per row, since a TUI places its own text. Columns are counted in
  CELLS, since a wide character is one character and two cells. xterm splits a row into spans as
  it likes, so the e2e finds a link's span by POSITION, never by its text. **NO PASS HOLDS THE
  PAGE** (#167; MEASURED 2 s stalls before, 2009 ms and 2046 ms in `scan`, Stable's diag log
  2026-10-10): a full pass paints the live screen, then the scrollback bottom up in slices of 8 ms
  or less (`lib/linkScanPlan.ts`, a marker as the cursor), and a found path repaints only the tab
  and the lines that asked (`revisit`). The `linkPaintStall` e2e holds it. **OSC 8 LINKS** (#169)
  open on a LEFT click, http(s) only, never through a confirm (the `linkHandler` option; xterm's
  default asked `confirm()` and opened a blank window main denied, on any button). Their cells are
  painted from the stream (`lib/termOsc8.ts`: the cursor at the open and at the close, MEASURED to
  bracket Claude Code's label through the bundled ConPTY) while their text stands, on both screens,
  and the menu's Copy link / Open link take where a click goes. A LABEL THAT SHOWS ANOTHER HOST'S
  ADDRESS OPENS WHAT IT SHOWS (`osc8Target`, review 2026-10-11): xterm's OSC 8 provider outranks the
  visible-text match, so `https://github.com/...` printed over a hidden `https://evil.example/`
  opened evil.example. An OSC 8 label is a link to the click-caret gate too. A reflow or a buffer
  switch forgets them. **THE APP NEVER SETS `FORCE_HYPERLINK`** (#173 did; review 2026-10-11 took
  it out): supports-hyperlinks reads it BEFORE its isTTY test (read in claude.exe 2.1.296), so it
  put raw OSC 8 into every pipe and redirect, Claude's own Bash tool commands among them. Claude
  prints `label (long url)` without it; its `hyperlinks` setting, or a user's own variable, turns
  OSC 8 on. The `osc8Links` e2e holds both.
- <a id="path-links"></a>**A PATH ON SCREEN IS A LINK WHEN IT EXISTS** (#99; owner, 2026-09-29: "clickable links that would
  open the file or folder", then "go ahead"). `lib/termPaths` finds what COULD be a path (relative or
  absolute, sentence punctuation and `:12` taken off); main's `termPathOpen` answers which exist from
  the shell's folder (`cwd` tracks the prompt's OSC 9;9), and ONLY those are painted and clickable
  (`lib/termPathLinks`: batched, cached per folder, a "no" forgotten after 15 s). A left click opens
  a file in its own app and a folder in Explorer; ANYTHING RUNNABLE (exe, scripts, shortcuts,
  installers: `isRunnable`) is only SHOWN in Explorer, never run. Main never trusts the page with
  a path: it gets the TEXT back and resolves and checks it again. No UNC paths (a share can stall a
  stat). A prompt (`PS C:\x>`, `C:\x>`) is not a link. Menu: Open, Show in Explorer, Copy path.
  Under `--e2e` main records (`__e2eOpenedPaths`) and opens nothing. A host without `paths` in its
  main deps (Prism, until wired) paints no paths at all; `TermHostConfig.openPath` is where Prism
  opens them inside Prism. A found path repaints only the tab that asked and only the lines that
  asked (#167: `linkRanges(text, cwd, owner)`, `onPathsFound(owner, fn)`, `takeAsked`); waking
  every tab's full repaint froze the window 2 s (MEASURED). The `pathLinks` e2e holds it.
- <a id="file-drop-and-menu"></a>**A file dropped on the terminal types its quoted path, and the terminal answers a right-click**
  (2026-09-19, #16). Both lived in Prism's `TermDock.tsx`, the split dock, and went with it when
  the dock was stripped, while the README, the spec and PR #3 went on listing the drop as shipped
  for a day: NOTHING IN A FEATURE LIST IS TRUE UNTIL A TEST HAS DONE IT. They are on App's terminal
  host now (`data-term-host`): the drop goes through `quotePaths` and `termInput`, never Enter, and
  only over a shell; the menu is Paste (the terminal's own paste rule, via `pasteInto`), Find in
  scrollback and Command help, led by Copy link over a link and Copy with text marked, and with no
  Close tab since 2026-09-23 (see THE MENU FITS in [two-apps.md](two-apps.md#menu-fits)). The e2e performs a
  REAL drop with Chromium's drag events (`Input.dispatchDragEvent` carrying a file path): a
  synthetic DataTransfer holds a File with no path and proves nothing about `getPathForFile`.
  When a Prism component is stripped, grep what ELSE it owned before calling a feature kept.
- <a id="legacy-opacity"></a>**The legacy opacity is a number read defensively** (`legacyTermOpacity`, the migration's only
  reader): `Number(null)` is 0, and never-set must read as opaque.
- <a id="explorer-verbs"></a>**Explorer verbs**: HKCU, `reg.exe` with argv only, on `Directory` and `Directory\Background`, no
  `*`. On by default, put back at launch unless somebody said no (the off-marker is the one fact
  stored), never in dev and never under `--e2e`, and the Settings switch reports what the REGISTRY
  says. `shellVerbParity.test.ts` asserts the uninstaller deletes every key the app writes.
  **BOTH ENTRIES READ "Open terminal here" AND NEITHER NAMES THE APP** (owner, 2026-09-19, #27:
  "have it say Open Terminal here and don't have any of them mention Prism, you can see that by
  the logo"; they were "Open in Prism Terminal" and "Open Prism Terminal here"). An install that
  already had them is RELABELLED by `reconcile` at launch, under the narrowest rule that does it:
  no "no" on record, the key present AND pointing at this exe (each key judged on its own), its
  label readable and different, and then only the label value is written. It never turns on an
  entry somebody turned off (that case does not even query), and `allowed` still gates it like
  every other write. The label is read by matching `REG_SZ`, never the value's name, because
  reg.exe prints "(Default)" in the language of the Windows it runs on.
- <a id="renderer-sandboxed"></a>**Renderer is sandboxed** (`sandbox: true`, context isolation on). The preload reaches the
  clipboard through main for that reason. `will-navigate` and window-open allow http(s) only.
- The preload global is `window.prism` and localStorage keys are `prism.term.*`, kept from Prism so
  copied code needs no renaming. The app has its own userData (`%APPDATA%\PrismTerminal`).
