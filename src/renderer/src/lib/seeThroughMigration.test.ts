import { beforeEach, describe, expect, it } from 'vitest'
import { migrateSeeThrough } from './seeThroughMigration'
import { windowBackground } from './backgroundPrefs'
import { customWindowColours } from './customWindowColours'
import { customTermTheme, termAcrylic, termGroundAlpha, termSeeThrough } from '@core/renderer/lib/termLook'
import { configureTermCore, resetTermCore } from '@core/renderer/host'

// THE SWITCH AND THE BACKGROUND'S ALPHA BECOME THE SEE-THROUGH SLIDER, AND
// NOBODY'S WINDOW CHANGES (2026-10-13). Each case seeded the way the old app
// left its storage.

const ACRYLIC = 'prism.term.acrylic'
const LEVEL = 'prism.term.seeThrough'
const THEME = 'prism.term.theme'
const CUSTOM = 'prism.term.custom'
const PICKED = 'prism.window.background'
const KEPT = 'prism.window.customColours'
const custom = (extra: Record<string, unknown>): string =>
  JSON.stringify({ bg: '#1d1f21', fg: '#c5c8c6', cursor: '#ff0000', ansi: {}, ...extra })

beforeEach(() => {
  localStorage.clear()
  resetTermCore()
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

describe('migrateSeeThrough', () => {
  it('a fresh install, or the switch off: 0, the window solid', () => {
    migrateSeeThrough()
    expect(localStorage.getItem(LEVEL)).toBe('0')
    expect(termAcrylic()).toBe(false)
    localStorage.clear()
    localStorage.setItem(ACRYLIC, '0')
    localStorage.setItem(PICKED, '#20202099')
    migrateSeeThrough()
    expect(termSeeThrough()).toBe(0)
    expect(windowBackground()).toBe('#202020')
    expect(localStorage.getItem(ACRYLIC)).toBeNull()
  })

  it('on over a dark preset: the default it painted (b9), as a level', () => {
    localStorage.setItem(THEME, 'dracula')
    localStorage.setItem(ACRYLIC, '1')
    migrateSeeThrough()
    expect(termSeeThrough()).toBe(27)
    expect(termGroundAlpha()).toBeCloseTo(0xb9 / 255, 2)
  })

  it('on over a light preset: the light default (d1)', () => {
    localStorage.setItem(THEME, 'paper')
    localStorage.setItem(ACRYLIC, '1')
    migrateSeeThrough()
    expect(termGroundAlpha()).toBeCloseTo(0xd1 / 255, 2)
  })

  it('on with a see-through picked Background: its alpha, and the pick goes opaque', () => {
    localStorage.setItem(THEME, 'dracula')
    localStorage.setItem(ACRYLIC, '1')
    localStorage.setItem(PICKED, '#20202099')
    migrateSeeThrough()
    expect(termSeeThrough()).toBe(40)
    expect(windowBackground()).toBe('#202020')
  })

  it('a saved Custom keeps the glass it was saved with, on an opaque ground', () => {
    localStorage.setItem(THEME, 'dracula')
    localStorage.setItem(CUSTOM, custom({ bg: '#1d1f2180', acrylic: true }))
    migrateSeeThrough()
    expect(customTermTheme()).toMatchObject({ bg: '#1d1f21', seeThrough: 50 })
    expect(customTermTheme() && 'acrylic' in customTermTheme()!).toBe(false)
    // What is live is the preset's, off.
    expect(termSeeThrough()).toBe(0)
  })

  it('a Custom saved with the switch off, or never said, keeps none', () => {
    localStorage.setItem(CUSTOM, custom({ bg: '#1d1f2180' }))
    migrateSeeThrough()
    expect(customTermTheme()).toMatchObject({ bg: '#1d1f21', seeThrough: 0 })
  })

  it('the Background a Custom keeps is what it painted, and it goes opaque too', () => {
    localStorage.setItem(CUSTOM, custom({ acrylic: true }))
    localStorage.setItem(KEPT, JSON.stringify({ background: '#ffffff99', accent: null, secondary: null }))
    migrateSeeThrough()
    expect(customTermTheme()?.seeThrough).toBe(40)
    expect(customWindowColours().background).toBe('#ffffff')
  })

  it('runs once: a stored level is left alone', () => {
    localStorage.setItem(LEVEL, '12')
    localStorage.setItem(ACRYLIC, '1')
    migrateSeeThrough()
    expect(termSeeThrough()).toBe(12)
    expect(localStorage.getItem(ACRYLIC)).toBe('1')
  })

  it('a corrupt Custom is left for its own reader', () => {
    localStorage.setItem(CUSTOM, '{nope')
    expect(() => migrateSeeThrough()).not.toThrow()
    expect(localStorage.getItem(CUSTOM)).toBe('{nope')
  })
})
