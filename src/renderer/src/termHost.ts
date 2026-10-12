import { appOwnsKey } from './lib/keymap'
import { tabLayout } from './lib/tabLayoutPrefs'
import { focusedTermFullScreen } from '@core/renderer/components/TerminalPanel'
import { configureTermCore } from '@core/renderer/host'
import { helpEnabled } from '@core/renderer/lib/helpPrefs'
import { themeAgentColors } from './lib/agentColors'
import { onWindowAccentChange } from './lib/accentPrefs'
import { onWindowBackgroundChange, windowBackground } from './lib/backgroundPrefs'

/**
 * PRISM TERMINAL AS A HOST OF THE TERMINAL CORE (#15).
 *
 * Everything that is the terminal lives in `core/` and is shared with Prism.
 * This file is the whole of what this app says differently, and each line is an
 * owner decision recorded in docs/regression-rules.md: the terminal theme drives the window
 * (so there is no host style to follow), the panel paints the ground, the
 * indicator is quiet and wears the theme by default, and the app claims only
 * the chords a shell never uses.
 *
 * A SIDE-EFFECT MODULE, imported FIRST by main.tsx: imports are evaluated in
 * order and before main.tsx's own body, so anything in App's module graph that
 * reads a terminal setting at import time must find a host already there.
 * (Learned in Prism, whose theme.ts paints at import time.)
 */
configureTermCore({
  api: window.prism,
  defaults: {
    theme: 'pt-default',
    acrylic: false,
    indicator: 'minimal',
    // '' = follow the theme (lib/agentColors resolves what that is here).
    agentColor: '',
    agentDoneColor: ''
  },
  followsHostStyle: false,
  // The window's chrome is derived from the terminal theme here, so that is
  // where the accent an unpicked indicator wears comes from.
  themedAgentColors: themeAgentColors,
  // The Background colour setting paints the terminal's ground too (the panel
  // reads --p-bg), so the core floors the palette against it; a picked accent
  // or background recolours the indicator and restyles the running shells.
  terminalGround: windowBackground,
  onChromeChange: (cb) => {
    const offAccent = onWindowAccentChange(cb)
    const offBackground = onWindowBackgroundChange(cb)
    return () => {
      offAccent()
      offBackground()
    }
  },
  // Nothing else owns the window, so the terminal setting switches its material.
  acrylic: { kind: 'window', supported: () => window.prism.acrylicSupported() },
  paintsGround: true,
  // THE TAB MARKS (#143; owner, 2026-10-10): this strip draws the core's
  // marks, so the Agents page offers all four styles and the rainbow finish.
  tabMarks: { indicators: ['off', 'minimal', 'ring', 'full'], rainbow: true },
  // DICTATION (#13). A press only counts over a shell, and App already hands
  // the controller null when the start screen or Settings is in front, so
  // there is nothing further for this app to refuse.
  dictation: { api: window.prism, canDictate: () => true },
  // The app's keys (lib/keymap), the same table App's handler reads, so xterm
  // yields exactly the chords the app acts on.
  ownsKey: (e) =>
    appOwnsKey(e, { help: helpEnabled(), vertical: tabLayout() === 'vertical', fullScreen: focusedTermFullScreen() })
})
