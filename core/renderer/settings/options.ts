/**
 * EVERY TERMINAL OPTION, BY ID (#15). The owner's rule: the two apps' terminal
 * settings are the same settings ("the setting names, types, how they
 * function"); only the personal values differ. The shared sections render
 * these rows as `data-pref="<id>"`, and each app has a PARITY TEST asserting
 * that what it shows is this list, so an option can never exist in one app and
 * not the other without a test going red.
 *
 * `hosts` names where a row legitimately does not appear, and why.
 */
export interface TerminalOption {
  id: string
  label: string
  type: 'choice' | 'switch' | 'range' | 'colour' | 'theme'
  /** The localStorage key behind it. Same key in both apps, separate stores. */
  key: string
  /** Absent = every host. */
  onlyWhere?: 'the terminal owns the window acrylic'
}

export const TERMINAL_OPTIONS: readonly TerminalOption[] = [
  { id: 'term-theme', label: 'Theme', type: 'theme', key: 'prism.term.theme' },
  { id: 'term-font-family', label: 'Font', type: 'choice', key: 'prism.term.font' },
  { id: 'term-font', label: 'Font size', type: 'choice', key: 'prism.term.fontPct' },
  { id: 'term-acrylic', label: 'Acrylic background', type: 'switch', key: 'prism.term.acrylic' },
  {
    id: 'term-opacity',
    label: 'Opacity',
    type: 'range',
    key: 'prism.term.opacity',
    // In Prism the window material belongs to the app style; a second alpha
    // over the same glass would fight it (owner, 2026-09-19).
    onlyWhere: 'the terminal owns the window acrylic'
  },
  { id: 'agent-color', label: 'Agent working indicator', type: 'colour', key: 'prism.term.agentColor' },
  { id: 'agent-done-color', label: 'Agent finished indicator', type: 'colour', key: 'prism.term.agentDoneColor' },
  { id: 'term-shell', label: 'Shell', type: 'choice', key: 'prism.term.shell' },
  { id: 'agent-indicator', label: 'Agent indicator', type: 'choice', key: 'prism.term.agentIndicator' }
]

/** The option ids a host should be showing. */
export function terminalOptionIds(host: { windowAcrylic: boolean }): string[] {
  return TERMINAL_OPTIONS.filter((o) => !o.onlyWhere || host.windowAcrylic).map((o) => o.id)
}
