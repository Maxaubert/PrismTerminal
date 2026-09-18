import { describe, expect, it } from 'vitest'
import {
  EMPTY,
  addTab,
  closeTab,
  openSettings,
  pickTab,
  reorderTabs,
  setCwd,
  shellTabs,
  stepTab,
  tabLabels
} from './tabs'

const three = () =>
  addTab(addTab(addTab(EMPTY, 'a', 'C:\\w\\api'), 'b', 'C:\\w\\web'), 'c', 'D:\\x\\api')

describe('tabs', () => {
  it('adds at the end and activates', () => {
    const s = three()
    expect(s.tabs.map((t) => t.id)).toEqual(['a', 'b', 'c'])
    expect(s.activeId).toBe('c')
  })
  it('allows two tabs in the same folder', () => {
    const s = addTab(addTab(EMPTY, 'a', 'C:\\w'), 'b', 'C:\\w')
    expect(s.tabs).toHaveLength(2)
    expect(tabLabels(s.tabs)).toEqual(['w', 'w'])
  })
  it('closing the active tab activates the right neighbour, else the left', () => {
    expect(closeTab(pickTab(three(), 'b'), 'b').activeId).toBe('c')
    expect(closeTab(three(), 'c').activeId).toBe('b')
  })
  it('closing a background tab keeps the active one', () => {
    expect(closeTab(three(), 'a').activeId).toBe('c')
  })
  it('closing the last tab leaves nothing active', () => {
    expect(closeTab(addTab(EMPTY, 'a', 'C:\\w'), 'a')).toEqual({ tabs: [], activeId: null })
  })
  it('steps with wrap', () => {
    expect(stepTab(three(), 1).activeId).toBe('a')
    expect(stepTab(pickTab(three(), 'a'), -1).activeId).toBe('c')
  })
  it('relabels on cwd and returns the same state when nothing changed', () => {
    const s = three()
    expect(setCwd(s, 'a', 'C:\\w\\api')).toBe(s)
    expect(tabLabels(setCwd(s, 'b', 'C:\\w\\web\\src').tabs)[1]).toBe('src')
  })
  it('tells same-named folders apart by their parent', () => {
    expect(tabLabels(three().tabs)).toEqual(['api - w', 'web', 'api - x'])
  })
  it('reads one folder spelled two ways as one folder, not as a clash', () => {
    const s = addTab(addTab(EMPTY, 'a', 'C:\\w\\api'), 'b', 'c:/w/api/')
    expect(tabLabels(s.tabs)).toEqual(['api', 'api'])
  })
  it('labels a drive root by its letter', () => {
    expect(tabLabels(addTab(EMPTY, 'a', 'D:\\').tabs)).toEqual(['D:'])
  })
  it('opens one settings tab and reuses it', () => {
    const s = openSettings(openSettings(three()))
    expect(s.tabs.filter((t) => t.kind === 'settings')).toHaveLength(1)
    expect(tabLabels(s.tabs).at(-1)).toBe('Settings')
    expect(shellTabs(s)).toHaveLength(3)
  })
  it('reorders, correcting for the removed slot', () => {
    expect(reorderTabs(three().tabs, 'a', 3).map((t) => t.id)).toEqual(['b', 'c', 'a'])
    expect(reorderTabs(three().tabs, 'c', 0).map((t) => t.id)).toEqual(['c', 'a', 'b'])
  })
})
