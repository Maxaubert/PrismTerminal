import { chromeTokens } from './chromeTheme'
import { FAILED_RED, QUESTION_BLUE } from '@core/renderer/lib/agentColors'
import { windowAccent } from './accentPrefs'
import { windowBackground } from './backgroundPrefs'
import { contrastRatio, ensureContrast, normalizeColor } from '@core/renderer/lib/termAnsi'
import { presetAccent, resolveTermTheme } from '@core/renderer/lib/termTheme'

/**
 * What the agent indicators wear when the user has not picked a colour: the
 * THEME's (owner, 2026-09-18).
 *
 * Working is the chrome's own accent, the very colour the active tab's rule
 * and the selected settings page already wear, so a lit tab belongs to the
 * window it is in. Finished is the theme's green, because "done" has to be
 * told apart from "working" at a glance and green is what every one of these
 * palettes already uses to say so; it is moved to the contrast floor on the
 * theme's ground like any other ink. A palette whose green IS its accent
 * (it happens) gets the fallback green instead, since two states in one
 * colour is no indicator at all.
 */
const FALLBACK_DONE = '#22c55e'
const FLOOR = 3

export function themeAgentColors(themeId: string): {
  working: string
  finished: string
  question: string
  failed: string
} {
  // What the chrome REALLY wears (2026-09-28): the picked background and
  // accent, where there are any, exactly as paintChrome derives the window. An
  // unpicked indicator follows "the accent you see", which is the pick.
  const own = resolveTermTheme(themeId)
  const background = windowBackground()
  const theme = background ? { ...own, background } : own
  const vars = chromeTokens(theme, 1, presetAccent(themeId), undefined, windowAccent()).vars
  const bg = vars['--p-bg-solid']
  // The accent as a LINE, never see-through (#112, #114): an indicator that
  // follows the theme is opaque even when a picked accent is not.
  const working = vars['--p-accent-solid']
  const green = ensureContrast(normalizeColor(theme.green ?? '', FALLBACK_DONE), bg, FLOOR)
  // Near-identical colours measure about 1:1 against each other.
  const finished =
    contrastRatio(green, working) < 1.15 ? ensureContrast(FALLBACK_DONE, bg, FLOOR) : green
  // The question mark's blue, moved only as far as this ground needs.
  const question = ensureContrast(QUESTION_BLUE, bg, FLOOR)
  // FAILED is the theme's red (#131), at the same floor. Where that red is
  // too near the accent or the green (Garnet's accent IS red), the plain red,
  // then the theme's magenta: two states in one colour say nothing. Told
  // apart by HUE, or failing that by distance, never by contrast, which only
  // sees lightness and called a red and an orange of one luminance the same
  // (MEASURED on Paper).
  const tries = [theme.red, FAILED_RED, theme.magenta, FALLBACK_FAIL_ALT].map((c) =>
    ensureContrast(normalizeColor(c ?? '', FAILED_RED), bg, FLOOR)
  )
  const failed = tries.find((c) => marksApart(c, working) && marksApart(c, finished)) ?? tries[0]
  return { working, finished, question, failed }
}

/** The last resort for Failed, a magenta, for a palette whose reds are all
 *  taken by its accent. */
const FALLBACK_FAIL_ALT = '#d946ef'

const rgbOf = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)

/** Hue in degrees, and saturation (HSL), of a `#rrggbb`. */
function hueSat(h: string): { hue: number; sat: number } {
  const [r, g, b] = rgbOf(h)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  const l = (max + min) / 2
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  if (d === 0) return { hue: 0, sat }
  const hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { hue: (hue * 60 + 360) % 360, sat }
}

/** Two marks that read as two: hues 20 degrees apart (both coloured), or an
 *  RGB distance of 80 or more. Exported for its test. */
export function marksApart(a: string, b: string): boolean {
  const [x, y] = [hueSat(a), hueSat(b)]
  const turn = Math.abs(x.hue - y.hue)
  if (x.sat > 0.25 && y.sat > 0.25 && Math.min(turn, 360 - turn) >= 20) return true
  const [p, q] = [rgbOf(a), rgbOf(b)]
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) * 255 >= 80
}
