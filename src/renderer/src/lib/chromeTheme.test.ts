import { describe, expect, it } from 'vitest'
import { CHROME_COLOUR_TOKENS, chromeTokens } from './chromeTheme'
import { TERM_PRESETS, resolveTermTheme, type TermTheme } from '@core/renderer/lib/termTheme'
import { contrastRatio } from '@core/renderer/lib/termAnsi'
import { composite } from '@core/renderer/lib/colour'
import { groundMode } from '@core/renderer/lib/termReplies'
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
  // What a program is told (#168, #172) and what the chrome wears are one
  // measurement: Claude must never pick light under a dark title bar. The
  // core cannot import this file (its lint wall), so the agreement is pinned here.
  it.each(TERM_PRESETS.map((p) => p.id))('%s: a program is told the mode the chrome wears', (id) => {
    const theme = resolveTermTheme(id)
    expect(groundMode(theme.background)).toBe(chromeTokens(theme).mode)
  })
  it('wears a chosen accent exactly when the ground can show it', () => {
    const theme = resolveTermTheme('prism')
    const { vars } = chromeTokens(theme, 1, undefined, 'hairline', '#e07a2f')
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
        const { vars } = chromeTokens(resolveTermTheme(id), 1, undefined, 'hairline', pick)
        for (const ground of [vars['--p-bg-solid'], vars['--p-side-flat']]) {
          expect(contrastRatio(vars['--p-accent'], ground), `${pick} on ${ground}`).toBeGreaterThanOrEqual(3)
        }
        expect(contrastRatio(vars['--p-on-accent'], vars['--p-sel-bg'])).toBeGreaterThanOrEqual(4.5)
      }
    }
  )
  it('a picked light background makes a light window whose inks still read', () => {
    // The background setting hands chromeTokens the theme with its ground
    // replaced; the mode is MEASURED, so a white ground on a dark theme turns
    // the window light, and every ink is floored against the new ground.
    const theme = resolveTermTheme('pt-default')
    const { vars, mode } = chromeTokens({ ...theme, background: '#f4f1ea' }, 1, '#fe8f34')
    expect(mode).toBe('light')
    expect(vars['--p-bg-solid']).toBe('#f4f1ea')
    expect(contrastRatio(vars['--p-text'], vars['--p-bg-solid'])).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(vars['--p-accent'], vars['--p-bg-solid'])).toBeGreaterThanOrEqual(3)
  })
  it('follows the theme when nothing is chosen', () => {
    const theme = resolveTermTheme('prism')
    expect(chromeTokens(theme, 1, undefined, 'hairline', null).vars).toEqual(chromeTokens(theme).vars)
  })
  it('publishes every colour token the components read', () => {
    // The components were transplanted from Prism and read Prism's token names.
    // A name missing here is a surface painted by the stylesheet's fallback,
    // which is the default theme's colour under somebody else's theme.
    for (const opacity of [1, 153 / 255]) {
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
    const glass = chromeTokens(resolveTermTheme('prism'), 153 / 255).vars
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
      expect(chromeTokens(t, 1, undefined, 'hairline').vars).toEqual(chromeTokens(t).vars)
    }
  })

  it.each(['prism', 'github'])('%s: none < faint < hairline < solid, on both line tokens', (id) => {
    const of = (e: (typeof WINDOW_EDGES)[number]): Record<string, string> =>
      chromeTokens(resolveTermTheme(id), 1, undefined, e).vars
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
    const { vars } = chromeTokens(resolveTermTheme('prism'), 1, undefined, 'none')
    expect(vars['--p-divider']).toBe('#ffffff00')
    expect(vars['--p-line']).toBe('#ffffff00')
  })

  it('moves the two line tokens and nothing else', () => {
    // Hover fills, the ground, the inks: an edges setting that changed any of
    // those would be a second theme picker.
    const base = chromeTokens(resolveTermTheme('dracula')).vars
    for (const e of WINDOW_EDGES) {
      const v = chromeTokens(resolveTermTheme('dracula'), 1, undefined, e).vars
      for (const name of CHROME_COLOUR_TOKENS) {
        if ((LINES as readonly string[]).includes(name)) continue
        expect(v[name], `${e} ${name}`).toBe(base[name])
      }
    }
  })

  it('reads anything it does not know as the default', () => {
    const t = resolveTermTheme('prism')
    expect(chromeTokens(t, 1, undefined, 'dotted' as never).vars).toEqual(chromeTokens(t).vars)
  })
})

