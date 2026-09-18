import { useMemo } from 'react'
import { chromeTokens } from './chromeTheme'
import { contrastRatio, ensureContrast, normalizeColor } from './termAnsi'
import { presetAccent, resolveTermTheme } from './termTheme'
import {
  useAgentColorChoice,
  useAgentDoneColorChoice,
  useCustomTermTheme,
  useTermThemeId
} from './termLook'

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

export function themeAgentColors(themeId: string): { working: string; finished: string } {
  const theme = resolveTermTheme(themeId)
  const vars = chromeTokens(theme, 100, presetAccent(themeId)).vars
  const bg = vars['--p-bg-solid']
  const working = vars['--p-accent']
  const green = ensureContrast(normalizeColor(theme.green ?? '', FALLBACK_DONE), bg, FLOOR)
  // Near-identical colours measure about 1:1 against each other.
  const finished =
    contrastRatio(green, working) < 1.15 ? ensureContrast(FALLBACK_DONE, bg, FLOOR) : green
  return { working, finished }
}

/** The colours in force: the user's pick where there is one, else the theme's. */
export function useAgentColors(): { working: string; finished: string } {
  const themeId = useTermThemeId()
  // A custom theme edited in place keeps its id; its palette is the dependency.
  const custom = useCustomTermTheme()
  const working = useAgentColorChoice()
  const finished = useAgentDoneColorChoice()
  return useMemo(() => {
    const themed = themeAgentColors(themeId)
    return { working: working || themed.working, finished: finished || themed.finished }
    // `custom` is read through resolveTermTheme, not named in the body.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeId, custom, working, finished])
}
