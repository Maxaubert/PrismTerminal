import { describe, expect, it } from 'vitest'
import { hexCommit } from './fields'

// Code review 2026-09-24, #26: tabbing through a colour that follows the theme
// must not make it a colour of your own.
describe('hexCommit', () => {
  it('commits nothing when nothing was typed', () => {
    expect(hexCommit(null, '#aabbcc')).toBeNull()
  })
  it('commits nothing when the draft names the same colour', () => {
    expect(hexCommit('ABC', '#aabbcc')).toBeNull()
    expect(hexCommit('#AABBCC', '#aabbcc')).toBeNull()
  })
  it('commits a new colour, normalised', () => {
    expect(hexCommit('123', '#aabbcc')).toBe('#112233')
  })
  it('commits nothing for a draft that is not a colour', () => {
    expect(hexCommit('zz', '#aabbcc')).toBeNull()
  })
})
