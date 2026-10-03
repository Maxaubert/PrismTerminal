import { beforeEach, describe, expect, it } from 'vitest'
import { migrateOpacity } from './opacityMigration'
import { windowBackground } from './backgroundPrefs'
import { customTermTheme, termGroundAlpha } from '@core/renderer/lib/termLook'
import { configureTermCore, resetTermCore } from '@core/renderer/host'
import { chromeTokens } from './chromeTheme'
import { resolveTermTheme } from '@core/renderer/lib/termTheme'

// THE OPACITY SLIDER BECOMES THE BACKGROUND'S ALPHA, AND NOBODY'S WINDOW
// CHANGES (#114). These are the cases the spec names, each seeded the way the
// old app left its storage.

const LIVE = 'prism.term.opacity'
const ACRYLIC = 'prism.term.acrylic'
const THEME = 'prism.term.theme'
const CUSTOM = 'prism.term.custom'
const PICKED = 'prism.window.background'

/** The byte a saved N becomes: round(N / 100 * 255), what N painted. */
const byte = (n: number): string => Math.round((n / 100) * 255).toString(16).padStart(2, '0')
const custom = (extra: Record<string, unknown>): string =>
  JSON.stringify({ bg: '#1d1f21', fg: '#c5c8c6', cursor: '#ff0000', ansi: { red: '#cc6666' }, ...extra })
/** Dracula's own ground, as the window paints it. */
const DRACULA = resolveTermTheme('dracula').background.slice(0, 7).toLowerCase()
const saved = (): Record<string, unknown> => JSON.parse(localStorage.getItem(CUSTOM) ?? 'null')

beforeEach(() => {
  localStorage.clear()
  resetTermCore()
  // The app's host: the picked Background is the ground the core reads.
  configureTermCore({
    api: {} as never,
    defaults: { theme: 'pt-default', acrylic: false, indicator: 'minimal', agentColor: '', agentDoneColor: '' },
    followsHostStyle: false,
    paintsGround: true,
    themedAgentColors: () => ({ working: '#5b5bd6', finished: '#22c55e' }),
    terminalGround: windowBackground,
    acrylic: { kind: 'window', supported: async () => true },
    ownsKey: () => false
  })
})

