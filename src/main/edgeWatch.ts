import type { BrowserWindow, Point, Rectangle } from 'electron'

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
 *  (the resize border's own band), in DIPs. */
export const EDGE = { inside: 10, outside: 8, everyMs: 60 } as const

export interface EdgeNear {
  top: boolean
  left: boolean
  /** The cursor relative to the content's top left, so the page can ask
   *  whether it is over its own part of the edge. */
  x: number
  y: number
}

/** Pure: where `cursor` is against the content box. */
export function edgeNear(cursor: Point, content: Rectangle, zone = EDGE): EdgeNear {
  const x = cursor.x - content.x
  const y = cursor.y - content.y
  const across = x >= -zone.outside && x < content.width + zone.outside
  const down = y >= -zone.outside && y < content.height + zone.outside
  return {
    top: across && y >= -zone.outside && y < zone.inside,
    left: down && x >= -zone.outside && x < zone.inside,
    x,
    y
  }
}

/** Poll while asked; tell the page only when top or left changes. */
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
    const near = edgeNear(cursor(), w.getContentBounds())
    const key = `${near.top}|${near.left}|${near.top ? Math.round(near.x / 8) : ''}`
    if (key === last) return
    last = key
    send(near)
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
