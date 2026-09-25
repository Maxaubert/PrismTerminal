import { useEffect, useRef, useState, type JSX, type ReactNode } from 'react'

// THE SETTINGS FIELDS, shared by both hosts (#15). The owner's rule: the two
// apps' terminal settings are the same settings, "the setting names, types, how
// they function", and only the personal values differ (each app keeps its own).
// So the controls a terminal setting is built from live here, once. They wear
// the `--p-*` tokens both apps define, and nothing else.

/** A real on/off switch: one control, one state, no pair of buttons to compare. */
export function Switch({
  on,
  onChange,
  label,
  disabled
}: {
  on: boolean
  onChange: (b: boolean) => void
  label: string
  disabled?: boolean
}): JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-[20px] w-[36px] shrink-0 rounded-full transition-colors disabled:cursor-default ${
        on ? SWITCH_ON : 'bg-[var(--p-track)]'
      }`}
    >
      <span
        className={`absolute left-[2px] top-[2px] h-4 w-4 rounded-full shadow-sm transition-transform duration-150 ease-out ${
          on ? SWITCH_KNOB_ON : 'bg-white'
        }`}
        style={{ transform: on ? 'translateX(16px)' : 'none' }}
      />
    </button>
  )
}

/**
 * A colour well: type a hex, or open the system picker.
 *
 * The hex is a field rather than a readout - a colour you already know is
 * quicker typed than hunted for in a picker, and it is how a colour arrives
 * from anywhere else. It is held as text while you edit and only applied when
 * it parses, so half-typed values don't repaint the app on every keystroke.
 */
/** "#abc", "abc", "#aabbcc" → "#aabbcc"; anything else → null. */
export function parseHexInput(raw: string): string | null {
  const hex = '#' + raw.trim().replace(/^#/, '')
  const full = /^#[0-9a-f]{3}$/i.test(hex)
    ? '#' +
      hex
        .slice(1)
        .split('')
        .map((c) => c + c)
        .join('')
    : hex
  return /^#[0-9a-f]{6}$/i.test(full) ? full.toLowerCase() : null
}

/**
 * What a hex field's blur or Enter commits: only a DRAFT the user typed, and
 * only when it names another colour (code review 2026-09-24, #26). Committing
 * the value on every blur turned a row that follows the theme into a colour of
 * your own just by tabbing through it: Reset appeared, Save changes lit, and
 * the next theme pick asked about changes nobody made.
 */
export function hexCommit(draft: string | null, value: string): string | null {
  if (draft === null) return null
  const full = parseHexInput(draft)
  return full && full !== parseHexInput(value) ? full : null
}

/** The compact colour control: a hex field and a swatch. Every place a colour
 *  is chosen carries the field - a picker without one strands anyone pasting
 *  a code from elsewhere. */
export function HexSwatch({
  label,
  value,
  onChange
}: {
  label: string
  value: string
  onChange: (v: string) => void
}): JSX.Element {
  // While you are typing the field holds the draft; the rest of the time it is
  // simply the colour. No effect syncing the two, which is a render loop
  // waiting to happen.
  const [draft, setDraft] = useState<string | null>(null)
  const text = draft ?? value
  const commit = (): void => {
    setDraft(null) // either it took, or the field goes back to the colour
    const full = hexCommit(draft, value)
    if (full) onChange(full)
  }
  return (
    <span className="flex items-center gap-1.5">
      <input
        value={text}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          else if (e.key === 'Escape') setDraft(null)
        }}
        spellCheck={false}
        aria-label={`${label} hex value`}
        className="w-[64px] rounded-[var(--p-radius-sm)] border border-[color:var(--p-line)] bg-[var(--p-control)] px-1 py-0.5 text-center font-[Consolas,'Cascadia_Mono',monospace] text-[10.5px] uppercase text-[var(--p-text)] focus-visible:border-[var(--p-accent-hi)] focus-visible:outline-none"
      />
      <label
        className="relative block h-6 w-9 cursor-pointer overflow-hidden rounded-[var(--p-radius-sm)] border border-[color:var(--p-line)]"
        style={{ background: value }}
        title="Pick a colour"
      >
        <input
          type="color"
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
    </span>
  )
}

/** Two or three exclusive choices as one control rather than a row of buttons. */
export function Segmented<T extends string>({
  value,
  onChange,
  options
}: {
  value: T
  onChange: (v: T) => void
  options: Array<{ id: T; name: string }>
}): JSX.Element {
  return (
    <div className="inline-flex gap-0.5 rounded-full border border-[color:var(--p-divider)] bg-[var(--p-control)] p-[3px]">
      {options.map((o) => {
        const on = o.id === value
        return (
          <button
            key={o.id}
            data-seg={o.id}
            onClick={() => onChange(o.id)}
            aria-pressed={on}
            className={`rounded-full px-3 py-1 text-[11.5px] font-semibold transition ${
              on
                ? SEGMENT_ON
                : 'text-[var(--p-dim)] hover:text-[var(--p-text)]'
            }`}
          >
            {o.name}
          </button>
        )
      })}
    </div>
  )
}

/** The one save button: accent while there is something to save, quietly grey
 *  when there is not. */
export function SaveButton({ dirty, onClick, title }: { dirty: boolean; onClick: () => void; title: string }): JSX.Element {
  return (
    <button
      data-save-term
      onClick={onClick}
      disabled={!dirty}
      title={dirty ? title : 'Nothing to save yet'}
      className={`shrink-0 rounded-[var(--p-radius-sm)] border px-3 py-1 text-[11.5px] font-semibold transition ${
        dirty
          ? 'border-[var(--p-accent)] bg-[var(--p-accent)] text-[var(--p-on-accent)] hover:brightness-110'
          : 'cursor-default border-[color:var(--p-line)] bg-[var(--p-hover)] text-[var(--p-dim2)]'
      }`}
    >
      Save changes
    </button>
  )
}

/** The section head: title, one line under it, and the save button in the
 *  top-right corner. */
export function ThemeHead({ sub, save }: { sub: string; save: ReactNode }): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-[12.5px] font-semibold text-[var(--p-text)]">Theme</div>
        <p className="mt-0.5 text-[11.5px] text-[var(--p-dim)]">{sub}</p>
      </div>
      {save}
    </div>
  )
}

// Both pages are plain lists: one row per setting, name + one line of
// explanation on the left, its control on the right, hairline between. No
// panels: the pages are short enough that grouping them would be ceremony.

// A list of preference rows, hairline above and below each one. Full width: the
// control sits at the right edge of the page, where the eye already is.
export const ROWS = 'border-t border-[color:var(--p-line)]'

/** One setting: copy on the left, control on the right. The hint is one line -
 *  it truncates rather than wraps, because a setting that needs a paragraph
 *  needs a better name instead. `off` dims the whole row: a control that
 *  cannot be used should not look like one that can. */
export function Pref({
  id,
  label,
  hint,
  off,
  children
}: {
  id: string
  label: string
  hint?: string
  off?: boolean
  children: ReactNode
}): JSX.Element {
  return (
    <div
      data-pref={id}
      aria-disabled={off || undefined}
      className={`flex items-center justify-between gap-8 border-b border-[color:var(--p-line)] py-2.5 ${
        off ? 'opacity-50' : ''
      }`}
    >
      <div className="min-w-0">
        <label htmlFor={id} className="block text-[12.5px] font-semibold text-[var(--p-text)]">
          {label}
        </label>
        {hint && (
          <p className="mt-0.5 truncate text-[11.5px] text-[var(--p-dim)]" title={hint}>
            {hint}
          </p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

/** A styled dropdown, not a native select: the popup wears the app's own menu
 *  look (flat panel, hover token, a check on the active row), and each option
 *  can carry a style - which is how the font picker previews its faces. */
export function Select({
  id,
  value,
  onChange,
  options
}: {
  id: string
  value: string
  onChange: (v: string) => void
  options: Array<{ id: string; name: string; style?: React.CSSProperties }>
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (): void => setOpen(false)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
      }
    }
    const onDown = (e: PointerEvent): void => {
      if (!box.current?.contains(e.target as Node)) close()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('blur', close)
    }
  }, [open])
  const cur = options.find((o) => o.id === value)
  return (
    <div ref={box} className="relative">
      <button
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 min-w-[168px] items-center justify-between gap-2 rounded-[var(--p-radius-sm)] border border-[color:var(--p-divider)] bg-[var(--p-control)] px-2.5 text-[12px] font-medium text-[var(--p-text)] transition-colors hover:border-[color:var(--p-line)] focus-visible:border-[var(--p-accent-hi)] focus-visible:outline-none"
      >
        <span className="truncate" style={cur?.style}>
          {cur?.name ?? value}
        </span>
        <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 text-[var(--p-dim)] transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          aria-labelledby={id}
          className="absolute right-0 z-40 mt-1 max-h-[300px] min-w-full overflow-y-auto rounded-[2px] border border-[color:var(--p-divider)] bg-[var(--p-side-flat)] py-0.5 shadow-[0_10px_28px_rgba(0,0,0,.5)]"
        >
          {options.map((o) => {
            const on = o.id === value
            return (
              <button
                key={o.id}
                role="option"
                aria-selected={on}
                onClick={() => {
                  onChange(o.id)
                  setOpen(false)
                }}
                className={`flex h-[28px] w-full items-center justify-between gap-4 whitespace-nowrap px-[11px] text-left text-[12px] transition-colors hover:bg-[var(--p-hover)] ${
                  on ? 'text-[var(--p-accent-hi)]' : 'text-[var(--p-text-soft)] hover:text-[var(--p-text)]'
                }`}
                style={o.style}
              >
                {o.name}
                {on && (
                  <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M4.5 12.5l5 5 10-11" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * RESET, as Prism's own settings draw it (owner, 2026-09-22: "don't show these
 * buttons, use instead the same as Prism uses in style where it is just a
 * simple reset text you can click"): a word in the accent, underlined on hover,
 * beside the colour it puts back. For a row whose value can return to what
 * the theme gives it.
 */
export const RESET_LINK =
  'text-[11px] font-semibold text-[var(--p-accent-hi)] hover:underline focus-visible:underline focus-visible:outline-none'

/**
 * SETTINGS CONTROLS ARE NEUTRAL, AND ONLY SAVE WEARS THE ACCENT (owner,
 * 2026-09-23: "i dont want settings buttons to be affected by the accent
 * colour... grey based on the bg colour and then a slight contrast so that it
 * can easily be seen. same colours as the drop down menus"; "the only ones to
 * keep accented are the save buttons"). Every grey here is a token the theme
 * derives from its own ground, so it keeps its contrast on every preset and on
 * a chosen background. The focus ring stays the accent: it is not a button.
 */

/** The button a row uses for a verb of its own: the dropdown's own look. */
export const ROW_BUTTON =
  'h-8 rounded-[var(--p-radius-sm)] border border-[color:var(--p-divider)] bg-[var(--p-control)] px-3 text-[12px] font-semibold text-[var(--p-text)] transition-colors hover:border-[color:var(--p-line)] hover:bg-[var(--p-hover)] focus-visible:border-[var(--p-accent-hi)] focus-visible:outline-none disabled:opacity-50'

/** The pressed segment: a step lighter than the control round it (darker on a
 *  light theme), in the text's own ink. */
export const SEGMENT_ON = 'bg-[color-mix(in_srgb,var(--p-text)_16%,var(--p-control))] text-[var(--p-text)]'

/** A switch that is on: the track in the soft text ink and the knob in the
 *  ground, so on and off differ in lightness, not only in position. */
export const SWITCH_ON = 'bg-[var(--p-text-soft)]'
export const SWITCH_KNOB_ON = 'bg-[var(--p-bg)]'

