import { beforeEach, describe, expect, it } from 'vitest'
import { setWindowBackground, windowBackground } from './backgroundPrefs'
import { windowAccent } from './accentPrefs'

describe('backgroundPrefs', () => {
  beforeEach(() => localStorage.clear())

  it('follows the theme until somebody chooses, and forgets on null', () => {
    expect(windowBackground()).toBeNull()
    setWindowBackground('#1A1B26')
    expect(windowBackground()).toBe('#1a1b26')
    setWindowBackground(null)
    expect(windowBackground()).toBeNull()
  })

  it('is its own key: picking a background picks no accent', () => {
    setWindowBackground('#101010')
    expect(windowAccent()).toBeNull()
  })

  it('reads junk as "follow the theme"', () => {
    for (const junk of ['black', '#1234567', '#123456789', 'rgba(0,0,0,0.5)']) {
      localStorage.setItem('prism.window.background', junk)
      expect(windowBackground(), junk).toBeNull()
    }
  })

  // #114: the background's alpha IS the window's see-through (it replaced the
  // Opacity slider), so it is kept, in the one stored form.
  it('keeps an alpha, in lower case, and an opaque one as six digits', () => {
    setWindowBackground('#1A1B2699')
    expect(windowBackground()).toBe('#1a1b2699')
    setWindowBackground('#1a1b26FF')
    expect(windowBackground()).toBe('#1a1b26')
  })
})
