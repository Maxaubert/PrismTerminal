/** One tab's place in the strip, frozen when a drag starts. */
export interface Lane {
  left: number
  width: number
  mid: number
}

/**
 * The slot a carried tab asks for, in `reorderTabs`' terms (the index in the
 * list as it was, so passing lane j going right is j + 1).
 *
 * The LEADING EDGE decides, not the tab's centre (#125; owner, 2026-10-04: "i
 * cant drag that github tab to the left of the prism tab"). The tab is clamped
 * to the strip, and a centre had to pass the first tab's centre: a tab as wide
 * as the first or wider could never get there, so first place was out of
 * reach. An edge reaches the strip's own edge, which is past every centre.
 * Going left the carried tab's left edge must pass a lane's middle, going
 * right its right edge must.
 */
export function dropSlot(lanes: readonly Lane[], from: number, dx: number): number {
  const lane = lanes[from]
  if (!lane) return from
  const left = lane.left + dx
  const right = left + lane.width
  let slot = from
  for (let i = from - 1; i >= 0 && left < lanes[i].mid; i -= 1) slot = i
  if (slot !== from) return slot
  for (let i = from + 1; i < lanes.length && right > lanes[i].mid; i += 1) slot = i + 1
  return slot
}
