import { configureTermCore } from '@core/renderer/host'
import { themeAgentColors } from './lib/agentColors'

/**
 * PRISM TERMINAL AS A HOST OF THE TERMINAL CORE (#15).
 *
 * Everything that is the terminal lives in `core/` and is shared with Prism.
 * This file is the whole of what this app says differently, and each line is an
 * owner decision recorded in CLAUDE.md: the terminal theme drives the window
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
    theme: 'prism',
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
  // Nothing else owns the window, so the terminal setting switches its material.
  acrylic: { kind: 'window', supported: () => window.prism.acrylicSupported() },
  paintsGround: true,
  ownsKey: (e) => {
    if (!e.ctrlKey || e.altKey) return false
    const k = e.key.toLowerCase()
    // Next / previous tab, jump to a tab, Settings.
    if (e.key === 'Tab' || /^[1-9]$/.test(e.key) || e.key === ',') return true
    // New tab is Ctrl+T and close tab is Ctrl+W (owner, 2026-09-18 and -19),
    // with or without shift, as in Prism and in every browser. That takes
    // both chords from whatever runs in the shell (Claude Code's task list;
    // readline's delete-word, for which Ctrl+Backspace remains): the owner's
    // trade, made knowingly.
    if (k === 't' || k === 'w') return true
    // Find carries SHIFT, and the shift is tested: plain Ctrl+F is the shell's.
    return e.shiftKey && k === 'f'
  }
})
