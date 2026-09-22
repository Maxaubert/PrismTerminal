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
    localStorage.setItem('prism.window.background', 'black')
    expect(windowBackground()).toBeNull()
  })
})
