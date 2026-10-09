# Indicator styles and the Prompt tab style (#143)

Date: 2026-10-10. Issue: #143. Branch: `feat/143-indicator-styles`.
Status: approved by the owner through the mockups ("go ahead and build", 2026-10-10).

Mockups, the source of truth for the look (read their CSS, not only the pictures):

- `research/prism-terminal/mockups/2026-10-10-prompt-style/index.html` (+ `overview.png`): the
  Prompt tab style, its arrow-edge indicator, the approved working pulse, the flowing rainbow edge.
- `research/prism-terminal/mockups/2026-10-10-indicators-r4/index.html` (+ `overview.png`): Minimal,
  Ring and Full (the mockup's "C. Solid") with the name-colour rule.
- The rainbow WASH strips in both (a, b and c) are DROPPED.

## 1. What the owner decided

In the owner's words, 2026-10-10 (the request that started this build):

> "Let's drop the tab style where the indicators style for completion where the tab is fully filled
> out in that rainbow color. Let's just keep the like that border that moves slowly. The pulsation
> effect is also now exactly what I want it. And I like the gentle pulse too for questions. Make
> sure that's also applied to the minimal style for normal tabs. And yeah, I think you can
> basically go ahead and build if you want."

So: no rainbow wash anywhere; finished is the flowing rainbow line or edge; the working pulse on the
Prompt edge is the approved one; the question's gentle pulse applies everywhere, Minimal on normal
(Classic) tabs included.

On the issue, 2026-10-10 ("Full (Solid): one name colour, owner's rule"):

> "Every tab name in Full uses the theme's own text colour, on every tab, idle ones included ... A
> filled tab changes its name to the opposite colour (black on a dark theme, white on a light theme)
> only when the theme's text colour would read under 2:1 on that state's full fill colour ... The
> choice is made once per state colour, from the fill at full strength. It never changes per
> animation frame."

From the issue body (2026-10-09): remove the small icon (the brain) inside a working tab; the active
tab must stay obvious in every state; a lighter style that is only the resume ring/spinner. Round 2:
"Ring v2. The spinning ring stays, but only while the agent is working. Finished, question and failed
... use Minimal's lines"; "Rainbow finished, an option for every style ... It must still read as
finished ... by its shape too and not only its colour."

### The decisions, as built

| | Decision |
|---|---|
| Tab styles | A new setting, this app's own: **Classic** (today's strip) and **Prompt** (chevron segments). |
| Separators | None between tabs in either style: the `border-r` on every tab goes. |
| Indicator choices | **Off, Minimal, Ring, Full.** Today's Full (the accent fill that hid the active tab) and the brain icon go. |
| Minimal, Classic | Working: today's running bar. Finished, question, failed: a straight 3 px bottom line in their colour. No dashes, no double lines. |
| Minimal, Prompt | The arrow edge to the right of the segment IS the mark. Working: the approved pulse. Finished, question, failed: the whole edge in their colour. |
| Ring | The resume ring beside the name while working, on any tab; every other state is the tab style's Minimal mark. |
| Full | Every marked tab NOT in front is filled solid (opaque) in its state colour. The tab in front is never filled and shows Minimal's mark. Finished is the icon's dark badge with the flowing rainbow along its foot. |
| Name colour in Full | Theme text everywhere; a fill flips it to the opposite only below 2:1, decided per state colour. |
| Question | A gentle pulse in every style: fades all the way to the ground and back, 2 s. |
| Finished | The icon's rainbow, flowing slowly (line 8 s a lap, edge 7 s), each colour moved to the 3:1 floor. A **Rainbow finished** switch, ON by default; off is today's finished colour. |
| Failed | Steady red. Working wears the accent, as today. |
| Reduced motion | Everything still: rainbow static, working pulse at full, the run a full line, question solid, the ring a still arc. |
| Kept | Lines only on tabs not looked at (the attention rules), the taskbar badge, the Finished / Question / Failed switches. |

**Off stays.** The owner's list names Minimal, Ring and Full; Off was not mentioned and removing it
would silently change what a user who chose it sees. It stays as the first choice. (Owner may say
otherwise; it is one entry in a list.)

**Classic, not "Current".** The owner called it "Current (today's strip)". A choice cannot be named
Current once there are two, so the label is **Classic** (stored `classic`). One string to change if
the owner prefers another word.

## 2. The core / app split

How Prism consumes the indicator today (Prism `952e309`, read only):

- Prism draws its OWN tab strip (`src/renderer/src/components/TabStrip.tsx`). From the core it takes
  `useAgentIndicator` (termLook), `useAgentColors`, `useAgentIndicator` (the rules hook), and the
  settings section `AgentMarksSection` (Agents page).
