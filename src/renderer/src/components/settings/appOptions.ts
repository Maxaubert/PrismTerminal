/**
 * THIS APP'S OWN SETTINGS ROWS, a closed list (2026-10-05, the grouped cards
 * redesign). The terminal's, dictation's and command help's rows are the
 * core's lists; these are the rows about Prism Terminal itself: its window,
 * where a new tab opens, the Explorer menu, the taskbar count, the version.
 * The `options` e2e asserts the page shows the core's lists, these, and
 * nothing else: a row in neither is a fork.
 *
 * `section` is where the row is drawn: one of this app's sections, or a core
 * section that lends this app a slot (`theme` under the wall, `marks` after
 * the agent switches). `store` is where the value lives: the localStorage
 * keys, `registry` (the Explorer verb, read back from Windows), or null for a
 * row that stores nothing. One line per entry, as in the core's lists.
 */
export type AppPageId = 'appearance' | 'terminal' | 'agents' | 'dictation' | 'diagnostics' | 'about'

export interface AppOption {
  id: string
  label: string
  sub: string
  section: 'window' | 'opening' | 'keys' | 'theme' | 'marks' | 'about'
  page: AppPageId
  icon: string
  keywords?: string
  store: readonly string[] | 'registry' | null
}

export const APP_OPTIONS: readonly AppOption[] = [
  { id: 'tab-layout', label: 'Tab position', sub: 'Tabs along the top, or down the side.', section: 'window', page: 'appearance', icon: 'sidebar', keywords: 'vertical horizontal sidebar side left strip top', store: ['prism.window.tabLayout', 'prism.window.sidebar', 'prism.window.sidebarWidth'] },
  { id: 'tab-switch', label: 'Tab switching', sub: 'Which tab comes next when you switch.', section: 'window', page: 'appearance', icon: 'key', keywords: 'ctrl tab mru recent order cycle switch next previous last used', store: ['prism.window.tabSwitch'] },
  { id: 'agent-guard', label: 'Keep agent sessions open', sub: 'Keys never clear or close a running agent.', section: 'keys', page: 'terminal', icon: 'key', keywords: 'ctrl c ctrl d exit close quit clear input interrupt claude codex agent session keys protect', store: ['prism.window.agentGuard'] },
  { id: 'agent-keys', label: 'Agent hotkeys', sub: 'Spare shell keys open the sidebar, switch tabs.', section: 'keys', page: 'terminal', icon: 'key', keywords: 'shortcuts hotkeys keyboard bindings ctrl s page up page down sidebar agent claude codex keys', store: ['prism.window.agentKeys'] },
  { id: 'window-edges', label: 'Panel edges', sub: 'Lines between panels and around the window.', section: 'window', page: 'appearance', icon: 'edges', keywords: 'border lines hairline outline faint solid', store: ['prism.window.edges'] },
  { id: 'window-background', label: 'Background colour', sub: 'Behind the text in window and terminal.', section: 'theme', page: 'appearance', icon: 'viewer', keywords: 'ground backdrop color transparent alpha opacity', store: ['prism.window.background'] },
  { id: 'window-secondary', label: 'Secondary colour', sub: 'The sidebar and title bar beside the terminal.', section: 'theme', page: 'appearance', icon: 'brush', keywords: 'sidebar title bar panel surface chrome secondary color vertical tabs', store: ['prism.window.secondary'] },
  { id: 'window-accent', label: 'Accent colour', sub: 'Highlights, the active tab and selection.', section: 'theme', page: 'appearance', icon: 'accent', keywords: 'highlight color selection', store: ['prism.window.accent'] },
  { id: 'newtab-mode', label: 'Folder for new tabs', sub: 'Opens in your user folder.', section: 'opening', page: 'terminal', icon: 'newtab', keywords: 'folder home directory start new tab ask', store: ['prism.newtab.mode', 'prism.newtab.folder'] },
  { id: 'explorer-verb', label: 'Add to the Explorer menu', sub: 'Open terminal here, on every folder.', section: 'opening', page: 'terminal', icon: 'menu', keywords: 'context menu right click open here', store: 'registry' },
  { id: 'taskbar-badge', label: 'Count marked tabs on the taskbar', sub: 'A number on the taskbar button.', section: 'marks', page: 'agents', icon: 'taskbar', keywords: 'count number badge overlay', store: ['prism.window.taskbarBadge'] },
  { id: 'app-version', label: 'Version', sub: 'The version you are running.', section: 'about', page: 'about', icon: 'version', keywords: 'update release number', store: null }
]

/** This app's own section headings (the About section has none). */
export const APP_SECTIONS = { window: 'Window', opening: 'Opening terminals', keys: 'Keys', about: '' } as const

/** One of this app's rows by id. Throws on a typo, which the tests find. */
export function appOpt(id: string): AppOption {
  const o = APP_OPTIONS.find((a) => a.id === id)
  if (!o) throw new Error(`no app settings option ${id}`)
  return o
}
