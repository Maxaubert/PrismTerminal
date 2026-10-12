import { useState, type JSX, type ReactNode } from 'react'
import { baseName } from '@core/shared/folderNames'
import { AppMark } from './AppMark'
import { COG_PATH } from './glyphPaths'
import { plusMenuRows } from './tabMenus'
import { keyLabel } from '../lib/keymap'
import { useAppVersion } from '../lib/appFacts'

/**
 * The start screen: the window with no tab open (owner, 2026-09-18, with
 * Tabby's as the reference: the mark and the name, a short list of things to
 * do, a quiet footer).
 *
 * It is what closing the last tab lands on, so it is a place you pass through
 * many times a day and not a first-run page: no greeting, no explanation.
 * What it adds to the reference is the one thing a terminal can know that a
 * start screen is for, the folders you were last in, each one a single press
 * from a shell. "New terminal" is the + by another name: what it opens (the
 * user's folder, a folder Settings names, or the chooser) is decided where
 * the + is decided, so the two can never disagree.
 */
const REPO = 'https://github.com/Maxaubert/PrismTerminal'

const ROW =
  'no-drag group flex h-9 w-full items-center gap-3 rounded-[var(--p-radius-sm)] px-2.5 text-left text-[13px] text-[var(--p-text-soft)] transition-colors hover:bg-[var(--p-hover)] hover:text-[var(--p-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--p-accent-hi)]'

/** One stroke weight and one box for every glyph on the screen. */
const Glyph = ({ children }: { children: ReactNode }): JSX.Element => (
  <svg
    viewBox="0 0 24 24"
    width={16}
    height={16}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="shrink-0 text-[var(--p-icon)] transition-colors group-hover:text-[var(--p-accent-hi)]"
    aria-hidden
  >
    {children}
  </svg>
)

/** Where a folder lives, from its NEAR end: the last two folders above it.
 *  A long path cut at its far end loses exactly the part that tells two
 *  "api" apart; the whole path is the row's tooltip. */
function whereabouts(p: string): string {
  const above = p
    .split(/[\\/]+/)
    .filter(Boolean)
    .slice(0, -1)
  const near = above.slice(-2).join('\\')
  return above.length > 2 ? `…\\${near}` : near
}

export default function EmptyState({
  onNew,
  onOpenFolder,
  onSettings
}: {
  onNew: () => void
  /** A folder from the list: a shell there, with nothing asked. */
  onOpenFolder: (path: string) => void
  onSettings: () => void
}): JSX.Element {
  const version = useAppVersion()
  // Read when the screen appears: the tab that was just closed is on it.
  const [places] = useState(plusMenuRows)

  return (
    <div data-empty-state className="p-styled-font relative flex h-full w-full flex-col">
      <div className="p-start-in flex min-h-0 flex-1 flex-col items-center justify-center px-6">
        {/* The mark: the app's own, in the accent (owner, 2026-10-12: "use
            also this on that startup page"). */}
        <AppMark size={84} className="text-[var(--p-accent-solid)]" />
        <h1 className="mt-4 text-[22px] font-semibold tracking-[-0.01em] text-[var(--p-text)]">
          Prism Terminal
        </h1>

        <nav aria-label="Start" className="mt-10 flex w-full max-w-[340px] flex-col gap-0.5">
          <button className={ROW} onClick={onNew} data-start-new>
            <Glyph>
              <path d="M12 5.5v13M5.5 12h13" />
            </Glyph>
            <span className="min-w-0 flex-1 truncate text-[var(--p-text)]">New terminal</span>
            <span className="shrink-0 text-[11.5px] text-[var(--p-dim)]">{keyLabel('new-tab')}</span>
          </button>

          {places.length > 0 && (
            <div className="my-2 border-t border-[color:var(--p-divider)]" role="presentation" />
          )}
          {places.map((p) => (
            <button
              key={p.path}
              className={ROW}
              onClick={() => onOpenFolder(p.path)}
              title={p.path}
              data-start-folder
            >
              <Glyph>
                <path d="M3.5 7.5a2 2 0 0 1 2-2h3.6l2 2.4h7.4a2 2 0 0 1 2 2v6.6a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
              </Glyph>
              <span className="shrink-0 truncate">{baseName(p.path)}</span>
              {/* The folder it is in, which is what tells two "src" apart. */}
              <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--p-dim)]">
                {whereabouts(p.path)}
              </span>
              {p.pinned && <span className="shrink-0 text-[11px] text-[var(--p-dim)]">Pinned</span>}
            </button>
          ))}
          <div className="my-2 border-t border-[color:var(--p-divider)]" role="presentation" />

          <button className={ROW} onClick={onSettings} data-start-settings>
            <Glyph>
              {/* The title bar's cog: one glyph for one destination. */}
              <circle cx="12" cy="12" r="3" />
              <path d={COG_PATH} />
            </Glyph>
            <span className="min-w-0 flex-1 truncate">Settings</span>
            <span className="shrink-0 text-[11.5px] text-[var(--p-dim)]">{keyLabel('settings')}</span>
          </button>
        </nav>
      </div>

      <footer className="flex shrink-0 items-center justify-between px-5 pb-4 text-[11.5px] text-[var(--p-dim)]">
        <button
          className="no-drag rounded px-1 transition-colors hover:text-[var(--p-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--p-accent-hi)]"
          onClick={() => window.prism.openExternal(REPO)}
        >
          GitHub
        </button>
        <span data-start-version>{version && `Version ${version}`}</span>
      </footer>
    </div>
  )
}
