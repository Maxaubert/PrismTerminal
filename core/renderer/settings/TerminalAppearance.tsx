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
  setAgentQuestionColor,
  setAgentIndicator,
  setTermAcrylic,
  setTermFontId,
  setTermFontPct,
  setTermThemeId,
  termThemeId,
  useAgentColorChoice,
  useAgentDoneColorChoice,
  useAgentQuestionColorChoice,
  useCustomTermTheme,
  useTermAcrylic,
  useTermFontId,
  useTermFontPct,
  useTermGroundAlpha,
  useTermThemeId,
  withGroundAlpha,
  type CustomTermTheme
} from '../lib/termLook'
import { resolveCustomTheme, resolveTermTheme, watchTermTheme, TERM_PRESETS } from '../lib/termTheme'
import { useAgentColors } from '../lib/agentColors'
import { luminance, normalizeColor } from '../lib/termAnsi'
import { alphaOf, type AlphaRange } from '../lib/colour'
import { Pref, RESET_LINK, ROWS, SaveButton, Select, Switch, ThemeHead } from './fields'
import { ColourField } from './ColourPicker'
import { AgentIndicatorSetting, AttentionSettings } from './TerminalBehaviour'
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
            ? 'border-[color:var(--p-accent-hi)] ring-1 ring-[var(--p-accent-solid,var(--p-accent))]/45'
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
  bgAlpha,
  onSave,
  onCancel
}: {
  seed: CustomTermTheme
  /** What the Background's alpha may be: the window's see-through where the
   *  terminal owns the window acrylic, nothing where the style does (#114). */
  bgAlpha: AlphaRange & { alphaDisabled?: boolean }
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
      // An Escape aimed at a colour picker inside the editor is the picker's
      // (#112): this listener is native and on the window, so it hears the key
      // before the picker does, and would close the editor behind it.
      if ((e.target as Element | null)?.closest?.('[data-colour-popover]')) return
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
    if ((e.target as Element | null)?.closest?.('[data-colour-popover]')) return
    const all = [...(panel.current?.querySelectorAll<HTMLElement>('input, button, [tabindex="0"]') ?? [])].filter(
      (el) => !el.hasAttribute('disabled')
    )
    if (!all.length) return
    const i = all.indexOf(document.activeElement as HTMLElement)
    const next = e.shiftKey ? (i <= 0 ? all.length - 1 : i - 1) : i === -1 || i === all.length - 1 ? 0 : i + 1
    e.preventDefault()
    all[next].focus()
  }
  const set = (k: string, v: string | undefined): void =>
    setDraft((d) =>
      k === 'bg' || k === 'fg' || k === 'cursor' || k === 'selection'
        ? { ...d, [k]: v }
        : { ...d, ansi: { ...d.ansi, [k]: v ?? '#888888' } }
    )
  // EVERY COLOUR CARRIES AN ALPHA (#112). The Background's IS the window's
  // see-through where the terminal owns the window acrylic (#114, in place of
  // the Opacity slider), at least 30% as the slider was, and inert while
  // acrylic is off; where the style owns the glass (Prism) it has none.
  // Escape in a picker puts the draft back (no onRevert: the well's opening
  // value is written back).
  const well = (
    label: string,
    key: string,
    value: string,
    more: AlphaRange & { alphaDisabled?: boolean; onRevert?: () => void } = {}
  ): JSX.Element => (
    <div key={key} className="flex items-center justify-between gap-2 text-[11px] text-[var(--p-dim)]">
      <span className="w-[86px] truncate">{label}</span>
      <ColourField label={label} value={value} onChange={(v) => set(key, v)} {...more} />
    </div>
  )
  // The selection shows what is drawn until one is chosen: the cursor AS
  // DRAWN (composited and floored, which a see-through cursor is) at 55, the
  // terminal's own derivation, so a nudge starts from what was on screen.
  // Its alpha stops at 254/255, since xterm draws an OPAQUE selection at 0.3
  // (ThemeService, issue 2737) and what is picked must be what is drawn.
  // Escape on a selection never chosen leaves it unchosen. The preview card
  // draws the same resolution: raw alphas would show a 30% foreground the
  // terminal floors to 4.5:1.
  const chosenSelection = draft.selection
  const drawn = useMemo(() => resolveCustomTheme(draft), [draft])
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
            {well('Background', 'bg', draft.bg, bgAlpha)}
            {well('Foreground', 'fg', draft.fg)}
            {well('Cursor', 'cursor', draft.cursor)}
            {well('Selection', 'selection', chosenSelection ?? drawn.selectionBackground, {
              alphaMax: 254 / 255,
              onRevert: () => set('selection', chosenSelection)
            })}
            {ANSI_KEYS.map((k) => well(k, k, draft.ansi[k] ?? '#888888'))}
          </div>
          <TermThemeCard
            id="custom-preview"
            name="Custom"
            on
            bg={drawn.background}
            fg={drawn.foreground}
            cursor={drawn.cursor}
            ansi={cardAnsi(drawn as unknown as Record<string, string>)}
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

