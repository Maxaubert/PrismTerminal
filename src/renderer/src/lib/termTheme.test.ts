import { describe, expect, it } from 'vitest'
import { DEFAULT_TERM_THEME, TERM_PRESETS, resolveTermTheme } from './termTheme'

describe('resolveTermTheme', () => {
  it('leads the list with the prism preset, which is the default', () => {
    expect(TERM_PRESETS[0]?.id).toBe('prism')
    expect(DEFAULT_TERM_THEME).toBe('prism')
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
