import { beforeEach, describe, expect, it } from 'vitest'
import { agentColorChoice, agentIndicator, customTermTheme, setAgentColor, saveCustomTermTheme, setAgentIndicator, setTermAcrylic, setTermFontPct, setTermOpacity, setTermThemeId, termAcrylic, termBaseFontPx, termFontPct, termOpacity, termThemeId } from './termLook'

beforeEach(() => localStorage.clear())

describe('terminal look prefs', () => {
  it('defaults: the prism preset, 100% of 13px', () => {
    expect(termThemeId()).toBe('prism')
    expect(termFontPct()).toBe(100)
    expect(termBaseFontPx()).toBe(13)
  })
  it('round-trips a preset and a size', () => {
    setTermThemeId('dracula')
    setTermFontPct(125)
    expect(termThemeId()).toBe('dracula')
    expect(termFontPct()).toBe(125)
    expect(termBaseFontPx()).toBe(16)
  })
  it("a stored 'style' (Prism's follow-the-app default) reads as prism", () => {
    localStorage.setItem('prism.term.theme', 'style')
    expect(termThemeId()).toBe('prism')
  })
  it('an off-menu percentage falls back to 100', () => {
    localStorage.setItem('prism.term.fontPct', '733')
    expect(termFontPct()).toBe(100)
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
