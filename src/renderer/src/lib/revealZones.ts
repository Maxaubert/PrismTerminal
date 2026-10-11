import { REVEAL } from './hoverReveal'

/**
 * WHERE THE POINTER KEEPS A REVEALED PANEL (#162; owner, 2026-10-11: "make it
 * appear at one level but disappear a bit further down, i should be able to
 * have the cursor 2-3 px off the titlebar before it disappears"). One rule for
 * the page's own pointer moves and for main's reading of the cursor
 * (edgeWatch.ts), which is the only one there is over a drag region.
 *
 * Hidden, a panel comes at its edge's zone (the top 16 px, the left 24 px).
 * Shown, it stays while the pointer is on it or within KEEP of its far edge:
 * the way out is a little further than the way in, so a hand resting on the
 * bar's bottom edge does not flicker it.
 */
export const KEEP = 4
/** How far outside the window still counts as at its edge: the resize
 *  border's band, where Windows has the pointer (edgeWatch's `outside`). */
const BORDER = 8

export interface Point {
  x: number
  y: number
}

/** The pop-out title bar, starting at `left`, `height` tall. */
export function barWants(p: Point | null, shown: boolean, left: number, height: number): boolean {
  if (!p || p.x < left || p.y < -BORDER) return false
  if (p.y <= REVEAL.top) return true
  return shown && p.y <= height + KEEP
}

/** The collapsed sidebar, from `top` down, `width` wide. */
export function sideWants(p: Point | null, shown: boolean, top: number, width: number): boolean {
  if (!p || p.y < top || p.x < -BORDER) return false
  if (p.x <= REVEAL.left) return true
  return shown && p.x <= width + KEEP
}
