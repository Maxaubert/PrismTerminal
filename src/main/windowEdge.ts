import type { BrowserWindow } from 'electron'
import { hwndOf, setBorder } from './dwmHelper'
import { DEFAULT_BG, isLightBg, validBg } from './material'
import { EDGE_BORDER_STEP, validWindowEdges, type WindowEdges } from '@shared/windowEdges'

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
 *
 * IT FOLLOWS THE EDGES SETTING (owner, 2026-09-19, #27: "Hairline, Faint, or
 * like Solid edges, or even No edges"). The setting is about every edge of the
 * window and this border is the outermost of them, so "no edges" with a line
 * still drawn round the window would be a setting that half works. The step
 * off the ground is the only thing that changes: hairline is the 0.13 / 0.16
 * this file always used, so the default is the border as it was; faint and
 * solid scale it as the line tokens scale; none asks DWM for no border at all,
 * the same DWMWA_COLOR_NONE a maximized window already gets. It costs nothing
 * new: one more reason to call the same debounced apply().
 */

/** The ground moved a step toward the far end (lighter on dark, darker on
 *  light), by as much as the edges setting asks, or 'none' for no border. */
export function edgeFor(bg: string, edges: WindowEdges = 'hairline'): `#${string}` | 'none' {
  const steps = EDGE_BORDER_STEP[validWindowEdges(edges)]
  if (!steps) return 'none'
  const hex = validBg(bg) ? bg : DEFAULT_BG
  const n = parseInt(hex.slice(1), 16)
  const to = isLightBg(hex) ? 0 : 255
  const step = isLightBg(hex) ? steps.light : steps.dark
  const mix = (c: number): number => Math.round(c + (to - c) * step)
  const out = (mix((n >> 16) & 255) << 16) | (mix((n >> 8) & 255) << 8) | mix(n & 255)
  return `#${out.toString(16).padStart(6, '0')}`
}

export function createWindowEdge(
  win: () => BrowserWindow | null,
  bg: () => string,
  edges: () => WindowEdges = () => 'hairline'
): { apply(): void } {
  let timer: NodeJS.Timeout | null = null
  const now = (): void => {
    const w = win()
    if (!w || w.isDestroyed()) return
    try {
      const flat = w.isMaximized() || w.isFullScreen()
      setBorder(hwndOf(w.getNativeWindowHandle()), flat ? 'none' : edgeFor(bg(), edges()))
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
