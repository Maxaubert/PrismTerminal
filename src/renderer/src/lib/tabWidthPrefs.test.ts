import { beforeEach, describe, expect, it, vi } from 'vitest'
import { onTabWidthChange, setTabWidth, tabWidth } from './tabWidthPrefs'

describe('tabWidthPrefs', () => {
  beforeEach(() => localStorage.clear())

  it('is fixed until somebody chooses, which is the strip as it is today', () => {
    expect(tabWidth()).toBe('fixed')
  })

  it('remembers both choices under its own key', () => {
    for (const w of ['fit', 'fixed'] as const) {
      setTabWidth(w)
      expect(tabWidth()).toBe(w)
      expect(localStorage.getItem('prism.window.tabWidth')).toBe(w)
    }
  })

  it('reads a word it does not know as fixed, and never stores one', () => {
    localStorage.setItem('prism.window.tabWidth', 'wide')
    expect(tabWidth()).toBe('fixed')
    setTabWidth('huge' as never)
    expect(localStorage.getItem('prism.window.tabWidth')).toBe('fixed')
  })

  it('tells its listeners on a change, and stops when asked', () => {
    const heard = vi.fn()
    const off = onTabWidthChange(heard)
    setTabWidth('fit')
    expect(heard).toHaveBeenCalledTimes(1)
    off()
    setTabWidth('fixed')
    expect(heard).toHaveBeenCalledTimes(1)
  })
})
