# Command help as a side panel (#199)

Owner, 2026-10-13: "I want to move the command helper to instead of being a pop-up window, I want it to
be a sidebar that animates from the side ... and overlays over the terminal, like not the whole terminal,
but sort of like Microsoft often uses this in their things, like a copilot studio, power automate".
Mockups: `docs/research/2026-10-13-help-panel/` (round 1: sheet, floating card, category rail; the owner
picked the sheet, then layout 2 of four row layouts, "settled on this").

## What it is
- A **sheet** flush to the right edge of the terminal's column, under the title bar, the full height,
  on the opaque surface (`--p-side-flat`), one divider line and a soft shadow on its left edge.
  620 px by default (`prism.help.panelWidth`, 420-1100, never more than the column less 120 px).
- **Animation:** slides in on a 460 ms exponential ease-out, out on a 260 ms ease-in; the rows rise in
  just after it lands. Reduced motion: none.
- **Not a dialog:** no scrim, no focus trap. The terminal beside it stays readable and usable; the panel
  stays out across a click into the shell and a tab switch (the new shell gets the keyboard). F1, the ?
  button and the menu's Command help toggle it; Escape inside it and its X close it. Find and the panel
  share the top right: the one opened last wins.

## Rows (owner's words, 2026-10-13)
- Two columns: what you want on the left (two lines at most), the command on the right in a quiet
  recessed block ("the fields stand out too much"), its copy button inside the block. No syntax colours
  ("not needed").
- **The whole row copies** ("the whole row should be clickable to copy not just the icon"); Enter copies
  the keyboard's row.
- **The copy icon turns into a check** that draws itself, green, for 1.4 s; the app's "Copied" badge is not
  raised for these copies (a success said once; `copyTextQuietly`).
- **Stripes** on every other row ("have the rows alternate like before"), a hover a step lighter and the
  keyboard's row lighter still ("the alternation colour cant be the same as the highlight colour").
  Square corners, about 36 px tall ("a bit too tall").
- **Nothing marked** until Up or Down; the pointer over the list takes the mark away ("why is this row
  always highlighted").
- **No warning labels or tags** ("remove warning labels and similar tags"): the danger sentence stays for
  screen readers only.
- **No trailing placeholder words** ("dont say folder the user understand"): `Set-Location FOLDER` reads and
  copies as `Set-Location ` (`blankless`). 236 rows lose their blank; 292 keep one, because it sits in the
  middle or in quotes (`Remove-Item FOLDER -Recurse -Force`, `git commit -m "MESSAGE"`), where dropping it
  makes a different command. **Open for the owner:** reorder or rewrite those, or leave them.
- Category headings, the title, chips, count and key hints are not selectable ("dont let the headers be
  selectable"); the commands are.
- The resize edge draws nothing ("remove it").

## Unchanged
Search, the shell chips, the catalogue and its rules, "it shows and copies, nothing else": the panel still
cannot reach a shell. Prism does not mount command help.
