import { describe, expect, it } from 'vitest'
import { chromeTokens } from './chromeTheme'
import { TERM_PRESETS, presetAccent, resolveTermTheme } from '@core/renderer/lib/termTheme'
import { contrastRatio } from '@core/renderer/lib/termAnsi'

// An ON switch wears the theme's accent (#138; owner, 2026-10-07: "yes option
// 1 but it should depend on the theme so only teal on the teal theme"): its
// track is --p-sel-bg, which still carries --p-on-accent at 4.5:1 (the update
// chip's pair). On every preset that ink reads on the track and the track
// stands off the ground, so on is never a shape lost in the page.
describe('the on switch', () => {
  it.each(TERM_PRESETS.map((p) => p.id))('%s: the accent ink 4.5:1 on the track, track 3:1 on the ground', (id) => {
    const { vars } = chromeTokens(resolveTermTheme(id), 1, presetAccent(id))
    expect(contrastRatio(vars['--p-on-accent'], vars['--p-sel-bg'])).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(vars['--p-sel-bg'], vars['--p-bg-solid'])).toBeGreaterThanOrEqual(3)
  })
  // The knob follows the THEME since 2026-10-10 (owner: "keep that to being
  // black on dark themes and white on light themes ... only when the color is
  // very close"): black on dark, white on light, the opposite under 2:1.
  it.each(TERM_PRESETS.map((p) => p.id))('%s: the knob is the theme\'s ink, at least 2:1 on the track', (id) => {
    const { mode, vars } = chromeTokens(resolveTermTheme(id), 1, presetAccent(id))
    const ink = mode === 'dark' ? '#0b0b0f' : '#ffffff'
    const knob = vars['--p-switch-knob']
    expect(knob === ink || contrastRatio(ink, vars['--p-sel-bg']) < 2).toBe(true)
    expect(contrastRatio(knob, vars['--p-sel-bg'])).toBeGreaterThanOrEqual(2)
  })
})