// #114: the accent may be see-through. A FILL wears the alpha, a LINE never
// does (`--p-accent-solid`), and text on a fill is chosen on what the eye
// sees: the fill composited over each ground it sits on. Under a see-through
// window, the text-bearing fills are flattened over the solid ground, since
// 4.5:1 cannot be held over an unknown desktop (owner decision 5).
describe('a see-through accent', () => {
  const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/
  const alphaByte = (hex: string): number => (hex.length === 9 ? parseInt(hex.slice(7), 16) : 255)
  it.each(TERM_PRESETS.map((p) => p.id))('%s: fills see-through, lines solid, text 4.5:1 on the composite', (id) => {
    for (const pick of ['#e07a2f80', '#3b82f633', '#f7f7f7cc', '#0a0a0a99']) {
      const { vars } = chromeTokens(resolveTermTheme(id), 1, undefined, 'hairline', pick)
      for (const v of Object.values(vars)) expect(v).toMatch(HEX)
      expect(vars['--p-accent'], pick).toMatch(/^#[0-9a-f]{8}$/)
      expect(alphaByte(vars['--p-accent'])).toBe(alphaByte(pick))
      expect(vars['--p-sel-bg']).toMatch(/^#[0-9a-f]{8}$/)
      expect(vars['--p-accent-solid']).toMatch(/^#[0-9a-f]{6}$/)
      expect(vars['--p-accent-hi']).toMatch(/^#[0-9a-f]{6}$/)
      for (const ground of [vars['--p-bg-solid'], vars['--p-side-flat']]) {
        // The line is held to the non-text floor, as an opaque accent is.
        expect(contrastRatio(vars['--p-accent-solid'], ground), `${pick} line on ${ground}`).toBeGreaterThanOrEqual(3)
        for (const fill of ['--p-accent', '--p-sel-bg']) {
          const seen = composite(vars[fill], ground)
          expect(contrastRatio(vars['--p-on-accent'], seen), `${pick} ${fill} text on ${ground}`).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
  })
  it('keeps the picked colour where the ground can show it', () => {
    const { vars } = chromeTokens(resolveTermTheme('pt-default'), 1, undefined, 'hairline', '#e07a2f80')
    expect(vars['--p-accent-solid']).toBe('#e07a2f')
  })
  it('an opaque accent publishes its solid as itself', () => {
    for (const id of TERM_PRESETS.map((p) => p.id)) {
      const { vars } = chromeTokens(resolveTermTheme(id))
      expect(vars['--p-accent-solid']).toBe(vars['--p-accent'])
      const picked = chromeTokens(resolveTermTheme(id), 1, undefined, 'hairline', '#e07a2f').vars
      expect(picked['--p-accent-solid']).toBe(picked['--p-accent'])
    }
  })
  it.each(TERM_PRESETS.map((p) => p.id))('%s: under a see-through ground the text fills are flattened', (id) => {
    const { vars } = chromeTokens(resolveTermTheme(id), 153 / 255, undefined, 'hairline', '#e07a2f80')
    expect(vars['--p-bg']).toMatch(/^#[0-9a-f]{6}99$/)
    expect(vars['--p-accent']).toMatch(/^#[0-9a-f]{6}$/)
    expect(vars['--p-sel-bg']).toMatch(/^#[0-9a-f]{6}$/)
    expect(contrastRatio(vars['--p-on-accent'], vars['--p-accent'])).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(vars['--p-on-accent'], vars['--p-sel-bg'])).toBeGreaterThanOrEqual(4.5)
    // What the fill showed over the solid ground is what it shows now.
    const open = chromeTokens(resolveTermTheme(id), 1, undefined, 'hairline', '#e07a2f80').vars
    expect(vars['--p-sel-bg']).toBe(composite(open['--p-sel-bg'], vars['--p-bg-solid']))
  })
  it('--p-bg-solid is always flat, whatever the ground alpha (main is only ever sent it)', () => {
    for (const a of [0.3, 0.5, 153 / 255, 1]) {
      expect(chromeTokens(resolveTermTheme('prism'), a).vars['--p-bg-solid']).toMatch(/^#[0-9a-f]{6}$/)
      expect(chromeTokens({ ...resolveTermTheme('prism'), background: '#10203099' }, a).vars['--p-bg-solid']).toBe('#102030')
    }
  })
})

describe('the Prompt segments (#143)', () => {
  it('are the text over the strip at 4% and 11%, solid on an opaque window', () => {
    const v = chromeTokens(resolveTermTheme('prism')).vars
    expect(v['--p-seg']).toBe(v['--p-side-flat'])
    expect(contrastRatio(v['--p-seg-on'], v['--p-bg'])).toBeGreaterThan(contrastRatio(v['--p-seg'], v['--p-bg']))
  })

  it('on glass are the text at that alpha, so a segment is one step over the sheet', () => {
    const v = chromeTokens(resolveTermTheme('prism'), 0.6).vars
    expect(v['--p-seg']).toBe(v['--p-text'] + '0a')
    expect(v['--p-seg-on']).toBe(v['--p-text'] + '1c')
    expect(composite(v['--p-seg'], v['--p-bg-solid'])).toBe(chromeTokens(resolveTermTheme('prism')).vars['--p-seg'])
  })

  it('match the :root fallbacks index.css carries for the default prism preset', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const css = readFileSync(join(__dirname, '..', 'index.css'), 'utf8')
    const v = chromeTokens(resolveTermTheme('prism')).vars
    for (const name of ['--p-seg', '--p-seg-on']) expect(css).toContain(`${name}: ${v[name]};`)
  })
})
