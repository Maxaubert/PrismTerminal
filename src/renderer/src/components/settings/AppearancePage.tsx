import { useEffect, useState, useSyncExternalStore, type JSX } from 'react'
import { WINDOW_EDGES, type WindowEdges } from '@shared/windowEdges'
import { RESET_LINK, Segmented, Switch } from '@core/renderer/settings/fields'
import { ColourField } from '@core/renderer/settings/ColourPicker'
import { SettingRow } from '@core/renderer/settings/layout/SettingRow'
import { SettingsSection } from '@core/renderer/settings/layout/SettingsSection'
import { TerminalThemeSection } from '@core/renderer/settings/sections/TerminalThemeSection'
import { alphaOf, withAlpha, type AlphaRange } from '@core/renderer/lib/colour'
import { customTermTheme, onTermLookChange, termThemeId, useTermAcrylic } from '@core/renderer/lib/termLook'
import { presetAccent, resolveTermTheme } from '@core/renderer/lib/termTheme'
import { setWindowEdges, useWindowEdges } from '../../lib/edgesPrefs'
import { setTabWidth, useTabWidth, type TabWidth } from '../../lib/tabWidthPrefs'
import { setTitleBarMode, useTitleBarMode } from '../../lib/titleBarPrefs'
import { setWindowAccent, useWindowAccent } from '../../lib/accentPrefs'
import { onWindowBackgroundChange, setWindowBackground, useWindowBackground, windowBackground } from '../../lib/backgroundPrefs'
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

// Dynamic first: it is the default (owner, 2026-09-23: "call it dynamic ...
// have dynamic be the default").
const TAB_WIDTH_OPTIONS: Array<{ id: TabWidth; name: string }> = [
  { id: 'dynamic', name: 'Dynamic' },
  { id: 'fixed', name: 'Fixed' }
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
  // The theme's ground AS THE WINDOW PAINTS IT (#114): its solid colour at the
  // theme's own alpha (a Custom may carry one), so the row shows the
  // see-through that is in force while nothing is picked.
  const own = id === 'custom' ? customTermTheme() : null
  return `${vars['--p-accent']}|${withAlpha(themeBg, own ? alphaOf(own.bg) : 1)}`
}
const onColoursChange = (cb: () => void): (() => void) => {
  const offs = [onTermLookChange(cb), onWindowBackgroundChange(cb)]
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
  id: 'window-background' | 'window-accent'
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
        <button data-follow-theme={id.replace('window-', '')} onClick={() => onPick(null)} className={RESET_LINK}>
          Reset
        </button>
      )}
      {/* Escape in the picker puts back what was chosen when it opened, a
          row that followed the theme included (#112). */}
      <ColourField label={o.label} value={chosen ?? fromTheme} onChange={onPick} onRevert={() => onPick(chosen)} {...range} />
    </SettingRow>
  )
}

function WindowColours(): JSX.Element {
  const accent = useWindowAccent()
  const background = useWindowBackground()
  const [themeAccent, themeBg] = useSyncExternalStore(onColoursChange, themeColours).split('|')
  const acrylicOn = useTermAcrylic()
  // The material is Windows 11's (1809 has none): where main says it cannot
  // be had, the window never shows the desktop, so the alpha is as inert as
  // with the switch off, the rule the theme editor's Background follows.
  // Null until main answers reads as supported, so the row does not flash.
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
  const acrylic = acrylicOn && acrylicOk !== false
  return (
    <>
      {/* THE BACKGROUND'S ALPHA IS THE WINDOW'S SEE-THROUGH (#114; owner,
          2026-10-03: alpha "should be built into the colour pickers ... it
          should not be a separate opacity setting"). At least 30%, and inert
          while acrylic is off, when the desktop does not show through. */}
      <WindowColour
        id="window-background"
        sub={acrylic ? 'Its alpha lets the desktop show through.' : appOpt('window-background').sub}
        chosen={background}
        fromTheme={themeBg}
        onPick={setWindowBackground}
        range={{ alphaMin: 0.3, alphaDisabled: !acrylic }}
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
  const edges = useWindowEdges()
  const width = useTabWidth()
  const titleBar = useTitleBarMode()
  const tab = appOpt('tab-width')
  const bar = appOpt('title-bar')
  const edge = appOpt('window-edges')
  return (
    <>
      <SettingsSection id="window" title={APP_SECTIONS.window}>
        <SettingRow id="tab-width" icon={tab.icon} label={tab.label} sub={tab.sub}>
          <Segmented value={width} onChange={setTabWidth} options={TAB_WIDTH_OPTIONS} />
        </SettingRow>
        {/* A switch over the same store the segmented control wrote: on is
            `shown`, the default, the window as it always was (#91). */}
        <SettingRow id="title-bar" icon={bar.icon} label={bar.label} sub={bar.sub} tap>
          <Switch on={titleBar === 'shown'} onChange={(on) => setTitleBarMode(on ? 'shown' : 'hidden')} label={bar.label} />
        </SettingRow>
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
        onThemePicked={() => {
          setWindowBackground(null)
          setWindowAccent(null)
        }}
      />
    </>
  )
}
