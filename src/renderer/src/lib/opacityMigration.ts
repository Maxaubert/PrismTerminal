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
    foldLive(foldSavedCustom())
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
 *    Answers whether it gave `bg` an alpha, which the live step must then
 *    weigh even when no live value was stored (that read as 100).
 */
function foldSavedCustom(): boolean {
  const raw = localStorage.getItem(CUSTOM_KEY)
  if (!raw) return false
  let c: Record<string, unknown>
  try {
    c = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return false // Corrupt: its own reader reads it as no Custom; not ours to fix.
  }
  if (!c || typeof c !== 'object' || !('opacity' in c)) return false
  const { opacity, ...rest } = c
  const n = opacityPct(opacity)
  let folded = false
  if (n < 100 && c.acrylic !== false && typeof c.bg === 'string' && parseColour(c.bg)) {
    rest.bg = withAlpha(c.bg, alphaFor(n))
    folded = true
  }
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(rest))
  return folded
}

/**
 * 2. THE LIVE VALUE, which is what was painting (100 when never stored, as the
 *    old window read it). Only with acrylic on did it show; then it goes, in
 *    the order the window reads its ground:
 *    - onto the picked Background, when one is picked (at 100 the picked one
 *      is already opaque and stays as it is);
 *    - nowhere, when the theme is the Custom whose own bg now carries the
 *      same alpha;
 *    - else onto a picked Background that is the theme's own opaque ground,
 *      at that alpha: a preset below 100, or a Custom whose live value was
 *      not the saved one. THAT INCLUDES A LIVE 100 over a Custom saved
 *      see-through (review of #115): the window was opaque, and with step 1
 *      alone it would have painted the saved alpha after the update.
 *    The old key is removed. Runs only when there was something to migrate:
 *    a live key, or a saved Custom step 1 just folded.
 */
function foldLive(customFolded: boolean): void {
  const hasLive = localStorage.getItem(LEGACY_OPACITY_KEY) !== null
  if (!hasLive && !customFolded) return
  const n = legacyTermOpacity()
  if (termAcrylic()) {
    const a = alphaFor(n)
    const picked = windowBackground()
    const own = termThemeId() === 'custom' ? customTermTheme() : null
    if (picked) {
      if (n < 100) setWindowBackground(withAlpha(picked, a))
    } else if (own ? !sameByte(alphaOf(own.bg), a) : n < 100) {
      setWindowBackground(withAlpha(opaque(resolveTermTheme(termThemeId()).background, '#0b0b0f'), a))
    }
  }
  if (hasLive) localStorage.removeItem(LEGACY_OPACITY_KEY)
}
