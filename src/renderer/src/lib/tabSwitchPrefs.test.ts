import { beforeEach, describe, expect, it, vi } from 'vitest'
import { onTabSwitchChange, setTabSwitch, tabSwitch } from './tabSwitchPrefs'

describe('tabSwitchPrefs', () => {
  beforeEach(() => localStorage.clear())

  it("is In order until somebody chooses, so nobody's keys change on update (#158)", () => {
    expect(tabSwitch()).toBe('order')
  })

  it('remembers both choices under its own key', () => {
    for (const m of ['recent', 'order'] as const) {
      setTabSwitch(m)
      expect(tabSwitch()).toBe(m)
      expect(localStorage.getItem('prism.window.tabSwitch')).toBe(m)
    }
  })

  it('reads a word it does not know as In order, and never stores one', () => {
    localStorage.setItem('prism.window.tabSwitch', 'mru')
    expect(tabSwitch()).toBe('order')
    setTabSwitch('random' as never)
    expect(localStorage.getItem('prism.window.tabSwitch')).toBe('order')
  })

  it('tells its listeners on a change, and stops when asked', () => {
    const heard = vi.fn()
    const off = onTabSwitchChange(heard)
    setTabSwitch('recent')
    expect(heard).toHaveBeenCalledTimes(1)
    off()
    setTabSwitch('order')
    expect(heard).toHaveBeenCalledTimes(1)
  })
})
