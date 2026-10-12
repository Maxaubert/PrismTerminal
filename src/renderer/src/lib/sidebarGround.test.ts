import { describe, expect, it } from 'vitest'
import { TERM_PRESETS, presetAccent, resolveTermTheme } from '@core/renderer/lib/termTheme'
import { contrastRatio, luminance, mixHex } from '@core/renderer/lib/termAnsi'
import { BLACK_GROUND, SIDEBAR_STEP, okLightness, sidebarGround } from './sidebarGround'
import { chromeTokens } from './chromeTheme'

// Owner, 2026-10-12, of the sidebar steps mockup: one scheme for every theme,
// Medium step; the light themes' text held up ("yes thats good").
describe("the sidebar's ground", () => {
  it.each(TERM_PRESETS.map((p) => p.id))('%s: one even step darker, or black kept', (id) => {
    const bg = resolveTermTheme(id).background as string
    const side = sidebarGround(bg)
    if (luminance(bg) < BLACK_GROUND) expect(side).toBe(bg)
    else expect(okLightness(bg) - okLightness(side)).toBeCloseTo(SIDEBAR_STEP, 2)
  })

  it.each(TERM_PRESETS.map((p) => p.id))(
    '%s: names read at 7:1 and folders at 4.5:1, on the sidebar and its pill',
    (id) => {
      const { vars } = chromeTokens(resolveTermTheme(id), 1, presetAccent(id))
      const side = vars['--p-secondary'].slice(0, 7)
      const pill = mixHex(side, vars['--p-accent-hi'], 0.18)
      for (const ground of [side, pill]) {
        expect(contrastRatio(vars['--p-side-text'], ground)).toBeGreaterThanOrEqual(7)
        expect(contrastRatio(vars['--p-side-dim'], ground)).toBeGreaterThanOrEqual(4.5)
      }
    }
  )
})
