import { beforeEach, describe, expect, it, vi } from 'vitest'
import { onTabStyleChange, setTabStyle, tabStyle } from './tabStylePrefs'

describe('tabStylePrefs (#143)', () => {
  beforeEach(() => localStorage.clear())

  it('is Classic until somebody chooses, so nobody\'s window changes with the update', () => {
    expect(tabStyle()).toBe('classic')
  })

  it('remembers both choices under its own key', () => {
    for (const s of ['prompt', 'classic'] as const) {
      setTabStyle(s)
      expect(tabStyle()).toBe(s)
      expect(localStorage.getItem('prism.window.tabStyle')).toBe(s)
    }
  })

  it('reads a word it does not know as Classic, and never stores one', () => {
    localStorage.setItem('prism.window.tabStyle', 'powerline')
    expect(tabStyle()).toBe('classic')
    setTabStyle('round' as never)
    expect(localStorage.getItem('prism.window.tabStyle')).toBe('classic')
  })

  it('tells its listeners on a change, and stops when asked', () => {
    const heard = vi.fn()
    const off = onTabStyleChange(heard)
    setTabStyle('prompt')
    expect(heard).toHaveBeenCalledTimes(1)
    off()
    setTabStyle('classic')
    expect(heard).toHaveBeenCalledTimes(1)
  })
})
