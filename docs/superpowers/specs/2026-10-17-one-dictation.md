# One dictation: the same in the app and outside, one engine for every copy (spec + plan)

Owner, 2026-10-17, after trying PR #246 on Stable: "the dictation in the app and outside seem like two
different things, and at least the one in the app is very unresponsive, they should be the same thing
for the most part. also when you have two instances of pt open, there should be one dictation engine
for both, not one engine choosing one of the instances. when you then dictate and it finishes, it
should show all sessions open in one ui from both instances of pt". And: "It needs to be ready at all
times. Look at for example, open whisper ... mainly the responsiveness and the stability of it".

## What was measured (Stable diag log, 2026-10-17)

- After a restart, the first presses did nothing: no dictation event at all until one finally started.
- One recording stayed open for 100 s while the owner pressed and held the key to stop it.
- Neither case left a trace, because the in-app key path logs only phase changes, never the key.
- Today there are TWO key paths: the page reads the key while the app is in front (its own reducer,
  its pill), and the keyboard hook reads it everywhere else (a second reducer in main, the widget).
  They can disagree about what is held, and a press near a focus change lands in one, the other, or
  both.

## What the owner gets

- **One key path.** The keyboard hook reads the dictation key everywhere, the app in front included.
  One reducer decides start and stop. The page no longer reads the key in Prism Terminal (Prism, which
  has no hook, keeps reading it in its own window as today).
- **One widget.** The same widget shows in the app and outside: listening with the live words, then
  the outcome. What happens to the words stays as today:
  - a Prism Terminal window in front: pasted at the cursor of its front tab, no Enter;
  - any other app in front: the active orchestrator, or the list of sessions to pick from.
- **One engine for every copy.** The first copy started runs the dictation service: the key, the mic,
  the speech engine and the widget. Every other copy connects to it and tells it its tabs. When the
  service's copy closes, the next copy takes over within a second (the lock file from #246).
- **One list.** The picker shows the Claude sessions of every copy, each row saying which copy (for
  example "Stable") when more than one is open. Picking sends it through that copy's own checked path
  (Windows' process check, decided again before typing and before Enter).
- **Ready at all times.**
  - The speech engine is started with the app and kept warm while dictation is on (no idle stand-down).
  - The start sound plays the moment the key is recognised, before the mic is open, so a press is
    always answered.
  - The widget shows "Starting" until the mic is open, then "Listening". (Words spoken before the
    mic is open can only be kept if the mic stays open: see the open question.)
- **Every key decision is logged** (the binding's keys only, never other keys or typed text), so a
  press that did nothing says why in the diag log.

## Design

1. **The service** lives in the main process of the copy that holds the lock. It runs the hook
   helper, the one reducer (`globalDictKey` feed), and the widget window. Capture and transcription
   stay in that copy's page, as today; main drives it.
2. **The link between copies**: a named pipe owned by the service (`\\.\pipe\prism-terminal-dictation-<user>`).
   A client copy sends its tab list (id, label, folder, agent state, orchestrator) on every change and
   answers two requests: "paste this into your front tab" and "send this into tab X". Only copies of
   Prism Terminal run by the same user can connect (the pipe's security is the user's own).
3. **Which copy is in front**: the hook already says when a Prism Terminal window is in front; it will
   also say WHICH (its process id), so the service sends an in-app paste to that copy.
4. **Prism** is unchanged: it embeds the core, has no hook, and keeps its in-window dictation. The core
   keeps `armDictation` for it; Prism Terminal stops calling it.

## Plan

1. Key logging first (main and page), installed to Stable, so the unresponsive presses are explained
   before anything moves.
2. Service and lock: the copy holding the lock starts the service; the others become clients.
3. Pipe protocol: tab lists, paste, send; tests for each message and for a copy closing mid-pick.
4. One key path: the in-app press goes through the hook; the page's own listener off in Prism
   Terminal; the widget in the app too.
5. Ready at all times: engine kept warm, the cue on recognition, "Starting" until the mic is open;
   measure how long the mic takes to open (the DJI Mic Mini and the default).
6. The picker across copies, with the copy's name on each row when more than one is open.
7. Verify: unit tests, e2e with two copies (the second copy's tabs in the list, a pick sent to it, the
   service handed over when the first closes), a real run on this PC, the full e2e.
8. Docs: PRIVACY.md (the pipe, local only), regression rules, two-apps (Prism unchanged).
   Versions: core minor if the core changes, app minor.

## Owner decisions (2026-10-17)

- The plan: "Yes, build it". On PR #246.
- **The mic opens on each press** (owner chose it over keeping it open, which would have shown
  Windows' microphone icon the whole time).
