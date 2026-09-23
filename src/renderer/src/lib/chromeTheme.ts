import type { TermTheme } from '@core/renderer/lib/termTheme'
import { contrastRatio, ensureContrast, luminance, mixHex, normalizeColor } from '@core/renderer/lib/termAnsi'
import { EDGE_ALPHA, validWindowEdges, type WindowEdges } from '@shared/windowEdges'

// The window wears the terminal's theme. Every chrome colour is derived from
// the theme's background, foreground and blue, and whatever falls short of a
// contrast floor is moved to it, so no preset and no custom theme can make an
// unreadable title bar.
//
// The token NAMES are Prism's own, because the components were transplanted
// from Prism and read them by name. How they relate to each other is Prism's
// too (its lib/theme.ts `derive`): one surface for the window, text stepped
// back toward the ground for the quieter inks, and hover / divider / line as
// the mode's ink at a low alpha, so they sit on whatever is behind them.

const INDIGO = '#5b5bd6'
const FALLBACK_BG = '#0b0b0f'
const FALLBACK_FG = '#e7e7ee'

// Body text clears WCAG's 4.5; the dim inks, the icons and the accent clear 3,
// which is the large-text and non-text line and the same floor the ANSI
// sixteen use. Holding dim to 4.5 as well was tried on paper and rejected: on
// a theme whose own foreground barely clears 4.5 (Solarized) text and dim land
// on the same colour, and the active tab is told from the rest by its INK.
const TEXT_FLOOR = 4.5
const QUIET_FLOOR = 3

/** Every COLOUR token the components read. Radius, font and size tokens are
 *  index.css's, since no theme changes them. */
export const CHROME_COLOUR_TOKENS = [
  '--p-bg',
  '--p-bg-solid',
  '--p-side',
  '--p-side-flat',
  '--p-title',
  '--p-tabs',
  '--p-tab-active',
  '--p-text',
  '--p-text-soft',
  '--p-dim',
  '--p-dim2',
  '--p-accent',
  '--p-accent-hi',
  '--p-on-accent',
  '--p-icon',
  '--p-hover',
  '--p-hover-hi',
  '--p-divider',
  '--p-line',
  '--p-track',
  '--p-control',
  '--p-preview',
  '--p-sel-bg',
  '--p-tree-folder'
] as const

export interface ChromeTokens {
  mode: 'dark' | 'light'
  vars: Record<string, string>
}

/** 0-100 as the two hex digits of an alpha channel. Shared with the terminal
 *  panel, whose canvas has to carry the very same alpha as the chrome. */
export const alphaHex = (pct: number): string =>
  Math.round((Math.min(100, Math.max(0, pct)) / 100) * 255)
    .toString(16)
    .padStart(2, '0')

/**
 * Pure: a terminal theme in, the chrome's custom properties out. `opacityPct`
 * below 100 makes the window's surfaces translucent (#rrggbbaa) for an acrylic
 * window; `--p-bg-solid` and `--p-side-flat` are always flat, which is what
 * everything here is measured against and what a menu or a dialog paints,
 * since a panel you can read the terminal through is a smear rather than a
 * layer. Every value is #rrggbb or #rrggbbaa, never rgba(): xterm's search
 * decorations and the contrast maths both want hex.
 *
 * `edges` is the user's choice of how strongly the window draws its lines
 * (#27). It is applied HERE, to the two tokens every edge in the window reads
 * (`--p-divider`, `--p-line`: the title bar's rule, the tab separators, the
 * settings rows, a control's outline, a menu's border), so no component has to
 * know the setting exists and the shared settings in core/ follow it without
 * being touched. The default is the look the window had before the choice.
 */
