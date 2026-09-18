import type { JSX } from 'react'

/**
 * The window with nothing in it at all.
 *
 * One button, and it is the + by another name: what it opens (a folder
 * chooser, or the one fixed folder Settings names) is decided where the + is
 * decided, so the two can never disagree. Nothing here promises a drop: the
 * strip is what hears one, and with no tabs there is no strip.
 */
export default function EmptyState({ onNew }: { onNew: () => void }): JSX.Element {
  return (
    <div
      data-empty-state
      className="flex h-full flex-col items-center justify-center gap-4 text-center"
    >
      {/* A hairline and nothing else, so the window's own material carries
          through it. No backdrop-filter: inside a transparent window it has
          nothing behind to sample and composites as a solid fill, which is
          exactly the opaque tile this was meant to get rid of. */}
      <div className="grid h-[72px] w-[72px] place-items-center rounded-[20px] border border-[color:var(--p-line)] text-[var(--p-accent-hi)]">
        <svg
          viewBox="0 0 24 24"
          width={30}
          height={30}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M5 8l5 4-5 4" />
          <path d="M12.5 16.5H19" />
        </svg>
      </div>
      <div className="text-lg font-semibold text-[var(--p-text)]">No tabs open</div>
      <div className="text-sm text-[var(--p-dim)]">A tab is a shell in a folder you pick</div>
      <button
        className="no-drag rounded-xl bg-[var(--p-accent)] px-4 py-2 text-sm font-semibold text-[var(--p-on-accent)] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--p-accent-hi)]"
        onClick={onNew}
      >
        New tab
      </button>
      <div className="text-xs text-[var(--p-dim2)]">Ctrl+Shift+T</div>
    </div>
  )
}