- Its strip knows `'off' | 'minimal' | 'full'`, where `full` is the old fill.
- Its gate (`tools/e2e/run.mjs`, `termOptionsScenario`) reads `options.ts` as TEXT and asserts the
  Agents page shows exactly the non-`onlyWhere` rows of that list, clicks "Full" in
  `agent-indicator` and expects `data-agent="full"`. Its unit test `appOptions.test.ts` asserts
  `ROW_ORDER` holds every id in `TERMINAL_OPTIONS` (onlyWhere rows included).

So a new row in `TERMINAL_OPTIONS` would turn Prism's unit test red at the next core bump, and a new
row drawn by `AgentMarksSection` would turn its gate red. The core-release automation merges a bump
only when Prism's checks are green, so either would stall the pipeline. The split:

### In the core (shared, because Prism must look and behave the same once it adopts the marks)

1. **The indicator store** (`core/renderer/lib/termLook.ts`): `AgentIndicator` becomes
   `'off' | 'minimal' | 'ring' | 'full'`. The stored value is read through a pure validator,
   `readIndicator(raw, allowed, fallback)`, against what the HOST draws (below). A stored `full`
   reads as `full` (in this app that is now the new Full; nothing is rewritten). A stored value the
   host does not draw (`ring` in Prism) reads as the host's default. `applyCustomExtras` writes a
   saved Custom's `indicator` only through the same validator (it wrote it unchecked).
