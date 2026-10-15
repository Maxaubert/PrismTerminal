/**
 * HOW THE TOP BAR FITS MANY TABS (#146; owner, 2026-10-15, option C of the
 * mockups: "icons first, then the list"). Pure, so the rule has tests.
 *
 * In three steps, each only when the one before has run out of room:
 *  1. every tab named, shrinking equally to its floor (as before);
 *  2. tabs at rest become their icon; the tab in front and the tabs that need
 *     you (Finished, Question, Failed) keep their names, and if that is still
 *     too wide, the ones that need you become icons too, newest first;
 *  3. tabs go into the +N list: resting ones first, newest first, then those
 *     that need you. The tab in front is never an icon and never hidden.
 * Order never changes: a hidden tab is simply not drawn.
 */

export type StripSlot = 'full' | 'icon' | 'hidden'

/** A named tab's floor (TabStrip's min width since 2026-10-12). */
export const TAB_FLOOR = 84
/** An icon tab: the 18 px icon and 11 px either side. */
export const ICON_TAB = 40
/** The +N button, with its count, dots and chevron. */
export const MORE_BUTTON = 72

export function planStrip({
  ids,
  activeId,
  needs,
  room
}: {
  ids: readonly string[]
  activeId: string | null
  /** Tabs that need you: they keep their names longest, and hide last. */
  needs: ReadonlySet<string>
  /** The strip's width for tabs and the +N button (the + left out). */
  room: number
}): StripSlot[] {
  const n = ids.length
  if (n * TAB_FLOOR <= room) return ids.map(() => 'full')
  const slot: StripSlot[] = ids.map((id) => (id === activeId || needs.has(id) ? 'full' : 'icon'))
  const width = (): number => {
    let w = 0
    let hidden = false
    for (const s of slot) {
      if (s === 'full') w += TAB_FLOOR
      else if (s === 'icon') w += ICON_TAB
      else hidden = true
    }
    return w + (hidden ? MORE_BUTTON : 0)
  }
  const fits = (): boolean => width() <= room
  // Newest first: the end of the bar gives way before its start.
  const order = ids.map((_, i) => n - 1 - i)
  // 2b. The tabs that need you become icons: their marks stay on screen.
  for (const i of order) {
    if (fits()) return slot
    if (slot[i] === 'full' && ids[i] !== activeId) slot[i] = 'icon'
  }
  // 3. Into the list: resting tabs first, then those that need you.
  for (const wanted of [false, true]) {
    for (const i of order) {
      if (fits()) return slot
      if (slot[i] === 'icon' && needs.has(ids[i]) === wanted) slot[i] = 'hidden'
    }
  }
  return slot
}
