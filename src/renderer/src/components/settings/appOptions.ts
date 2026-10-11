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
  section: 'window' | 'opening' | 'theme' | 'marks' | 'about'
  page: AppPageId
  icon: string
  keywords?: string
  store: readonly string[] | 'registry' | null
}

export const APP_OPTIONS: readonly AppOption[] = [
  { id: 'tab-width', label: 'Tab width', sub: 'Sized to the name, or all equal.', section: 'window', page: 'appearance', icon: 'tabs', keywords: 'size wide narrow equal fixed dynamic', store: ['prism.window.tabWidth'] },
  { id: 'tab-style', label: 'Tab style', sub: 'Flat tabs, or arrows like a prompt.', section: 'window', page: 'appearance', icon: 'prompt', keywords: 'chevron arrow segment shape powerline classic', store: ['prism.window.tabStyle'] },
  { id: 'tab-switch', label: 'Tab switching', sub: 'Which tab comes next when you switch.', section: 'window', page: 'appearance', icon: 'key', keywords: 'ctrl tab mru recent order cycle switch next previous last used', store: ['prism.window.tabSwitch'] },
  { id: 'title-bar', label: 'Show title bar', sub: 'When off, tabs share the top row.', section: 'window', page: 'appearance', icon: 'titlebar', keywords: 'caption top frame hide hidden', store: ['prism.window.titleBar'] },
  { id: 'window-edges', label: 'Panel edges', sub: 'Lines between panels and around the window.', section: 'window', page: 'appearance', icon: 'edges', keywords: 'border lines hairline outline faint solid', store: ['prism.window.edges'] },
  { id: 'window-background', label: 'Background colour', sub: 'Behind the text in window and terminal.', section: 'theme', page: 'appearance', icon: 'viewer', keywords: 'ground backdrop color transparent alpha opacity', store: ['prism.window.background'] },
  { id: 'window-accent', label: 'Accent colour', sub: 'Highlights, the active tab and selection.', section: 'theme', page: 'appearance', icon: 'accent', keywords: 'highlight color selection', store: ['prism.window.accent'] },
  { id: 'newtab-mode', label: 'Folder for new tabs', sub: 'Opens in your user folder.', section: 'opening', page: 'terminal', icon: 'newtab', keywords: 'folder home directory start new tab ask', store: ['prism.newtab.mode', 'prism.newtab.folder'] },
  { id: 'explorer-verb', label: 'Add to the Explorer menu', sub: 'Open terminal here, on every folder.', section: 'opening', page: 'terminal', icon: 'menu', keywords: 'context menu right click open here', store: 'registry' },
  { id: 'taskbar-badge', label: 'Count marked tabs on the taskbar', sub: 'A number on the taskbar button.', section: 'marks', page: 'agents', icon: 'taskbar', keywords: 'count number badge overlay', store: ['prism.window.taskbarBadge'] },
  { id: 'app-version', label: 'Version', sub: 'The version you are running.', section: 'about', page: 'about', icon: 'version', keywords: 'update release number', store: null }
]

/** This app's own section headings (the About section has none). */
export const APP_SECTIONS = { window: 'Window', opening: 'Opening terminals', about: '' } as const

/** One of this app's rows by id. Throws on a typo, which the tests find. */
export function appOpt(id: string): AppOption {
  const o = APP_OPTIONS.find((a) => a.id === id)
  if (!o) throw new Error(`no app settings option ${id}`)
  return o
}
