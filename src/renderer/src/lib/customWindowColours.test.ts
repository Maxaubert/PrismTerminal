import { beforeEach, describe, expect, it } from 'vitest'
import { NO_COLOURS, coloursDiffer, customWindowColours, setCustomWindowColours, validColours } from './customWindowColours'

describe('the window colours Custom keeps', () => {
  beforeEach(() => localStorage.clear())

  it('keeps none until Save changes keeps some', () => {
    expect(customWindowColours()).toEqual(NO_COLOURS)
    setCustomWindowColours({ background: '#101010', accent: null, secondary: '#2A2A2A' })
    expect(customWindowColours()).toEqual({ background: '#101010', accent: null, secondary: '#2a2a2a' })
    setCustomWindowColours(null)
    expect(customWindowColours()).toEqual(NO_COLOURS)
  })

  it('reads junk as none', () => {
    localStorage.setItem('prism.window.customColours', '{nope')
    expect(customWindowColours()).toEqual(NO_COLOURS)
    expect(validColours({ background: 'red', accent: 12, secondary: '#abcdef' })).toEqual({
      background: null,
      accent: null,
      secondary: '#abcdef'
    })
  })

  it('a pick that differs from what is kept is a change to save', () => {
    expect(coloursDiffer(NO_COLOURS, NO_COLOURS)).toBe(false)
    expect(coloursDiffer({ background: null, accent: '#FF8800', secondary: null }, NO_COLOURS)).toBe(true)
    expect(
      coloursDiffer({ background: null, accent: '#FF8800', secondary: null }, { background: null, accent: '#ff8800', secondary: null })
    ).toBe(false)
  })
})
