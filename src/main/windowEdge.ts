import type { BrowserWindow } from 'electron'
import { hwndOf, setBorder } from './dwmHelper'
import { DEFAULT_BG, isLightBg, validBg } from './material'

/**
 * The window's edge: a faint hairline, as in Prism (owner, 2026-09-18: "remove
 * the edge outline of the window or make it thinner like a faint hairline").
 *
 * Windows 11 draws a 1px border on every framed window, in a mid grey that
 * reads as a heavy outline on a near-black terminal. It is always one physical
 * pixel, so it cannot be made thinner; what reads as thickness is CONTRAST. So
 * it is drawn a small step off the window's own ground, which is the theme's,
 * and a floating window still has an edge. MAXIMIZED or FULLSCREEN the same
 * border is a line across the top of the screen, and goes.
 *
 * Chromium rewrites the DWM attributes whenever the backdrop changes (measured
 * in Prism: a strip applied at ready-to-show read back as default once the
 * material had been set), so every change is applied a moment AFTER the thing
 * that caused it, debounced.
 */

/** The ground moved a step toward the far end: lighter on dark, darker on light. */
export function edgeFor(bg: string): `#${string}` {
  const hex = validBg(bg) ? bg : DEFAULT_BG
  const n = parseInt(hex.slice(1), 16)
  const to = isLightBg(hex) ? 0 : 255
  const step = isLightBg(hex) ? 0.16 : 0.13
  const mix = (c: number): number => Math.round(c + (to - c) * step)
  const out = (mix((n >> 16) & 255) << 16) | (mix((n >> 8) & 255) << 8) | mix(n & 255)
  return `#${out.toString(16).padStart(6, '0')}`
}

export function createWindowEdge(
  win: () => BrowserWindow | null,
  bg: () => string
): { apply(): void } {
  let timer: NodeJS.Timeout | null = null
  const now = (): void => {
    const w = win()
    if (!w || w.isDestroyed()) return
    try {
      const flat = w.isMaximized() || w.isFullScreen()
      setBorder(hwndOf(w.getNativeWindowHandle()), flat ? 'none' : edgeFor(bg()))
    } catch {
      /* cosmetic */
    }
  }
  return {
    apply: () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(now, 250)
    }
  }
}
