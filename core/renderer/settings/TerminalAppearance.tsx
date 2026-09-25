import { useEffect, useMemo, useRef, useState, type JSX, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { followsHostStyle, hostDefaults, termHost } from '../host'
import {
  FONT_PCTS,
  TERM_FONTS,
  termExtraDefaults,
  agentIndicator,
  applyCustomExtras,
  customTermTheme,
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
  useCustomTermTheme,
  useTermAcrylic,
  useTermFontId,
  useTermFontPct,
  useTermOpacity,
  useTermThemeId,
  type CustomTermTheme
} from '../lib/termLook'
import { resolveTermTheme, watchTermTheme, TERM_PRESETS } from '../lib/termTheme'
import { useAgentColors } from '../lib/agentColors'
import { luminance, normalizeColor } from '../lib/termAnsi'
import { HexSwatch, Pref, RESET_LINK, ROWS, SaveButton, Select, Switch, ThemeHead } from './fields'
import { AgentIndicatorSetting } from './TerminalBehaviour'
import ThemeSwitchAsk from '../components/ThemeSwitchAsk'

// THE TERMINAL'S LOOK, as one settings section for both hosts (#15): the theme
// wall and its editor, font, size, acrylic, and the two agent indicator
// colours. It WRITES STORES and nothing else; whoever hosts it listens to
// onTermLookChange and repaints what it owns. Each app composes its own page
// round this; the rows, their names, types and behaviour are the same code.

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
  // The pencil is a real button BESIDE the card's, laid over its label row
  // (code review 2026-09-24, #28): nested inside the card's button it was
  // flattened into the card's name, and could not be reached as a control.
  return (
    <div className="relative w-[196px]">
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
          className="h-[92px] w-full px-2.5 py-2 font-[Consolas,'Cascadia_Mono',monospace] text-[10.5px] leading-[1.5]"
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
        {/* ONE HEIGHT FOR EVERY LABEL ROW (owner, 2026-09-22: "when I click a
            theme ... the ui shifts a bit"). The pencil is 20px, taller than the
            name's line, so the selected card grew and took its row of the wall
            with it: picking a theme in another row moved everything below. The
            row is fixed at a height that holds the pencil, whether it is there
            or not. */}
        <div
          className={`flex h-8 items-center justify-between border-t px-2.5 text-[11.5px] font-semibold ${
            on ? 'border-[color:var(--p-accent-hi)]/40 text-[var(--p-accent-hi)]' : 'border-[color:var(--p-line)] text-[var(--p-text)]'
          }`}
        >
          <span>{name}</span>
        </div>
      </button>
      {/* Only the SELECTED theme wears the pencil: editing starts from what
          you are using, and saving lands in the Custom slot. */}
      {on && onEdit && (
        <button
          data-edit-theme={id}
          className="absolute bottom-1.5 right-2.5 grid h-5 w-5 place-items-center rounded text-[var(--p-accent-hi)] hover:bg-[var(--p-hover)]"
          title="Edit colours, saved as Custom"
          aria-label={`Edit ${name}`}
          onClick={onEdit}
        >
          <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 5l4 4L8 20H4v-4z" />
          </svg>
        </button>
      )}
    </div>
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
  // A MODAL THAT HOLDS THE KEYBOARD (code review 2026-09-24, #28). Opened from
  // the pencil by keyboard, the focus stayed behind the backdrop: Escape did
  // nothing (it was heard only inside) and Tab walked the cards under it, where
  // Enter picked a theme beneath the open editor. So the first field takes the
  // focus, Escape is heard from the window as ThemeSwitchAsk hears it, Tab
  // stays inside, and the focus goes back to where it came from on close.
  const panel = useRef<HTMLDivElement>(null)
  const cancel = useRef(onCancel)
  useEffect(() => {
    cancel.current = onCancel
  })
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null
    panel.current?.querySelector<HTMLElement>('input, button')?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      cancel.current()
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      back?.focus?.()
    }
  }, [])
  const trapTab = (e: ReactKeyboardEvent): void => {
    if (e.key !== 'Tab' || e.ctrlKey || e.altKey || e.metaKey) return
    const all = [...(panel.current?.querySelectorAll<HTMLElement>('input, button, [tabindex="0"]') ?? [])].filter(
      (el) => !el.hasAttribute('disabled')
    )
    if (!all.length) return
    const i = all.indexOf(document.activeElement as HTMLElement)
    const next = e.shiftKey ? (i <= 0 ? all.length - 1 : i - 1) : i === -1 || i === all.length - 1 ? 0 : i + 1
    e.preventDefault()
    all[next].focus()
  }
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
      onKeyDown={trapTab}
      role="dialog"
      aria-modal="true"
      aria-label="Edit terminal colours"
    >
      <div ref={panel} className="max-h-[85vh] overflow-y-auto rounded-lg border border-[color:var(--p-divider)] bg-[var(--p-side-flat)] p-5 shadow-[0_18px_48px_rgba(0,0,0,.55)]">
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
/**
 * A PRESET'S LOOK, worked out once (2026-09-22, owner: the Appearance page
 * "takes a second to load"). A preset never changes, and resolving one runs
 * the legibility floors over its sixteen colours, so the forty cards cost the
 * same forty resolves on every change to any setting on the page. Custom and
 * Follow style are live, and are never read through this.
 */
