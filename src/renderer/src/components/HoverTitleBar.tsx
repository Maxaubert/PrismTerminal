import { useRef, type JSX, type ReactNode } from 'react'
import { REVEAL, useHoverReveal } from '../lib/hoverReveal'
import { useEdgeNear } from '../lib/edgeNear'

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
  // Main's word too: over the resize border of a window that is not maximized
  // the page hears nothing (edgeWatch.ts).
  const edge = useEdgeNear(true)
  const shown = useHoverReveal(
    true,
    (e) => {
      if (e.clientX < left) return false
      if (e.clientY <= REVEAL.top) return true
      const box = bar.current?.getBoundingClientRect()
      return !!box && box.bottom > 0 && e.clientY <= box.bottom
    },
    hold || (edge.top && edge.x >= left)
  )
  return (
    <div
      ref={bar}
      data-title-bar="float"
      data-title-shown={shown || undefined}
      inert={!shown}
      // Slid by its TOP, never a transform: Windows is told where a drag
      // region is from the layout, and a transformed bar was reported where
      // its slide started, above the window, so it moved nothing (measured
      // with WM_NCHITTEST, 2026-10-11).
      className={`drag p-styled-font absolute right-0 z-40 flex h-9 items-center justify-end gap-2.5 border-b border-[var(--p-divider)] bg-[var(--p-title)] pl-3 pr-1.5 text-[13px] transition-[top,box-shadow] duration-[200ms] [transition-timing-function:cubic-bezier(.16,1,.3,1)] ${
        shown ? 'shadow-[0_10px_30px_-10px_rgba(0,0,0,.8)]' : ''
      }`}
      style={{ left, top: shown ? 0 : -48 }}
    >
      {children}
    </div>
  )
}
