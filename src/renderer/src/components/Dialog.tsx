import { useEffect, useRef, type JSX, type ReactNode } from 'react'

// A small modal for the handful of questions Prism has to ask before touching a
// file. Deliberately plain: a title, a line of explanation, and the choices as
// buttons in the order you'd read them, with the safe one first.

export interface Choice {
  label: string
  onPick: () => void
  /** The one that acts. Gets the accent, and Enter picks it. */
  primary?: boolean
  /** Reads as a warning (overwriting, deleting). */
  danger?: boolean
}

export function Dialog({
  title,
  body,
  choices,
  onCancel
}: {
  title: string
  body?: ReactNode
  choices: Choice[]
  onCancel: () => void
}): JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  // THE LISTENER IS REGISTERED ONCE, and reads the latest onCancel from a ref.
  // Callers pass an inline arrow, so keyed on `onCancel` the effect tore the
  // listener down and put a new one up on EVERY render of the app. That has a
  // hole in it, MEASURED in the updateGuard e2e (2026-09-20, about one run in
  // five): when another keydown listener on the window sets state during the
  // same Escape, React flushes this effect between the two listeners, the old
  // listener is removed before its turn, and one added during a dispatch is
  // not called for that event. Escape then did nothing, with the question on
  // screen and focused.
  const cancel = useRef(onCancel)
  useEffect(() => {
    cancel.current = onCancel
  })

  // Focus lands on the primary action, so Enter confirms and Escape backs out
  // without anyone reaching for the mouse. Again when the QUESTION changes
  // under a dialog that stays mounted (the install question replaced by the
  // window's): the buttons are keyed by label, so the focused one is gone.
  useEffect(() => {
    box.current?.querySelector<HTMLButtonElement>('[data-primary="true"]')?.focus()
  }, [title])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        cancel.current()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  return (
    // data-owns-escape: the app's capture-phase Escape handler registered
    // first and would otherwise close the WINDOW while a dialog is up.
    <div data-owns-escape className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-6" role="presentation" onMouseDown={onCancel}>
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        // Flat surface colour: --p-title carries the window alpha on glass
        // styles, and a question box should not be see-through.
        className="w-full max-w-[420px] rounded-[var(--p-radius)] border border-[color:var(--p-divider)] bg-[var(--p-side-flat)] p-5 shadow-[0_24px_70px_rgba(0,0,0,.6)]"
      >
        <h2 className="text-[14.5px] font-semibold text-[var(--p-text)]">{title}</h2>
        {body && <div className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--p-dim)]">{body}</div>}
        <div className="mt-5 flex justify-end gap-2">
          {choices.map((c) => (
            <button
              key={c.label}
              data-primary={c.primary ? 'true' : undefined}
              onClick={c.onPick}
              className={`rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--p-accent-hi)] ${
                c.danger
                  ? 'bg-[#b4353f] text-[var(--p-on-accent)] hover:brightness-110'
                  : c.primary
                    ? 'bg-[var(--p-accent)] text-[var(--p-on-accent)] hover:brightness-110'
                    : 'border border-[color:var(--p-divider)] bg-[var(--p-hover)] text-[var(--p-text-soft)] hover:text-[var(--p-text)]'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