const presetLooks = new Map<string, ReturnType<typeof resolveTermTheme>>()
function presetLook(id: string): ReturnType<typeof resolveTermTheme> {
  let look = presetLooks.get(id)
  if (!look) presetLooks.set(id, (look = resolveTermTheme(id)))
  return look
}

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
  if (volume !== termExtraDefaults().indicator) setAgentIndicator(volume)
}

/**
 * `afterFont`: an app's OWN rows, placed right under Font size (owner,
 * 2026-09-22: "move those settings, bg and accent, to the top of the list
 * right under font and font size"). The rows stay the app's - Prism passes
 * nothing, since its window colours belong to its app style - and the core
 * only lends them the place.
 */
export function TerminalAppearanceSettings({
  afterFont,
  withIndicator = false,
  onThemePicked
}: {
  afterFont?: ReactNode
  /** Draw the Agent indicator row here, above its two colours (2026-09-22).
   *  Opt-in, so a host that still places the row itself (Prism before its
   *  next core update) never shows it twice. */
  withIndicator?: boolean
  /** A theme card was picked (Custom included), after the pick landed. For a
   *  host whose OWN rows follow the theme (owner, 2026-09-23: switching theme
   *  should change "the altered bg and accent colours" too): Prism Terminal
   *  forgets its picked background and accent here. Prism passes nothing. */
  onThemePicked?: () => void
} = {}): JSX.Element {
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
  // What the HOST's style looks like right now, for its card; re-read when the
  // style repaints :root. Only a host WITH styles has one (Prism).
  const [styleTheme, setStyleTheme] = useState(() => resolveTermTheme(followsHostStyle() ? 'style' : termThemeId()))
  useEffect(() => (followsHostStyle() ? watchTermTheme(setStyleTheme) : undefined), [])
  // The material is Windows 11's; null while main has not answered yet, which
  // reads as supported so the row does not flash disabled on every open.
  const [acrylicOk, setAcrylicOk] = useState<boolean | null>(null)
  // WHAT ACRYLIC MEANS is the host's (core/renderer/host): here the terminal
  // setting switches the window's own material on ('window'), in Prism the
  // material belongs to the app style and the row only lets it show through
  // the terminal ('style'), with no slider.
  const acrylic = termHost().acrylic
  const windowAcrylic = acrylic.kind === 'window'
  useEffect(() => {
    if (acrylic.kind !== 'window') return
    let live = true
    void acrylic.supported().then((ok) => {
      if (live) setAcrylicOk(ok)
    })
    return () => {
      live = false
    }
  }, [acrylic])
  const noAcrylic = windowAcrylic && acrylicOk === false
  // Presets ordered by brightness, the themes nearest your own look leading:
  // on a light theme the wall runs light to dark, on a dark one dark to light.
  // The direction is MEASURED off the theme worn when the page opened, and
  // read once: the chrome follows the theme now, so re-sorting on every pick
  // would shuffle the wall under the pointer that just clicked a card.
  const [lightFirst] = useState(
    () => luminance(normalizeColor(resolveTermTheme(termThemeId()).background, '#000000')) > 0.4
  )
  // CUSTOM LEADS THE WALL, then THE HOST'S OWN DEFAULT (owner, 2026-09-22: "it
  // should be first in the list"; then 2026-09-23: "custom should come before
  // default"). Prism Terminal's default is a preset (PT Default); Prism's is
  // 'style', which is no preset, so there Custom leads Follow style.
  const defaultPreset = TERM_PRESETS.find((p) => p.id === hostDefaults().theme)
  const sortedPresets = useMemo(() => {
    const lum = (bg: string): number => luminance(normalizeColor(bg, '#000000'))
    return TERM_PRESETS.filter((p) => p !== defaultPreset).sort((a, b) =>
      lightFirst ? lum(b.bg) - lum(a.bg) : lum(a.bg) - lum(b.bg)
    )
  }, [lightFirst, defaultPreset])
  const presetCard = (p: (typeof TERM_PRESETS)[number]): JSX.Element => {
    const t = presetLook(p.id)
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
        onPick={() => pick(p.id)}
        onEdit={() => setEditing(paletteOf(p.id))}
      />
    )
  }
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
    font: src?.font ?? termExtraDefaults().font,
    fontPct: src?.fontPct ?? termExtraDefaults().fontPct,
    indicatorColor: src?.indicatorColor ?? termExtraDefaults().indicatorColor,
    doneColor: src?.doneColor ?? termExtraDefaults().doneColor,
    acrylic: src?.acrylic ?? termExtraDefaults().acrylic,
    opacity: src?.opacity ?? termExtraDefaults().opacity
  }
  const termDirty = JSON.stringify(extras) !== JSON.stringify(baseline)
  const saveTermSetup = (): void => {
    saveCustomTermTheme({ ...paletteOf(termThemeId()), ...extras })
    setTermThemeId('custom')
  }
  // A THEME PICK, Custom included. It lands at once when nothing is unsaved;
  // with Save changes lit it asks first (ThemeSwitchAsk), since landing puts
  // the font, size, agent colours and acrylic back to the theme's own. Once
  // it lands the host hears of it (`onThemePicked`), for its own rows that
  // follow the theme.
  const [asking, setAsking] = useState<string | null>(null)
  const land = (id: string): void => {
    const saved = customTermTheme()
    if (id === 'custom' && saved) {
      setTermThemeId('custom')
      // The saved setup is more than the palette: font, agent colours,
      // acrylic come back with it when the save captured them.
      applyCustomExtras(saved)
    } else pickPreset(id)
    onThemePicked?.()
  }
  const pick = (id: string): void => {
    if (termDirty) setAsking(id)
    else land(id)
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
    <div className={ROWS} data-pref="term-theme">
      <div className="border-b border-[color:var(--p-line)] py-2.5">
        <ThemeHead
          // Where the host has styles of its own the window wears THOSE; only a
          // host with none (Prism Terminal) dresses its window in the theme.
          sub={
            followsHostStyle()
              ? 'The colours of the terminal text and background.'
              : 'The colours of the terminal and the window around it.'
          }
          save={
            <SaveButton
              dirty={termDirty}
              onClick={saveTermSetup}
              title="Saves the theme, font, agent colours and acrylic as Custom"
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
                onPick={() => pick('custom')}
                onEdit={() => setEditing(paletteOf('custom'))}
              />
            )}
            {defaultPreset && presetCard(defaultPreset)}
            {followsHostStyle() && (
              <TermThemeCard
                id="style"
                name="Follow style"
                on={themeId === 'style'}
                bg={styleTheme.background}
                fg={styleTheme.foreground}
                cursor={styleTheme.cursor}
                ansi={cardAnsi(styleTheme as unknown as Record<string, string>)}
                onPick={() => pick('style')}
                onEdit={() => setEditing(paletteOf('style'))}
              />
            )}
            {sortedPresets.map(presetCard)}
          </div>
          {asking !== null && (
            <ThemeSwitchAsk
              onSave={() => {
                const to = asking
                setAsking(null)
                saveTermSetup()
                land(to)
              }}
              onDiscard={() => {
                const to = asking
                setAsking(null)
                land(to)
              }}
              onCancel={() => setAsking(null)}
            />
          )}
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
              // The Custom slot is the WHOLE setup (code review 2026-09-24,
              // #8): saved as a bare palette, the font, size, agent colours and
              // acrylic it held were gone for good. And it is a theme pick like
              // a card's (#29), so the host forgets its own window colours and
              // the edited background is the one that shows.
              saveCustomTermTheme({ ...t, ...extras })
              setTermThemeId('custom')
              setEditing(null)
              onThemePicked?.()
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </div>
      <Pref id="term-font-family" label="Font" hint="The typeface used in the terminal.">
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
        hint="The text size for every terminal."
      >
        <Select
          id="term-font"
          value={String(fontPct)}
          onChange={(v) => setTermFontPct(Number(v))}
          options={FONT_PCTS.map((p) => ({ id: String(p), name: `${p}%` }))}
        />
      </Pref>
      {afterFont}
      {/* The material does not exist before Windows 11, so there the row says
          why instead of offering a switch that would do nothing. */}
      <Pref
        id="term-acrylic"
        label="Acrylic background"
        off={noAcrylic}
        hint={
          noAcrylic
            ? 'Needs Windows 11.'
            : windowAcrylic
              ? 'Lets the desktop show through the window and terminal.'
              : 'Gives the terminal the same see through surface as the app. When off, the terminal has a solid background.'
        }
      >
        <Switch
          on={acrylicOn && !noAcrylic}
          onChange={setTermAcrylic}
          label="Acrylic background"
          disabled={noAcrylic}
        />
      </Pref>
      {windowAcrylic && (
        <Pref
          id="term-opacity"
          label="Opacity"
          off={noAcrylic || !acrylicOn}
          hint={noAcrylic ? 'Needs Windows 11.' : 'How much of the theme background covers the acrylic.'}
        >
          <div className="flex items-center gap-3">
            <span className="w-[34px] text-right font-[Consolas,'Cascadia_Mono',monospace] text-[11.5px] text-[var(--p-dim)]">
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
      )}
      {/* ONE ORDER IN BOTH APPS (owner, 2026-09-22: "the terminal settings
          pages in Prism and Prism Terminal should be the same in terms of
          order"). The indicator sits directly above the two colours it uses,
          here in the core, so neither app places it on its own. */}
      {withIndicator && <AgentIndicatorSetting />}
      <Pref
        id="agent-color"
        label="Agent working indicator"
        hint={
          agentCol
            ? 'The colour a tab shows while its agent is working. Uses your own colour.'
            : 'The colour a tab shows while its agent is working. Follows the theme accent.'
        }
      >
        <div className="flex items-center gap-2.5">
          {agentCol && (
            <button data-follow-theme="working" onClick={() => setAgentColor('')} className={RESET_LINK}>
              Reset
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
            ? 'The colour a tab keeps after its agent finishes, until you open it. Uses your own colour.'
            : 'The colour a tab keeps after its agent finishes, until you open it. Follows the theme green.'
        }
      >
        <div className="flex items-center gap-2.5">
          {doneCol && (
            <button data-follow-theme="finished" onClick={() => setAgentDoneColor('')} className={RESET_LINK}>
              Reset
            </button>
          )}
          <HexSwatch label="Agent finished indicator" value={inForce.finished} onChange={setAgentDoneColor} />
        </div>
      </Pref>
    </div>
  )
}
