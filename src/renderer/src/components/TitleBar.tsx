import type { JSX, ReactNode } from 'react'

/**
 * The frameless window's top strip: the mark and the name, a drag region, the
 * update chip when there is one, the command help button (#12, when that
 * setting is on), the settings cog, and the three window buttons. A cog and not a menu (owner, 2026-09-18): a menu of one row is
 * chrome.
 *
 * Prism's bar, by subtraction: no file name, no panel toggle, no Tools. What
 * it keeps is the shape - 36px, the title surface, glyph-only 32x28 buttons -
 * so the two apps read as one family.
 *
 * The update chip is handed in (`chip`), not built here: it is the core's
 * component since #28, and its state lives in App beside the window it opens,
 * so the bar only gives it its place.
 */

const BTN =
  'grid h-7 w-8 place-items-center rounded text-[var(--p-icon)] transition-colors hover:bg-[var(--p-hover-hi)] hover:text-[var(--p-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--p-accent-hi)]'

export default function TitleBar({
  onSettings,
  onHelp,
  chip
}: {
  onSettings: () => void
  /** Open the command help popup; absent when the setting is off, and the
   *  button goes with it. */
  onHelp?: () => void
  /** The update chip, or nothing when there is no update. */
  chip?: ReactNode
}): JSX.Element {
  const w = window.prism
  return (
    <div
      data-title-bar
      className="drag p-styled-font flex h-9 shrink-0 items-center gap-2.5 border-b border-[var(--p-divider)] bg-[var(--p-title)] pl-3 pr-1.5 text-[13px]"
    >
      {/* The mark: a prompt in a tile, in the accent. The app icon proper
          replaces it when there is one to match. */}
      <svg
        viewBox="0 0 24 24"
        width={16}
        height={16}
        fill="none"
        stroke="var(--p-accent-hi)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0"
        aria-hidden
      >
        <rect x="2.5" y="3.5" width="19" height="17" rx="3.5" />
        <path d="M7 9.5l3.5 2.75L7 15" />
        <path d="M13 15.5h4" />
      </svg>
      <span className="shrink-0 font-semibold text-[var(--p-accent-hi)]">Prism Terminal</span>
      {/* The rest of the bar is the handle the window is moved by. */}
      <span className="min-w-0 flex-1" />
      {chip}
      <div className="no-drag flex items-center gap-1">
        {onHelp && (
          <button
            className={BTN}
            onClick={onHelp}
            title="Command help (F1)"
            aria-label="Command help"
            data-title-help
          >
            <svg
              viewBox="0 0 24 24"
              width={15}
              height={15}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M9.4 9.3a2.7 2.7 0 1 1 4 2.4c-.9.5-1.4 1.1-1.4 2.1" />
              <path d="M12 17.2v.01" />
            </svg>
          </button>
        )}
        <button
          className={BTN}
          onClick={onSettings}
          title="Settings (Ctrl+,)"
          aria-label="Settings"
          data-title-settings
        >
          <svg
            viewBox="0 0 24 24"
            width={15}
            height={15}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <button className={BTN} onClick={() => w.windowMinimize()} title="Minimize" aria-label="Minimize">
          <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <path d="M6 12h12" />
          </svg>
        </button>
        <button
          className={BTN}
          onClick={() => w.windowToggleMaximize()}
          title="Maximize"
          aria-label="Maximize"
        >
          <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
            <rect x="6" y="6" width="12" height="12" rx="1.5" />
          </svg>
        </button>
        <button
          // Red on every theme: closing is the one button whose colour is a
          // convention rather than a style.
          className="grid h-7 w-8 place-items-center rounded text-[var(--p-icon)] transition-colors hover:bg-red-500/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--p-accent-hi)]"
          onClick={() => w.windowClose()}
          title="Close"
          aria-label="Close"
          data-window-close
        >
          <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <path d="M7 7l10 10M17 7L7 17" />
          </svg>
        </button>
      </div>
    </div>
  )
}
