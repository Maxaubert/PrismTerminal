import { beforeEach, describe, expect, it } from 'vitest'
import { FONT_PCTS, agentColorChoice, applyCustomExtras, resetTermExtras, agentIndicator, customTermTheme, setAgentColor, saveCustomTermTheme, setAgentIndicator, setTermAcrylic, setTermFontPct, setTermOpacity, setTermThemeId, termAcrylic, termBaseFontPx, termFontPct, termOpacity, termThemeId } from './termLook'

beforeEach(() => localStorage.clear())

describe('terminal look prefs', () => {
  it('defaults: the prism preset, 100% of 13px', () => {
    expect(termThemeId()).toBe('prism')
    expect(termFontPct()).toBe(100)
    expect(termBaseFontPx()).toBe(13)
  })
  it('round-trips a preset and a size', () => {
    setTermThemeId('dracula')
    setTermFontPct(120)
    expect(termThemeId()).toBe('dracula')
    expect(termFontPct()).toBe(120)
    expect(termBaseFontPx()).toBe(16)
  })
  it("a stored 'style' (Prism's follow-the-app default) reads as prism", () => {
    localStorage.setItem('prism.term.theme', 'style')
    expect(termThemeId()).toBe('prism')
  })
  it('an off-menu percentage falls back to 100', () => {
    localStorage.setItem('prism.term.fontPct', '733')
    expect(termFontPct()).toBe(100)
    localStorage.setItem('prism.term.fontPct', '20')
    expect(termFontPct()).toBe(100)
  })
  it('the sizes run 50 to 200 in tens, and an old step lands on the nearest', () => {
    expect(FONT_PCTS[0]).toBe(50)
    expect(FONT_PCTS[FONT_PCTS.length - 1]).toBe(200)
    expect(FONT_PCTS.every((p, i) => i === 0 || p - FONT_PCTS[i - 1] === 10)).toBe(true)
    localStorage.setItem('prism.term.fontPct', '125')
    expect(termFontPct()).toBe(130)
    localStorage.setItem('prism.term.fontPct', '175')
    expect(termFontPct()).toBe(180)
    localStorage.setItem('prism.term.fontPct', '60')
    expect(termFontPct()).toBe(60)
  })
  it('a theme leaves the font and its size alone', () => {
    localStorage.setItem('prism.term.font', 'consolas')
    localStorage.setItem('prism.term.fontPct', '140')
    resetTermExtras()
    applyCustomExtras({ bg: '#000000', fg: '#ffffff', cursor: '#ff0000', ansi: {}, font: 'cascadia', fontPct: 90 })
    expect(localStorage.getItem('prism.term.font')).toBe('consolas')
    expect(termFontPct()).toBe(140)
  })
})

describe('the one custom theme', () => {
  it('is null before any save, and saving overwrites the single slot', () => {
    expect(customTermTheme()).toBeNull()
    saveCustomTermTheme({ bg: '#111111', fg: '#eeeeee', cursor: '#ff0000', ansi: { red: '#ff5555' } })
    expect(customTermTheme()?.bg).toBe('#111111')
    saveCustomTermTheme({ bg: '#222222', fg: '#dddddd', cursor: '#00ff00', ansi: {} })
    expect(customTermTheme()?.bg).toBe('#222222')
  })
  it('a corrupt save reads as no custom theme', () => {
    localStorage.setItem('prism.term.custom', '{nope')
    expect(customTermTheme()).toBeNull()
  })
})

describe('the agent indicator', () => {
  it('defaults to minimal and round-trips full', () => {
    localStorage.removeItem('prism.term.agentIndicator')
    expect(agentIndicator()).toBe('minimal')
    setAgentIndicator('full')
    expect(agentIndicator()).toBe('full')
  })
  it('garbage reads as the default', () => {
    localStorage.setItem('prism.term.agentIndicator', 'soup')
    expect(agentIndicator()).toBe('minimal')
  })
})

describe('the working colour', () => {
  it('follows the theme until a colour is picked, and can be given back', () => {
    localStorage.removeItem('prism.term.agentColor')
    expect(agentColorChoice()).toBe('')
    setAgentColor('#22c55e')
    expect(agentColorChoice()).toBe('#22c55e')
    setAgentColor('')
    expect(agentColorChoice()).toBe('')
    expect(localStorage.getItem('prism.term.agentColor')).toBeNull()
  })
  it('garbage in storage reads as following the theme', () => {
    localStorage.setItem('prism.term.agentColor', 'soup')
    expect(agentColorChoice()).toBe('')
  })
})

describe('acrylic and its opacity', () => {
  it('acrylic is off until asked for', () => {
    expect(termAcrylic()).toBe(false)
    setTermAcrylic(true)
    expect(termAcrylic()).toBe(true)
  })
  it('reads a never-set opacity as opaque, not transparent', () => {
    localStorage.clear()
    expect(termOpacity()).toBe(100)
    localStorage.setItem('prism.term.opacity', '')
    expect(termOpacity()).toBe(100)
    setTermOpacity(5)
    expect(termOpacity()).toBe(30)
  })
})
