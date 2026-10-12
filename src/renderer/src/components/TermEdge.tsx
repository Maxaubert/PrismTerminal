import type { JSX } from 'react'

/**
 * THE TERMINAL'S EDGE, DRAWN ONCE (owner, 2026-10-12): along its top under the
 * bar and, beside the open sidebar, its left and round the cut corner, so the
 * bar's edge and the sidebar's are one line ("the sidebar border should not go
 * all the way up. It should only go up to the title bar border so they can
 * connect there").
 *
 * A LINE ON EVERY THEME, in the divider's ink, so it follows Panel edges (None,
 * Faint, Hairline, Solid): owner, the same day, "give all themes that border
 * that black themes use ... make sure it follows the setting for edges". The
 * shadows it replaces gathered darker in the corner.
 */
export function TermEdge({ open }: { open: boolean }): JSX.Element {
  return (
    <span
      data-term-edge
      aria-hidden
      className={`pointer-events-none absolute inset-x-0 bottom-0 top-9 z-10 border-t border-[var(--p-divider)] ${
        open ? 'rounded-tl-[10px] border-l' : ''
      }`}
    />
  )
}
