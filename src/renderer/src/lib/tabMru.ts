/**
 * MOST RECENT TAB SWITCHING (#158), as pure data: the most-recently-used list
 * of tab ids (front = the tab in front) and the walk Ctrl+Tab takes over it.
 *
 * The walk is a SNAPSHOT of the list taken at the first Tab of a Ctrl hold, and
 * the list is only reordered when the hold ends (Ctrl released, or the window
 * losing focus), the way browsers and VS Code do it. Reordering on every press
 * would make the second Tab flip straight back to where it started (a
 * ping-pong), so a long hold could never reach an older tab.
 */

/** Tab ids, the one in front first, then the one used before it, and so on. */
export type Mru = readonly string[]

/** One Ctrl hold: the list as it was at its first press, and where it is. */
export interface Walk {
  readonly list: Mru
  readonly at: number
}

/** The tab came to the front. The same list back when it already was. */
export function touchMru(mru: Mru, id: string): Mru {
  if (mru[0] === id) return mru
  return [id, ...mru.filter((t) => t !== id)]
}

/**
 * Follow the strip: closed tabs leave, tabs the list has not seen join after
 * the known ones in strip order (the effect that calls this then touches the
 * one in front, so a new tab, which is activated, lands first). An empty list
 * (a launch, or a restore that settled every placeholder under a new id)
 * starts from the tab in front, then the strip.
 */
export function syncMru(mru: Mru, tabIds: readonly string[], activeId: string | null): Mru {
  const open = new Set(tabIds)
  const kept = mru.filter((id) => open.has(id))
  if (kept.length === 0) {
    return activeId && open.has(activeId) ? [activeId, ...tabIds.filter((id) => id !== activeId)] : [...tabIds]
  }
  const known = new Set(kept)
  const added = tabIds.filter((id) => !known.has(id))
  return added.length === 0 && kept.length === mru.length ? mru : [...kept, ...added]
}

/** A walk needs somewhere to go: with one tab or none there is none. */
export function startWalk(mru: Mru): Walk | null {
  return mru.length < 2 ? null : { list: [...mru], at: 0 }
}

/** Tab goes one further back (1), Shift+Tab the other way (-1). Wraps, so a
 *  fresh Shift+Tab lands on the oldest. */
export function stepWalk(walk: Walk, dir: 1 | -1): Walk {
  const n = walk.list.length
  return { list: walk.list, at: (walk.at + dir + n) % n }
}

export function walkTarget(walk: Walk): string {
  return walk.list[walk.at]
}
