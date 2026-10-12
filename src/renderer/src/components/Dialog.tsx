import type { JSX, ReactNode } from 'react'
import { Modal } from '@core/renderer/components/Modal'

// A small modal for the questions the app asks before acting (closing with an
// agent still working). Deliberately plain: a title, a line of explanation, and
// the choices as buttons in the order you'd read them, with the safe one first.

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
  // The frame (scrim, Escape, Tab kept inside, a press outside, focus) is the
  // core's Modal, the same for every dialog in both apps. Focus lands on the
  // primary action, again when the QUESTION changes under a dialog that stays
  // mounted (the install question replaced by the window's).
  return (
    <Modal
      onCancel={onCancel}
      label={title}
      focusKey={title}
      boxClassName="w-full max-w-[420px] p-5"
    >
      <h2 className="text-[14.5px] font-semibold text-[var(--p-text)]">{title}</h2>
      {body && (
        <div className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--p-dim)]">{body}</div>
      )}
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
    </Modal>
  )
}
