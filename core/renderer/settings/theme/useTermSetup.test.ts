import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { configureTermCore, resetTermCore, type TermHostConfig } from '../../host'
import {
  customTermTheme,
  saveCustomTermTheme,
  setTermAcrylic,
  setTermThemeId,
  termAcrylicInForce,
  termGroundAlpha,
  termThemeId
} from '../../lib/termLook'
import { saveTermSetup, termSetupState } from './useTermSetup'

// Review of #156: Save changes must judge, and save, the setup IN FORCE, so a
// switch the user cannot see (High Contrast holds the window solid) neither
// lights it nor rides out on it, and a picked opaque Background does not light
// it by its lightness.

let picked: string | null = null
const PRISM_TERMINAL: TermHostConfig = {
  api: {} as TermHostConfig['api'],
  defaults: { theme: 'prism', acrylic: false, indicator: 'minimal', agentColor: '', agentDoneColor: '' },
  followsHostStyle: false,
  paintsGround: true,
  themedAgentColors: () => ({ working: '#5b5bd6', finished: '#22c55e' }),
  acrylic: { kind: 'window', supported: async () => true },
  ownsKey: () => false,
  terminalGround: () => picked
}

describe('the setup Save changes judges (#156 review)', () => {
  beforeEach(() => {
    localStorage.clear()
    picked = null
    configureTermCore(PRISM_TERMINAL)
  })
  afterEach(() => resetTermCore())

  it('High Contrast with the switch stored on is not dirty: the switch is not in force', () => {
    setTermThemeId('high-contrast')
    setTermAcrylic(true)
    expect(termSetupState().dirty).toBe(false)
  })

  it('saving High Contrast keeps it solid: the Custom carries the switch in force', () => {
    setTermThemeId('high-contrast')
    setTermAcrylic(true)
    saveTermSetup()
    expect(termThemeId()).toBe('custom')
    expect(customTermTheme()?.acrylic).toBe(false)
    expect(termAcrylicInForce()).toBe(false)
    expect(termGroundAlpha()).toBe(1)
  })

  it('an opaque picked Background does not light Save changes, light or dark', () => {
    saveCustomTermTheme({ bg: '#111111', fg: '#eeeeee', cursor: '#ff0000', ansi: {}, acrylic: true })
    setTermThemeId('custom')
    setTermAcrylic(true)
    expect(termSetupState().dirty).toBe(false)
    picked = '#ffffff'
    expect(termSetupState().dirty).toBe(false)
    picked = '#000000'
    expect(termSetupState().dirty).toBe(false)
    // A see-through pick still does.
    picked = '#ffffff99'
    expect(termSetupState().dirty).toBe(true)
  })

  it('a save under an opaque light pick keeps the Custom at its own level', () => {
    saveCustomTermTheme({ bg: '#111111', fg: '#eeeeee', cursor: '#ff0000', ansi: {}, acrylic: true })
    setTermThemeId('custom')
    setTermAcrylic(true)
    picked = '#ffffff'
    saveTermSetup()
    expect(customTermTheme()?.bg).toBe('#111111b9')
  })
})
