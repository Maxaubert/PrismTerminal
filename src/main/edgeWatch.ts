import type { BrowserWindow, Point, Rectangle } from 'electron'
import { REVEAL_ZONE } from '@shared/revealZones'
import type { EdgeNear } from '@shared/types'

/**
 * THE POINTER AT THE WINDOW'S TOP OR LEFT EDGE, AS WINDOWS SEES IT (#162
 * follow-up; owner, 2026-10-11: "the title bar doesnt always appear when im
 * near the edge, especially on windowed mode, maximized seems a bit more
 * stable there").
 *
 * The page cannot see this reliably. On a window that is not maximized the
 * outermost pixels of a frameless window are Windows' own resize border: the
 * pointer there belongs to the frame, and the page gets no move at all. Over a
 * drag region (the sidebar's head) it gets none either. Maximized there is no
 * resize border, which is why it held there. So main reads the cursor itself,
 * a few times a second and only while the page has asked, and says when it is
 * at the top or the left edge, content-relative.
 */

/** How far inside the content edge counts as "at" it, and how far outside it
 *  (the resize border's own band), in DIPs: the shared REVEAL_ZONE. */
export const EDGE = { ...REVEAL_ZONE, everyMs: 50 } as const

export type { EdgeNear }

/** How far outside the content the cursor is "far": well past the resize
 *  border's band (`outside`) and anything the page reads (the slid-out
 *  sidebar lies inside the content). */
export const EDGE_FAR_DIP = 48
/** What the page hears for a cursor far from the window: at no edge, and up
 *  and to the left of everything, where no reveal zone reaches. */
export const FAR: EdgeNear = { top: false, left: false, x: -100000, y: -100000 }

/** Pure: where `cursor` is against the content box. */
export function edgeNear(cursor: Point, content: Rectangle, zone = EDGE): EdgeNear {
  const x = cursor.x - content.x
  const y = cursor.y - content.y
  const across = x >= -zone.outside && x < content.width + zone.outside
  const down = y >= -zone.outside && y < content.height + zone.outside
  return {
    top: across && y >= -zone.outside && y < zone.top,
    left: down && x >= -zone.outside && x < zone.left,
    x,
    y
  }
}

/** Poll while asked; tell the page whenever the cursor moves. The page decides
 *  from it (lib/revealZones), because over a drag region (the dropped bar, the
 *  sidebar's grab strip) a press is Windows', so the page hears no pointer
 *  move there at all and took the pointer for gone (owner, 2026-10-11: "my
 *  cursor can be on the titlebar and its disappearing"). */
export function createEdgeWatch(
  win: () => BrowserWindow | null,
  cursor: () => Point,
  send: (near: EdgeNear) => void
): { set: (on: boolean) => void; stop: () => void } {
  let timer: ReturnType<typeof setInterval> | null = null
  let last = ''
  const tick = (): void => {
    const w = win()
    if (!w || w.isDestroyed() || w.isMinimized() || !w.isVisible()) return
    const box = w.getContentBounds()
    const near = edgeNear(cursor(), box)
    // FAR FROM THE WINDOW IS ONE PLACE (perf review 2026-10-16): with the
    // sidebar collapsed for days, every move of the mouse in other apps was an
    // IPC and a page wakeup, up to 20 a second, for an answer that is always
    // "nowhere near". Once the cursor is EDGE_FAR_DIP outside the content, the page
    // hears FAR once, and nothing more until it comes back.
    const far =
      near.x < -EDGE_FAR_DIP ||
      near.y < -EDGE_FAR_DIP ||
      near.x >= box.width + EDGE_FAR_DIP ||
      near.y >= box.height + EDGE_FAR_DIP
    const key = far ? 'far' : `${Math.round(near.x)}|${Math.round(near.y)}`
    if (key === last) return
    last = key
    send(far ? FAR : near)
  }
  const stop = (): void => {
    if (timer) clearInterval(timer)
    timer = null
    last = ''
  }
  return {
    set: (on) => {
      if (!on) return stop()
      if (!timer) timer = setInterval(tick, EDGE.everyMs)
    },
    stop
  }
}
