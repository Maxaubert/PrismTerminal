import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SIDEBAR_WIDTH,
  onSidebarChange,
  setSidebarMode,
  setSidebarWidth,
  sidebarMode,
  sidebarWidth,
  validSidebarWidth
} from './sidebarPrefs'

describe('sidebarPrefs (#162)', () => {
  beforeEach(() => localStorage.clear())

  it('is open, at the initial width, until somebody chooses', () => {
    expect(sidebarMode()).toBe('open')
    expect(sidebarWidth()).toBe(SIDEBAR_WIDTH.initial)
  })

  it('remembers collapsed and open', () => {
    setSidebarMode('collapsed')
    expect(sidebarMode()).toBe('collapsed')
    expect(localStorage.getItem('prism.window.sidebar')).toBe('collapsed')
    setSidebarMode('open')
    expect(sidebarMode()).toBe('open')
  })

  it('reads an unknown mode as open', () => {
    localStorage.setItem('prism.window.sidebar', 'floating')
    expect(sidebarMode()).toBe('open')
  })

  it('keeps a width inside its range, whole, and reads junk as the initial width', () => {
    setSidebarWidth(260.6)
    expect(sidebarWidth()).toBe(261)
    setSidebarWidth(5)
    expect(sidebarWidth()).toBe(SIDEBAR_WIDTH.min)
    setSidebarWidth(9999)
    expect(sidebarWidth()).toBe(SIDEBAR_WIDTH.max)
    localStorage.setItem('prism.window.sidebarWidth', 'wide')
    expect(sidebarWidth()).toBe(SIDEBAR_WIDTH.initial)
    expect(validSidebarWidth('')).toBe(SIDEBAR_WIDTH.initial)
    expect(validSidebarWidth(null)).toBe(SIDEBAR_WIDTH.initial)
  })

  it('tells its listeners on a change, and stops when asked', () => {
    const heard = vi.fn()
    const off = onSidebarChange(heard)
    setSidebarMode('collapsed')
    setSidebarWidth(300)
    expect(heard).toHaveBeenCalledTimes(2)
    off()
    setSidebarMode('open')
    expect(heard).toHaveBeenCalledTimes(2)
  })
})
