import { useSyncExternalStore, type JSX } from 'react'
import { WINDOW_EDGES, type WindowEdges } from '@shared/windowEdges'
import { RESET_LINK, Segmented, Switch } from '@core/renderer/settings/fields'
import { ColourField } from '@core/renderer/settings/ColourPicker'
import { SettingRow } from '@core/renderer/settings/layout/SettingRow'
import { SettingsSection } from '@core/renderer/settings/layout/SettingsSection'
import { TerminalThemeSection } from '@core/renderer/settings/sections/TerminalThemeSection'
import { opaque, type AlphaRange } from '@core/renderer/lib/colour'
import { onTermLookChange, termThemeId, useTermThemeId } from '@core/renderer/lib/termLook'
import { presetAccent, resolveTermTheme } from '@core/renderer/lib/termTheme'
import { setWindowEdges, useWindowEdges } from '../../lib/edgesPrefs'
import { setTabSwitch, useTabSwitch, type TabSwitch } from '../../lib/tabSwitchPrefs'
import { setAgentKeys, useAgentKeys } from '../../lib/agentKeysPrefs'
import { AGENT_CHORDS, CHORDS } from '../../lib/keymap'
import { setTabLayout, useTabLayout, type TabLayout } from '../../lib/tabLayoutPrefs'
import { setWindowAccent, useWindowAccent } from '../../lib/accentPrefs'
import {
  onWindowBackgroundChange,
  setWindowBackground,
  useWindowBackground,
  windowBackground
} from '../../lib/backgroundPrefs'
import {
  onWindowSecondaryChange,
  setWindowSecondary,
  useWindowSecondary
} from '../../lib/secondaryPrefs'
import {
  NO_COLOURS,
  coloursDiffer,
  customWindowColours,
  setCustomWindowColours,
  setWindowColours,
  useCustomWindowColours
} from '../../lib/customWindowColours'
import { chromeTokens } from '../../lib/chromeTheme'
import { APP_SECTIONS, appOpt } from './appOptions'

// APPEARANCE: THE WINDOW FIRST, THE THEME AFTER IT (2026-10-05, the grouped
// cards redesign). What no theme owns sits above the theme wall (owner,
// 2026-09-28: tab width and edges "should be above the themes"), with Tab
// width the first row of the page (#56). In this app the terminal theme
// dresses the window, so its section lives here, with this app's own two
// window colours in the slot under the wall (Q2).
//
// Settings WRITES STORES and nothing else. The window's chrome and its acrylic
// material follow the terminal theme, and App is the one listening to
// onTermLookChange to repaint them.

// WEAKEST TO STRONGEST, the order Prism's own Edges row uses (None, Faint,
// Hairline, Strong). The owner asked for the option "like we have in the main
// app", and a segmented control that is a scale reads as one only when its
// steps are in order. The names come from the ids in `WINDOW_EDGES`, so the
// two lists cannot drift.
const EDGE_NAMES: Record<WindowEdges, string> = {
  none: 'None',
  faint: 'Faint',
  hairline: 'Hairline',
  solid: 'Solid'
}
const EDGE_OPTIONS: Array<{ id: WindowEdges; name: string }> = WINDOW_EDGES.map((id) => ({
  id,
  name: EDGE_NAMES[id]
}))

// Horizontal first: it is the default, the strip as it always was (#162).
const TAB_LAYOUT_OPTIONS: Array<{ id: TabLayout; name: string }> = [
  { id: 'horizontal', name: 'Horizontal' },
  { id: 'vertical', name: 'Vertical' }
]

// In order first: it is the default, Ctrl+Tab as it always was (#158).
const TAB_SWITCH_OPTIONS: Array<{ id: TabSwitch; name: string }> = [
  { id: 'order', name: 'In order' },
  { id: 'recent', name: 'Most recent' }
]

