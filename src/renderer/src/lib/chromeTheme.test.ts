import { describe, expect, it } from 'vitest'
import { chromeTokens } from './chromeTheme'
import { TERM_PRESETS, resolveTermTheme, type TermTheme } from './termTheme'
import { contrastRatio } from './termAnsi'

describe('chromeTokens', () => {
  it.each(TERM_PRESETS.map((p) => p.id))(
    '%s: readable text and a visible accent on its own ground',
    (id) => {
      const { vars } = chromeTokens(resolveTermTheme(id))
      expect(contrastRatio(vars['--p-text'], vars['--p-bg-solid'])).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(vars['--p-accent'], vars['--p-bg-solid'])).toBeGreaterThanOrEqual(3)
      expect(contrastRatio(vars['--p-text-dim'], vars['--p-bg-solid'])).toBeGreaterThanOrEqual(3)
      // What sits ON the accent has to read too: a filled tab, a primary button.
      expect(contrastRatio(vars['--p-accent-text'], vars['--p-accent'])).toBeGreaterThanOrEqual(3)
    }
  )
  it('measures the mode instead of trusting a name', () => {
    expect(chromeTokens(resolveTermTheme('github')).mode).toBe('light')
    expect(chromeTokens(resolveTermTheme('dracula')).mode).toBe('dark')
  })
  it('paints a translucent ground only when asked', () => {
    expect(chromeTokens(resolveTermTheme('prism')).vars['--p-bg']).toMatch(/^#[0-9a-f]{6}$/i)
    expect(chromeTokens(resolveTermTheme('prism'), 60).vars['--p-bg']).toMatch(/^#[0-9a-f]{6}99$/i)
  })
  it('moves a custom theme that fails the floors instead of trusting it', () => {
    // Grey on grey with a cursor and a blue that both vanish into the ground:
    // nothing a preset would ship, and exactly what a custom theme can be.
    const bad: TermTheme = {
      background: '#202020',
      foreground: '#2a2a2a',
      cursor: '#242424',
      selectionBackground: '#24242455',
      blue: '#222233'
    }
    const { vars } = chromeTokens(bad)
    expect(contrastRatio(vars['--p-text'], vars['--p-bg-solid'])).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(vars['--p-text-dim'], vars['--p-bg-solid'])).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(vars['--p-accent'], vars['--p-bg-solid'])).toBeGreaterThanOrEqual(3)
  })
  it('measures against a flat ground when the theme publishes anything else', () => {
    // rgba() and #rrggbbaa are fine to paint and useless to measure against:
    // unparsed they are NaN, which is how every hue once walked to black.
    const t: TermTheme = {
      background: 'rgba(11, 11, 15, 0.8)',
      foreground: '#e7e7ee',
      cursor: '#5b5bd6',
      selectionBackground: '#5b5bd655'
    }
    const { vars, mode } = chromeTokens(t)
    expect(mode).toBe('dark')
    expect(vars['--p-bg-solid']).toBe('#0b0b0f')
    for (const v of Object.values(vars)) expect(v).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/i)
  })
})
