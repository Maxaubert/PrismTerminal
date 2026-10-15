# Many tabs in the top bar (#146)

Owner, 2026-10-10: "we don't really have a system to control what happens when there are a lot of
tabs. Currently they just squeeze together more and more and you get a scroll bar". 2026-10-15: "lets
tackle when theres very many tabs". Mockup round the same day (four options: scroll with arrows, a
list, icons then a list, extra rows); **the owner picked C, icons first, then a list**.

Scope: the horizontal tab bar only (`TabStrip`). The sidebar layout already lists any number of tabs.
App shell (`src/`), not the core: Prism has its own strip.

## What the bar does

The bar lays tabs out in up to three steps, each only when the one before has run out of room.

1. **As today:** every tab one width, 150 px, shrinking equally to its floor of 84 px.
2. **Icons:** when the tabs no longer fit at 84 px, tabs at rest shrink to their icon (36 px), with
   their mark (ring or Bar) on the icon's corner. These keep their name:
   - the tab in front;
   - tabs that need you: Finished, Question, Failed.
   A working tab at rest is an icon too; its spinner stays on the corner.
   If the named tabs plus the icons still don't fit, the tabs that need you become icons as well
   (their marks stay on screen). The tab in front always keeps its name.
3. **The list:** when even the icons don't fit, tabs go behind a **+N** button at the end of the bar,
   just before the **+**. Resting tabs go first, newest first; a tab that needs you goes only when
   no resting tab is left. The tab in front is never in the list.

Order never changes: tabs keep their place in the bar, a hidden tab simply is not drawn.

## The +N button and its list

- **The button:** `+N` and a small dot for each hidden tab that needs you, in its mark colour (up to
  four), and a chevron. Its tooltip says "N more tabs".
- **The list:** opens under the button. A **Find a tab** field at the top, focused, filters by name
  and folder as you type; Enter picks the first match, Escape closes.
- Rows: the agent icon, the name, the folder (dim), and the tab's mark. Tabs that need you come first
  under **Needs you**, the rest under **Other tabs**, each group in bar order.
- Picking a row makes that tab the one in front. It then shows in the bar (the tab in front is
  always shown), and whichever tab no longer fits goes into the list.
- A right click on a row opens that tab's usual menu.

## Keys

- **Ctrl+Shift+K (Find a tab)** in the top-bar layout opens the list with its field focused, with
  every tab in it (not only the hidden ones), so it finds any tab. Today it does nothing in this
  layout.
- Ctrl+Tab, Ctrl+1..9 and the rest work as now; a hidden tab they pick comes into the bar.

## Details

- An icon tab's tooltip is the same as a named tab's: the name, the folder, the state (Tooltips,
  placed by the whole tab since #223).
- An icon tab is a drag handle like any tab (`useTabReorder`). Hidden tabs are not draggable; the
  list does not reorder.
- An icon tab has no close button (40 px holds the icon and its mark): it closes with a middle click,
  its right-click menu or Ctrl+W, as any tab does.
- The layout is recomputed from the bar's measured width (a ResizeObserver) and the tab list, never
  from a timer. Tabs do not animate between steps (no motion on resize).
- Screen readers: icon tabs keep their name as the accessible name; the +N button is a menu button
  ("12 more tabs"); the list is a `listbox` with the field as its combobox.

## Out of scope

- The sidebar, Prism's strip, a suggestion to switch to the sidebar.
- Pinned tabs, tab groups.

## Tests

- Unit: `planStrip` (pure): widths in, `full | icon | hidden` per tab out. Cases: fits; icons start;
  needs-you keep names; needs-you become icons before anything hides; resting tabs hide first,
  newest first; the tab in front is never an icon or hidden; one huge count.
- e2e (parked, headless): 30 tabs in a 1100 px window: no horizontal scrollbar on the strip; icon
  tabs present; the tab in front named; a +N button whose count plus the drawn tabs equals 30;
  opening the list and picking a row brings that tab in front and into the bar; Ctrl+Shift+K opens
  the list with its field focused. Screenshot `.e2e-shots/strip-many.png` to look at.

# Plan

1. `src/renderer/src/lib/stripPlan.ts`: `planStrip({ tabs, activeId, needs, room })` plus tests.
2. `TabStrip.tsx`: measure the strip (ResizeObserver), call `planStrip`, draw `full` tabs as now,
   `icon` tabs as a compact variant (icon, mark on the corner, no close button), skip `hidden`;
   add the `+N` button. Remove `overflow-x-auto` from the strip.
3. `src/renderer/src/components/TabOverflowList.tsx`: the list (field, groups, rows, keyboard),
   reusing the menu panel's surface and `TabIcon` / `TabMark`.
4. `App.tsx`: `find-tab` in the top-bar layout opens the list (an event the strip listens for, as the
   sidebar does).
5. e2e scenario `manyTabs` in `tools/e2e/run.mjs`.
6. Version bump (app only), PR, install for the owner to try, merge on the owner's yes.
