# Agent icons on every tab, one tab style per orientation (2026-10-12)

The owner's decisions from the sidebar and tab mockups of 2026-10-12. The mockups are
`scratchpad/sidebar-looks.html` (24 sidebar styles) and `scratchpad/tab-looks.html` (Classic with
icons); both are copied into `docs/research/2026-10-12-tab-looks/` by the plan.

## Decisions (owner, 2026-10-12)

1. **The agent indicator is Ring or Bar.** "from now on agent indicator is only ring or bar, no full."
   Bar is today's Minimal: the 3 px line along the tab's foot. Full is no longer offered in Prism
   Terminal.
2. **The ring sits at the END of the tab, in the close button's place.** "for these tabs with ring
   the ring goes on the right where you close the tab." Hovering the tab swaps the ring for the close
   button. A tab with no ring shows its close on hover and on the tab in front, as today.
3. **One tab style per orientation.** "only has one tab style from now on, so classic and this new
   one for vertical." Along the top: Classic. Powerline is removed. Down the side: the "Icon band" card
   (sidebar mockup 10): a full-height square holding the icon at the card's left, the name and folder
   beside it.
4. **Every tab shows its agent's icon, in both orientations.**
   - Claude Code: **Clawd**, Claude Code's own mascot, in its orange.
   - Codex: the **OpenAI** mark, monochrome (the name's ink).
   - No agent, or another one: a **`>_` prompt**, monochrome.
   - Settings: the cog it has today.
5. **Along the top the icon has no box** ("i dont think i want the icons in a box on the horizontal
   version"): mockup option 3, the icon at the tab's left and the name centred in the room left.
6. **Sizes: 18 px on the top tabs, 18 px in the sidebar** (the owner's picker screenshot). Clawd is
   drawn at the same size as the others ("make the claude icon a bit smaller on the vertical").

## What it looks like

- **Classic tab:** `[icon 18] [name, centred] [end slot: ring, or close on hover]`. The accent rule
  along the top, the faint line at the right and the equal widths stay as they are.
- **Sidebar card:** `[44 px icon band | icon 18] [name / folder] [end slot]`, the card faintly filled,
  the one in front tinted with the accent, the band tinted with it.
- **Bar mode:** no ring; the bar runs along the foot of the tab or card, as Minimal does today.

## Where it lives

- `core/renderer/components/AgentIcon.tsx` (new, core): the icon for an agent kind, drawn inline. Core
  because Prism has tabs too and may adopt it; nothing in Prism changes until it does.
  - Clawd is drawn from Claude Code's own start-screen block art (` ▐▛███▜▌` / `▝▜█████▛▘` /
    `  ▘▘ ▝▝`), one quadrant a pixel, each pixel twice as tall as wide as a terminal cell is.
  - The OpenAI mark is Simple Icons' path (CC0 data; the mark itself is OpenAI's trademark, used
    to name the agent the tab runs, which is the purpose such marks are for).
- `src/renderer/src/termHost.ts`: `tabMarks.indicators` becomes `['ring', 'minimal']`. A stored `off`
  or `full` already reads as the host default through `readIndicator`; the default becomes `ring`.
- The tab parts (`tabParts.tsx`): an `EndSlot` holding the ring and the close, used by both layouts.
- Powerline's own code in `src/` goes: `promptGeometry.ts`, the Prompt branches of `TabStrip`,
  `TabSidebar` and `tabLooks`, the Tab style row and its pref (`tabStylePrefs.ts`; a stored `prompt`
  is simply no longer read). Core's Prompt and Full mark rules STAY: Prism declares no `tabMarks` and
  draws its own Full, and the core carries the superset.

## Answered (owner, 2026-10-12)

1. **Off goes too.** Only Ring and Bar are offered.
2. **"Minimal" is renamed "Bar"** in both apps (the label is core's).
3. **The picks ship fixed.** An icon picker in Settings is a later, separate change.

## Not in scope

The icon picker and colour treatments (answer 3), Prism adopting the icons, any other tab shapes.
