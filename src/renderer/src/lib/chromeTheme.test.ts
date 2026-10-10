import { describe, expect, it } from 'vitest'
import { CHROME_COLOUR_TOKENS, chromeTokens } from './chromeTheme'
import { TERM_PRESETS, presetAccent, resolveTermTheme, type TermTheme } from '@core/renderer/lib/termTheme'
import { SEE_THROUGH_ALPHA, seeThroughAlpha } from '@core/renderer/lib/seeThrough'
import { contrastRatio } from '@core/renderer/lib/termAnsi'
import { composite } from '@core/renderer/lib/colour'
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
  // #156: the switch alone paints every preset at Prism's default see-through,
  // so every preset is held to its text there, on the theme's own accent.
  it.each(TERM_PRESETS.map((p) => [p.id, p.bg]))('%s: legible at its default see-through', (id, bg) => {
    const a = seeThroughAlpha(bg)
    const { vars } = chromeTokens(resolveTermTheme(id), a, presetAccent(id))
    expect(vars['--p-bg']).toMatch(a === SEE_THROUGH_ALPHA.dark ? /^#[0-9a-f]{6}b9$/ : /^#[0-9a-f]{6}d1$/)
    for (const t of ['--p-text', '--p-dim', '--p-on-accent', '--p-accent', '--p-sel-bg'])
      expect(vars[t], t).toMatch(/^#[0-9a-f]{6}$/)
    expect(contrastRatio(vars['--p-text'], vars['--p-bg-solid'])).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(vars['--p-on-accent'], vars['--p-accent'])).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(vars['--p-on-accent'], vars['--p-sel-bg'])).toBeGreaterThanOrEqual(4.5)
  })
  it('--p-bg-solid is always flat, whatever the ground alpha (main is only ever sent it)', () => {
    for (const a of [0.3, 0.5, 153 / 255, 1]) {
      expect(chromeTokens(resolveTermTheme('prism'), a).vars['--p-bg-solid']).toMatch(/^#[0-9a-f]{6}$/)
      expect(chromeTokens({ ...resolveTermTheme('prism'), background: '#10203099' }, a).vars['--p-bg-solid']).toBe('#102030')
    }
  })
})

// PROMPT ON THE THEME'S OWN GROUND (2026-10-10 rework): the segments' own two
// greys are gone. An idle segment paints nothing and the tab in front is
// --p-tab-active, exactly Classic's, so no token of their own remains.
describe('the Prompt segments', () => {
  it('have no tokens of their own any more, nor :root fallbacks', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const v = chromeTokens(resolveTermTheme('prism')).vars
    expect(v['--p-seg']).toBeUndefined()
    expect(v['--p-seg-on']).toBeUndefined()
    expect((CHROME_COLOUR_TOKENS as readonly string[]).filter((n) => n.startsWith('--p-seg'))).toEqual([])
    expect(readFileSync(join(__dirname, '..', 'index.css'), 'utf8')).not.toMatch(/--p-seg/)
  })

  it('wear --p-tab-active in front and nothing at rest, in the strip source', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(join(__dirname, '..', 'components', 'TabStrip.tsx'), 'utf8')
    expect(src).not.toMatch(/--p-seg/)
    const shape = src.slice(src.indexOf('data-prompt-shape'), src.indexOf('style={{ clipPath: segmentClip'))
    expect(shape).toMatch(/on \? 'bg-\[var\(--p-tab-active\)\]' : 'group-hover:bg-\[var\(--p-hover\)\]'/)
  })
})

// THE ON SWITCH'S KNOB (owner, 2026-10-10: "keep that to being black on dark
// themes and white on light themes ... only when the color is very close").
describe('the switch knob token', () => {
  it('is black on a dark theme, white on a light one, on the presets', () => {
    expect(chromeTokens(resolveTermTheme('pt-default')).vars['--p-switch-knob']).toBe('#0b0b0f')
    expect(chromeTokens(resolveTermTheme('paper')).vars['--p-switch-knob']).toBe('#ffffff')
  })

  it('flips only where the default reads under 2:1 on the ON track', () => {
    // Every preset's knob reads at least 2:1 on its track.
    for (const p of TERM_PRESETS) {
      const v = chromeTokens(resolveTermTheme(p.id)).vars
      expect(contrastRatio(v['--p-switch-knob'], v['--p-sel-bg']), p.id).toBeGreaterThanOrEqual(2)
    }
    // An opaque accent is held to 3:1 on the ground, which keeps it clear of the
    // default knob too; a SEE-THROUGH one (#114) is a fill that can sit close
    // to it. A very light blue on a light theme: a black knob.
    const track = (v: Record<string, string>): string => composite(v['--p-sel-bg'], v['--p-bg-solid'])
    const pale = chromeTokens(resolveTermTheme('paper'), 1, undefined, 'hairline', '#cfe4ff80').vars
    expect(contrastRatio('#ffffff', track(pale))).toBeLessThan(2)
    expect(pale['--p-switch-knob']).toBe('#0b0b0f')
    // A very dark grey accent on a dark theme: a white knob.
    const dark = chromeTokens(resolveTermTheme('pt-default'), 1, undefined, 'hairline', '#2a2c3080').vars
    expect(contrastRatio('#0b0b0f', track(dark))).toBeLessThan(2)
    expect(dark['--p-switch-knob']).toBe('#ffffff')
  })

  it('matches the :root fallback index.css carries for the default prism preset', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const css = readFileSync(join(__dirname, '..', 'index.css'), 'utf8')
    expect(css).toContain(`--p-switch-knob: ${chromeTokens(resolveTermTheme('prism')).vars['--p-switch-knob']};`)
  })
})