import { LEGACY_OPACITY_KEY, customTermTheme, legacyTermOpacity, opacityPct, termAcrylic, termThemeId } from '@core/renderer/lib/termLook'
import { resolveTermTheme } from '@core/renderer/lib/termTheme'
import { alphaOf, opaque, parseColour, withAlpha } from '@core/renderer/lib/colour'
import { setWindowBackground, windowBackground } from './backgroundPrefs'

// THE OPACITY SLIDER BECOMES THE BACKGROUND'S ALPHA, AND NOBODY'S WINDOW
// CHANGES ON UPDATE (#114; owner, 2026-10-03: alpha "should be built into the
// colour pickers ... it should not be a separate opacity setting", and of the
// direction, option a, "go ahead"). Spec: docs/superpowers/specs/
// 2026-10-03-colour-picker-alpha-design.md, "Background alpha replaces Opacity".
//
// Runs ONCE per launch before the first paint (main.tsx), and is idempotent:
// each step's input is what the old app left behind, and each step removes
// it. Two values that can differ are read: the LIVE `prism.term.opacity`
// (perhaps an unsaved edit) and the SAVED `Custom.opacity`.
//
// A saved N becomes the alpha byte round(N / 100 * 255), which is exactly what
// the window painted for Opacity N, so the window is byte for byte the same.

const CUSTOM_KEY = 'prism.term.custom'

/** The alpha a saved Opacity N painted at. */
const alphaFor = (n: number): number => n / 100
const sameByte = (a: number, b: number): boolean => Math.round(a * 255) === Math.round(b * 255)

export function migrateOpacity(): void {
  try {
    foldSavedCustom()
    foldLive()
  } catch {
    /* a blocked store migrates nothing, and the window is opaque as before */
  }
}

/**
 * 1. THE SAVED CUSTOM. Its opacity folds into its own `bg` when it was saved
 *    with acrylic (on, or never said): with acrylic off it painted nothing.
 *    The saved slot never takes the live value, so picking Custom again
 *    restores the SAVED see-through, as it did. The field then goes (it is
 *    read by nothing, as `font` and `fontPct` are not).
 */
function foldSavedCustom(): void {
  const raw = localStorage.getItem(CUSTOM_KEY)
  if (!raw) return
  let c: Record<string, unknown>
  try {
    c = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return // Corrupt: its own reader reads it as no Custom; not ours to fix.
  }
  if (!c || typeof c !== 'object' || !('opacity' in c)) return
  const { opacity, ...rest } = c
  const n = opacityPct(opacity)
  if (n < 100 && c.acrylic !== false && typeof c.bg === 'string' && parseColour(c.bg)) {
    rest.bg = withAlpha(c.bg, alphaFor(n))
  }
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(rest))
}

/**
 * 2. THE LIVE VALUE, which is what was painting. Only with acrylic on did it
 *    show; then it goes, in the order the window reads its ground:
 *    - onto the picked Background, when one is picked;
 *    - nowhere, when the theme is the Custom whose own bg already carries it;
 *    - else onto a picked Background that is the theme's own opaque ground,
 *      at that alpha (a preset, or a Custom whose live value was not saved).
 *    Either way the old key is removed.
 */
function foldLive(): void {
  if (localStorage.getItem(LEGACY_OPACITY_KEY) === null) return
  const n = legacyTermOpacity()
  if (termAcrylic() && n < 100) {
    const a = alphaFor(n)
    const picked = windowBackground()
    const own = termThemeId() === 'custom' ? customTermTheme() : null
    if (picked) setWindowBackground(withAlpha(picked, a))
    else if (!(own && sameByte(alphaOf(own.bg), a)))
      setWindowBackground(withAlpha(opaque(resolveTermTheme(termThemeId()).background, '#0b0b0f'), a))
  }
  localStorage.removeItem(LEGACY_OPACITY_KEY)
}
