import { beforeEach, describe, expect, it, vi } from 'vitest'
import { onTabLayoutChange, setTabLayout, tabLayout } from './tabLayoutPrefs'

describe('tabLayoutPrefs (#162)', () => {
  beforeEach(() => localStorage.clear())

  it('is horizontal until somebody chooses, the window as it always was', () => {
    expect(tabLayout()).toBe('horizontal')
  })

  it('remembers vertical and horizontal under its own key', () => {
    setTabLayout('vertical')
    expect(tabLayout()).toBe('vertical')
    expect(localStorage.getItem('prism.window.tabLayout')).toBe('vertical')
    setTabLayout('horizontal')
    expect(tabLayout()).toBe('horizontal')
  })

  it('reads a word it does not know as horizontal, and never stores one', () => {
    localStorage.setItem('prism.window.tabLayout', 'diagonal')
    expect(tabLayout()).toBe('horizontal')
    setTabLayout('left' as never)
    expect(localStorage.getItem('prism.window.tabLayout')).toBe('horizontal')
  })

  it('tells its listeners on a change, and stops when asked', () => {
    const heard = vi.fn()
    const off = onTabLayoutChange(heard)
    setTabLayout('vertical')
    expect(heard).toHaveBeenCalledTimes(1)
    off()
    setTabLayout('horizontal')
    expect(heard).toHaveBeenCalledTimes(1)
  })
})
