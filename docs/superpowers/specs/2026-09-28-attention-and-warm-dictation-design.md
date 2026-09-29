# Attention indicators, a warm speech engine, and tab polish

Date: 2026-09-28. Owner's requests, the same day (dictated): the transcription model "is slow to
start up ... it should work from the get-go when you open the terminal"; "an optional completion
indicator ... a static colour like a green border on the bottom ... stay there until you click the
tab"; "a question indicator when a session asks you a question ... a blue indicator, also
optional"; "a badge on the taskbar icon ... how many sessions have completed without me having
taken a look at them"; "tab names centred ... dynamic tab sizes [need] a limit ... maybe like 4
letters"; and "when many tabs are working in consecutive order ... there should be one single
working indicator that moves across all the tabs and not 3 separate".

Design and plan together, for one approval (the owner's standing rule).

## What was measured first

**Dictation's slow start is the GPU compiling its kernels, not the server starting.** On this
PC (RTX 5090, the official CUDA 12.4 pack, Large v3 Turbo):

| | server answering | 1st transcription | 2nd | 3rd |
|---|---|---|---|---|
| driver kernel cache present | 1.1 s | 0.26 s | 0.17 s | 0.16 s |
| no kernel cache (`CUDA_CACHE_DISABLE=1`) | 1.1 s | **31.8 s** | 0.16 s | 0.16 s |

The pack has no native kernels for this GPU generation, so the driver JIT-compiles them on the
first pass and keeps them in its shared cache (`%APPDATA%\NVIDIA\ComputeCache`, 1.1 GB here, and
capped). That cache is shared with every CUDA program on the PC; once ours are evicted, the next
first dictation pays 30 s again. The engine is also started only at the first press, and stops after
5 idle minutes. Partial passes queue behind the compile, so the live preview shows nothing and
the pill says "Transcribing" throughout. That is the 1 to 2 minutes the owner saw.

**Claude gives the terminal no signal for "asking you".** A real session in a pty, asked to use
its question tool: the title goes `◐ … → ✳ Color preference question` and then stays `✳` while
it waits, exactly as when it has finished; no bell, no OSC 9, no progress sequence. (Its desktop
notifications reach only Ghostty, Kitty and iTerm2, and only when it thinks you are away.) What
differs is the SCREEN: the question box draws "Enter to select · ↑/↓ to navigate · Esc to
cancel", and a permission prompt draws "Esc to cancel" under numbered choices.

## Design

### 1. The speech engine is warm before you speak (core, so Prism too)
- **A private kernel cache.** The engine is started with `CUDA_CACHE_PATH` set to
  `%LOCALAPPDATA%\PrismDictation\cuda-cache` and `CUDA_CACHE_MAXSIZE` at 4 GB, so our compiled
  kernels are ours and are not evicted by other CUDA programs. The 30 s is paid once per driver
  update, not whenever the shared cache churns.
- **Warm-up at launch.** With dictation on and a model chosen, main starts the engine a few
  seconds after the window appears and runs one pass over half a second of silence, which is
  what compiles the kernels and loads the model. The same warm-up runs when dictation is switched
  on or the model is changed. Warm-up is lower priority than a real press: a press during it waits
  for it rather than racing it.
- **The pill tells the truth.** While the engine is starting or warming, a press shows "Starting
  speech engine…" (not "Transcribing"), and no live partials are sent until the engine is warm,
  so nothing queues behind the compile.
- The 5-minute idle stop stays (an owner decision). Restarting a warm-cached engine costs about
  1.4 s. The first press after a stop re-warms before it transcribes, and the pill shows it.
- Off still means off: with dictation off, nothing starts and nothing is warmed.

### 2. Finished and question indicators (core logic, both apps' tab strips)
- **Finished:** a tab whose agent finished while you were not looking at it gets a static,
  full-width bottom border (3 px) in the Finished colour (default the theme's green, as today).
  It stays until you activate that tab. "Not looking" means another tab was in front, or the
  window did not have focus.
- **Question:** the same border in the Question colour (default blue, moved to the contrast floor
  like every ink) when the agent is waiting on you. It is detected when a Claude session's title
  goes idle AND the bottom rows of its screen show Claude's choice footer ("Esc to cancel" with
  "Enter to select", or "Do you want to proceed"). It is checked again as output arrives while
  idle. It clears when the agent works again, when you type in that tab, or when you activate it.
  The screen text is Claude's today; the detector is one small tested function, so a Claude
  update that rewords the footer is a one-line fix, and the worst case is the Finished colour
  instead of the Question one. Codex: Finished only until its prompts are measured.
- **Settings (Appearance, under the working indicator):** "Finished indicator" and "Question
  indicator" rows, each a switch (both on by default) and a colour, "Follow theme" as today.
  The existing "Agent finished indicator" colour row becomes the Finished row's colour. These
  are the core's rows, so they are added to `TERMINAL_OPTIONS`, and both apps show them.
- Full mode's whole-tab fill for "finished" is replaced by the border, so the finished mark looks
  the same in Minimal and Full. Full keeps its fill for working.

### 3. One working bar across neighbouring tabs (each app's strip)
In Minimal mode, a run of adjacent working tabs (1, 2 and 3; not 1 and 3) draws ONE bar across
the run's combined width. It moves at the same speed a single tab's bar does, so a wide run is not
a blur. An isolated working tab keeps its own bar. Runs are worked out from the strip's order and
measured tab boxes, so they follow drags, closes and resizes.

### 4. Taskbar badge (this app; Prism if the owner wants it)
The taskbar button carries a small round badge with the number of tabs showing Finished or
Question (1 to 9, then "9+"). There is no badge at zero. On Windows this is the window's overlay
icon (`setOverlayIcon`), drawn in the renderer and sent to main as a PNG. A switch in Settings >
General turns it off (on by default).

### 5. Tab labels
- Labels are centred in both Dynamic and Fixed (they are left-aligned today).
- Dynamic tabs have a minimum width: a four-character label plus padding and the close button, so
  a one-letter folder no longer makes a sliver. Longer names are sized as now, up to 14rem.

## Plan (one PR per repo; the core changes ride this repo's PR)

1. **Dictation warm-up** (`core/main/dictationEngine.ts`, `dictationIpc.ts`,
   `core/renderer/lib/dictation.ts`): private CUDA cache env, a `warm()` that starts and runs a
   silent pass, main calls it at launch and on setting changes, the pill's "Starting speech
   engine…" phase, no partials before warm. Tests: engine unit tests for the env, warm-then-press
   ordering, and no partial before warm; the `dictation` e2e asserts the pill never says
   Transcribing before the engine is warm, and that a press straight after launch pastes. Hands-on:
   first press after a cold launch on this PC.
2. **Question detection** (`core/renderer/lib/agentQuestion.ts`, pure): given the bottom screen
   rows, is this Claude's choice footer? Unit-tested against the captured screens (question box,
   permission prompt, idle prompt, finished answer). Wired into `useAgentIndicator`, which gains
   `questionIds` beside `doneIds`, with the clearing rules above.
3. **Settings and colours** (core `termLook`, `agentColors`, `TerminalAppearance`, `options.ts`):
   the two switches and the Question colour; `settingsCopy` holds the wording.
4. **Tab strip** (`src/renderer/src/components/TabStrip.tsx`): the bottom borders, the joined
   working bar, centred labels, the Dynamic minimum. e2e: `indicator` extended (finished border
   on a background tab, cleared on click; a question border from a stand-in shell that prints
   Claude's footer; a run of three working tabs draws one bar spanning them, two apart draw two).
   `tabWidth` asserts centring and the minimum.
5. **Taskbar badge** (renderer draws, `window:overlay` IPC, main sets it; Settings > General
   switch). Unit-test the count; the e2e reads what main was asked to show.
6. CLAUDE.md rules, versions (core minor, app minor), full e2e, install as the regular app and the
   stable copy, PR, and your merge.
7. **Prism** (if approved below): the same borders, joined bar, centring and minimum in Prism's
   own tab strip, and the badge. Its dictation warm-up comes with the core bump.
