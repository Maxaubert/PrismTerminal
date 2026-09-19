import { useEffect, useMemo, useRef, useState, type JSX, type ReactNode } from 'react'
import { savedShellId, saveShellId } from '../lib/termPrefs'
import { setConfirmClose, useConfirmClose } from '../lib/closePrefs'
import { setNewTabMode, useNewTabFolder, useNewTabMode } from '../lib/newTabPrefs'
import {
  FONT_PCTS,
  TERM_FONTS,
  TERM_EXTRA_DEFAULTS,
  agentIndicator,
  applyCustomExtras,
  resetTermExtras,
  saveCustomTermTheme,
  setAgentColor,
  setAgentDoneColor,
  setAgentIndicator,
  setTermAcrylic,
  setTermFontId,
  setTermFontPct,
  setTermOpacity,
  setTermThemeId,
  termThemeId,
  useAgentColorChoice,
  useAgentDoneColorChoice,
  useAgentIndicator,
  useCustomTermTheme,
  useTermAcrylic,
  useTermFontId,
  useTermFontPct,
  useTermOpacity,
  useTermThemeId,
  type AgentIndicator,
  type CustomTermTheme
} from '../lib/termLook'
import { resolveTermTheme, TERM_PRESETS } from '../lib/termTheme'
import { useAgentColors } from '../lib/agentColors'
import { luminance, normalizeColor } from '../lib/termAnsi'

// Settings WRITES STORES and nothing else. The window's chrome and its acrylic
// material follow the terminal theme, and App is the one listening to
// onTermLookChange to repaint them; a second caller in here would be two
// places deciding what the window looks like.

/* ---------- shared bits ---------- */

