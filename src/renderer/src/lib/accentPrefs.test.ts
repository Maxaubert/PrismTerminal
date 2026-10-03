import { beforeEach, describe, expect, it, vi } from 'vitest'
import { onWindowAccentChange, setWindowAccent, windowAccent } from './accentPrefs'

describe('accentPrefs', () => {
  beforeEach(() => localStorage.clear())

  it('follows the theme until somebody chooses', () => {
    expect(windowAccent()).toBeNull()
  })

  it('remembers a chosen colour, in lower case', () => {
    setWindowAccent('#E07A2F')
    expect(windowAccent()).toBe('#e07a2f')
  })

  it('reads anything that is not a six or eight digit hex as "follow the theme"', () => {
    for (const junk of ['', 'orange', '#fff', '#12345g', 'null', '#1234567', '#123456789']) {
      localStorage.setItem('prism.window.accent', junk)
      expect(windowAccent(), junk).toBeNull()
    }
  })

  // #114: the accent carries an alpha. Stored in the one canonical form: eight
  // digits only when see-through, so an opaque pick writes what it always did.
  it('remembers an alpha, and stores an opaque pick as six digits', () => {
    setWindowAccent('#E07A2F80')
    expect(windowAccent()).toBe('#e07a2f80')
    setWindowAccent('#e07a2fff')
    expect(windowAccent()).toBe('#e07a2f')
    expect(localStorage.getItem('prism.window.accent')).toBe('#e07a2f')
  })

  it('forgets the choice when handed null, and tells the painter both times', () => {
    const cb = vi.fn()
    const off = onWindowAccentChange(cb)
    setWindowAccent('#336699')
    setWindowAccent(null)
    expect(windowAccent()).toBeNull()
    expect(cb).toHaveBeenCalledTimes(2)
    off()
    setWindowAccent('#336699')
    expect(cb).toHaveBeenCalledTimes(2)
  })
})
