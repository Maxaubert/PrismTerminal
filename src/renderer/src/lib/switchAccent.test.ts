import { describe, expect, it } from 'vitest'
import { chromeTokens } from './chromeTheme'
import { TERM_PRESETS, presetAccent, resolveTermTheme } from '@core/renderer/lib/termTheme'
import { contrastRatio } from '@core/renderer/lib/termAnsi'

// An ON switch wears the theme's accent (#138; owner, 2026-10-07: "yes option
// 1 but it should depend on the theme so only teal on the teal theme"): its
// track is --p-sel-bg and its knob --p-on-accent. On every preset the knob
// reads on the track and the track stands off the ground, so on is never a
// shape lost in the page.
describe('the on switch', () => {
  it.each(TERM_PRESETS.map((p) => p.id))('%s: knob 4.5:1 on the track, track 3:1 on the ground', (id) => {
    const { vars } = chromeTokens(resolveTermTheme(id), 1, presetAccent(id))
    expect(contrastRatio(vars['--p-on-accent'], vars['--p-sel-bg'])).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(vars['--p-sel-bg'], vars['--p-bg-solid'])).toBeGreaterThanOrEqual(3)
  })
})
