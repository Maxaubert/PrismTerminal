import { beforeEach, describe, expect, it } from 'vitest'
import { HELP_KEYS, helpEnabled, helpShell, onHelpPrefs, setHelpEnabled, setHelpShell } from './helpPrefs'

describe('the help panel settings', () => {
  beforeEach(() => localStorage.clear())

  it('is ON until somebody switches it off, and off means off', () => {
    // A discoverability feature is for the people who would never find the
    // switch that turns it on; the owner asked only that it be optional.
    expect(helpEnabled()).toBe(true)
    setHelpEnabled(false)
    expect(helpEnabled()).toBe(false)
    expect(localStorage.getItem(HELP_KEYS.enabled)).toBe('0')
    setHelpEnabled(true)
    expect(helpEnabled()).toBe(true)
  })

  it('remembers a shell picked by hand, and reads anything else as never picked', () => {
    expect(helpShell()).toBeNull()
    setHelpShell('bash')
    expect(helpShell()).toBe('bash')
    localStorage.setItem(HELP_KEYS.shell, 'fish')
    expect(helpShell()).toBeNull()
  })

  it('tells its listeners when a value changes', () => {
    let heard = 0
    const off = onHelpPrefs(() => (heard += 1))
    setHelpEnabled(false)
    off()
    setHelpEnabled(true)
    expect(heard).toBe(1)
  })

  it('keeps its keys under prism.help', () => {
    for (const k of Object.values(HELP_KEYS)) expect(k.startsWith('prism.help.')).toBe(true)
  })
})
