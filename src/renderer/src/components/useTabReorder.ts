import { useRef, useState, type CSSProperties, type PointerEvent, type RefObject } from 'react'
import { dropSlot, type Lane } from '../lib/tabDrop'
import { CARRY_SLIDE, DRAG_SLOP } from '../lib/chromeLayout'

/** A tab being carried along its row or down its column. */
interface Carry {
  id: string
  from: number
  /** The carried tab's width (strip) or height (sidebar). */
  size: number
  /** How far it has been carried along the axis. */
  d: number
  /** True once the press travelled past the slop: only THEN is it a drag. */
  live: boolean
}

/** What a tab's wrapper hands the pointer to. */
export interface TabHandlers {
  onPointerDown: (e: PointerEvent<HTMLElement>) => void
  onPointerMove: (e: PointerEvent<HTMLElement>) => void
  onPointerUp: (e: PointerEvent<HTMLElement>) => void
  onPointerCancel: () => void
}

/**
 * REORDERING A TAB BY CARRYING IT (#70), one engine for the strip (along x)
 * and the sidebar (down y). Audit 2026-10-12: the two were the same code with
 * x swapped for y, so the next drag fix landed in one layout only.
 *
 * The carried tab lifts out and its neighbours slide across to open the gap
 * it would drop into, which is what "picked up" looks like. A POINTER drag,
 * not an HTML5 one (owner, 2026-08-23): a system drag goes anywhere on screen
 * and carries an OS snapshot; a tab slides inside its own row and nowhere
 * else. The containers keep their HTML5 handlers for a FOLDER dropped from
 * Explorer, a different gesture with a different meaning.
 */
export function useTabReorder({
  axis,
  container,
  onReorder,
  refuse
}: {
  axis: 'x' | 'y'
  /** The row or column the tabs live in: the carry is clamped to it. */
  container: RefObject<HTMLElement | null>
  onReorder: (id: string, toIndex: number) => void
  /** No carry starts while this is true (the sidebar while Find a tab filters). */
  refuse?: boolean
}): {
  carry: Carry | null
  /** The pointer handlers a tab's wrapper takes. */
  handlers: (id: string, i: number) => TabHandlers
  /** The tab's transform, layer and slide while something is carried. */
  motion: (id: string, i: number) => CSSProperties
  /** A click at the end of a press: false when the press travelled (a drag,
   *  not a pick), which it also consumes. */
  isPick: () => boolean
} {
  const [dropAt, setDropAt] = useState<number | null>(null)
  const [carry, setCarry] = useState<Carry | null>(null)
  // The tab boundaries as they were when the drag STARTED. Asking which tab
  // sits under the pointer cannot work once they animate: the neighbour
  // slides out from under the cursor, the answer flips back, and the row
  // judders. Frozen geometry has no feedback loop. Down the column, a lane's
  // `left` and `width` are a row's top and height.
  const lanes = useRef<Lane[]>([])
  const start = useRef(0)
  /** True once the press has travelled far enough to BE a drag: a plain click
   *  must still switch tabs. */
  const dragging = useRef(false)
  /** Whatever had the keyboard before the drag, which is nearly always the
   *  shell. Dragging a tab is not leaving it. */
  const heldFocus = useRef<HTMLElement | null>(null)
  const along = (e: { clientX: number; clientY: number }): number => (axis === 'x' ? e.clientX : e.clientY)

  const endDrag = (): void => {
    setDropAt(null)
    setCarry(null)
    lanes.current = []
    const el = heldFocus.current
    heldFocus.current = null
    if (el && document.contains(el)) requestAnimationFrame(() => el.focus())
  }

  const handlers = (id: string, i: number): TabHandlers => ({
    onPointerDown: (e) => {
      if (e.button !== 0 || refuse) return
      // The X is not a handle: capturing the pointer here would swallow its
      // own click and close nothing. A right click cannot start a carry.
      if ((e.target as HTMLElement).closest('[data-tab-close]')) return
      heldFocus.current = document.activeElement as HTMLElement | null
      const boxes = [...(container.current?.querySelectorAll('[data-tab]') ?? [])].map((el) =>
        el.getBoundingClientRect()
      )
      lanes.current = boxes.map((b) =>
        axis === 'x'
          ? { left: b.left, width: b.width, mid: b.left + b.width / 2 }
          : { left: b.top, width: b.height, mid: b.top + b.height / 2 }
      )
      start.current = along(e)
      dragging.current = false
      setCarry({ id, from: i, size: lanes.current[i]?.width ?? 0, d: 0, live: false })
      setDropAt(i)
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove: (e) => {
      if (!carry) return
      const raw = along(e) - start.current
      if (!dragging.current && Math.abs(raw) < DRAG_SLOP) return
      dragging.current = true
      // Clamped to the row: the tab cannot be carried out of it, which is the
      // whole point of doing this with the pointer.
      const lane = lanes.current[carry.from]
      const box = container.current?.getBoundingClientRect()
      const lo = box ? (axis === 'x' ? box.left : box.top) : 0
      const hi = box ? (axis === 'x' ? box.right : box.bottom) : 0
      const d = lane && box ? Math.max(lo - lane.left, Math.min(raw, hi - (lane.left + lane.width))) : raw
      setCarry((c) => (c ? { ...c, d, live: true } : c))
      // The CARRIED tab decides, not the pointer: it is what the eye is
      // following, and it keeps a grab near an edge honest. Its leading edge,
      // so first place is in reach (#125, lib/tabDrop).
      setDropAt(dropSlot(lanes.current, carry.from, d))
    },
    onPointerUp: (e) => {
      if (!carry) return
      e.currentTarget.releasePointerCapture(e.pointerId)
      const landed = dragging.current ? dropAt : null
      const carried = carry.id
      endDrag()
      if (landed !== null) onReorder(carried, landed)
    },
    onPointerCancel: () => {
      if (carry) endDrag()
    }
  })

  /** How far a tab slides to open the gap: everything between the carried
   *  tab's old slot and the one it would drop into shifts by its size. */
  const slide = (i: number): number => {
    if (!carry || dropAt === null || i === carry.from) return 0
    if (dropAt > carry.from && i > carry.from && i < dropAt) return -carry.size
    if (dropAt <= carry.from && i >= dropAt && i < carry.from) return carry.size
    return 0
  }

  const motion = (id: string, i: number): CSSProperties => {
    const d = carry?.id === id ? carry.d : slide(i)
    return {
      transform: axis === 'x' ? `translateX(${d}px)` : `translateY(${d}px)`,
      zIndex: carry?.id === id ? 5 : undefined,
      // The tab you picked up follows the pointer; the neighbours sliding open
      // the gap are the preview, and only they animate.
      transition: carry && carry.id !== id ? `transform ${CARRY_SLIDE}` : undefined
    }
  }

  const isPick = (): boolean => {
    if (dragging.current) {
      dragging.current = false
      return false
    }
    return true
  }

  return { carry, handlers, motion, isPick }
}
