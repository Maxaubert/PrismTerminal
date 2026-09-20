import type { JSX } from 'react'
import type { UpdateInfo, UpdatePhase } from '../../shared/updateTypes'

/**
 * The update chip: a quiet pill in the title bar, there only while there is
 * something to install. The same in both apps (#28; owner, 2026-09-19: "yes
 * keep the core"). Props only: it never reaches for a bridge, the host's
 * `useUpdateFlow` hands it everything.
 *
 * A CLICK OPENS THE WINDOW, it does not install (owner, same day: "when you
 * click the Update badge, it opens like a pop window, which shows the change
 * log or like patch notes for the new update, and then you can choose cancel
 * or install"). Until then a click on it downloaded an installer and quit the
 * app, with nothing said about what was in it.
 *
 * THE CHIP IS THE PROGRESS BAR, ONE SHAPE FOR EVERY STATE, AND IT NEVER
 * CHANGES WIDTH (Prism's standing design, owner pick from 12 mockups,
 * 2026-08-24). The shape was always one; the width was not, and that is worth
 * writing down: the label went from "Update 0.5.0" to "7%" to "Installing…",
 * the pill is sized by its label, and it is anchored on its right, so its left
 * edge jumped with every change (MEASURED with the sizers taken out: 104.8px
 * idle, 54.8px at "7%", 96.0px installing). So EVERY label is always laid out, all in one grid cell, and
 * only the one that applies is visible: the cell is as wide as the widest of
 * them whatever is showing. The e2e measures the chip in every phase.
 */
export default function UpdateChip({
  info,
  phase,
  pct,
  onOpen,
  notice = null,
  onDismissNotice
}: {
  info: UpdateInfo | null
  phase: UpdatePhase
  pct: number
  onOpen: () => void
  /** A line about the install that just ended, hung under the chip. */
  notice?: string | null
  onDismissNotice?: () => void
}): JSX.Element | null {
  if (!info) return null
  const labels: Array<{ id: UpdatePhase; text: string }> = [
    { id: 'idle', text: `Update ${info.version}` },
    { id: 'downloading', text: `${pct}%` },
    { id: 'installing', text: 'Installing…' }
  ]
  /** The arrow and the label. Drawn TWICE, see the fill below; `base` is the
   *  copy that is read (by a screen reader and by the e2e). */
  const content = (base: boolean): JSX.Element => (
    <>
      <svg
        viewBox="0 0 24 24"
        width={11}
        height={11}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="relative shrink-0"
        aria-hidden
      >
        <path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 20h14" />
      </svg>
      {/* Every label, stacked in one cell; see the note on width above. The
          percentage is sized as "100%", its widest, so the digits arriving
          cannot move anything either. */}
      <span className="relative grid whitespace-nowrap tabular-nums">
        {labels.map((l) => (
          <span
            key={l.id}
            data-update-label={base && l.id === phase ? 'shown' : undefined}
            aria-hidden={!base || l.id !== phase}
            className={`col-start-1 row-start-1 text-center ${l.id === phase ? '' : 'invisible'}`}
          >
            {l.text}
          </span>
        ))}
        <span aria-hidden className="invisible col-start-1 row-start-1">
          100%
        </span>
      </span>
    </>
  )
  // How much of the chip the fill covers, from the left.
  const filled = phase === 'idle' ? 0 : phase === 'installing' ? 100 : pct
  return (
    // The wrapper exists for the line under the chip: it is positioned against
    // this box and is out of the flow, so it cannot move the bar either.
    <span className="no-drag relative flex shrink-0 items-center">
      <button
        data-update-chip
        data-phase={phase}
        className="relative flex h-6 shrink-0 items-center gap-1.5 overflow-hidden rounded-md border px-2.5 text-[11.5px] font-medium text-[var(--p-text)] transition-[filter] hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--p-accent-hi)] disabled:hover:brightness-100"
        style={{
          borderColor:
            phase === 'idle'
              ? 'color-mix(in srgb, var(--p-text) 14%, transparent)'
              : 'color-mix(in srgb, var(--p-accent) 55%, transparent)',
          // Working: the part not yet filled is tinted with the accent, so the
          // whole chip reads as one bar and not as a bar inside a button.
          background:
            phase === 'idle'
              ? 'color-mix(in srgb, var(--p-text) 8%, transparent)'
              : 'color-mix(in srgb, var(--p-accent) 30%, transparent)'
        }}
        onClick={onOpen}
        disabled={phase !== 'idle'}
        title={
          info.mock
            ? `Preview: see what an update to ${info.version} would look like`
            : `See what is new in ${info.version}`
        }
        aria-label={`Update to ${info.version}`}
        aria-haspopup="dialog"
        {...(phase === 'downloading'
          ? {
              role: 'progressbar',
              'aria-valuenow': pct,
              'aria-valuemin': 0,
              'aria-valuemax': 100
            }
          : {})}
      >
        {content(true)}
        {/*
          THE FILL IS A SECOND COPY OF THE CHIP, in the accent with the ink that
          belongs on the accent, CLIPPED to the percentage. So the label is
          always in the right ink for what is behind it: the theme's text over
          the part not yet filled, `--p-on-accent` over the part that is, and a
          digit the edge is passing through is drawn half in each. The first
          build of this (and Prism's chip before it) set ONE ink for the whole
          label, `--p-on-accent`, which is white on most light themes: on the
          GitHub theme "35%" was white on a pale blue remainder, seen in the
          e2e's own screenshot and nowhere in its assertions. Same padding and
          gap as the button, so the two copies sit exactly on each other.

          No transition back to idle: a fill that drains from 100% to nothing
          over the word "Update" reads as an install running backwards.
        */}
        <span
          aria-hidden
          data-update-fill
          data-filled={filled}
          className={`absolute inset-0 flex items-center gap-1.5 bg-[var(--p-accent)] px-2.5 text-[var(--p-on-accent)] ${
            phase === 'idle' ? '' : 'transition-[clip-path] duration-300 ease-out'
          }`}
          style={{ clipPath: `inset(0 ${100 - filled}% 0 0)` }}
        >
          {content(false)}
        </span>
      </button>
      {notice && (
        <div
          data-update-notice
          // A status, so a screen reader says it; a click anywhere on it puts
          // it away, and it leaves by itself after a few seconds.
          role="status"
          onClick={onDismissNotice}
          // The flat surface, not --p-title: that one carries the window's
          // alpha on an acrylic theme, and a line hung over the tab strip must
          // not be read through.
          className="absolute right-0 top-[calc(100%+8px)] z-40 whitespace-nowrap rounded-md border border-[color:var(--p-divider)] bg-[var(--p-side-flat)] px-2.5 py-1.5 text-[11.5px] text-[var(--p-text-soft)] shadow-[0_10px_30px_rgba(0,0,0,.45)]"
        >
          {notice}
        </div>
      )}
    </span>
  )
}
