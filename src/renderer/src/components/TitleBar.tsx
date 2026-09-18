import { useState, type JSX } from 'react'
import { ContextMenu } from './ContextMenu'
import UpdateChip from './UpdateChip'

/**
 * The frameless window's top strip: the mark and the name, a drag region, the
 * update chip when there is one, a menu, and the three window buttons.
 *
 * Prism's bar, by subtraction: no file name, no panel toggle, no Tools. What
 * it keeps is the shape - 36px, the title surface, glyph-only 32x28 buttons -
 * so the two apps read as one family.
 */

const BTN =
  'grid h-7 w-8 place-items-center rounded text-[var(--p-icon)] transition-colors hover:bg-[var(--p-hover-hi)] hover:text-[var(--p-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--p-accent-hi)]'

export default function TitleBar({ onSettings }: { onSettings: () => void }): JSX.Element {
  const w = window.prism
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
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
      <UpdateChip />
      <div className="no-drag flex items-center gap-1">
        <button
          className={`${BTN} ${menu ? 'bg-[var(--p-hover-hi)] text-[var(--p-text)]' : ''}`}
          onClick={(e) => {
            // Opened at the button's own bottom-left corner, not at the
            // pointer: a menu from a button belongs to the button. ContextMenu
            // clamps it inside the window.
            const r = e.currentTarget.getBoundingClientRect()
            setMenu({ x: r.left, y: r.bottom + 2 })
          }}
          title="Menu"
          aria-label="Menu"
          aria-haspopup="menu"
          aria-expanded={!!menu}
          data-title-menu
        >
          <svg
            viewBox="0 0 24 24"
            width={15}
            height={15}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M5 7h14M5 12h14M5 17h14" />
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
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: 'Settings', hint: 'Ctrl+,', onPick: onSettings },
            // Close hides the window and leaves the app resident, so the next
            // launch is instant; this is the row that really ends it.
            { label: 'Quit Prism Terminal', onPick: () => w.quitApp() }
          ]}
        />
      )}
    </div>
  )
}
