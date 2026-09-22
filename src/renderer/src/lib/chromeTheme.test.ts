import { describe, expect, it } from 'vitest'
import { CHROME_COLOUR_TOKENS, chromeTokens } from './chromeTheme'
import { TERM_PRESETS, resolveTermTheme, type TermTheme } from '@core/renderer/lib/termTheme'
import { contrastRatio } from '@core/renderer/lib/termAnsi'
import { WINDOW_EDGES } from '@shared/windowEdges'

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
  it('wears a chosen accent exactly when the ground can show it', () => {
    const theme = resolveTermTheme('prism')
    const { vars } = chromeTokens(theme, 100, undefined, 'hairline', '#e07a2f')
    expect(vars['--p-accent']).toBe('#e07a2f')
    // Everything derived from the accent follows it, and still reads.
    expect(contrastRatio(vars['--p-on-accent'], vars['--p-accent'])).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(vars['--p-on-accent'], vars['--p-sel-bg'])).toBeGreaterThanOrEqual(4.5)
    expect(vars['--p-accent']).not.toBe(chromeTokens(theme).vars['--p-accent'])
  })
  it.each(TERM_PRESETS.map((p) => p.id))(
    '%s: a chosen accent the ground cannot show is moved to the floor, not swapped',
    (id) => {
      // Near-black and near-white: one of them is invisible on every theme.
      for (const pick of ['#0a0a0a', '#f7f7f7']) {
        const { vars } = chromeTokens(resolveTermTheme(id), 100, undefined, 'hairline', pick)
        for (const ground of [vars['--p-bg-solid'], vars['--p-side-flat']]) {
          expect(contrastRatio(vars['--p-accent'], ground), `${pick} on ${ground}`).toBeGreaterThanOrEqual(3)
        }
        expect(contrastRatio(vars['--p-on-accent'], vars['--p-sel-bg'])).toBeGreaterThanOrEqual(4.5)
      }
    }
  )
  it('follows the theme when nothing is chosen', () => {
    const theme = resolveTermTheme('prism')
    expect(chromeTokens(theme, 100, undefined, 'hairline', null).vars).toEqual(chromeTokens(theme).vars)
  })
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

// #27 (owner, 2026-09-19): "add the option to specify the edges ... Hairline,
// Faint, or like Solid edges, or even No edges". Every edge in the window reads
// one of two tokens, so the choice is applied where those two are derived.
describe('the window edges', () => {
  /** The alpha channel of a #rrggbbaa token, 0-255. */
  const alpha = (hex: string): number => parseInt(hex.slice(7, 9), 16)
  const LINES = ['--p-divider', '--p-line'] as const

  it('hairline is the default, and is EXACTLY what the window looked like before there was a choice', () => {
    // The numbers chromeTheme hard-coded before #27: the ink at 7% and 9% on a
    // dark ground, 10% and 12% on a light one. Nobody's window changes until
    // they choose, and the stylesheet's :root fallbacks stay true.
    const dark = chromeTokens(resolveTermTheme('prism')).vars
    expect(dark['--p-divider']).toBe('#ffffff12')
    expect(dark['--p-line']).toBe('#ffffff17')
    const light = chromeTokens(resolveTermTheme('github')).vars
    expect(light['--p-divider']).toBe('#0000001a')
    expect(light['--p-line']).toBe('#0000001f')
    for (const id of ['prism', 'github']) {
      const t = resolveTermTheme(id)
      expect(chromeTokens(t, 100, undefined, 'hairline').vars).toEqual(chromeTokens(t).vars)
    }
  })

  it.each(['prism', 'github'])('%s: none < faint < hairline < solid, on both line tokens', (id) => {
    const of = (e: (typeof WINDOW_EDGES)[number]): Record<string, string> =>
      chromeTokens(resolveTermTheme(id), 100, undefined, e).vars
    for (const name of LINES) {
      expect(alpha(of('none')[name]), name).toBe(0)
      expect(alpha(of('faint')[name]), name).toBeGreaterThan(0)
      expect(alpha(of('faint')[name]), name).toBeLessThan(alpha(of('hairline')[name]))
      expect(alpha(of('hairline')[name]), name).toBeLessThan(alpha(of('solid')[name]))
    }
  })

  it('no edges is a TRANSPARENT colour, never a missing one', () => {
    // A border keeps its pixel of layout, so nothing in the window moves when
    // the edges go; and every token stays hex, which the rest of this file
    // already demands of the whole table.
    const { vars } = chromeTokens(resolveTermTheme('prism'), 100, undefined, 'none')
    expect(vars['--p-divider']).toBe('#ffffff00')
    expect(vars['--p-line']).toBe('#ffffff00')
  })

  it('moves the two line tokens and nothing else', () => {
    // Hover fills, the ground, the inks: an edges setting that changed any of
    // those would be a second theme picker.
    const base = chromeTokens(resolveTermTheme('dracula')).vars
    for (const e of WINDOW_EDGES) {
      const v = chromeTokens(resolveTermTheme('dracula'), 100, undefined, e).vars
      for (const name of CHROME_COLOUR_TOKENS) {
        if ((LINES as readonly string[]).includes(name)) continue
        expect(v[name], `${e} ${name}`).toBe(base[name])
      }
    }
  })

  it('reads anything it does not know as the default', () => {
    const t = resolveTermTheme('prism')
    expect(chromeTokens(t, 100, undefined, 'dotted' as never).vars).toEqual(chromeTokens(t).vars)
  })
})
