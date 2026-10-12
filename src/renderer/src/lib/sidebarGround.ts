import { luminance } from '@core/renderer/lib/termAnsi'
import { fromLab, toLab } from '@core/renderer/lib/oklab'

export { okLightness } from '@core/renderer/lib/oklab'

/**
 * THE SIDEBAR'S GROUND, unpicked (#162; owner, 2026-10-12, of the sidebar
 * steps mockup: a mix toward black was "too heavy" on some themes and "too
 * light" on others, it "should follow a general scheme"; then Medium step:
 * "yes thats good"). One step for every theme, the same size to the eye: the
 * terminal's ground made darker by SIDEBAR_STEP in OKLab lightness, its hue
 * kept and its chroma shrunk with the lightness so a dark step does not turn
 * muddy. A black ground has no room below it and stays itself.
 */
export const SIDEBAR_STEP = 0.045

/** Below this luminance a ground is black: a step down would not show, so the
 *  sidebar keeps it. */
export const BLACK_GROUND = 0.0045

/** The sidebar's own ground for a terminal ground (a 6-digit hex). */
export function sidebarGround(bg: string): string {
  if (luminance(bg) < BLACK_GROUND) return bg
  const [L, a, b] = toLab(bg)
  const step = Math.min(SIDEBAR_STEP, L - 0.08)
  const k = (L - step) / L
  return fromLab([L - step, a * k, b * k])
}
