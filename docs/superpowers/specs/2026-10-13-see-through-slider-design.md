# The see-through slider

Owner, 2026-10-13: "can you add a see through slider, now its just a toggle make it a slider only
with it being at 0 by default". Answers the same day:

- **Slider only (owner):** the slider is the ONLY see-through control here. Background colour
  (this app's row) and Background in the theme editor lose their Alpha bar.
- **Part of the theme, like Prism (owner):** "prism has it built into themes, that should stay so
  maybe it should be theme specific for us too", then "Like Prism: an edit". Moving the slider is
  an unsaved edit to the theme in force: Save changes keeps it as Custom, picking another theme
  asks first (the existing question) and drops it. Every preset's own level is 0.
- **Prism unchanged (owner):** Prism's see-through stays in its themes; the core's row in Prism
  (`acrylic.kind: 'style'`, "Acrylic terminal background") keeps its switch.

This reverses #114's "alpha built into the colour pickers, not a separate opacity setting" (owner,
2026-10-03) for the window's see-through only. Other colours keep their alpha (the accent's fills,
the mark colours, a Custom's selection).

## The row (this app only)

`term-acrylic` stays the row's id. Where the terminal owns the window acrylic it holds a slider,
0-70 in percent with the value beside it (0 reads "Off"), 70 being today's 30% alpha floor. Under
Windows 10 the row stays disabled with "Needs Windows 11.". A level paints the window's ground at
alpha `1 - level/100`; 0 is the material off and a solid window.

## Storage

- New key `prism.term.seeThrough`, an integer percent, a THEME EXTRA like the agent colours:
  `resetTermExtras` removes it on a theme pick, Save changes stores it in Custom (`seeThrough`),
  `applyCustomExtras` puts it back. `termAcrylic()` is `level > 0` in a window host (its readers
  are unchanged); in Prism it is the old switch, untouched.
- `termGroundAlpha()` in a window host is `1 - level/100`, never read off a colour.
  `paintsAlpha`'s default levels and `withGroundAlpha` go there: the slider is the level.
- Save changes' dirty check compares the level with the theme's own (preset 0, Custom its saved
  level) in place of the old acrylic flag and ground byte.

## Migration, once (a window host, `prism.term.seeThrough` absent)

- The old switch off: 0. On: the see-through the window painted by the old rule,
  `round((1 - oldGroundAlpha) * 100)`, clamped 1-70. Nobody's window changes on update.
- A picked Background is written back opaque. A saved Custom gets `seeThrough` from its old
  `acrylic` and `bg` alpha by the same rule, its `bg` opaque, `acrylic` dropped.
- The old key `prism.term.acrylic` is removed.

## Must not regress

- The #114 and #156 entries in `docs/two-apps.md` are rewritten to this.
- The panel paints the ground, xterm's canvas is clear (rule 14) and material before colour
  (rule 12): unchanged.
