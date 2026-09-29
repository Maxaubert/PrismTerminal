# The caret follows typing, not a streaming agent (#101)

Owner, 2026-09-29, relayed by the Wind session: "make sure pt session does the fix", then
"create a plan and spec and then go for it, no approval from me needed, just do it". Hard rule for
this task: no install of any build on the owner's PC (the stable copy included); PR and "merge?" as
usual.

## The problem

Screen magnifiers and readers (Wind, Windows Magnifier, Narrator) and the IME candidate window
follow the text caret through UI Automation. In a terminal built on xterm.js, that caret is
xterm's helper textarea, which xterm moves to the buffer cursor at the end of every parsed write
(`_syncTextArea`, from `onCursorMove`; xterm 6.0.0). Wind's log: while the owner types in Claude
Code in a busy tab, the caret reads the input line (y=1737/1782 of 2160) and then jumps to
y=432/567 for seconds.

## What was measured (not assumed)

Claude Code 2.1.285 under a headless xterm through the same bundled ConPTY, a 60-line streaming
answer, typing "abc def ghi " during it, the cursor position logged at the end of every chunk:

| Claude's view | Cursor hidden? | Drawn (inverse) caret? | Chunk ends off the input row |
|---|---|---|---|
| fullscreen (alternate screen) | no | none | 0 of 28 while typing |
| inline (normal screen) | no | none | 6 of 26 while typing, 26 of 29 while streaming |

In the inline view every streaming frame ends with the real cursor on the output row (row 10),
above the input row (row 24); each keystroke echo brings it back, and the next frame takes it
away again. That is the jump. The fullscreen view is already right. The owner's sessions ran
inline for part of 2026-09-28/29 (Claude had switched its fullscreen view off after test
launches), and a session keeps its view until restarted.

So the suggested design (find the caret the program DRAWS, while DECTCEM hides the cursor) does
not apply: Claude draws no caret and does not hide the cursor in either view.

## The design

On the NORMAL screen only, the textarea is held on the caret the user's last keystroke produced,
while the program moves the cursor ABOVE that caret on its own:

- **Anchor.** A keystroke (xterm `onKey`) opens a short window (250 ms). Every cursor position at
  a chunk end inside it is a candidate, and the LOWEST one (by absolute buffer line) is the caret:
  in a shell and in Claude's inline view alike, the input line is the bottom of what the keystroke
  redraws, and a streaming frame that lands inside the window is above it.
- **Hold.** Outside the window, a chunk end with the cursor ABOVE the caret line leaves the
  textarea on the caret (it is re-placed after xterm's own sync). At or below the caret line,
  nothing is done, xterm's placement stands, and that position becomes the caret (a new prompt,
  output that pushed the input down).
- **Release.** The alternate screen (full-screen programs own their cursor, Claude's fullscreen view
  is already right), a resize, a caret line scrolled out of the live screen, and a view scrolled
  back all drop the hold; xterm's placement stands.
- Only the textarea moves. xterm's cursor, the pty and what is drawn are untouched.

The rule is pure (`core/renderer/lib/termCaretHold.ts`, a reducer over key and cursor events) and
unit-tested; the panel wires it to xterm's `onKey` and `onCursorMove` (registered after xterm's
own, so it runs after the sync) and places the textarea with the cell size read from the DOM.
It is in `core/`, so Prism's terminals get it too.

Not covered: the IME composition view, which xterm positions itself while composing.

## Testing

- Unit: the reducer: anchor on the lowest position in the window, hold above, follow at or
  below, release on the alternate screen, resize and scroll-off.
- e2e `caretHold` in a real pwsh: a raw-mode program that behaves like Claude's inline view (an
  input row at the bottom, echo there; a "streaming" frame written on a row above that leaves the
  cursor there). Asserts the textarea stays on the input row while the frame parks the cursor
  above, that typing keeps it there, and that at a plain prompt after the program ends the
  textarea follows xterm's cursor as before.

## Plan

1. `termCaretHold.ts` + tests (reducer: `key(t)`, `cursor(line, x, t)`, `release()` -> hold or none).
2. Wire in `TerminalPanel.createSession`: `onKey` -> key; `onCursorMove` -> cursor with the
   absolute line; if held, set `.xterm-helper-textarea` left/top from the caret; `onResize` and
   buffer change -> release.
3. e2e `caretHold`, failing first on main.
4. CLAUDE.md rule, core and app patch bump, full unit + e2e, PR, "merge?". No install.
