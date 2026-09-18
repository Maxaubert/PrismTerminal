import { beforeEach, describe, expect, it } from 'vitest'
import { confirmClose, setConfirmClose } from './closePrefs'

describe('closePrefs', () => {
  beforeEach(() => localStorage.clear())
  it('asks by default', () => expect(confirmClose()).toBe(true))
  it('off means off, and it comes back on', () => {
    setConfirmClose(false)
    expect(confirmClose()).toBe(false)
    setConfirmClose(true)
    expect(confirmClose()).toBe(true)
  })
  it('reads anything but an explicit off as on', () => {
    localStorage.setItem('prism.close.confirm', '')
    expect(confirmClose()).toBe(true)
  })
})
