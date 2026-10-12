import { luminance } from '@core/renderer/lib/termAnsi'

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
 *  sidebar keeps it and draws a hairline (sidebarLook). */
export const BLACK_GROUND = 0.0045

const lin = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const unlin = (v: number): number => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)

function toLab(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255))
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ]
}

function fromLab([L, a, b]: [number, number, number]): string {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ]
  return (
    '#' +
    rgb
      .map((v) =>
        Math.round(Math.max(0, Math.min(1, unlin(Math.max(0, v)))) * 255)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  )
}

/** OKLab lightness, 0 black to 1 white. */
export const okLightness = (hex: string): number => toLab(hex)[0]

/** The sidebar's own ground for a terminal ground (a 6-digit hex). */
export function sidebarGround(bg: string): string {
  if (luminance(bg) < BLACK_GROUND) return bg
  const [L, a, b] = toLab(bg)
  const step = Math.min(SIDEBAR_STEP, L - 0.08)
  const k = (L - step) / L
  return fromLab([L - step, a * k, b * k])
}