/** What the THEME in force would give the window, which is what a swatch
 *  shows while nothing is chosen: computed the way the window computes it
 *  (chromeTokens), not read back off the page, so it cannot lag a repaint.
 *  The theme's accent is measured against the PICKED background when there is
 *  one, since that is the ground it has to be seen on. */
const themeColours = (): string => {
  const id = termThemeId()
  const theme = resolveTermTheme(id)
  const bg = windowBackground()
  const vars = chromeTokens(bg ? { ...theme, background: bg } : theme, 1, presetAccent(id)).vars
  const themeBg = chromeTokens(theme, 1, presetAccent(id)).vars['--p-bg-solid']
  // The theme's ground, SOLID: the see-through is the slider's (2026-10-13).
  return `${vars['--p-accent']}|${themeBg}|${vars['--p-secondary']}`
}
const onColoursChange = (cb: () => void): (() => void) => {
  const offs = [onTermLookChange(cb), onWindowBackgroundChange(cb), onWindowSecondaryChange(cb)]
  return () => offs.forEach((off) => off())
}

/**
 * A window colour the user may pick over the theme's (owner, 2026-09-22): the
 * ACCENT ("the accents you see, like the blue highlight effect and tab
 * effect") and the BACKGROUND ("let background colour be a setting"). Each
 * follows the theme until a colour is picked, and a plain Reset word puts it
 * back, as in Prism. This app's own rows: in Prism the window's colours are
 * the app style's. A theme sets them, so they sit right under the theme wall,
 * where the core lends the place (`afterTheme`).
 */
function WindowColour({
  id,
  sub,
  chosen,
  fromTheme,
  onPick,
  range
}: {
  id: 'window-background' | 'window-accent' | 'window-secondary'
  sub: string
  chosen: string | null
  fromTheme: string
  onPick: (hex: string | null) => void
  /** The alpha this colour may carry (#114). */
  range: AlphaRange & { alphaDisabled?: boolean }
}): JSX.Element {
  const o = appOpt(id)
  return (
    <SettingRow id={id} icon={o.icon} label={o.label} sub={sub}>
      {chosen && (
        <button
          data-follow-theme={id.replace('window-', '')}
          onClick={() => onPick(null)}
          className={RESET_LINK}
        >
          Reset
        </button>
      )}
      {/* Escape in the picker puts back what was chosen when it opened, a
          row that followed the theme included (#112). */}
      <ColourField
        label={o.label}
        value={chosen ?? fromTheme}
        onChange={onPick}
        onRevert={() => onPick(chosen)}
        {...range}
      />
    </SettingRow>
  )
}

function WindowColours(): JSX.Element {
  const accent = useWindowAccent()
  const background = useWindowBackground()
  const [themeAccent, themeBg, themeSecondary] = useSyncExternalStore(
    onColoursChange,
    themeColours
  ).split('|')
  const secondary = useWindowSecondary()
  return (
    <>
      {/* THE BACKGROUND IS A COLOUR ONLY (owner, 2026-10-13: the see-through
          slider "only"): the slider over the theme wall is the see-through,
          so this picker carries no Alpha, and a pick is stored opaque. */}
      <WindowColour
        id="window-background"
        sub={appOpt('window-background').sub}
        chosen={background}
        fromTheme={themeBg}
        onPick={(hex) => setWindowBackground(hex && opaque(hex))}
        range={{ alpha: false }}
      />
      {/* THE SECONDARY COLOUR (owner, 2026-10-12): the vertical tabs'
          sidebar and title bar. The theme's own, a step off its ground, until
          one is picked; solid, its see-through is the window's. */}
      <WindowColour
        id="window-secondary"
        sub={appOpt('window-secondary').sub}
        chosen={secondary}
        fromTheme={themeSecondary}
        onPick={setWindowSecondary}
        range={{ alpha: false }}
      />
      {/* The accent's alpha is for its FILLS; its lines stay solid. */}
      <WindowColour
        id="window-accent"
        sub={appOpt('window-accent').sub}
        chosen={accent}
        fromTheme={themeAccent}
        onPick={setWindowAccent}
        range={{ alphaMin: 0.1 }}
      />
    </>
  )
}