describe('migrateOpacity', () => {
  it('a preset at 60 with acrylic on: the theme ground at 60 becomes the picked Background', () => {
    localStorage.setItem(THEME, 'dracula')
    localStorage.setItem(ACRYLIC, '1')
    localStorage.setItem(LIVE, '60')
    // What the window painted before: the theme's ground at Opacity 60.
    const before = chromeTokens(resolveTermTheme('dracula'), 153 / 255).vars['--p-bg']
    migrateOpacity()
    expect(windowBackground()).toBe(DRACULA + byte(60))
    expect(localStorage.getItem(LIVE)).toBeNull()
    expect(termGroundAlpha()).toBe(0x99 / 255)
    expect(chromeTokens({ ...resolveTermTheme('dracula'), background: windowBackground()! }, termGroundAlpha()).vars['--p-bg']).toBe(before)
  })

  it('a picked Background takes the live alpha', () => {
    localStorage.setItem(ACRYLIC, '1')
    localStorage.setItem(LIVE, '45')
    localStorage.setItem(PICKED, '#102030')
    migrateOpacity()
    expect(windowBackground()).toBe('#102030' + byte(45))
  })

  it('a Custom whose live value equals its saved one: the alpha rides on Custom.bg alone', () => {
    localStorage.setItem(THEME, 'custom')
    localStorage.setItem(ACRYLIC, '1')
    localStorage.setItem(LIVE, '80')
    localStorage.setItem(CUSTOM, custom({ acrylic: true, opacity: 80 }))
    migrateOpacity()
    expect(customTermTheme()?.bg).toBe('#1d1f21' + byte(80))
    expect('opacity' in saved()).toBe(false)
    expect(windowBackground()).toBeNull()
    expect(termGroundAlpha()).toBe(parseInt(byte(80), 16) / 255)
  })

  it('a Custom whose live value differs: the saved slot keeps its own, the live one is picked', () => {
    localStorage.setItem(THEME, 'custom')
    localStorage.setItem(ACRYLIC, '1')
    localStorage.setItem(LIVE, '60')
    localStorage.setItem(CUSTOM, custom({ acrylic: true, opacity: 80 }))
    migrateOpacity()
    // Picking Custom again restores the SAVED see-through, as it did.
    expect(customTermTheme()?.bg).toBe('#1d1f21' + byte(80))
    // What paints now is the live value, on the theme's own ground.
    expect(windowBackground()).toBe('#1d1f21' + byte(60))
    expect(termGroundAlpha()).toBe(0x99 / 255)
  })

  // Review of #115: step 1 gave Custom.bg the saved alpha, and a live 100 was
  // skipped as "nothing to do", so an opaque window turned see-through.
  it('a Custom saved at 60, left at a live 100 with acrylic on, stays opaque', () => {
    localStorage.setItem(THEME, 'custom')
    localStorage.setItem(ACRYLIC, '1')
    localStorage.setItem(LIVE, '100')
    localStorage.setItem(CUSTOM, custom({ acrylic: true, opacity: 60 }))
    migrateOpacity()
    expect(termGroundAlpha()).toBe(1)
    expect(windowBackground()).toBe('#1d1f21')
    // Picking Custom again still restores the SAVED see-through.
    expect(customTermTheme()?.bg).toBe('#1d1f21' + byte(60))
    expect(localStorage.getItem(LIVE)).toBeNull()
  })

  it('a Custom saved at 60 with no live value stored (read as 100) stays opaque', () => {
    localStorage.setItem(THEME, 'custom')
    localStorage.setItem(ACRYLIC, '1')
    localStorage.setItem(CUSTOM, custom({ acrylic: true, opacity: 60 }))
    migrateOpacity()
    expect(termGroundAlpha()).toBe(1)
    const once = JSON.stringify({ ...localStorage })
    migrateOpacity()
    expect(JSON.stringify({ ...localStorage })).toBe(once)
  })

  it('a Custom saved at 60 under a preset leaves the preset alone', () => {
    localStorage.setItem(THEME, 'dracula')
    localStorage.setItem(ACRYLIC, '1')
    localStorage.setItem(CUSTOM, custom({ acrylic: true, opacity: 60 }))
    migrateOpacity()
    expect(windowBackground()).toBeNull()
    expect(termGroundAlpha()).toBe(1)
  })

  it('a Custom with a picked Background: the picked one takes the live value', () => {
    localStorage.setItem(THEME, 'custom')
    localStorage.setItem(ACRYLIC, '1')
    localStorage.setItem(LIVE, '70')
    localStorage.setItem(PICKED, '#333333')
    localStorage.setItem(CUSTOM, custom({ acrylic: true, opacity: 70 }))
    migrateOpacity()
    expect(windowBackground()).toBe('#333333' + byte(70))
    expect(customTermTheme()?.bg).toBe('#1d1f21' + byte(70))
  })

  it('a Custom saved with acrylic off is not folded: its opacity painted nothing', () => {
    localStorage.setItem(THEME, 'custom')
    localStorage.setItem(CUSTOM, custom({ acrylic: false, opacity: 50 }))
    migrateOpacity()
    expect(customTermTheme()?.bg).toBe('#1d1f21')
    expect('opacity' in saved()).toBe(false)
  })

  it('a Custom saved without the acrylic field is folded (it never said off)', () => {
    localStorage.setItem(CUSTOM, custom({ opacity: 50 }))
    migrateOpacity()
    expect(customTermTheme()?.bg).toBe('#1d1f21' + byte(50))
  })

  it('a live value with acrylic off had no effect, and is only removed', () => {
    localStorage.setItem(THEME, 'dracula')
    localStorage.setItem(LIVE, '40')
    migrateOpacity()
    expect(windowBackground()).toBeNull()
    expect(localStorage.getItem(LIVE)).toBeNull()
  })

  it('a live 100 is only removed', () => {
    localStorage.setItem(ACRYLIC, '1')
    localStorage.setItem(LIVE, '100')
    migrateOpacity()
    expect(windowBackground()).toBeNull()
    expect(localStorage.getItem(LIVE)).toBeNull()
  })

  it('is idempotent: a second run changes nothing', () => {
    localStorage.setItem(THEME, 'custom')
    localStorage.setItem(ACRYLIC, '1')
    localStorage.setItem(LIVE, '60')
    localStorage.setItem(CUSTOM, custom({ acrylic: true, opacity: 80 }))
    migrateOpacity()
    const once = JSON.stringify({ ...localStorage })
    migrateOpacity()
    expect(JSON.stringify({ ...localStorage })).toBe(once)
  })

  it('a fresh install has nothing to do', () => {
    migrateOpacity()
    expect(localStorage.length).toBe(0)
  })

  it('junk reads as the window read it, and never throws', () => {
    localStorage.setItem(ACRYLIC, '1')
    localStorage.setItem(THEME, 'dracula')
    localStorage.setItem(LIVE, 'soup')
    expect(() => migrateOpacity()).not.toThrow()
    expect(windowBackground()).toBeNull()
    expect(localStorage.getItem(LIVE)).toBeNull()
    // Below the slider's floor reads as 30, as the window clamped it.
    localStorage.setItem(LIVE, '5')
    migrateOpacity()
    expect(windowBackground()).toBe(DRACULA + byte(30))
    // A corrupt Custom is left for its own reader, which reads it as none.
    localStorage.setItem(CUSTOM, '{nope')
    expect(() => migrateOpacity()).not.toThrow()
    expect(localStorage.getItem(CUSTOM)).toBe('{nope')
    localStorage.setItem(CUSTOM, custom({ bg: 'soup', opacity: 50 }))
    expect(() => migrateOpacity()).not.toThrow()
  })
})
