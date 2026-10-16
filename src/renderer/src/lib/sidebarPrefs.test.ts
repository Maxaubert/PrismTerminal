import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SIDEBAR_WIDTH,
  onSidebarChange,
  setSidebarMode,
  setSidebarWidth,
  sidebarMode,
  toggleSidebar,
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

describe('the sidebar key (#162)', () => {
  beforeEach(() => localStorage.clear())

  it('toggles open and collapsed', () => {
    toggleSidebar()
    expect(sidebarMode()).toBe('collapsed')
    toggleSidebar()
    expect(sidebarMode()).toBe('open')
  })
})

// Pinned or unpinned, the sidebar and the terminal slide together, and the
// terminals keep their size until the slide is over (owner, 2026-10-14 and
// 2026-10-16).
describe('pinning and unpinning slide', () => {
  beforeEach(() => localStorage.clear())

  it('lays out the new mode at once, slides for one slide, and holds the terminals until then', async () => {
    vi.useFakeTimers()
    try {
      const { sidebarSliding, sidebarLayout } = await import('./sidebarPrefs')
      const { SIDEBAR_SLIDE_MS } = await import('./chromeLayout')
      const { termFitHeld } = await import('@core/renderer/lib/fitHold')
      setSidebarMode('collapsed')
      vi.advanceTimersByTime(SIDEBAR_SLIDE_MS + 40)
      expect(sidebarSliding()).toBe(false)
      setSidebarMode('open')
      expect(sidebarLayout()).toBe('open')
      expect(sidebarSliding()).toBe(true)
      expect(termFitHeld()).toBe(true)
      vi.advanceTimersByTime(SIDEBAR_SLIDE_MS + 40)
      expect(sidebarSliding()).toBe(false)
      expect(termFitHeld()).toBe(false)
      // The same mode again is no slide.
      setSidebarMode('open')
      expect(sidebarSliding()).toBe(false)
      // Unpinned: a slide too, and a toggle mid-slide starts a fresh one.
      setSidebarMode('collapsed')
      vi.advanceTimersByTime(100)
      setSidebarMode('open')
      vi.advanceTimersByTime(SIDEBAR_SLIDE_MS)
      expect(sidebarSliding()).toBe(true)
      vi.advanceTimersByTime(40)
      expect(sidebarSliding()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
