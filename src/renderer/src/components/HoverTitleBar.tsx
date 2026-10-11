import { useEffect, useRef, type JSX, type ReactNode } from 'react'
import { useHoverReveal } from '../lib/hoverReveal'
import { useEdgeWants } from '../lib/edgeNear'
import { barWants } from '../lib/revealZones'

/** The bar's height: h-9. */
const BAR_H = 36

/**
 * THE TITLE BAR THAT IS NOT THERE (#162; owner, 2026-10-11): with the tabs in
 * the sidebar and the title bar hidden, there is no top row at all. "the
 * titlebar should be invisible, and only appear when your cursor is near the
 * top since its only needed for the window adjustments and i guess settings
 * and command help." So it slides down over the window while the pointer is at
 * the top edge, holding only those buttons ("dont show this", the app's name,
 * "in the hidden titlebar"), and goes again when the pointer leaves.
 *
 * `hold` keeps it down while something of its own is open (the update chip's
 * notice). Out of sight it is no window handle and no stop for Tab: an element
 * moved away can still claim the drag region and the keys.
 */
export function HoverTitleBar({
  children,
  hold = false,
  left = 0
}: {
  children: ReactNode
  hold?: boolean
  /** Where the bar starts: the open sidebar's edge, so it never covers the
   *  sidebar (owner, 2026-10-11: "dont have the titlebar go over the sidebar
   *  ... when the sidebar is collapsed then it can go across the whole thing"). */
  left?: number
}): JSX.Element {
  const bar = useRef<HTMLDivElement>(null)
  // Whether it was shown at the last answer: the way out is past its bottom
  // edge, the way in only the top zone (lib/revealZones).
  const shownNow = useRef(false)
  // Main's reading of the cursor, the only one there is while it is over the
  // bar itself: the bar is a drag region, so a press there is Windows' and the
  // page hears no pointer move (edgeWatch.ts).
  const fromMain = useEdgeWants(true, (p) => barWants(p, shownNow.current, left, BAR_H))
  const shown = useHoverReveal(
    true,
    (e) => barWants({ x: e.clientX, y: e.clientY }, shownNow.current, left, BAR_H),
    hold || fromMain
  )
  useEffect(() => {
    shownNow.current = shown
  }, [shown])
  return (
    <div
      ref={bar}
      data-title-bar="float"
      data-title-shown={shown || undefined}
      inert={!shown}
      // No line under it (owner, 2026-10-11: "dont have a border on the
      // titlebar on hidden"): its shadow says where it ends.
      // Slid by its TOP, never a transform: Windows is told where a drag
      // region is from the layout, and a transformed bar was reported where
      // its slide started, above the window, so it moved nothing (measured
      // with WM_NCHITTEST, 2026-10-11).
      className={`drag p-styled-font absolute right-0 z-40 flex h-9 items-center justify-end gap-2.5 bg-[var(--p-secondary)] pl-3 pr-1.5 text-[13px] transition-[top,box-shadow] duration-[200ms] [transition-timing-function:cubic-bezier(.16,1,.3,1)] ${
        shown ? 'shadow-[0_10px_30px_-10px_rgba(0,0,0,.8)]' : ''
      }`}
      style={{ left, top: shown ? 0 : -48 }}
    >
      {children}
      {/* THE CORNER WHERE IT MEETS THE SIDEBAR (owner, 2026-10-12: rounded,
          "making it seem like they merge together"): a quarter circle of the
          bar's own colour under its left end, cut out of the terminal. Only
          beside a sidebar; across the whole window there is none to meet. */}
      {left > 0 && (
        <span
          data-title-corner
          aria-hidden
          className="pointer-events-none absolute left-0 top-full h-2.5 w-2.5"
          style={{ background: 'radial-gradient(circle at 100% 100%, transparent 9.5px, var(--p-secondary) 10px)' }}
        />
      )}
    </div>
  )
}
