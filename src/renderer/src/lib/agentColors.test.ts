import { describe, expect, it } from 'vitest'
import { marksApart, themeAgentColors } from './agentColors'
import { chromeTokens } from './chromeTheme'
import { contrastRatio } from '@core/renderer/lib/termAnsi'
import { TERM_PRESETS, presetAccent, resolveTermTheme } from '@core/renderer/lib/termTheme'

describe('themeAgentColors', () => {
  it('working IS the chrome accent of the theme', () => {
    for (const id of ['prism', 'dracula', 'github']) {
      const accent = chromeTokens(resolveTermTheme(id), 1, presetAccent(id)).vars['--p-accent']
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

// #131: the Failed mark wears the theme's red, on every preset.
describe('the failed colour', () => {
  it.each(TERM_PRESETS.map((p) => p.id))('%s: shows on the ground, and is neither of the other two', (id) => {
    const bg = chromeTokens(resolveTermTheme(id)).vars['--p-bg-solid']
    const { working, finished, failed } = themeAgentColors(id)
    expect(contrastRatio(failed, bg)).toBeGreaterThanOrEqual(3)
    expect(failed.toLowerCase()).not.toBe(working.toLowerCase())
    expect(failed.toLowerCase()).not.toBe(finished.toLowerCase())
    expect(marksApart(failed, working)).toBe(true)
    expect(marksApart(failed, finished)).toBe(true)
  })

  it("is the theme's own red where it reads apart from the accent", () => {
    // PT Default: red #ff615a beside the orange accent, 24 degrees apart.
    const { failed } = themeAgentColors('pt-default')
    expect(failed.toLowerCase()).toBe(resolveTermTheme('pt-default').red?.toLowerCase())
  })
})

describe('marksApart', () => {
  it('tells a red from an orange of the same lightness, and not a red from a red', () => {
    expect(marksApart('#ff615a', '#fe8f34')).toBe(true)
    expect(marksApart('#ef4444', '#e5484d')).toBe(false)
    expect(marksApart('#22c55e', '#ef4444')).toBe(true)
    expect(marksApart('#777777', '#7a7a7a')).toBe(false)
  })
})

// #114: a picked accent may be see-through; the indicator that follows it is
// a line, and stays opaque.
describe('a see-through picked accent', () => {
  it('leaves the theme-derived working colour opaque', () => {
    localStorage.setItem('prism.window.accent', '#e07a2f80')
    try {
      const { working } = themeAgentColors('pt-default')
      expect(working).toBe('#e07a2f')
    } finally {
      localStorage.removeItem('prism.window.accent')
    }
  })
})
