import { useEffect, useState, type JSX } from 'react'
import { onCopied } from '../lib/copyNotice'

/** How long the badge stays before it fades. */
export const COPIED_BADGE_MS = 1200

/**
 * THE "COPIED" BADGE (owner, 2026-09-23: "a badge appear at the bottom center of
 * the screen saying copied"). One per window, mounted by the host; it answers
 * every successful `copyText`. Neutral like the dropdowns (the ground's
 * control grey and its hairline), no shadow, never in the way of a click. A
 * second copy restarts the clock rather than stacking a second badge. The
 * word stays while it fades; screen readers hear each copy once, from a line
 * of their own whose text changes every time.
 */
export default function CopiedBadge(): JSX.Element {
  const [visible, setVisible] = useState(false)
  const [count, setCount] = useState(0)
  useEffect(() => {
    let timer: number | undefined
    const off = onCopied(() => {
      setVisible(true)
      setCount((n) => n + 1)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setVisible(false), COPIED_BADGE_MS)
    })
    return () => {
      off()
      window.clearTimeout(timer)
    }
  }, [])
  return (
    <>
      <div
        data-copied-badge={visible ? 'shown' : 'hidden'}
        aria-hidden
        className={`pointer-events-none fixed bottom-6 left-1/2 z-[300] -translate-x-1/2 rounded-full border border-[color:var(--p-divider)] bg-[var(--p-control)] px-3.5 py-1.5 text-[12px] font-semibold text-[var(--p-text)] transition-[opacity,translate] duration-200 ease-out ${
          visible ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
        }`}
      >
        Copied
      </div>
      <span role="status" aria-live="polite" className="sr-only">
        {count ? `Copied${count % 2 ? '' : ' '}` : ''}
      </span>
    </>
  )
}