2. **The rainbow switch** (`termLook`): `prism.term.agentRainbow`, on unless `'0'` (the Finished /
   Question / Failed switches' shape). Not theme-bound: a theme pick never touches it.
3. **The pure rules**, each with its own test file:
   - `lib/markColours.ts`: `ICON_RAINBOW` (the seven colours of `build/icon-source.png`, as the
     mockups sampled them: `#12cee5 #2179fa #945af5 #e84fd2 #fb7f6c #f0a934 #e8d021`), `floorMark`
     (a colour moved to a contrast floor against EVERY ground it can sit on: darkened toward black
     on a light ground and lightened toward white on a dark one, keeping its hue), `rainbowOn`
     (the seven, floored), `rainbowGradient` (the looping gradient string, along x or y),
     `opaqueOver` (a see-through colour composited on the solid ground, since Full is opaque).
   - `lib/nameInk.ts`: the owner's flip rule. `nameInk(fill, text, groundIsDark)` is `text` when
     `contrast(text, fill) >= 2`, else `#0b0b0b` on a dark theme and `#ffffff` on a light one.
     Dark or light is MEASURED from the ground, never read off a name (regression rule 15).
   - `lib/tabMark.ts`: `resolveTabMark({ indicator, tabStyle, state, active, rainbow })` answers
     WHICH mark a tab wears: `none | run | line | edge | ring | fill`, its colour role
     (`working | rule | done | rainbow | badge | question | failed`) and its motion
     (`run | grow | breathe | flow | ride | still`). Both styles and every rule of section 1 live
     here, so the strip only draws what it is told.
4. **The motion, once** (`core/renderer/styles/marks.css`, new; imported by each host's
   `index.css`): the keyframes and classes for the run, the edge grow, the question breathe, the
   rainbow flow, the Full working ride and the reduced-motion rules. The core has had no CSS file;
   a host that does not import it simply gets still marks.
5. **The flat-tab marks component** (`core/renderer/components/TabMark.tsx`, props only): draws a
   `run`, `line`, `ring` or `fill` (with the badge and its rainbow foot, and the riding bar) from
   `resolveTabMark`'s answer. Prism's strip can mount it when it adopts the marks.
6. **The declared difference** (`core/renderer/host.ts`): a new OPTIONAL field

   ```ts
   /** What the host's tab strip draws (#143). Absent: Off, Minimal and Full, where Full is the
    *  host's own filled tab, and no Rainbow finished row (Prism, until it adopts the marks). */
   tabMarks?: { indicators: readonly AgentIndicator[]; rainbow: boolean }
   ```

   Optional, so Prism's `termHost.ts` still typechecks unchanged and Prism's look, rows and gate
   are untouched until the owner decides Prism adopts the marks. Adding a `TermHostConfig` field is
   an owner decision: this one is recorded here and named in the PR for the owner's yes.
7. **The settings rows** (`core/renderer/settings/sections/AgentMarksSection.tsx`): the indicator's
   choices come from `tabMarks?.indicators` (Off, Minimal, Full where absent); its subtext per
   choice. The **Rainbow finished** row is drawn only where `tabMarks?.rainbow`, right after "Mark
   tabs when an agent finishes". It is listed in a NEW core list, `settings/markOptions.ts`
   (`MARK_OPTIONS`, flat one-line entries like the others), NOT in `TERMINAL_OPTIONS`: the pattern
   `helpOptions.ts` set ("a row there would fail Prism's parity check until Prism wires the
   popup"). `agent-indicator` stays in `TERMINAL_OPTIONS` with its id, label and key unchanged
   (Prism's gate reads them); only its keywords grow.

### In this app (`src/`)

1. **The tab style setting**: `lib/tabStylePrefs.ts` (`prism.window.tabStyle`, `classic` default,
   anything else reads as `classic`), the row `tab-style` in `appOptions.ts` (Appearance > Window,
   right after Tab width), its `settingsIndex.ts` entry, drawn by the Appearance page.
2. **The strip** (`components/TabStrip.tsx`): no separators; the old Full, `onTint` and the brain
   slot removed; each tab asks `resolveTabMark` and mounts the core's `TabMark` (Classic) or hands
   its mark to the Prompt edges (Prompt).
3. **Prompt** (`components/PromptEdges.tsx` + pure `lib/promptGeometry.ts`): the segment shapes,
   the edge bands and the active tab's top rule, as section 4 describes.
4. **The chrome tokens** (`lib/chromeTheme.ts`): `--p-seg` and `--p-seg-on`, the segment grounds
   (the theme text mixed into `--p-tabs` at 4% and 11%, the mockups' values), from the SOLID ground
   so acrylic does not halve them. The `:root` fallbacks in `index.css` are recomputed (CLAUDE.md:
   they are `chromeTokens` output for the `prism` preset).
5. **The host config** (`termHost.ts`): `tabMarks: { indicators: ['off', 'minimal', 'ring', 'full'], rainbow: true }`.

## 3. The marks, state by state

`state` is what TabStrip already works out, unchanged: working (any tab, active included), else
question > failed > done, each only on a tab not looked at and behind its switch. Colours are
`useAgentColors()` as today; `rule` is `--p-accent-hi`.

| indicator | state | Classic, not in front | Classic, in front | Prompt, not in front | Prompt, in front |
|---|---|---|---|---|---|
| Minimal | working | run (working) | run (working) | edge grow (working) | edge grow (rule colour, joins the top rule) |
| Minimal | done | line flow (rainbow) | same | edge flow (rainbow) | same |
| Minimal | question | line breathe (question) | same | edge breathe | same |
| Minimal | failed | line still (failed) | same | edge still | same |
| Ring | working | ring beside the name | same | ring beside the name, no edge | same |
| Ring | other | as Minimal | as Minimal | as Minimal | as Minimal |
| Full | working | fill (working) + ride in the name ink | Minimal's run | fill on the segment + ride | Minimal's edge grow |
| Full | done | fill (badge `#383c44`) + rainbow foot line, flow | Minimal's | segment badge + foot line | Minimal's |
| Full | question | fill breathe (name ink fixed) | Minimal's | segment fill breathe | Minimal's |
| Full | failed | fill still | Minimal's | segment fill still | Minimal's |
| Off | working | none | none | none | none |
| Off | other | as Minimal | as Minimal | as Minimal | as Minimal |

- **Rainbow finished off**: `done` is the finished colour, still; Full's done fill is then the
  finished colour (no badge), its name by the flip rule.
- **Off** keeps today's meaning: no working mark; the attention marks still show behind their
  switches.
- **Full's fill is opaque**: a see-through working colour (#112) is composited over
  `--p-bg-solid` first. The name ink is `nameInk(fill at full strength, --p-text, dark)`, chosen
  once per state colour, so the breathing question's name never changes mid-fade.
- **The ride** (Full, working, not in front): a 2 px bar, 40% of the tab, riding along the foot,
  3 px above the bottom, in the name ink (`ride`, 1.4 s), as the mockup's `.sf::after`.
- **The badge**: the icon's dark ground as the mockup has it, `#383c44`. The rainbow on it is
  floored against the badge (3:1), not the strip.

## 4. Prompt geometry (from the mockup, MEASURED there)

- A segment's arrow is 12 px deep; the next segment's notch is parallel (12 px), the segments
  overlap by 9.5 px (`margin-right: -9.5px`), so the ground-coloured chevron between two segments,
  the **edge**, is 2.5 px across (2 px square to the slant, the top rule's own width).
- Padding `0 22px 0 14px`; the first segment has no notch (`padding-left: 10px`); the last keeps
  `margin-right: 4px` before the +. Fixed width: `flex: 0 1 122px`, min 72 px. Dynamic width: the
  label sizes the segment as Classic does, plus the arrow's room.
- Segments are `--p-seg`; the tab in front is `--p-seg-on`, its name bold.
- **The edge band** is drawn in the STRIP, behind the segments, from 1 px inside this segment to
  1 px inside the next, so both segments' own shapes cut it and it fills the gap flush, tip to both
  corners. The last segment's band stops on the notch line it would have. Bands are placed from the
  measured boxes (ResizeObserver on the strip and each segment) and MOVED, never rebuilt, so a
  resize does not restart an animation. During a carry a band rides its tab's `translateX`.
- **The top rule** of the tab in front is drawn in the strip above the segments, cut along the
  arrow's slant at its right end and the notch's at its left, running 0.5 px past the slant (the
  mockup's SEAM: inside the segment the clip left a one-pixel darker hairline, MEASURED there at
  about 80% brightness at 4x).
- **Working** grows the edge: empty 0.2 s, from the tip out to both corners 0.6 s, full 0.2 s, back
  0.6 s (`grow`, 1.6 s, `cubic-bezier(.45, 0, .55, 1)` per leg); a solid fill scaled from the tip's
  row, the chevron clip shaping it, so both arms reach their corners on the same frame. On the tab
  in front it wears the rule's colour, so at full length rule and edge read as one line bending
  down.
- **Finished**: the rainbow runs down the edge, the whole ribbon in the edge's height, 7 s a lap.
- The hit area of a segment is its clip shape; the notch area belongs to the next tab.

## 5. Motion

| name | what | timing |
|---|---|---|
| `run` | today's running bar (`p-agent-run`) | 1.25 s, as today |
| `grow` | the Prompt edge pulse | 1.6 s loop: hold 0.2, grow 0.6, hold 0.2, shrink 0.6 |
| `breathe` | question: opacity 1 to 0 and back, cosine-sampled linear keyframes | 2 s |
| `flow` | rainbow: the gradient slides one tile per lap, the mark itself never moves | line 8 s (tile = 114 px), edge 7 s (tile = the edge's height) |
| `ride` | Full working bar in the name ink | 1.4 s |
| `spin` | Ring | 1 s, as the resume ring |

`prefers-reduced-motion: reduce`: no animation at all; the run and the ride are full width, the
edge is full, the question is fully on, the rainbow stands still, the ring is a still arc with two
coloured sides.

## 6. Colour floors

- Every mark is held to **3:1** against EVERY ground it can sit on: `--p-tabs` (the bare strip) and,
  under Prompt, `--p-seg` and `--p-seg-on`. Working, finished, question and failed already come
  floored from `useAgentColors`; the rainbow is floored per colour by `floorMark` (on Paper the
  mockup darkened every colour that fell short, keeping its hue: lowest 3.01:1).
- The Full badge's rainbow is floored against `#383c44`.
- Full's names follow the flip rule (2:1), the owner's rule, not 4.5:1: legibility on Full is the
  owner's call and the mockup's numbers stand (Volt: working flips, 17.1:1; question 3.2:1, failed
  3.1:1 and the badge 9.7:1 keep the theme text).

## 7. Settings

| Row | Where | Values | Subtext (at most eight plain words) |
|---|---|---|---|
| `tab-style` (app) | Appearance > Window, after Tab width | Classic, Prompt | "Flat tabs, or arrows like a prompt." |
| `agent-indicator` (core) | Agents > Tab marks | Off, Minimal, Ring, Full | per choice: "No mark while an agent works." / "A line under the tab while it works." / "A spinner by the name while it works." / "Tabs you are not on fill with colour." |
| `agent-rainbow` (core, `MARK_OPTIONS`) | Agents > Tab marks, after "Mark tabs when an agent finishes" | switch, on | "The colours of the app icon, flowing." |

All three are in Find a setting (`settingsIndex.ts`) with keywords (tab-style: "chevron arrow
segment shape powerline"; agent-indicator adds "ring spinner solid fill"; agent-rainbow: "colors
gradient finished done icon"). The label of the rainbow row: "Rainbow finished mark". New tile
icons: `prompt` (a chevron) and `rainbow` (an arc) in `layout/icons.ts`.

## 8. What does not change

- `useAgentIndicator` (the rules hook): who is working, done, asked or failed is untouched.
- The attention rules, the taskbar badge and its count, the switches.
- Prism: its strip, rows, defaults and gate. The core bump changes nothing it draws.
- The resume spinner (`data-tab-loading`) while a tab resumes at launch.

## 9. Risks

- **Prism's gate at the bump.** Held by: no new `TERMINAL_OPTIONS` row, the optional host field,
  the indicator reader refusing values the host does not draw. Verified before the PR by running
  Prism's `appOptions` unit test and its `termOptions` gate against this core in a Prism worktree
  (read only, nothing committed there).
- **Prompt hit-testing and drag.** clip-path shapes the target; the carry and the drop slots
  measure the boxes, which overlap by 9.5 px under Prompt; `lib/tabDrop` gets a test for that.
- **A parallel branch** (`fix/144-question-stays`) changes question logic in `useAgentIndicator`;
  this work does not touch that file, so a rebase is mechanical.
