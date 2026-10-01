# Launch with restored agent tabs: tabs first, a skeleton while Claude comes back

Owner, 2026-09-30. On opening the app with three Claude tabs:
- What they saw: "you see the no tab screen (false, there are three tabs actually) -> the three tabs load (this should've been the first screen) -> then you see the path in the terminal then it disappears to load the claude session."
- What they want: "a loading screen on each tab, so that it doesn't look like we're just running some simple script ... it looks like it's meant to be this way, doesn't look as stitched together".
- Four mockups were shown as synced timelapses (`2026-09-30-launch-mockups.html`, next to this file). The owner picked **C, Skeleton**: "C is good".

## What happens today (read from the code)

1. **The start screen flashes.** App starts with no tabs and renders `EmptyState` until `window.prism.restoreTabs()` answers. Main's `tabs:restore` first stats every saved folder, then scans Claude's session files for each claude folder (`claudeSessionsAsync`). Only then does it answer. Until then the page honestly has no tabs, so it says so.
2. **The path flashes.**
   - A resumed tab's shell starts with `claude --resume <id>` as its startup command (`withResume`, `core/main/terminal.ts`).
   - TerminalPanel writes a text spinner ("⠋ Resuming Claude session…"), and the FIRST pty byte stops it.
   - That first byte is the shell's own prompt, so the prompt and path show until Claude draws over them.

## The design

### 1. Tabs from the first frame
- **Main answers the tab list at once, from a separate call.** `tabs:peek` is a synchronous read of `tabs.json`, which is tiny.
  - The preload exposes it as `window.prism.peekTabs()`, sent with `sendSync` once at page start.
  - It answers the saved tabs as they are (folder, agent) and the active index.
  - It does no stat and no session scan.
- **App's first state is those tabs**, each with its own id, in order, with the saved one in front. `EmptyState` is never drawn while a restore is pending; it shows only when the restore answers empty.
- **When `tabs:restore` answers, each restored tab takes over its placeholder by position.** `planRestore` now reports each restored tab's saved index (`from`).
  - A placeholder whose folder has gone is removed.
  - The folders this launch was handed (argv, the Explorer verb) are added after, as today.
  - The shells spawn at that moment, as today, all of them, the tabs behind included.
- **A placeholder draws the skeleton if its saved agent is claude or codex.** A plain-shell placeholder draws the empty ground, since its prompt arrives in well under a second.

### 2. A skeleton while the agent comes back (core, so Prism's resumed terminals get it too)
- **`ResumeSkeleton`** is a new core component: the logo block at the top, then a whole page of lines in paragraphs, filling the window to its bottom edge. The owner reviewed the first build on 2026-09-30: "it's too small, it should cover much more of the window ... not that bottom claude input bar thing, only the lines". So there is no input box and no footer.
- **Look:** the bars are `color-mix(var(--p-text) 7%)` on the panel's own ground, with a slow sheen. Under reduced motion there is no sheen. It follows every theme, since everything is drawn from tokens.
- **Placement:** TerminalPanel mounts it OVER the terminal element for a session marked resume. It replaces today's text spinner, which goes.
- **The shell's words never show.**
  - Main passes pty data through as today. The panel watches for the moment the AGENT's process takes the console: ConPTY retitles the console to the program that runs, so an OSC 0/2 title naming `claude` or `codex` arrives before that program draws anything. MEASURED 2026-09-28: a resumed claude sent `ESC]0;claude` first.
  - Right before writing the chunk that holds that title, the panel writes a local clear to xterm: screen, scrollback and home (`ESC[2J ESC[3J ESC[H`). The prompt and the resume command are gone from the buffer before a single cell of the agent is drawn.
- **The reveal.** The skeleton fades out over 180 ms as soon as the agent has painted. That is the first of:
  - a title Claude or Codex writes for itself (`agentTitle` recognises it: "✳ Claude Code", a spinner title), or a switch to the alternate screen (Claude's fullscreen view), each followed by 150 ms for the paint to land;
  - a key the user presses (they see what they type);
  - the shell exiting, or its spawn failing (the error line must be seen);
  - a 12 s ceiling, after which whatever is there is shown.
- **The rule is pure:** `core/renderer/lib/resumeReveal.ts` is a reducer over (data chunk, title, buffer change, key, exit, clock). It answers "clear before offset N" and "reveal now". It is tested on its own.

### 3. The tab says it is loading
- A tab whose session is resuming, or still a placeholder, shows a small ring before its name, in the accent: the mockup's ring. The ring goes at the reveal.
- The core publishes which sessions are resuming (`onResumingChange`, `resumingIds()` in `termBus`). This app's TabStrip reads it. Prism's strip may adopt it later, in a Prism PR.
- Behind the ring, the agent indicator follows its usual rules. A resumed agent does not count as working while it starts (`startupOutput`, as today).

### What does not change
- When the shells spawn, which resume id each tab gets, the resume shape check, and the saved-tabs format.
- A plain shell tab. A new tab opened by hand.
- A tab restored with no agent. Launching with a folder and no saved tabs.

## Testing
- **Unit:**
  - `resumeReveal`: the clear offset lands just before a claude or codex title, including mid-chunk and with an ST or BEL terminator; no clear on a pwsh title. The reveal comes on the agent title and on the alternate screen, each after the settle; on a key, on exit, and at 12 s.
  - `planRestore` reports `from`.
  - The peek parse survives a missing or malformed file.
- **e2e `launchSkeleton`:**
  - A temp HOME holds a fake Claude transcript for each of three folders, and `tabs.json` names three claude tabs.
  - A stand-in `claude.cmd` is first on PATH. It titles the console `claude`, waits 1.5 s, titles it `✳ Claude Code` and prints a banner.
  - Asserted:
    - the FIRST rendered frame already holds three tabs and no start screen;
    - the front tab shows the skeleton, and every tab shows the ring;
    - `PS ` never appears in the front terminal's text while the skeleton is up, nor after the reveal;
    - the banner appears and the skeleton and rings go;
    - a tab clicked after its session was ready shows no skeleton.
  - Nothing touches the real HOME or `~/.claude`.
- The existing `restore`, `lastTab` and `closeAsk` scenarios stay green. A launch with no saved tabs still shows the start screen.
- **Hands-on:** the owner relaunches the regular app with three Claude tabs and looks. The stable copy only if the owner asks.

## Plan
1. `planRestore` gains `from`; `tabs:peek` in main plus `peekTabs` in the preload; the shared types. Unit tests.
2. App: first state from the peek (placeholder tabs); the restore answer adopts, removes and appends; `EmptyState` only when the restore answered empty.
3. Core: `resumeReveal.ts` and its tests; `ResumeSkeleton.tsx`; TerminalPanel wiring (the clear before the agent's title, the overlay, the reveal), replacing the text spinner. `termBus` gains resuming state.
4. TabStrip ring from `resumingIds`, and on placeholders.
5. e2e `launchSkeleton` with a stand-in claude and a temp HOME, written to fail first. The full e2e suite. Screenshots looked at.
6. CLAUDE.md rule. Core minor bump, app minor bump. One PR. Say in it that the skeleton reaches Prism's resumed terminals through the core. Ask "merge?". No install of the stable copy unless asked.
