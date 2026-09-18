import { beforeEach, describe, expect, it } from 'vitest'
import { newTabFolder, newTabMode, setNewTabMode } from './newTabPrefs'

describe('newTabPrefs', () => {
  beforeEach(() => localStorage.clear())

  it('opens in a folder by default, and that folder is the user\'s own', () => {
    expect(newTabMode()).toBe('folder')
    expect(newTabFolder()).toBe('')
  })

  it('asks only when asked to', () => {
    setNewTabMode('ask')
    expect(newTabMode()).toBe('ask')
  })

  it('keeps the chosen folder across a visit to ask', () => {
    setNewTabMode('folder', 'D:/work')
    setNewTabMode('ask')
    setNewTabMode('folder')
    expect(newTabFolder()).toBe('D:/work')
  })

  it('goes back to the user\'s folder when the choice is cleared', () => {
    setNewTabMode('folder', 'D:/work')
    setNewTabMode('folder', '')
    expect(newTabFolder()).toBe('')
    expect(newTabMode()).toBe('folder')
  })
})