/** A real on/off switch: one control, one state, no pair of buttons to compare. */
function Switch({
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
        on ? 'bg-[var(--p-accent)]' : 'bg-[var(--p-track)]'
      }`}
    >
      <span
        className="absolute left-[2px] top-[2px] h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-150 ease-out"
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
function parseHexInput(raw: string): string | null {
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

/** The compact colour control: a hex field and a swatch. Every place a colour
 *  is chosen carries the field - a picker without one strands anyone pasting
 *  a code from elsewhere. */
function HexSwatch({
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
  const commit = (raw: string): void => {
    setDraft(null) // either it took, or the field goes back to the colour
    const full = parseHexInput(raw)
    if (full) onChange(full)
  }
  return (
    <span className="flex items-center gap-1.5">
      <input
        value={text}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(text)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(text)
          else if (e.key === 'Escape') setDraft(null)
        }}
        spellCheck={false}
        aria-label={`${label} hex value`}
        className="w-[64px] rounded-[var(--p-radius-sm)] border border-[color:var(--p-line)] bg-[var(--p-control)] px-1 py-0.5 text-center font-mono text-[10.5px] uppercase text-[var(--p-text)] focus-visible:border-[var(--p-accent-hi)] focus-visible:outline-none"
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
function Segmented<T extends string>({
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
                ? 'bg-[var(--p-accent)] text-[var(--p-on-accent)]'
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
function SaveButton({ dirty, onClick, title }: { dirty: boolean; onClick: () => void; title: string }): JSX.Element {
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
function ThemeHead({ sub, save }: { sub: string; save: ReactNode }): JSX.Element {
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
const ROWS = 'border-t border-[color:var(--p-line)]'

/** One setting: copy on the left, control on the right. The hint is one line -
 *  it truncates rather than wraps, because a setting that needs a paragraph
 *  needs a better name instead. `off` dims the whole row: a control that
 *  cannot be used should not look like one that can. */
function Pref({
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
function Select({
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

/** The quiet accent-outlined button a row uses for a verb of its own. */
const ROW_BUTTON =
  'h-8 rounded-lg border border-[color:var(--p-accent)]/45 bg-[var(--p-accent)]/10 px-3 text-[12px] font-semibold text-[var(--p-accent-hi)] transition-colors hover:border-[color:var(--p-accent)] hover:bg-[var(--p-accent)]/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--p-accent)]/45'

/* ---------- appearance ---------- */

/** A theme as a miniature terminal: prompt, coloured ls output, cursor. The
 *  point is the SYNTAX colours - a swatch row says nothing about how a real
 *  session will read. Every card paints itself with its OWN palette, never the
 *  chrome's tokens: the chrome is whichever theme is selected, and a wall of
 *  cards wearing that would be one theme drawn forty times. */
function TermThemeCard({
  id,
  name,
  on,
  bg,
  fg,
  cursor,
  ansi,
  onPick,
  onEdit
}: {
  id: string
  name: string
  on: boolean
  bg: string
  fg: string
  cursor: string
  ansi: { green: string; yellow: string; blue: string; cyan: string; red: string }
  onPick: () => void
  /** Rendered as a pencil on the SELECTED card only. */
  onEdit?: () => void
}): JSX.Element {
  return (
    <button
      data-term-card={id}
      aria-pressed={on}
      onClick={onPick}
      className={`group flex w-[196px] flex-col overflow-hidden rounded-md border text-left transition-colors ${
        on
          ? 'border-[color:var(--p-accent-hi)] ring-1 ring-[var(--p-accent)]/45'
          : 'border-[color:var(--p-line)] hover:border-[color:var(--p-divider)]'
      }`}
    >
      <div
        className="h-[92px] w-full px-2.5 py-2 font-mono text-[10.5px] leading-[1.5]"
        style={{ background: bg, color: fg }}
      >
        <div>
          <span style={{ color: ansi.green }}>you@pc</span>
          <span style={{ color: fg }}>:</span>
          <span style={{ color: ansi.blue }}>~/app</span>
          <span style={{ color: ansi.red }}>$</span> ls
          <span className="ml-[1px] inline-block h-[11px] w-[6px] translate-y-[2px]" style={{ background: cursor }} />
        </div>
        <div>
          <span style={{ color: ansi.blue }}>src</span>  <span style={{ color: ansi.blue }}>docs</span>{'  '}
          <span style={{ color: ansi.green }}>run.sh</span>
        </div>
        <div>
          <span style={{ color: ansi.yellow }}>notes.md</span>  <span style={{ color: ansi.cyan }}>a.link</span>
        </div>
        <div style={{ color: fg }}>12 files</div>
      </div>
      <div
        className={`flex items-center justify-between border-t px-2.5 py-1.5 text-[11.5px] font-semibold ${
          on ? 'border-[color:var(--p-accent-hi)]/40 text-[var(--p-accent-hi)]' : 'border-[color:var(--p-line)] text-[var(--p-text)]'
        }`}
      >
        <span>{name}</span>
        {/* Only the SELECTED theme wears the pencil: editing starts from what
            you are using, and saving lands in the Custom slot. */}
        {on && onEdit && (
          <span
            role="button"
            tabIndex={0}
            data-edit-theme={id}
            className="grid h-5 w-5 place-items-center rounded text-[var(--p-accent-hi)] hover:bg-[var(--p-hover)]"
            title="Edit colours (saves as Custom)"
            aria-label={`Edit ${name}`}
            onClick={(e) => {
              e.stopPropagation()
              onEdit()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                onEdit()
              }
            }}
          >
            <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 5l4 4L8 20H4v-4z" />
            </svg>
          </span>
        )}
      </div>
    </button>
  )
}

const ANSI_KEYS = [
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'
] as const

/** The five colours a card's miniature session reads, with the fallbacks a
 *  custom palette missing one of them gets. */
const cardAnsi = (
  a: Record<string, string | undefined>
): { green: string; yellow: string; blue: string; cyan: string; red: string } => ({
  green: a.green ?? '#8cc265',
  yellow: a.yellow ?? '#d1a54b',
  blue: a.blue ?? '#4aa5f0',
  cyan: a.cyan ?? '#42b3c2',
  red: a.red ?? '#e05561'
})

/** The Tabby-style editor: every colour of a theme, individually, with the
 *  live preview beside them. Save lands in the single Custom slot. */
function TermThemeEditor({
  seed,
  onSave,
  onCancel
}: {
  seed: CustomTermTheme
  onSave: (t: CustomTermTheme) => void
  onCancel: () => void
}): JSX.Element {
  const [draft, setDraft] = useState<CustomTermTheme>(seed)
  const set = (k: string, v: string): void =>
    setDraft((d) =>
      k === 'bg' || k === 'fg' || k === 'cursor'
        ? { ...d, [k]: v }
        : { ...d, ansi: { ...d.ansi, [k]: v } }
    )
  const well = (label: string, key: string, value: string): JSX.Element => (
    <label key={key} className="flex items-center justify-between gap-2 text-[11px] text-[var(--p-dim)]">
      <span className="w-[86px] truncate">{label}</span>
      <HexSwatch label={label} value={value} onChange={(v) => set(key, v)} />
    </label>
  )
  return (
    // A popup, not an inline section: below the card grid the editor sat out
    // of view. data-owns-escape keeps App's window Escape away; the backdrop
    // and Escape both cancel.
    <div
      data-theme-editor
      data-owns-escape
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-[3px]"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onCancel()
        }
      }}
      role="dialog"
      aria-label="Edit terminal colours"
    >
      <div className="max-h-[85vh] overflow-y-auto rounded-lg border border-[color:var(--p-divider)] bg-[var(--p-side-flat)] p-5 shadow-[0_18px_48px_rgba(0,0,0,.55)]">
        <div className="mb-3 text-[13px] font-bold text-[var(--p-text)]">Edit colours</div>
        <div className="flex flex-wrap items-start gap-6">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            {well('Background', 'bg', draft.bg)}
            {well('Foreground', 'fg', draft.fg)}
            {well('Cursor', 'cursor', draft.cursor)}
            {ANSI_KEYS.map((k) => well(k, k, draft.ansi[k] ?? '#888888'))}
          </div>
          <TermThemeCard
            id="custom-preview"
            name="Custom"
            on
            bg={draft.bg}
            fg={draft.fg}
            cursor={draft.cursor}
            ansi={cardAnsi(draft.ansi)}
            onPick={() => {}}
          />
        </div>
        <div className="mt-4 flex gap-2">
          <button
            data-save-custom
            className="h-8 rounded-lg bg-[var(--p-accent)] px-4 text-[12px] font-semibold text-[var(--p-on-accent)] hover:brightness-110"
            onClick={() => onSave(draft)}
          >
            Save as Custom
          </button>
          <button
            className="h-8 rounded-lg border border-[color:var(--p-line)] px-4 text-[12px] font-semibold text-[var(--p-text)] transition-colors hover:border-[color:var(--p-divider)]"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

/** The selected theme's palette as the editor and the Custom slot hold it.
 *  Normalised: a theme may publish rgba() or #rrggbbaa, and a colour input
 *  handed either silently renders black. */
function paletteOf(id: string): Pick<CustomTermTheme, 'bg' | 'fg' | 'cursor' | 'ansi'> {
  const t = resolveTermTheme(id)
  const ansi: Record<string, string> = {}
  for (const k of ANSI_KEYS) {
    const v = t[k]
    if (typeof v === 'string') ansi[k] = v
  }
  return {
    bg: normalizeColor(t.background, '#0b0b0f'),
    fg: normalizeColor(t.foreground, '#e7e7ee'),
    cursor: normalizeColor(t.cursor, '#5b5bd6'),
    ansi
  }
}

/** Picking a theme returns the LOOK to its defaults: the theme is the whole
 *  setup. The indicator's volume is carried across, because it is a General
 *  setting here (how loudly a tab speaks, not what the terminal looks like)
 *  and a behaviour that reset itself on a theme click would be a setting that
 *  does not hold. */
function pickPreset(id: string): void {
  const volume = agentIndicator()
  setTermThemeId(id)
  resetTermExtras()
  if (volume !== TERM_EXTRA_DEFAULTS.indicator) setAgentIndicator(volume)
}

function AppearanceTab(): JSX.Element {
  const themeId = useTermThemeId()
  const fontPct = useTermFontPct()
  const fontId = useTermFontId()
  const acrylicOn = useTermAcrylic()
  const opacity = useTermOpacity()
  // The CHOICES ('' = follow the theme) are what is saved and compared; the
  // colours in force are what the swatches show.
  const agentCol = useAgentColorChoice()
  const doneCol = useAgentDoneColorChoice()
  const inForce = useAgentColors()
  const custom = useCustomTermTheme()
  // The material is Windows 11's; null while main has not answered yet, which
  // reads as supported so the row does not flash disabled on every open.
  const [acrylicOk, setAcrylicOk] = useState<boolean | null>(null)
  useEffect(() => {
    let live = true
    void window.prism.acrylicSupported().then((ok) => {
      if (live) setAcrylicOk(ok)
    })
    return () => {
      live = false
    }
  }, [])
  const noAcrylic = acrylicOk === false
  // Presets ordered by brightness, the themes nearest your own look leading:
  // on a light theme the wall runs light to dark, on a dark one dark to light.
  // The direction is MEASURED off the theme worn when the page opened, and
  // read once: the chrome follows the theme now, so re-sorting on every pick
  // would shuffle the wall under the pointer that just clicked a card.
  const [lightFirst] = useState(
    () => luminance(normalizeColor(resolveTermTheme(termThemeId()).background, '#000000')) > 0.4
  )
  const sortedPresets = useMemo(() => {
    const lum = (bg: string): number => luminance(normalizeColor(bg, '#000000'))
    return [...TERM_PRESETS].sort((a, b) => (lightFirst ? lum(b.bg) - lum(a.bg) : lum(a.bg) - lum(b.bg)))
  }, [lightFirst])
  // "Save changes": the WHOLE look - palette of the selected theme, font,
  // size, agent colours, acrylic and its opacity - lands in the Custom slot,
  // reselectable after any theme switch. The indicator's volume is not part
  // of it (see pickPreset).
  const extras = {
    font: fontId,
    fontPct,
    indicatorColor: agentCol,
    doneColor: doneCol,
    acrylic: acrylicOn,
    opacity
  }
  // Dirty = the SETTINGS deviate from the selected theme's stock: any theme
  // arrives with the defaults, a Custom arrives with what it saved. Comparing
  // whole palettes kept the button lit forever - the palette IS the selection.
  // Built field by field in the same order as `extras`, since the comparison
  // is by JSON and key order is part of that.
  const src = themeId === 'custom' && custom ? custom : null
  const baseline = {
    font: src?.font ?? TERM_EXTRA_DEFAULTS.font,
    fontPct: src?.fontPct ?? TERM_EXTRA_DEFAULTS.fontPct,
    indicatorColor: src?.indicatorColor ?? TERM_EXTRA_DEFAULTS.indicatorColor,
    doneColor: src?.doneColor ?? TERM_EXTRA_DEFAULTS.doneColor,
    acrylic: src?.acrylic ?? TERM_EXTRA_DEFAULTS.acrylic,
    opacity: src?.opacity ?? TERM_EXTRA_DEFAULTS.opacity
  }
  const termDirty = JSON.stringify(extras) !== JSON.stringify(baseline)
  const saveTermSetup = (): void => {
    saveCustomTermTheme({ ...paletteOf(termThemeId()), ...extras })
    setTermThemeId('custom')
  }
  // The editor popup, seeded from the SELECTED theme. Presets never change -
  // editing always lands in the Custom slot.
  const [editing, setEditing] = useState<CustomTermTheme | null>(null)
  // Measured at click time, so the expand can ANIMATE: max-height can't
  // tween to 'none', only to a number, and the content's real height is the
  // honest one. 268px is the two collapsed rows.
  const [wallHeight, setWallHeight] = useState(268)
  const allThemes = wallHeight !== 268
  const themeWall = useRef<HTMLDivElement>(null)
  const toggleWall = (): void =>
    setWallHeight(allThemes ? 268 : (themeWall.current?.scrollHeight ?? 2400))
  return (
    <div className={ROWS}>
      <div className="border-b border-[color:var(--p-line)] py-2.5">
        <ThemeHead
          sub="Whole palettes, ANSI colours included. The window wears the theme you pick."
          save={
            <SaveButton
              dirty={termDirty}
              onClick={saveTermSetup}
              title="Keep the whole look - theme, font, agent colours, acrylic - as Custom"
            />
          }
        />
        <div
          ref={themeWall}
          // Ease OPEN only: the transition class is present exactly when the
          // expanded height applies, so collapsing snaps shut instantly.
          className={`relative mt-3 overflow-hidden ${
            allThemes ? 'transition-[max-height] duration-[240ms] [transition-timing-function:cubic-bezier(.16,1,.3,1)]' : ''
          }`}
          // Two card rows by default: every theme as one wall buried the font
          // row below them. The snap-open eased in 240ms rather than jumping.
          style={{ maxHeight: wallHeight }}
        >
          <div className="flex flex-wrap gap-3">
            {custom && (
              <TermThemeCard
                id="custom"
                name="Custom"
                on={themeId === 'custom'}
                bg={custom.bg}
                fg={custom.fg}
                cursor={custom.cursor}
                ansi={cardAnsi(custom.ansi)}
                onPick={() => {
                  setTermThemeId('custom')
                  // The saved setup is more than the palette: font, agent
                  // colours, acrylic come back with it when the save captured them.
                  applyCustomExtras(custom)
                }}
                onEdit={() => setEditing(paletteOf('custom'))}
              />
            )}
            {sortedPresets.map((p) => {
              const t = resolveTermTheme(p.id)
              return (
                <TermThemeCard
                  key={p.id}
                  id={p.id}
                  name={p.name}
                  on={themeId === p.id}
                  bg={t.background}
                  fg={t.foreground}
                  cursor={t.cursor}
                  ansi={{
                    green: t.green ?? '',
                    yellow: t.yellow ?? '',
                    blue: t.blue ?? '',
                    cyan: t.cyan ?? '',
                    red: t.red ?? ''
                  }}
                  onPick={() => pickPreset(p.id)}
                  onEdit={() => setEditing(paletteOf(p.id))}
                />
              )
            })}
          </div>
        </div>
        <div className="mt-2 flex justify-center">
          <button
            data-theme-wall-toggle
            aria-expanded={allThemes}
            aria-label={allThemes ? 'Show fewer themes' : `Show all ${TERM_PRESETS.length + (custom ? 1 : 0)} themes`}
            title={allThemes ? 'Show fewer' : 'Show all themes'}
            className="grid h-7 w-10 place-items-center rounded text-[var(--p-icon)] transition-colors hover:bg-[var(--p-hover)] hover:text-[var(--p-text)]"
            onClick={toggleWall}
          >
            <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${allThemes ? 'rotate-180' : ''}`} aria-hidden>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>
        {editing && (
          <TermThemeEditor
            seed={editing}
            onSave={(t) => {
              saveCustomTermTheme(t)
              setTermThemeId('custom')
              setEditing(null)
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </div>
      <Pref id="term-font-family" label="Font" hint="The terminal's typeface. A face you don't have falls back quietly.">
        <Select
          id="term-font-family"
          value={fontId}
          onChange={setTermFontId}
          options={TERM_FONTS.map((f) => ({ id: f.id, name: f.name, style: { fontFamily: f.stack } }))}
        />
      </Pref>
      <Pref
        id="term-font"
        label="Font size"
        hint="The base for every terminal. Ctrl+scroll zooms one session only."
      >
        <Select
          id="term-font"
          value={String(fontPct)}
          onChange={(v) => setTermFontPct(Number(v))}
          options={FONT_PCTS.map((p) => ({ id: String(p), name: `${p}%` }))}
        />
      </Pref>
      {/* The material does not exist before Windows 11, so there the row says
          why instead of offering a switch that would do nothing. */}
      <Pref
        id="term-acrylic"
        label="Acrylic background"
        off={noAcrylic}
        hint={noAcrylic ? 'Needs Windows 11' : 'The desktop shows through the window, terminal and chrome alike. Works with any theme.'}
      >
        <Switch
          on={acrylicOn && !noAcrylic}
          onChange={setTermAcrylic}
          label="Acrylic background"
          disabled={noAcrylic}
        />
      </Pref>
      <Pref
        id="term-opacity"
        label="Opacity"
        off={noAcrylic || !acrylicOn}
        hint={noAcrylic ? 'Needs Windows 11' : 'How much of the theme\'s background is painted over the acrylic.'}
      >
        <div className="flex items-center gap-3">
          <span className="w-[34px] text-right font-mono text-[11.5px] text-[var(--p-dim)]">
            {opacity}%
          </span>
          <input
            id="term-opacity"
            type="range"
            min={30}
            max={100}
            step={5}
            value={opacity}
            disabled={noAcrylic || !acrylicOn}
            onChange={(e) => setTermOpacity(Number(e.target.value))}
            className="h-1.5 w-[180px] cursor-pointer appearance-none rounded-full bg-[var(--p-track)] disabled:cursor-default"
            style={{ accentColor: 'var(--p-accent)' }}
          />
        </div>
      </Pref>
      <Pref
        id="agent-color"
        label="Agent working indicator"
        hint={
          agentCol
            ? "The line under a tab (minimal) or the tab's fill (full) while its agent works. Your own colour."
            : "The line under a tab (minimal) or the tab's fill (full) while its agent works. Follows the theme's accent."
        }
      >
        <div className="flex items-center gap-2.5">
          {agentCol && (
            <button data-follow-theme="working" onClick={() => setAgentColor('')} className={ROW_BUTTON}>
              Follow theme
            </button>
          )}
          <HexSwatch label="Agent working indicator" value={inForce.working} onChange={setAgentColor} />
        </div>
      </Pref>
      <Pref
        id="agent-done-color"
        label="Agent finished indicator"
        hint={
          doneCol
            ? 'A tab whose agent finished while you were elsewhere wears this until you visit it. Full indicator only. Your own colour.'
            : "A tab whose agent finished while you were elsewhere wears this until you visit it. Full indicator only. Follows the theme's green."
        }
      >
        <div className="flex items-center gap-2.5">
          {doneCol && (
            <button data-follow-theme="finished" onClick={() => setAgentDoneColor('')} className={ROW_BUTTON}>
              Follow theme
            </button>
          )}
          <HexSwatch label="Agent finished indicator" value={inForce.finished} onChange={setAgentDoneColor} />
        </div>
      </Pref>
    </div>
  )
}

/* ---------- general ---------- */

function GeneralTab(): JSX.Element {
  // The shells main detected, fetched when the page first shows. `saved` may
  // name one that no longer exists; the select then shows the real default,
  // which is also what a new terminal would actually launch.
  const [shells, setShells] = useState<Array<{ id: string; name: string }>>([])
  const [shellChoice, setShellChoice] = useState(() => savedShellId() ?? '')
  const [version, setVersion] = useState('')
  // Explorer's context-menu verb lives in the registry, not in a settings
  // file: the switch reports what Windows actually has.
  const [verb, setVerbState] = useState(false)
  const [verbBusy, setVerbBusy] = useState(true)
  useEffect(() => {
    let live = true
    void window.prism.termShells().then((list) => {
      if (live) setShells(list.map((sh) => ({ id: sh.id, name: sh.name })))
    })
    void window.prism.appVersion().then((v) => {
      if (live) setVersion(v)
    })
    void window.prism.shellVerbStatus().then((on) => {
      if (live) {
        setVerbState(on)
        setVerbBusy(false)
      }
    })
    return () => {
      live = false
    }
  }, [])
  const setVerb = (on: boolean): void => {
    setVerbBusy(true)
    void window.prism.setShellVerb(on).then(async () => {
      // Read it back rather than trusting the write: this is the registry.
      setVerbState(await window.prism.shellVerbStatus())
      setVerbBusy(false)
    })
  }
  const shellValue = shells.some((sh) => sh.id === shellChoice) ? shellChoice : (shells[0]?.id ?? '')

  const agentInd = useAgentIndicator()
  const askClose = useConfirmClose()
  const tabMode = useNewTabMode()
  const tabFolder = useNewTabFolder()
  const chooseFolder = (): void => {
    void window.prism.pickFolder().then((dir) => {
      if (dir) setNewTabMode('folder', dir)
    })
  }
  // With no folder chosen, "a folder" is the user's own (owner, 2026-09-18:
  // the + should simply open, and asking is the option, not the default).
  const [home, setHome] = useState('')
  useEffect(() => {
    void window.prism.homeDir().then(setHome)
  }, [])
  return (
    <div className={ROWS}>
      <Pref
        id="newtab-mode"
        label="New tabs"
        hint={
          tabMode === 'ask'
            ? 'The + and Ctrl+T ask for a folder every time.'
            : tabFolder || (home ? `Your user folder: ${home}` : 'Your user folder')
        }
      >
        <div className="flex items-center gap-2.5">
          {tabMode === 'folder' && tabFolder && (
            <button data-use-home onClick={() => setNewTabMode('folder', '')} className={ROW_BUTTON}>
              Use my user folder
            </button>
          )}
          {tabMode === 'folder' && (
            <button data-choose-folder onClick={chooseFolder} className={ROW_BUTTON}>
              Choose folder…
            </button>
          )}
          <Segmented
            value={tabMode}
            onChange={(v: 'ask' | 'folder') => setNewTabMode(v)}
            options={[
              { id: 'folder', name: 'Open in a folder' },
              { id: 'ask', name: 'Ask where each time' }
            ]}
          />
        </div>
      </Pref>
      {shells.length > 0 && (
        <Pref id="term-shell" label="Shell" hint="Applies to new tabs.">
          <Select
            id="term-shell"
            value={shellValue}
            onChange={(v) => {
              setShellChoice(v)
              saveShellId(v)
            }}
            options={shells}
          />
        </Pref>
      )}
      <Pref
        id="agent-indicator"
        label="Agent indicator"
        hint="Minimal runs a line under the tab while an agent works. Full fills the tab, and keeps the finished colour until you visit it. Idle tabs stay default."
      >
        <Segmented
          value={agentInd}
          onChange={(v) => setAgentIndicator(v as AgentIndicator)}
          options={[
            { id: 'off', name: 'Off' },
            { id: 'minimal', name: 'Minimal' },
            { id: 'full', name: 'Full' }
          ]}
        />
      </Pref>
      <Pref
        id="confirm-close"
        label="Ask before closing a working agent"
        hint="Closing a tab, or the window, while Claude or Codex is working asks first. Off means off."
      >
        <Switch on={askClose} onChange={setConfirmClose} label="Ask before closing a working agent" />
      </Pref>
      {/* Explorer's own menu. Windows 11 hides classic verbs behind "Show more
          options", and saying so is better than the user hunting for it. */}
      <Pref
        id="explorer-verb"
        label="Explorer menu"
        hint={verbBusy ? 'Asking Windows…' : 'On Windows 11 it is under Show more options.'}
      >
        <Switch
          on={verb}
          onChange={setVerb}
          label="Open in Prism Terminal in the Explorer menu"
          disabled={verbBusy}
        />
      </Pref>
      <Pref id="app-version" label="Version" hint="Updates show as a chip in the title bar when there is one.">
        <span id="app-version" data-app-version className="font-mono text-[12px] text-[var(--p-text-soft)]">
          {version}
        </span>
      </Pref>
    </div>
  )
}

/* ---------- page shell ---------- */

type TabId = 'general' | 'appearance'

const Ico = ({ d }: { d: string }): JSX.Element => (
  <svg
    viewBox="0 0 24 24"
    width={17}
    height={17}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d={d} />
  </svg>
)

// How the app behaves, then what it looks like.
const TABS: Array<{ id: TabId; label: string; icon: ReactNode }> = [
  {
    id: 'general',
    label: 'General',
    icon: (
      <Ico d="M4 7h8M16 7h4M4 17h4M12 17h8M12 7a2 2 0 1 0 4 0 2 2 0 1 0-4 0M8 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0" />
    )
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: (
      <Ico d="M12 3a9 9 0 1 0 0 18 3 3 0 0 0 0-6 3 3 0 0 1 0-6h3a6 6 0 0 0-3-6ZM7.5 10.5h.01M10 7h.01M14 7h.01" />
    )
  }
]

// Settings keeps the system font whatever the terminal wears: the faces on
// offer in here are monospace ones for the shell, and a page of preference
// rows set in one is harder to read, not more consistent.
const UI_FONT = '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif'

/**
 * The Settings page. It rides the tab strip as a tab of its own, so it FILLS
 * whatever App mounts it in rather than fixing itself over the window, and it
 * takes no props: there is nothing to close (the tab's X does that) and every
 * setting is a store it writes.
 */
export default function Settings(): JSX.Element {
  const [tab, setTab] = useState<TabId>('general')
  const active = TABS.find((t) => t.id === tab) ?? TABS[0]
  return (
    <div
      data-settings-page
      className="flex h-full min-h-0 w-full"
      style={{ fontFamily: UI_FONT, fontSize: '12.5px' }}
    >
      <aside className="flex w-[212px] shrink-0 flex-col overflow-hidden border-r border-[var(--p-divider)] bg-[var(--p-side)] p-2.5">
        <div className="px-2 pb-1 pt-1 text-[14px] font-bold tracking-tight text-[var(--p-text)]">
          Settings
        </div>
        <nav className="flex flex-col gap-0.5 pt-3">
          {TABS.map((t) => {
            const on = t.id === tab
            return (
              <button
                key={t.id}
                data-settings-tab={t.id}
                onClick={() => setTab(t.id)}
                aria-current={on ? 'page' : undefined}
                className={`flex items-center gap-2.5 rounded-[var(--p-radius-sm)] px-2.5 py-[7px] text-left text-[13px] transition ${
                  on
                    ? 'bg-[var(--p-sel-bg)] font-semibold text-[var(--p-on-accent)]'
                    : 'font-medium text-[var(--p-dim)] hover:bg-[var(--p-hover)] hover:text-[var(--p-text)]'
                }`}
              >
                <span className={on ? 'opacity-90' : ''}>{t.icon}</span>
                {t.label}
              </button>
            )
          })}
        </nav>
        <div className="mt-auto px-2 pb-0.5 text-[10.5px] text-[var(--p-dim2)]">Prism Terminal</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col bg-[var(--p-bg)]">
        <header className="px-6 pb-3 pt-5">
          <h2 className="text-[21px] font-bold leading-none tracking-[-.022em] text-[var(--p-text)]">
            {active.label}
          </h2>
        </header>
        <div className="p-scroll min-h-0 flex-1 overflow-y-auto px-6 py-2">
          {tab === 'general' ? <GeneralTab /> : <AppearanceTab />}
        </div>
      </div>
    </div>
  )
}
