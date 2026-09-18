/**
 * The tab list, as pure data. A tab is one shell and the folder it is in.
 * Every rule about which tab is in front after a change lives here, so it can
 * be tested without a window.
 */
export interface Tab {
  /** Stable for the tab's life; also the pty session id. */
  id: string
  /** The Settings page riding the strip. Never persisted, owns no shell. */
  kind?: 'settings'
  /** Where the shell was opened, then whatever it last reported (OSC 9;9). */
  cwd: string
}

export interface TabState {
  tabs: Tab[]
  activeId: string | null
}

export const EMPTY: TabState = { tabs: [], activeId: null }
const SETTINGS_ID = 'settings'

/** Appends and activates. Two tabs in one folder are allowed: a tab is a shell, not a root. */
export function addTab(s: TabState, id: string, cwd: string): TabState {
  return { tabs: [...s.tabs, { id, cwd }], activeId: id }
}

/** Closing the tab in front hands over to its right neighbour, else its left. */
export function closeTab(s: TabState, id: string): TabState {
  const at = s.tabs.findIndex((t) => t.id === id)
  if (at < 0) return s
  const tabs = s.tabs.filter((t) => t.id !== id)
  if (s.activeId !== id) return { tabs, activeId: s.activeId }
  const next = tabs[at] ?? tabs[at - 1] ?? null
  return { tabs, activeId: next ? next.id : null }
}

export function pickTab(s: TabState, id: string): TabState {
  return s.tabs.some((t) => t.id === id) && s.activeId !== id ? { ...s, activeId: id } : s
}

/** Ctrl+Tab and its reverse. Wraps at both ends. */
export function stepTab(s: TabState, dir: 1 | -1): TabState {
  if (s.tabs.length < 2) return s
  const at = s.tabs.findIndex((t) => t.id === s.activeId)
  const next = s.tabs[(at + dir + s.tabs.length) % s.tabs.length]
  return { ...s, activeId: next.id }
}

/**
 * The shell reported a folder. The SAME state comes back when nothing changed,
 * because a shell reports at every prompt and a fresh object each time would
 * re-render the strip and re-save the tabs for nothing.
 */
export function setCwd(s: TabState, id: string, cwd: string): TabState {
  const tab = s.tabs.find((t) => t.id === id)
  if (!tab || tab.cwd.toLowerCase() === cwd.toLowerCase()) return s
  return { ...s, tabs: s.tabs.map((t) => (t.id === id ? { ...t, cwd } : t)) }
}

/** One settings tab, reused: asking again switches to it. */
export function openSettings(s: TabState): TabState {
  if (s.tabs.some((t) => t.kind === 'settings')) {
    return s.activeId === SETTINGS_ID ? s : { ...s, activeId: SETTINGS_ID }
  }
  return {
    tabs: [...s.tabs, { id: SETTINGS_ID, kind: 'settings', cwd: '' }],
    activeId: SETTINGS_ID
  }
}

/** The tabs that own a shell, which is every tab but Settings. */
export function shellTabs(s: TabState): Tab[] {
  return s.tabs.filter((t) => t.kind !== 'settings')
}

/**
 * Move a tab to another slot in the strip (dragged by its own row).
 * `toIndex` is the slot in the CURRENT list the tab should land in front of;
 * dropping past the end appends. Pure, so the strip's drag maths is testable.
 */
export function reorderTabs(tabs: readonly Tab[], id: string, toIndex: number): Tab[] {
  const from = tabs.findIndex((t) => t.id === id)
  if (from < 0) return [...tabs]
  const next = [...tabs]
  const [moved] = next.splice(from, 1)
  // Removing the tab shifts everything after it left by one, so a drop that
  // was aimed past its old home has to come back by one too.
  const at = Math.max(0, Math.min(toIndex > from ? toIndex - 1 : toIndex, next.length))
  next.splice(at, 0, moved)
  return next
}

const parts = (p: string): string[] => p.split(/[\\/]+/).filter(Boolean)
/** The last segment. A drive root has only its letter, so `D:\` reads `D:`. */
const baseOf = (p: string): string => parts(p).at(-1) ?? p
/** The parent folder's name, for disambiguating a collision. */
const parentOf = (p: string): string => parts(p).at(-2) ?? ''
/** One folder however it was spelled: case, slash direction, trailing separator. */
const folderKey = (p: string): string => parts(p).join('\\').toLowerCase()

/**
 * What each tab is called: the folder's last segment, and the parent's name
 * added only where two tabs would otherwise read the same. Two `api` folders
 * are genuinely ambiguous; every other tab keeps the short label it deserves.
 */
export function tabLabels(tabs: readonly Tab[]): string[] {
  const bases = tabs.map((t) => (t.kind === 'settings' ? 'Settings' : baseOf(t.cwd)))
  // A collision is one basename over DIFFERENT folders. Two tabs in the very
  // same folder have nothing to tell apart, so they keep the plain name rather
  // than both growing an identical suffix.
  const byBase = new Map<string, Set<string>>()
  tabs.forEach((t, i) => {
    const set = byBase.get(bases[i]) ?? new Set<string>()
    set.add(folderKey(t.cwd))
    byBase.set(bases[i], set)
  })
  return tabs.map((t, i) => {
    const clash = (byBase.get(bases[i])?.size ?? 0) > 1
    const parent = parentOf(t.cwd)
    return clash && parent ? bases[i] + ' - ' + parent : bases[i]
  })
}
