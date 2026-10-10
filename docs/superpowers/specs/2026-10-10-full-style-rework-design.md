# Full style rework, Prompt on the theme's ground, the switch knob (#154)

Date: 2026-10-10. Follow-up to #143 (PR #147). Amends
[`2026-10-10-indicator-styles-design.md`](2026-10-10-indicator-styles-design.md) sections 3 (Full)
and 4 (the Prompt segments' tokens). Mockup and plan the owner approved:
`research/prism-terminal/mockups/2026-10-10-full-style/` (`index.html`, `overview.png`, `plan.md`).

## The owner's words

- On the mockup (2026-10-10): "Yeah, I really liked the new full style look. For example, as
  displayed in choice one, looks pretty good. Or I mean any of the others. They all look very
  similar to me."
- On the working bar: "on the full style with the minimal bar on the normal tab style. For example,
  if the tab is yellow, like in your example, the working bar that is on that tab, like the minimal
  bar, should be black and not like a faded arc yellow, like it is on some examples."
- On the Settings switches: "keep that to being black on dark themes and white on light themes ...
  only when the color is very close" (flip it, like the tab names).

## Decisions (owner)

| | Decision |
|---|---|
| Choice 1 | **A**: finished is the icon's rainbow, solid, flowing slowly across the WHOLE tab. No badge, no foot line. |
| Choice 2 | **CHANGED** from the recommendation: on a **Classic** tab the Minimal working bar on top of the working fill is the **name's ink** (black on Volt's yellow-green), the same rule as the tab name. On **Prompt** the arrow edge keeps variant **A** (see below). |
| Choice 3 | **A**: nothing added for the tab in front on Prompt; it is Classic's look. |
| Prompt segments | The theme's own tab ground exactly like Classic: an idle segment paints nothing, the tab in front is `--p-tab-active`. `--p-seg` / `--p-seg-on` are removed with their `:root` fallbacks and tests. |
| Switch knob | Black when the theme is dark, white when it is light (measured from the ground, never a name), the opposite only where that reads under 2:1 on the ON track. Decided per colour, never per frame. |

### Why Prompt's edge is not the name's ink (the split in choice 2)

Prompt's working edge sits in the GAP between two segments, and the gap is the strip's ground. On
a dark theme the name's black ink is the ground's own colour there (Volt: 1.0:1) and the edge would
vanish. So the edge keeps variant A: the least 2% step of the working colour toward black or white
that clears 3:1 on BOTH the fill and the ground (`shadeOn`; Volt `#798f15`, 3.2:1 / 5.5:1; Paper
`#1c3e59`, 3.1:1 / 10.1:1). Classic's run sits on the fill alone, so it takes the name's ink.

