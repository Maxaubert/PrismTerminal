import { beforeEach, describe, expect, it } from 'vitest'
import { newTabFolder, newTabMode, setNewTabMode } from './newTabPrefs'

describe('newTabPrefs', () => {
  beforeEach(() => localStorage.clear())
  it('asks by default', () => expect(newTabMode()).toBe('ask'))
  it('is only a fixed folder once one is chosen', () => {
    setNewTabMode('folder')
    expect(newTabMode()).toBe('ask')
    setNewTabMode('folder', 'C:\\work')
    expect(newTabMode()).toBe('folder')
  })
  it('keeps the chosen folder while asking, so switching back needs no second pick', () => {
    setNewTabMode('folder', 'C:\\work')
    setNewTabMode('ask')
    expect(newTabMode()).toBe('ask')
    expect(newTabFolder()).toBe('C:\\work')
    setNewTabMode('folder')
    expect(newTabMode()).toBe('folder')
  })
})
