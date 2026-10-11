import { useRef, type JSX, type ReactNode } from 'react'
import { REVEAL, useHoverReveal } from '../lib/hoverReveal'

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
  hold = false
}: {
  children: ReactNode
  hold?: boolean
}): JSX.Element {
  const bar = useRef<HTMLDivElement>(null)
  const shown = useHoverReveal(
    true,
    (e) => {
      if (e.clientY <= REVEAL.zone) return true
      const box = bar.current?.getBoundingClientRect()
      return !!box && box.bottom > 0 && e.clientY <= box.bottom
    },
    hold
  )
  return (
    <div
      ref={bar}
      data-title-bar="float"
      data-title-shown={shown || undefined}
      inert={!shown}
      className={`${shown ? 'drag' : 'no-drag'} p-styled-font absolute inset-x-0 top-0 z-40 flex h-9 items-center justify-end gap-2.5 border-b border-[var(--p-divider)] bg-[var(--p-title)] pl-3 pr-1.5 text-[13px] transition-[transform,box-shadow] duration-[220ms] [transition-timing-function:cubic-bezier(.16,1,.3,1)] ${
        shown ? 'shadow-[0_10px_30px_-10px_rgba(0,0,0,.8)]' : ''
      }`}
      style={{ transform: shown ? 'none' : 'translateY(calc(-100% - 12px))' }}
    >
      {children}
    </div>
  )
}