A MID working colour on a near-black ground (a mid green, Prism's own blue `#4aa5f0`) has no shade
that clears 3:1 on both: a step dark enough to stand off the fill is too dark to stand off the
ground, and none lighter exists. There `shadeOn` hands back the nearest step (measured 2.7 to
2.8:1 on both), never an error.

## The marks, as built

| indicator | state | Classic, not in front | Prompt, not in front | in front (both) |
|---|---|---|---|---|
| Full | working | fill (working) + Minimal's run in the name's ink | fill on the segment + the growing edge in `overlay.grow` | Minimal's |
| Full | done | the rainbow across the whole tab, flowing (`p-mark-flow-fill`, tile 228 px, 14 s) | same, inside the segment's shape | Minimal's |
| Full | question | fill breathe (name ink fixed) | same | Minimal's |
| Full | failed | fill still | same | Minimal's |

Everything else (Minimal, Ring, Off) is unchanged. With the rainbow off, finished is the finished
colour, still.

- `resolveTabMark` (core `lib/tabMark.ts`): a Full working tab not in front is
  `{ place: 'fill', colour: 'working', motion: null, overlay: 'run' | 'grow' }`; finished is
  `fill / rainbow / flow`. `badge` (colour) and `ride` (motion) are gone.
- `markPalette` (core): `fill.done` with the rainbow on is the icon's seven, RAW, as a horizontal
  looping gradient (`rainbowFillX`; a fill is the colour itself, not floored). `ink.done` on the
  rainbow is `rainbowInk(text, dark)`: judged on the WORST colour that can sit under the name (the
  seven stops and the blends at 25/50/75% between them); the text is kept if its worst is 2:1 or
  better, else the opposite if its worst is better (Volt: text 1.4:1 worst, black 4.6:1, so it
  flips; Paper: text 3.5:1, kept). `overlay.run` is `ink.working`; `overlay.grow` is
  `shadeOn(working fill, ground)`. `badgeFoot` and `MARK_BADGE` are gone.
- `marks.css`: `p-mark-ride` is gone; `p-mark-flow-fill` added with its reduced-motion rule.
- `TabMark.tsx`: a fill with `overlay: 'run'` draws the run's own markup on top in the `overlay`
  colour (`data-mark-overlay="run"`); a rainbow fill flows.

## Prompt on the theme's ground

- `TabStrip.tsx`: the tab in front's shape is `bg-[var(--p-tab-active)]`, an idle one nothing (a
  hover `--p-hover`, Classic's). Every mark sits on the one solid ground in both styles.
- The edge band's 1 px tuck (`promptGeometry.edgeBand`) is kept only under a segment that PAINTS
  (a Full fill, or the tab in front on an opaque window): an idle segment is see-through now, and a
  tuck under it would widen the 2.5 px edge to 4.5. The ground-coloured seam is invisible there.
- `chromeTheme.ts`: `SEG_MIX`, `SEG_ON_MIX`, `--p-seg`, `--p-seg-on` removed; `index.css` drops the
  fallbacks.

## The switch knob

- New token `--p-switch-knob`, computed in `chromeTokens` next to `--p-on-accent`:
  `switchKnob(track, darkGround)` (core `lib/switchKnob.ts`) with the track `--p-sel-bg` as the eye
  sees it (composited on the ground). Near-black `#0b0b0f` (the knob's black as before) on a dark
  ground, white on a light one; the opposite only under 2:1 (`NAME_FLIP`, the tab names' line).
- Core `SWITCH_KNOB_ON` is `bg-[var(--p-switch-knob,var(--p-on-accent))]`, so Prism keeps its knob
  until it defines the token. The track is unchanged.
- An opaque accent is held to 3:1 on the ground, which also keeps it at least about 2.2:1 off the
  default knob, so on every preset and every opaque pick the knob is the theme's ink. The flip shows
  on a see-through accent (#114), a fill that can sit right on the knob's colour: a pale one on
  Paper gives a black knob, a deep one on PT Default a white knob.

## Prism

Unaffected. Prism pins an older core and draws its own strip; its `src/` does not call
`resolveTabMark`, `markPalette` or import `marks.css`. The knob token falls back to `--p-on-accent`.
When Prism moves its pin its switches keep their look until it defines `--p-switch-knob`.

## Tests

- Unit: `tabMark.test.ts`, `markPalette.test.ts`, `markColours.test.ts` (`shadeOn`, `rainbowFillX`),
  `nameInk.test.ts` (`rainbowInk`), `switchKnob.test.ts`, `TabMark.test.ts`, `marks.test.ts`,
  `promptGeometry.test.ts` (tucks), `chromeTheme.test.ts` (no seg tokens; the shape source; the knob
  token and its fallback), `switchAccent.test.ts` (the knob on every preset),
  `neutralControls.test.ts`.
- e2e: `indicatorStyles` (the run is the name's ink, black on Volt; the Prompt edge 3:1 on fill and
  ground; the rainbow fill, its ink, its flow and its stillness; idle segments transparent, the tab
  in front `--p-tab-active`), `tabStyle` (the band without tucks), `accent` (the knob on PT Default,
  a picked accent, Paper, a very light see-through accent on Paper, a very dark accent on PT Default).