export function chromeTokens(
  theme: TermTheme,
  opacityPct = 100,
  wantedAccent?: string,
  edges: WindowEdges = 'hairline',
  /** The accent the USER chose (accentPrefs), or nothing to follow the theme. */
  chosenAccent?: string | null
): ChromeTokens {
  // Flattened before any maths: a theme may publish rgba() or #rrggbbaa, which
  // is fine to paint and NaN to measure, and NaN is how a hue walks to black.
  const bg = normalizeColor(theme.background ?? '', FALLBACK_BG)
  const rawFg = normalizeColor(theme.foreground ?? '', FALLBACK_FG)
  // Measured, never read off a name: a custom ground is whatever somebody made it.
  const mode = luminance(bg) > 0.4 ? 'light' : 'dark'
  const light = mode === 'light'
  // mixHex(a, b, t): t is the share of b.
  // The flat panel (menus, dialogs, the find bar) is the ground lifted a touch
  // toward the text, so a menu reads as a layer over the terminal it covers.
  const flat = mixHex(bg, ensureContrast(rawFg, bg, TEXT_FLOOR), 0.04)
  // Inks are drawn on BOTH the ground and the flat panel. The panel sits
  // between the ground and the text, so it is the harder of the two for
  // anything on the text's side; the ground is checked after it for the rare
  // colour that sits on the other side.
  const floorOn = (c: string, floor: number): string =>
    ensureContrast(ensureContrast(c, flat, floor), bg, floor)
  const fg = floorOn(rawFg, TEXT_FLOOR)
  // The theme's own blue first, its cursor second, Prism's indigo last, and the
  // first that is VISIBLE on this ground wins. If none is, the theme's blue is
  // moved to the floor rather than swapped for a colour the theme never had.
  // A preset with an opinion about its chrome (Prism's own indigo) goes first.
  const candidates = [wantedAccent, theme.blue, theme.cursor, INDIGO]
    .filter((c): c is string => !!c)
    .map((c) => normalizeColor(c, INDIGO))
  const visible = (c: string): boolean =>
    contrastRatio(c, bg) >= QUIET_FLOOR && contrastRatio(c, flat) >= QUIET_FLOOR
  // A CHOSEN accent is kept (owner, 2026-09-22: "an accent colour option").
  // The theme's own candidates above may be swapped for one another when they
  // are hard to see, because none of them was anybody's pick; a colour picked
  // by hand is only MOVED, as far as the floor and no further, so it stays the
  // colour that was chosen on every ground that can show it.
  const chosen = chosenAccent ? normalizeColor(chosenAccent, INDIGO) : null
  const accent = chosen
    ? visible(chosen)
      ? chosen
      : floorOn(chosen, QUIET_FLOOR)
    : (candidates.find(visible) ?? floorOn(candidates[0], QUIET_FLOOR))
  // What sits on the accent is white or near-black, whichever reads better:
  // the better of two, not a midpoint test, since both can be poor at a midpoint.
  const onAccent =
    contrastRatio('#ffffff', accent) >= contrastRatio(FALLBACK_BG, accent) ? '#ffffff' : FALLBACK_BG
  // A selected row carries TEXT, so its fill is the accent moved until that ink
  // clears the text floor on it (Prism's selectionBg): away from the ink.
  let selBg = accent
  const away = onAccent === '#ffffff' ? '#000000' : '#ffffff'
  for (let i = 0; i < 15 && contrastRatio(onAccent, selBg) < TEXT_FLOOR; i += 1) {
    selBg = mixHex(selBg, away, 0.04)
  }
  const accentHi = floorOn(mixHex(accent, fg, 0.25), QUIET_FLOOR)
  const dim = floorOn(mixHex(fg, bg, 0.38), QUIET_FLOOR)
  // A raised stage rather than a sunken one: a true-black ground has nothing
  // darker to go to, so this always steps towards the text colour.
  const stage = mixHex(bg, fg, light ? 0.16 : 0.13)
  // Hover, divider and line are the MODE's ink at a low alpha rather than a
  // mixed flat colour: they are laid over the ground, the flat panel and an
  // acrylic surface alike, and an alpha is right on all three.
  const ink = light ? '#000000' : '#ffffff'
  // The window is ONE sheet (Prism, owner decision 2026-09-03): the title bar,
  // the tab strip and the ground are the same colour at the same alpha, or on
  // glass they read as panes butted together.
  // The edges (#27): the same ink, at the alpha the choice asks for. Validated
  // rather than trusted, since it comes out of localStorage. "None" is alpha
  // 00 and still a colour, so a border keeps its pixel and nothing moves.
  const edgeAlpha = EDGE_ALPHA[validWindowEdges(edges)]
  const shade = light ? 'light' : 'dark'
  const glass = opacityPct < 100
  const sheet = glass ? bg + alphaHex(opacityPct) : bg
  const vars: Record<string, string> = {
    '--p-bg-solid': bg,
    '--p-bg': sheet,
    '--p-side': sheet,
    '--p-side-flat': flat,
    '--p-title': sheet,
    '--p-tabs': sheet,
    // The active tab is told by its ink, not a fill. On glass it must paint
    // NOTHING: it sits on the strip, and a second translucent coat of the same
    // colour is a visibly darker tab, which is a fill by accident.
    '--p-tab-active': glass ? bg + '00' : bg,
    '--p-text': fg,
    '--p-text-soft': floorOn(mixHex(fg, bg, 0.14), TEXT_FLOOR),
    '--p-dim': dim,
    '--p-dim2': floorOn(mixHex(fg, bg, 0.55), QUIET_FLOOR),
    '--p-accent': accent,
    '--p-accent-hi': accentHi,
    '--p-on-accent': onAccent,
    '--p-icon': dim,
    '--p-hover': ink + alphaHex(light ? 7 : 6),
    '--p-hover-hi': ink + alphaHex(light ? 12 : 11),
    '--p-divider': ink + alphaHex(edgeAlpha.divider[shade]),
    '--p-line': ink + alphaHex(edgeAlpha.line[shade]),
    '--p-preview': stage,
    // Form controls sit INTO the page, not on a platform: quieter than the stage.
    '--p-control': mixHex(bg, fg, light ? 0.09 : 0.035),
    // The unfilled part of a bar sits ON the stage, where a divider-strength
    // grey disappears.
    '--p-track': mixHex(stage, fg, light ? 0.34 : 0.26),
    '--p-sel-bg': selBg,
    // The folder in the + menu's list of places: the accent's brighter cut,
    // already held to the non-text floor on the panel it is drawn on.
    '--p-tree-folder': accentHi
  }
  return { mode, vars }
}

export function applyChrome(t: ChromeTokens, el: HTMLElement = document.documentElement): void {
  for (const [k, v] of Object.entries(t.vars)) el.style.setProperty(k, v)
  el.dataset.mode = t.mode
  el.style.colorScheme = t.mode
}