export function AppearancePage(): JSX.Element {
  // The window colours in force and what Custom keeps (Save changes).
  const background = useWindowBackground()
  const accent = useWindowAccent()
  const secondary = useWindowSecondary()
  const kept = useCustomWindowColours()
  const themeId = useTermThemeId()
  const edges = useWindowEdges()
  const layout = useTabLayout()
  const place = appOpt('tab-layout')
  const switching = useTabSwitch()
  const swap = appOpt('tab-switch')
  const agentRow = appOpt('agent-keys')
  const agentOn = useAgentKeys()
  const edge = appOpt('window-edges')
  return (
    <>
      <SettingsSection id="window" title={APP_SECTIONS.window}>
        {/* Where the tabs sit (#162): the strip along the top, or a sidebar
            down the left. The sidebar's own open or collapsed state is its
            button's, not a row here. */}
        <SettingRow id="tab-layout" icon={place.icon} label={place.label} sub={place.sub}>
          <Segmented value={layout} onChange={setTabLayout} options={TAB_LAYOUT_OPTIONS} />
        </SettingRow>
        {/* Where Ctrl+Tab goes (#158): the strip, or the tab used last. The
            sub says what the choice in force does, so the row answers it
            without trying the keys; settings copy names no key (settingsCopy). */}
        <SettingRow
          id="tab-switch"
          icon={swap.icon}
          label={swap.label}
          sub={
            switching === 'recent'
              ? 'Back to the tab you used last.'
              : 'The next tab along the strip.'
          }
        >
          <Segmented value={switching} onChange={setTabSwitch} options={TAB_SWITCH_OPTIONS} />
        </SettingRow>
        {/* AGENT HOTKEYS (#198), on by default: keys a shell rarely needs do
            app things. The sub names no key (settingsCopy); the row's
            tooltip lists them, from the keymap, so it cannot drift. */}
        <span title={AGENT_CHORDS.map((id) => CHORDS[id].agent!.label).join(', ')} className="contents">
          <SettingRow id="agent-keys" icon={agentRow.icon} label={agentRow.label} sub={agentRow.sub} tap>
            <Switch on={agentOn} onChange={setAgentKeys} label={agentRow.label} />
          </SettingRow>
        </span>
        <SettingRow id="window-edges" icon={edge.icon} label={edge.label} sub={edge.sub}>
          <Segmented value={edges} onChange={setWindowEdges} options={EDGE_OPTIONS} />
        </SettingRow>
      </SettingsSection>
      <TerminalThemeSection
        afterTheme={<WindowColours />}
        // A THEME PICK TAKES THE WINDOW'S COLOURS WITH IT (owner, 2026-09-23:
        // "when you change a colour away from the preset and then switch theme
        // it doesn't change the altered bg and accent colours, though it
        // should"): the two picks are forgotten, as Reset does, so the new
        // theme's own background and accent are what the window wears.
        // CUSTOM KEEPS ITS OWN (owner, 2026-10-12: Save changes "never grey when
        // there are changes to save"): picking Custom brings back the window
        // colours its Save kept; the editor's save starts Custom afresh.
        onThemePicked={(id) => {
          const kept = id === 'custom' ? customWindowColours() : NO_COLOURS
          if (id === 'edited') setCustomWindowColours(null)
          setWindowColours(kept)
        }}
        // The window colours in force are changes to save while they differ
        // from what the theme in front keeps; Save keeps them with Custom.
        extraDirty={coloursDiffer(
          { background, accent, secondary },
          themeId === 'custom' ? kept : NO_COLOURS
        )}
        onSaved={() => setCustomWindowColours({ background, accent, secondary })}
      />
    </>
  )
}
