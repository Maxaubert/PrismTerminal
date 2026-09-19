import { useEffect, useMemo, useRef, type JSX } from 'react'
import { moreLine, parseReleaseNotes } from '../../shared/releaseNotes'
import type { UpdateInfo } from '../../shared/updateTypes'

/**
 * The window the update chip opens (#28). Owner, 2026-09-19: "when you click
 * the Update badge, it opens like a pop window, which shows the change log or
 * like patch notes for the new update, and then you can choose cancel or
 * install." One copy, for both apps.
 *
 * Props only, like the chip. It closes on Cancel, on Escape, on a press
 * outside it, and on Install; from there the progress is the chip's to show.
 * Whether Install may start at once is the HOST's question (it ends in the app
 * quitting, and a working agent or unsaved text has a say), so this only
 * reports the choice.
 *
 * THE NOTES ARE PLAIN TEXT, AND THAT IS A RULE, NOT A STYLE. They are a GitHub
 * release body, which is text off the network, shown in a window that can reach
 * the app's bridge to main. `parseReleaseNotes` reduces the body to strings and
 * each one is printed below as a text node, which React escapes. No markdown is
 * rendered, no HTML is set, and nothing in here is an anchor: a url in a title
 * is only characters. Do not "improve" this with a markdown renderer.
 *
 * It looks like each app's own Dialog on purpose (same scrim, same box, same
 * buttons), and sits on the OPAQUE surface token: `--p-title` and `--p-bg`
 * carry the window's alpha on an acrylic theme, and a question is not
 * something to read the desktop through.
 */
export default function UpdateDialog({
  info,
  currentVersion,
  onInstall,
  onCancel
}: {
  info: UpdateInfo
  /** The running app's version; the quiet line under the title. */
  currentVersion: string
  onInstall: () => void
  onCancel: () => void
}): JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const notes = useMemo(() => parseReleaseNotes(info.notes), [info.notes])
  const title = `Update to ${info.version}`

  useEffect(() => {
    // Focus lands on Install, as it lands on the primary action of every other
    // dialog in both apps: Enter confirms, Escape backs out.
    box.current?.querySelector<HTMLButtonElement>('[data-primary="true"]')?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        onCancel()
        return
      }
      if (e.key !== 'Tab') return
      // Tab stays inside. Behind this is a terminal, and a Tab that wandered
      // out of the dialog would be typed into somebody's shell.
      const stops = [
        ...(box.current?.querySelectorAll<HTMLElement>('button, [tabindex="0"]') ?? [])
      ]
      if (!stops.length) return
      const at = stops.indexOf(document.activeElement as HTMLElement)
      const next = at < 0 ? 0 : (at + (e.shiftKey ? -1 : 1) + stops.length) % stops.length
      e.preventDefault()
      e.stopPropagation()
      stops[next].focus()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onCancel])

  return (
    // data-owns-escape: both apps have a capture-phase Escape of their own that
    // must stand down while a dialog is up (in Prism it would leave fullscreen
    // or close Settings underneath this).
    <div
      data-owns-escape
      data-update-scrim
      className="no-drag fixed inset-0 z-50 grid place-items-center bg-black/55 p-6"
      role="presentation"
      onMouseDown={onCancel}
    >
      <div
        ref={box}
        data-update-dialog
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-[460px] flex-col rounded-[var(--p-radius)] border border-[color:var(--p-divider)] bg-[var(--p-side-flat)] p-5 shadow-[0_24px_70px_rgba(0,0,0,.6)]"
      >
        <h2 className="text-[14.5px] font-semibold text-[var(--p-text)]">{title}</h2>
        <p data-update-current className="mt-1 text-[12.5px] leading-relaxed text-[var(--p-dim)]">
          You have {currentVersion}
        </p>
        {/* The list scrolls, the dialog does not: a long release must not push
            Cancel and Install off the bottom of a small window. tabIndex so the
            keyboard can scroll it. */}
        <div
          data-update-notes
          tabIndex={0}
          aria-label="What is new"
          className="p-scroll mt-4 max-h-[min(44vh,300px)] min-h-0 overflow-y-auto rounded-lg border border-[color:var(--p-line)] bg-[var(--p-control)] px-3.5 py-3 focus-visible:border-[color:var(--p-accent-hi)] focus-visible:outline-none"
        >
          {notes.empty ? (
            <p className="text-[12.5px] leading-relaxed text-[var(--p-dim)]">{notes.entries[0]}</p>
          ) : (
            <>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--p-dim)]">
                What is new
              </h3>
              <ul className="flex flex-col gap-1.5">
                {notes.entries.map((entry, i) => (
                  // The index is the key: two pull requests can share a title.
                  <li
                    key={i}
                    data-update-entry
                    className="flex gap-2 text-[12.5px] leading-snug text-[var(--p-text-soft)]"
                  >
                    <span
                      aria-hidden
                      className="mt-[0.5em] h-1 w-1 shrink-0 rounded-full bg-[var(--p-accent-hi)]"
                    />
                    <span className="min-w-0 [overflow-wrap:anywhere]">{entry}</span>
                  </li>
                ))}
              </ul>
              {notes.more > 0 && (
                <p data-update-more className="mt-2 pl-3 text-[12px] text-[var(--p-dim)]">
                  {moreLine(notes.more)}
                </p>
              )}
            </>
          )}
        </div>
        {info.mock && (
          <p data-update-preview className="mt-3 text-[12px] leading-relaxed text-[var(--p-dim)]">
            This is a preview. Install shows the progress and installs nothing.
          </p>
        )}
        <div className="mt-5 flex shrink-0 justify-end gap-2">
          <button
            data-update-cancel
            onClick={onCancel}
            className="rounded-lg border border-[color:var(--p-divider)] bg-[var(--p-hover)] px-3.5 py-1.5 text-[12.5px] font-semibold text-[var(--p-text-soft)] transition-colors hover:text-[var(--p-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--p-accent-hi)]"
          >
            Cancel
          </button>
          <button
            data-update-install
            data-primary="true"
            onClick={onInstall}
            className="rounded-lg bg-[var(--p-accent)] px-3.5 py-1.5 text-[12.5px] font-semibold text-[var(--p-on-accent)] transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--p-accent-hi)]"
          >
            Install
          </button>
        </div>
      </div>
    </div>
  )
}
