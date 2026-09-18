import { nativeTheme, type BrowserWindow } from 'electron'
import { release } from 'os'

/**
 * Acrylic, and why fullscreen takes it away (2026-08-25).
 *
 * The material makes the WINDOW transparent - DWM composites the blur behind
 * it, which CSS cannot do - and the renderer paints the theme's ground over
 * it at the chosen opacity. Fullscreen has nothing behind it to show through,
 * so the window goes opaque for the duration and the material comes back on
 * the way out.
 *
 * Nothing here is persisted: the renderer owns both prefs and says them again
 * at every launch (`acrylic:set`, `window:bg`).
 */

/** Windows 11 (build 22000) is where `backgroundMaterial` exists. `rel` is
 *  os.release(), "10.0.22631"; an argument so the rule can be tested. */
export function acrylicOk(rel: string = release(), platform: string = process.platform): boolean {
  const [major, , build] = rel.split('.').map(Number)
  return platform === 'win32' && major >= 10 && build >= 22000
}

/** The `prism` preset's ground: what the window is before the renderer has
 *  said which theme it is wearing. */
export const DEFAULT_BG = '#0b0b0f'

export const validBg = (hex: unknown): hex is string =>
  typeof hex === 'string' && /^#[0-9a-f]{6}$/i.test(hex)

/** DWM decides whether its blur is a light or a dark frost from the window's
 *  immersive theme, which Electron drives off nativeTheme. Told nothing, a
 *  light theme gets a dark frost under pale surfaces. */
export function isLightBg(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16)
  return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255 > 0.5
}

export interface Material {
  /** The solid ground, for a window about to be created. */
  bg(): string
  /** False when the material does not exist here; the wish is kept anyway. */
  setAcrylic(on: boolean): boolean
  /** Ignores anything that is not #rrggbb. */
  setBg(hex: unknown): void
  /**
   * A fullscreen change WE started is in flight. `enter-full-screen` fires once
   * the resize is already under way, and for that frame a transparent window
   * has grown while the page has not painted the new area - with nothing
   * behind it, the gap is the DESKTOP. So the window goes opaque BEFORE the OS
   * is asked, and `settled` (either fullscreen event) ends the hold.
   */
  beforeFullscreen(): void
  settled(): void
}

export function createMaterial(win: () => BrowserWindow | null): Material {
  let wanted = false
  let solid = DEFAULT_BG
  let fsPending = false
  const worn = new WeakMap<BrowserWindow, boolean>()
  const apply = (): void => {
    const w = win()
    if (!w || w.isDestroyed()) return
    // MATERIAL FIRST, COLOUR SECOND (measured 2026-09-18, Electron 43):
    // setBackgroundMaterial REWRITES the background colour - 'none' leaves the
    // window #FFFFFF whatever it was a line earlier, 'acrylic' leaves it clear.
    // Colour-then-material, the order this was copied in, turned acrylic OFF
    // into a white window behind a dark theme for every frame the page had not
    // painted. Read back both ways: '#FFFFFF' that way round, the theme's own
    // ground this way round.
    try {
      const on = wanted && acrylicOk() && !w.isFullScreen() && !fsPending
      // Only on a CHANGE, and per window: a theme switch restates the colour
      // many times over and the material has nothing to hear about it.
      if (worn.get(w) !== on && acrylicOk()) w.setBackgroundMaterial(on ? 'acrylic' : 'none')
      worn.set(w, on)
      w.setBackgroundColor(on ? '#00000000' : solid)
    } catch {
      /* older Windows: the solid background stands */
    }
  }
  return {
    bg: () => solid,
    setAcrylic: (on) => {
      wanted = on === true
      apply()
      return acrylicOk()
    },
    setBg: (hex) => {
      if (!validBg(hex)) return
      solid = hex
      try {
        nativeTheme.themeSource = isLightBg(hex) ? 'light' : 'dark'
      } catch {
        /* cosmetic */
      }
      apply()
    },
    beforeFullscreen: () => {
      fsPending = true
      apply()
    },
    settled: () => {
      fsPending = false
      apply()
    }
  }
}
