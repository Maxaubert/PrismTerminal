import { describe, expect, it } from 'vitest'
import { DEFAULT_TERM_THEME, TERM_PRESETS, resolveTermTheme } from './termTheme'

describe('resolveTermTheme', () => {
  it("keeps the core's own default, prism, in the list (PT Default now leads it)", () => {
    // The wall's first card is the HOST's default (Prism Terminal's is PT
    // Default); the core's neutral fallback is still 'prism', found by id.
    expect(TERM_PRESETS[0]?.id).toBe('pt-default')
    expect(DEFAULT_TERM_THEME).toBe('prism')
    expect(TERM_PRESETS.some((p) => p.id === DEFAULT_TERM_THEME)).toBe(true)
  })

  it('resolves a preset by id, with a full sixteen', () => {
    const t = resolveTermTheme('dracula')
    expect(t.background).toBe('#1e1f29')
    expect(t.selectionBackground).toBe('#bbbbbb55') // the cursor, translucent
    expect(t.red).toBeDefined()
    expect(t.brightWhite).toBeDefined()
  })

  it("an unknown id, and Prism's legacy 'style', resolve to the prism preset", () => {
    const prism = resolveTermTheme('prism')
    expect(prism.background).toBe('#0b0b0f')
    expect(prism.foreground).toBe('#e7e7ee')
    expect(prism.cursor).toBe('#7c7cf0')
    expect(resolveTermTheme('style')).toEqual(prism)
    expect(resolveTermTheme('no-such-theme')).toEqual(prism)
  })

  it("'custom' with nothing saved falls back the same way", () => {
    localStorage.clear()
    expect(resolveTermTheme('custom')).toEqual(resolveTermTheme('prism'))
  })
})
