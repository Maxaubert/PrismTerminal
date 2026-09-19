import { describe, expect, it } from 'vitest'
import { themeAgentColors } from './agentColors'
import { chromeTokens } from './chromeTheme'
import { contrastRatio } from './termAnsi'
import { TERM_PRESETS, presetAccent, resolveTermTheme } from './termTheme'

describe('themeAgentColors', () => {
  it('working IS the chrome accent of the theme', () => {
    for (const id of ['prism', 'dracula', 'github']) {
      const accent = chromeTokens(resolveTermTheme(id), 100, presetAccent(id)).vars['--p-accent']
      expect(themeAgentColors(id).working).toBe(accent)
    }
  })

  it('wears Prism indigo on the default theme', () => {
    expect(themeAgentColors('prism').working.toLowerCase()).toBe('#5b5bd6')
  })

  it.each(TERM_PRESETS.map((p) => p.id))(
    '%s: both states show on the ground and differ from each other',
    (id) => {
      const bg = chromeTokens(resolveTermTheme(id)).vars['--p-bg-solid']
      const { working, finished } = themeAgentColors(id)
      expect(contrastRatio(working, bg)).toBeGreaterThanOrEqual(3)
      expect(contrastRatio(finished, bg)).toBeGreaterThanOrEqual(3)
      expect(working.toLowerCase()).not.toBe(finished.toLowerCase())
    }
  )
})
