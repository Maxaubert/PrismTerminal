import { configureTermCore } from '@core/renderer/host'

/**
 * PRISM TERMINAL AS A HOST OF THE TERMINAL CORE (#15).
 *
 * Everything that is the terminal lives in `core/` and is shared with Prism.
 * This file is the whole of what this app says differently, and each line is an
 * owner decision recorded in CLAUDE.md: the terminal theme drives the window
 * (so there is no host style to follow), the panel paints the ground, the
 * indicator is quiet and wears the theme by default, and the app claims only
 * the chords a shell never uses.
 */
export function configurePrismTerminalHost(): void {
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
    paintsGround: true,
    ownsKey: (e) => {
      if (!e.ctrlKey || e.altKey) return false
      const k = e.key.toLowerCase()
      // Next / previous tab, jump to a tab, Settings.
      if (e.key === 'Tab' || /^[1-9]$/.test(e.key) || e.key === ',') return true
      // New tab is Ctrl+T (owner, 2026-09-18), with or without shift, which
      // takes the chord from whatever runs in the shell (Claude Code's task
      // list): the owner's trade.
      if (k === 't') return true
      // Close tab and find carry SHIFT, and the shift is tested: plain Ctrl+W
      // deletes a word in every readline and plain Ctrl+F is the shell's.
      return e.shiftKey && (k === 'w' || k === 'f')
    }
  })
}
