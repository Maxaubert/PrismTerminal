import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { hexCommit } from './fields'
import { colourCommit } from '../lib/colour'

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

// #112: HexSwatch is the core picker with its alpha off, for callers not yet
// moved. A typed alpha is dropped, and its commit is the generalised rule.
describe('HexSwatch drops an alpha', () => {
  it('is a ColourField with alpha={false}', () => {
    const src = readFileSync(resolve(__dirname, 'fields.tsx'), 'utf8')
    const body = src.slice(src.indexOf('export function HexSwatch'), src.indexOf('/** Two or three exclusive choices'))
    expect(body).toMatch(/<ColourField[^>]*alpha=\{false\}/)
    expect(body).not.toMatch(/type="color"/)
  })
  it('a typed alpha commits as the opaque colour, or as nothing', () => {
    expect(colourCommit('#11223380', '#aabbcc', { alpha: false })).toBe('#112233')
    expect(colourCommit('rgba(170, 187, 204, 0.5)', '#aabbcc', { alpha: false })).toBeNull()
  })
  it('agrees with hexCommit on every opaque case', () => {
    for (const [draft, value] of [[null, '#aabbcc'], ['ABC', '#aabbcc'], ['123', '#aabbcc'], ['zz', '#aabbcc']] as const)
      expect(colourCommit(draft, value, { alpha: false })).toBe(hexCommit(draft, value))
  })
})
