import { chromeTokens } from './chromeTheme'
import { QUESTION_BLUE } from '@core/renderer/lib/agentColors'
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

export function themeAgentColors(themeId: string): { working: string; finished: string; question: string } {
  // What the chrome REALLY wears (2026-09-28): the picked background and
  // accent, where there are any, exactly as paintChrome derives the window. An
  // unpicked indicator follows "the accent you see", which is the pick.
  const own = resolveTermTheme(themeId)
  const background = windowBackground()
  const theme = background ? { ...own, background } : own
  const vars = chromeTokens(theme, 100, presetAccent(themeId), undefined, windowAccent()).vars
  const bg = vars['--p-bg-solid']
  // The accent as a LINE, never see-through (#112): an indicator that follows
  // the theme is opaque even when a picked accent is not. `--p-accent-solid`
  // arrives with the accent's alpha; until then it is the accent itself.
  const working = vars['--p-accent-solid'] ?? vars['--p-accent']
  const green = ensureContrast(normalizeColor(theme.green ?? '', FALLBACK_DONE), bg, FLOOR)
  // Near-identical colours measure about 1:1 against each other.
  const finished =
    contrastRatio(green, working) < 1.15 ? ensureContrast(FALLBACK_DONE, bg, FLOOR) : green
  // The question mark's blue, moved only as far as this ground needs.
  const question = ensureContrast(QUESTION_BLUE, bg, FLOOR)
  return { working, finished, question }
}
