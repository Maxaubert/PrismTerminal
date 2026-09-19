import { describe, expect, it } from 'vitest'
import { CHROME_COLOUR_TOKENS, chromeTokens } from './chromeTheme'
import { TERM_PRESETS, resolveTermTheme, type TermTheme } from '@core/renderer/lib/termTheme'
import { contrastRatio } from '@core/renderer/lib/termAnsi'

describe('chromeTokens', () => {
  it.each(TERM_PRESETS.map((p) => p.id))(
    '%s: readable inks and a visible accent on its own ground',
    (id) => {
      const { vars } = chromeTokens(resolveTermTheme(id))
      // Every ink is drawn on the ground AND on the flat panel (menus, dialogs,
      // the find bar), so every floor is held on both.
      for (const ground of [vars['--p-bg-solid'], vars['--p-side-flat']]) {
        expect(contrastRatio(vars['--p-text'], ground)).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(vars['--p-text-soft'], ground)).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(vars['--p-dim'], ground)).toBeGreaterThanOrEqual(3)
        expect(contrastRatio(vars['--p-dim2'], ground)).toBeGreaterThanOrEqual(3)
        expect(contrastRatio(vars['--p-icon'], ground)).toBeGreaterThanOrEqual(3)
        expect(contrastRatio(vars['--p-accent'], ground)).toBeGreaterThanOrEqual(3)
        expect(contrastRatio(vars['--p-accent-hi'], ground)).toBeGreaterThanOrEqual(3)
        expect(contrastRatio(vars['--p-tree-folder'], ground)).toBeGreaterThanOrEqual(3)
      }
      // What sits ON the accent has to read too: a primary button, a selected row.
      expect(contrastRatio(vars['--p-on-accent'], vars['--p-accent'])).toBeGreaterThanOrEqual(3)
      expect(contrastRatio(vars['--p-on-accent'], vars['--p-sel-bg'])).toBeGreaterThanOrEqual(4.5)
    }
  )
  it('publishes every colour token the components read', () => {
    // The components were transplanted from Prism and read Prism's token names.
    // A name missing here is a surface painted by the stylesheet's fallback,
    // which is the default theme's colour under somebody else's theme.
    for (const opacity of [100, 60]) {
      const { vars } = chromeTokens(resolveTermTheme('prism'), opacity)
      for (const name of CHROME_COLOUR_TOKENS) {
        expect(vars[name], name).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/i)
      }
    }
  })
  it('measures the mode instead of trusting a name', () => {
    expect(chromeTokens(resolveTermTheme('github')).mode).toBe('light')
    expect(chromeTokens(resolveTermTheme('dracula')).mode).toBe('dark')
  })
  it('paints a translucent ground only when asked', () => {
    expect(chromeTokens(resolveTermTheme('prism')).vars['--p-bg']).toMatch(/^#[0-9a-f]{6}$/i)
    const glass = chromeTokens(resolveTermTheme('prism'), 60).vars
    // One sheet: the ground, the title bar and the strip carry the same alpha.
    for (const name of ['--p-bg', '--p-side', '--p-title', '--p-tabs']) {
      expect(glass[name], name).toMatch(/^#[0-9a-f]{6}99$/i)
    }
    // The active tab sits ON the strip: a second coat would be a darker tab.
    expect(glass['--p-tab-active']).toMatch(/^#[0-9a-f]{6}00$/i)
    // What a menu paints, and what the maths measures, stays flat.
    expect(glass['--p-side-flat']).toMatch(/^#[0-9a-f]{6}$/i)
    expect(glass['--p-bg-solid']).toMatch(/^#[0-9a-f]{6}$/i)
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
    expect(contrastRatio(vars['--p-dim'], vars['--p-bg-solid'])).toBeGreaterThanOrEqual(3)
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
