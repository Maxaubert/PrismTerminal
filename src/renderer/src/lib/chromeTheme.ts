import type { TermTheme } from './termTheme'
import { contrastRatio, ensureContrast, luminance, mixHex, normalizeColor } from './termAnsi'

// The window wears the terminal's theme. Every chrome colour is derived from
// the theme's background, foreground and blue, and whatever falls short of a
// contrast floor is moved to it, so no preset and no custom theme can make an
// unreadable title bar.

const INDIGO = '#5b5bd6'
const FALLBACK_BG = '#0b0b0f'
const FALLBACK_FG = '#e7e7ee'

// Body text clears WCAG's 4.5; the dim text and the accent clear 3, which is
// the large-text and non-text line and the same floor the ANSI sixteen use.
const TEXT_FLOOR = 4.5
const QUIET_FLOOR = 3

export interface ChromeTokens {
  mode: 'dark' | 'light'
  vars: Record<string, string>
}

const alphaHex = (pct: number): string =>
  Math.round((Math.min(100, Math.max(0, pct)) / 100) * 255)
    .toString(16)
    .padStart(2, '0')

/**
 * Pure: a terminal theme in, the chrome's custom properties out. `opacityPct`
 * below 100 makes `--p-bg` translucent (#rrggbbaa) for an acrylic window;
 * `--p-bg-solid` is always the flat ground, which is what everything here is
 * measured against and what a menu or a drawer paints, since a panel you can
 * read the terminal through is a smear rather than a layer.
 */
export function chromeTokens(theme: TermTheme, opacityPct = 100): ChromeTokens {
  // Flattened before any maths: a theme may publish rgba() or #rrggbbaa, which
  // is fine to paint and NaN to measure, and NaN is how a hue walks to black.
  const bg = normalizeColor(theme.background ?? '', FALLBACK_BG)
  const fg = ensureContrast(normalizeColor(theme.foreground ?? '', FALLBACK_FG), bg, TEXT_FLOOR)
  // Measured, never read off a name: a custom ground is whatever somebody made it.
  const mode = luminance(bg) > 0.4 ? 'light' : 'dark'
  // The theme's own blue first, its cursor second, Prism's indigo last, and the
  // first that is VISIBLE on this ground wins. If none is, the theme's blue is
  // moved to the floor rather than swapped for a colour the theme never had.
  const candidates = [theme.blue, theme.cursor, INDIGO]
    .filter((c): c is string => !!c)
    .map((c) => normalizeColor(c, INDIGO))
  const best =
    candidates.find((c) => contrastRatio(c, bg) >= QUIET_FLOOR) ??
    ensureContrast(candidates[0], bg, QUIET_FLOOR)
  // What sits on the accent is white or near-black, whichever reads better:
  // the better of two, not a midpoint test, since both can be poor at a midpoint.
  const accentText =
    contrastRatio('#ffffff', best) >= contrastRatio(FALLBACK_BG, best) ? '#ffffff' : FALLBACK_BG
  // mixHex(a, b, t): t is the share of b.
  const vars: Record<string, string> = {
    '--p-bg-solid': bg,
    '--p-bg': opacityPct >= 100 ? bg : bg + alphaHex(opacityPct),
    '--p-text': fg,
    '--p-text-dim': ensureContrast(mixHex(fg, bg, 0.4), bg, QUIET_FLOOR),
    '--p-surface': mixHex(bg, fg, 0.06),
    '--p-surface-hi': mixHex(bg, fg, 0.12),
    '--p-border': mixHex(bg, fg, 0.16),
    '--p-side-flat': mixHex(bg, fg, 0.04),
    '--p-accent': best,
    '--p-accent-hi': mixHex(best, fg, 0.25),
    '--p-accent-text': accentText
  }
  return { mode, vars }
}

export function applyChrome(t: ChromeTokens, el: HTMLElement = document.documentElement): void {
  for (const [k, v] of Object.entries(t.vars)) el.style.setProperty(k, v)
  el.dataset.mode = t.mode
  el.style.colorScheme = t.mode
}
