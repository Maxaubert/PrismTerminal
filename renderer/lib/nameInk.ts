import { contrastRatio, luminance } from './termAnsi'

/** Under this, the theme's text on a fill is gone and the name flips. */
export const NAME_FLIP = 2

/** Dark or light, MEASURED off the ground (regression rule 15), with the
 *  chrome's own threshold (`chromeTokens`: light above 0.4). */
export const groundIsDark = (ground: string): boolean => luminance(ground) <= 0.4

/**
 * THE NAME ON A FULL TAB (#143; owner, 2026-10-10: "Every tab name in Full
 * uses the theme's own text colour ... A filled tab changes its name to the
 * opposite colour ... only when the theme's text colour would read under 2:1
 * on that state's full fill colour"). Decided once per state colour, from the
 * fill at full strength, so a breathing question's name never changes as its
 * fill fades. The opposite is black on a dark theme and white on a light one,
 * and which theme it is comes from the GROUND, never from the text.
 */
export function nameInk(fill: string, text: string, darkGround: boolean): string {
  if (contrastRatio(text, fill) >= NAME_FLIP) return text
  return darkGround ? '#0b0b0b' : '#ffffff'
}
