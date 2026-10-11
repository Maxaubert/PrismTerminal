import type { JSX, ReactNode } from 'react'

/**
 * The frameless window's top strip: the app's icon in outline, a drag region, the
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
  chip,
  secondary = false
}: {
  /** Beside the vertical tabs' sidebar, the bar wears the secondary colour,
   *  as the sidebar does (#162). */
  secondary?: boolean
  onSettings: () => void
  /** Open the command help popup; absent when the setting is off, and the
   *  button goes with it. */
  onHelp?: () => void
  /** The update chip, or nothing when there is no update. */
  chip?: ReactNode
}): JSX.Element {
  return (
    <div
      data-title-bar
      className={`drag p-styled-font flex h-9 shrink-0 items-center gap-2.5 border-b border-[var(--p-divider)] ${secondary ? 'bg-[var(--p-secondary)]' : 'bg-[var(--p-title)]'} pl-3 pr-1.5 text-[13px]`}
    >
      {/* NO ICON, FOR NOW (owner, 2026-10-12: "removed that app icon in the
          title bar for now. It might get re-added later"). The outline mark of
          #185 is in git history (TitleBar.tsx at 031f0c0). */}
      {/* The rest of the bar is the handle the window is moved by. */}
      <span className="min-w-0 flex-1" />
      <TitleButtons onSettings={onSettings} onHelp={onHelp} chip={chip} />
    </div>
  )
}

/**
 * The title bar's right end: the update chip, command help, the cog and the
 * three window buttons. Its own component because with the title bar hidden
 * (#91) the same group sits at the end of the tab row instead.
 */
export function TitleButtons({
  onSettings,
  onHelp,
  chip
}: {
  onSettings: () => void
  onHelp?: () => void
  chip?: ReactNode
}): JSX.Element {
  return (
    <>
      {chip}
      <div className="no-drag flex items-center gap-1">
        <AppButtons onSettings={onSettings} onHelp={onHelp} />
        <WindowButtons />
      </div>
    </>
  )
}

/** Command help (while its setting is on) and the cog: with vertical tabs and
 *  no title bar they sit at the top of the sidebar instead (#162). */
export function AppButtons({
  onSettings,
  onHelp
}: {
  onSettings: () => void
  onHelp?: () => void
}): JSX.Element {
  return (
    <>
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
    </>
  )
}

/** Minimize, maximize and close. With vertical tabs and no title bar they are
 *  all that is left of it, floating at the window's top right (#162). */
export function WindowButtons(): JSX.Element {
  const w = window.prism
  return (
    <>
      <button
        className={BTN}
        onClick={() => w.windowMinimize()}
        title="Minimize"
        aria-label="Minimize"
      >
        <svg
          viewBox="0 0 24 24"
          width={13}
          height={13}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M6 12h12" />
        </svg>
      </button>
      <button
        className={BTN}
        onClick={() => w.windowToggleMaximize()}
        title="Maximize"
        aria-label="Maximize"
      >
        <svg
          viewBox="0 0 24 24"
          width={13}
          height={13}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
          aria-hidden
        >
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
        <svg
          viewBox="0 0 24 24"
          width={13}
          height={13}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M7 7l10 10M17 7L7 17" />
        </svg>
      </button>
    </>
  )
}