function paletteOf(id: string): Pick<CustomTermTheme, 'bg' | 'fg' | 'cursor' | 'ansi' | 'selection'> {
  // THE EDITOR EDITS WHAT IS STORED (#112). A Custom is handed over raw, its
  // alphas and chosen selection included: resolved, it would be the floored
  // composites, and Save changes would turn every see-through colour into an
  // opaque one. Presets and the host's style keep normalising (Prism's
  // e2e holds the follow-style Background to six digits).
  const raw = id === 'custom' ? customTermTheme() : null
  if (raw) {
    const out: Pick<CustomTermTheme, 'bg' | 'fg' | 'cursor' | 'ansi' | 'selection'> = {
      bg: raw.bg,
      fg: raw.fg,
      cursor: raw.cursor,
      ansi: { ...raw.ansi }
    }
    if (raw.selection) out.selection = raw.selection
    return out
  }
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

/** The theme Background's alpha is the window's see-through here (#114). */
const windowAcrylicOwned = (): boolean => termHost().acrylic.kind === 'window'

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
  beforeTheme,
  afterTheme,
  withIndicator = false,
  onThemePicked
}: {
  /** The host's own rows that belong to no theme, drawn first (Prism
   *  Terminal: Tab width and Edges). */
  beforeTheme?: ReactNode
  /** The host's own rows that a theme sets, drawn right under the theme wall
   *  (Prism Terminal: Background colour and Accent colour). */
  afterTheme?: ReactNode
  /** Draw the Agent indicator row here, with the font above the theme wall
   *  (2026-09-28; its style belongs to no theme). Opt-in, so a host that
   *  still places the row itself never shows it twice. */
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
  // The window's see-through (#114): the alpha of the ground in force, the
  // picked Background's first. A byte, so the comparison below is exact.
  const groundByte = Math.round(useTermGroundAlpha() * 255)
  // The CHOICES ('' = follow the theme) are what is saved and compared; the
  // colours in force are what the swatches show.
  const agentCol = useAgentColorChoice()
  const doneCol = useAgentDoneColorChoice()
  const questionCol = useAgentQuestionColorChoice()
  const inForce = useAgentColors()
  const custom = useCustomTermTheme()
  // The Custom card draws what the terminal draws (#113 review), not the raw
  // alphas; resolved once per saved Custom, which the store already caches.
  const customDrawn = useMemo(() => (custom ? resolveCustomTheme(custom) : null), [custom])
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
        onEdit={() => setEditing(withGroundAlpha(paletteOf(p.id)))}
      />
    )
  }
  // "Save changes": the theme's WHOLE look - palette of the selected theme,
  // agent colours, acrylic and how see-through the ground is - lands in the
  // Custom slot, reselectable after any theme switch. The font, its size and
  // the indicator's style belong to no theme and are not part of it
  // (2026-09-28). The see-through rides on the palette's own `bg` (#114).
  const extras = {
    indicatorColor: agentCol,
    doneColor: doneCol,
    questionColor: questionCol,
    acrylic: acrylicOn
  }
  // Dirty = the SETTINGS deviate from the selected theme's stock: any theme
  // arrives with the defaults, a Custom arrives with what it saved. Comparing
  // whole palettes kept the button lit forever - the palette IS the selection.
  // Built field by field in the same order as `extras`, since the comparison
  // is by JSON and key order is part of that.
  const src = themeId === 'custom' && custom ? custom : null
  const baseline = {
    indicatorColor: src?.indicatorColor ?? termExtraDefaults().indicatorColor,
    doneColor: src?.doneColor ?? termExtraDefaults().doneColor,
    questionColor: src?.questionColor ?? termExtraDefaults().questionColor,
    acrylic: src?.acrylic ?? termExtraDefaults().acrylic
  }
  // THE UNSAVED-CHANGES QUESTION SURVIVES THE SLIDER (#114, #60). Opacity was
  // one of the extras, so a changed one lit Save changes and a theme pick
  // asked before forgetting it. Its place is taken by the ground's alpha in
  // force against the theme's own (a preset is opaque, a Custom has its bg's):
  // a see-through picked Background lights Save changes in the same way.
  // Only where that alpha is the window's (Prism has no such alpha).
  const ownByte = src ? Math.round(alphaOf(src.bg) * 255) : 255
  const termDirty =
    JSON.stringify(extras) !== JSON.stringify(baseline) || (windowAcrylicOwned() && groundByte !== ownByte)
  const saveTermSetup = (): void => {
    saveCustomTermTheme({ ...withGroundAlpha(paletteOf(termThemeId())), ...extras })
    setTermThemeId('custom')
  }
  // A THEME PICK, Custom included. It lands at once when nothing is unsaved;
  // with Save changes lit it asks first (ThemeSwitchAsk), since landing puts
  // the agent colours and acrylic back to the theme's own. Once
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
    <div className={ROWS}>
      {/* WHAT NO THEME OWNS COMES FIRST (owner, 2026-09-28: font and font size
          "should transcend" the theme's save, "so changing a theme should not
          reset the font and font size or if you use a minimal or full agent
          indicator, or edges. those options should be above the themes in the
          list so the themes and save button appear under it"). The host's own
          such rows lead (Prism Terminal: Tab width, Edges), then the font, its
          size and the indicator's style; the theme wall and its Save follow,
          and under them only what a theme DOES set. */}
      {beforeTheme}
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
      {withIndicator && <AgentIndicatorSetting />}
      {withIndicator && <AttentionSettings />}
      <div data-pref="term-theme" className="border-b border-[color:var(--p-line)] py-2.5">
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
              title="Saves the theme, agent colours and acrylic as Custom"
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
                bg={customDrawn!.background}
                fg={customDrawn!.foreground}
                cursor={customDrawn!.cursor}
                ansi={cardAnsi(customDrawn as unknown as Record<string, string>)}
                onPick={() => pick('custom')}
                onEdit={() => setEditing(withGroundAlpha(paletteOf('custom')))}
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
            bgAlpha={windowAcrylic ? { alphaMin: 0.3, alphaDisabled: !acrylicOn || noAcrylic } : { alpha: false }}
            onSave={(t) => {
              // The Custom slot is the WHOLE setup (code review 2026-09-24,
              // #8): saved as a bare palette, the agent colours and
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
      {afterTheme}
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
              ? 'Lets the desktop show through the window and terminal. The background colour sets how much.'
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
      <Pref
        id="agent-color"
        label="Working colour"
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
          <ColourField label="Working colour" value={inForce.working} onChange={setAgentColor} onRevert={() => setAgentColor(agentCol)} />
        </div>
      </Pref>
      <Pref
        id="agent-done-color"
        label="Finished colour"
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
          <ColourField label="Finished colour" value={inForce.finished} onChange={setAgentDoneColor} onRevert={() => setAgentDoneColor(doneCol)} />
        </div>
      </Pref>
      <Pref
        id="agent-question-color"
        label="Question colour"
        hint={
          questionCol
            ? 'The colour a tab shows while its agent waits for your answer, until you open it. Uses your own colour.'
            : 'The colour a tab shows while its agent waits for your answer, until you open it. Follows the theme.'
        }
      >
        <div className="flex items-center gap-2.5">
          {questionCol && (
            <button data-follow-theme="question" onClick={() => setAgentQuestionColor('')} className={RESET_LINK}>
              Reset
            </button>
          )}
          <ColourField label="Question colour" value={inForce.question} onChange={setAgentQuestionColor} onRevert={() => setAgentQuestionColor(questionCol)} />
        </div>
      </Pref>
    </div>
  )
}
