import type { TermTheme } from '@core/renderer/lib/termTheme'
import {
  contrastRatio,
  ensureContrast,
  luminance,
  mixHex,
  normalizeColor
} from '@core/renderer/lib/termAnsi'
import { alphaHex, alphaOf, composite, selectionFor } from '@core/renderer/lib/colour'
import { switchKnob } from '@core/renderer/lib/switchKnob'
import { sidebarGround } from './sidebarGround'
import { atLightness, liftToFloor, okLightness } from './oklab'
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
/** White text on the accent is tried from this ratio up (see onAccent). */
const WHITE_ON_ACCENT = 3
/** The sidebar's tab names: AAA, for an owner who works zoomed in (#162). */
const SIDE_TEXT_FLOOR = 7

/** Every COLOUR token the components read. Radius, font and size tokens are
 *  index.css's, since no theme changes them. */
export const CHROME_COLOUR_TOKENS = [
  '--p-bg',
  '--p-bg-solid',
  '--p-side',
  '--p-side-flat',
  '--p-secondary',
  '--p-secondary-solid',
  '--p-title',
  '--p-tabs',
  '--p-tab-active',
  '--p-text',
  '--p-text-soft',
  '--p-dim',
  '--p-dim2',
  '--p-accent',
  '--p-accent-solid',
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
  '--p-tree-folder',
  '--p-switch-knob',
  '--p-pressed',
  '--p-pressed-ink',
  '--p-side-text',
  '--p-side-dim'
] as const

export interface ChromeTokens {
  mode: 'dark' | 'light'
  vars: Record<string, string>
}

/** A percentage of the mode's ink as the two hex digits of an alpha: the
 *  hover and edge strengths are written in percent. The one `alphaHex` is the
 *  core's (#114), which takes 0..1. */
const pctHex = (pct: number): string => alphaHex(Math.min(100, Math.max(0, pct)) / 100)

/**
 * Pure: a terminal theme in, the chrome's custom properties out. `groundAlpha`
 * below 1 makes the window's surfaces translucent (#rrggbbaa) for an acrylic
 * window. It is the ALPHA of the ground in force (#114: the Background
 * colour's alpha replaced the Opacity slider), handed over as its byte's
 * fraction and never through a percentage, so the field and the window name
 * the same alpha; a saved Opacity N was migrated to the byte
 * round(N / 100 * 255), which is exactly what N painted here before. `--p-bg-solid` and `--p-side-flat` are always flat, which is what
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
  groundAlpha = 1,
  wantedAccent?: string,
  edges: WindowEdges = 'hairline',
  /** The accent the USER chose (accentPrefs), or nothing to follow the theme.
   *  It may carry an alpha (#114). */
  chosenAccent?: string | null,
  /** The SECONDARY colour the user chose (secondaryPrefs), or nothing for the
   *  theme's own: the sidebar and the title bar beside the terminal. */
  chosenSecondary?: string | null
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
  // THE SECONDARY COLOUR (owner, 2026-10-12: "the sidebar and titlebar colour
  // should be this, but make that into a new setting called secondary colour
  // ... so the user can pick their own, but this is the gold standard. make it
  // fit with each theme"): the vertical tabs' sidebar and their title bar.
  // THE SIDEBAR'S GROUND, unpicked (owner, 2026-10-12: "black theme should
  // have black sidebar and all the others have the old style where its a bit
  // darker than the bg + shadow", then "should follow a general scheme"): one
  // even step darker on every theme (sidebarGround); a black theme keeps its
  // black. The edge between it and the terminal is one line (TermEdge). A pick
  // is a surface the inks are held to.
  const ownSecondary = sidebarGround(bg)
  const secondary = chosenSecondary ? normalizeColor(chosenSecondary, ownSecondary) : ownSecondary
  // The form control's fill (below), a step off the ground: on a light theme
  // the quiet inks sit on it too, a segment's name or a field's hint.
  const controlFill = mixHex(bg, rawFg, light ? 0.09 : 0.035)
  const floorOn = (c: string, floor: number): string =>
    ensureContrast(
      ensureContrast(
        ensureContrast(ensureContrast(c, flat, floor), secondary, floor),
        light ? controlFill : bg,
        floor
      ),
      bg,
      floor
    )
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
  // The accent as a LINE: rings, rules, progress, the spinner. Never
  // see-through (#114); a picked alpha belongs to the fills below.
  let solid = chosen
    ? visible(chosen)
      ? chosen
      : floorOn(liftToFloor(chosen, [bg, flat], QUIET_FLOOR) ?? chosen, QUIET_FLOOR)
    : (candidates.find(visible) ?? floorOn(candidates[0], QUIET_FLOOR))
  const glass = groundAlpha < 1
  let accent = solid
  let onAccent: string
  let selBg: string
  // A SEE-THROUGH ACCENT (#114) is a FILL, painted with its alpha. The text on
  // it is chosen on what the eye sees, the fill composited over each ground it
  // sits on (the ground and the flat panel), at 4.5:1 on the worse of the two,
  // by the core's `selectionFor` (Prism's #251 rule, moved to the core). So
  // the fill may be nudged off the pick, as the opaque path's selected row
  // always was; the line above keeps the pick itself.
  const fillAlpha = chosenAccent ? alphaOf(chosenAccent) : 1
  if (fillAlpha < 1) {
    const a = alphaHex(fillAlpha)
    const sel = selectionFor(solid + a, [bg, flat])
    onAccent = sel.ink
    accent = sel.fill + a
    selBg = accent
  } else {
    // What sits on the accent is white or near-black, whichever reads better:
    // the better of two, not a midpoint test, since both can be poor at a midpoint.
    const onWhite = contrastRatio('#ffffff', accent)
    const onDark = contrastRatio(FALLBACK_BG, accent)
    onAccent = onWhite >= onDark ? '#ffffff' : FALLBACK_BG
    // WHITE ON A STRONG MID COLOUR (owner, 2026-10-12, of near-black on a red
    // Save changes: "the text colour should shift to white"). A red or a blue
    // measures a little better in black by the WCAG sum but reads better in
    // white, so when white is close (3:1 up, black not half as good again) the
    // accent is taken a shade deeper, by lightness alone so it stays its hue,
    // until white clears the body floor: only as far as the ground still shows
    // it at the accent floor. Where that runs out first, the ink stays dark. A
    // pale accent (the PT orange, a yellow) never gets here.
    if (onAccent !== '#ffffff' && onWhite >= WHITE_ON_ACCENT && onWhite * 1.5 >= onDark) {
      let deeper = accent
      for (let i = 0; i < 40 && contrastRatio('#ffffff', deeper) < TEXT_FLOOR; i += 1) {
        const next = atLightness(deeper, okLightness(deeper) - 0.005)
        if (!visible(next)) break
        deeper = next
      }
      if (contrastRatio('#ffffff', deeper) >= TEXT_FLOOR) {
        accent = solid = deeper
        onAccent = '#ffffff'
      }
    }
    // A selected row carries TEXT, so its fill is the accent moved until that ink
    // clears the text floor on it (Prism's selectionBg): away from the ink.
    selBg = accent
    const away = onAccent === '#ffffff' ? '#000000' : '#ffffff'
    for (let i = 0; i < 15 && contrastRatio(onAccent, selBg) < TEXT_FLOOR; i += 1) {
      selBg = mixHex(selBg, away, 0.04)
    }
  }
  // FILLS UNDER GLASS (#114, owner decision 5). Over a see-through ground a
  // see-through fill lies on the unknown desktop, where no ink can be held to
  // 4.5:1, so the fills that carry text (the update chip, Save, Install, the
  // theme-switch ask, a selected row) are flattened over the solid ground they
  // were chosen on. An opaque accent composites to itself: nothing moves.
  if (glass && fillAlpha < 1) {
    accent = composite(accent, bg)
    selBg = composite(selBg, bg)
  }
  const accentHi = floorOn(mixHex(solid, fg, 0.25), QUIET_FLOOR)
  // ON A LIGHT THEME the quiet inks sit nearer the text (owner, 2026-10-12:
  // "the ui buttons on light themes are often a bit too hard to see, would be
  // better if they were darker grey or black"): the dim text and the icons are
  // held to the BODY floor there, and the icons a further step darker. A dark
  // theme keeps the quieter greys it was tuned with.
  // THE SIDEBAR'S INKS (owner, 2026-10-12, of the sidebar steps mockup: "very
  // light themes have bad contrast ratios"; then "yes thats good" to the names
  // held to 7:1 and the folder lines to 4.5:1): on the sidebar's ground AND on
  // the accent pill of the tab in front, which TabSidebar lays at 18 percent.
  const sideSolid = composite(secondary, bg)
  const pill = mixHex(sideSolid, accentHi, 0.18)
  const sideHeld = (c: string, floor: number): string =>
    ensureContrast(ensureContrast(c, sideSolid, floor), pill, floor)
  const sideInks = {
    '--p-side-text': sideHeld(fg, SIDE_TEXT_FLOOR),
    '--p-side-dim': sideHeld(mixHex(fg, sideSolid, light ? 0.42 : 0.55), TEXT_FLOOR)
  }
  const dim = light
    ? floorOn(mixHex(fg, bg, 0.28), TEXT_FLOOR)
    : floorOn(mixHex(fg, bg, 0.38), QUIET_FLOOR)
  const icon = light ? floorOn(mixHex(fg, bg, 0.18), TEXT_FLOOR) : dim
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
  const sheet = glass ? bg + alphaHex(groundAlpha) : bg
  const vars: Record<string, string> = {
    '--p-bg-solid': bg,
    '--p-bg': sheet,
    // The settings rail sits ON the settings page, which already paints the
    // sheet, so on glass it paints NOTHING, as the active tab does: a second
    // coat of b9 is 92%, solid to the eye (owner, 2026-10-11: "not all things
    // change when you turn on see through window, like the sidebar").
    '--p-side': glass ? bg + '00' : bg,
    '--p-side-flat': flat,
    // On glass it is see-through at the ground's own alpha, as the sheet is.
    '--p-secondary': glass ? secondary + alphaHex(groundAlpha) : secondary,
    // Never see-through: the collapsed sidebar slid out over the terminal,
    // where text behind it made it "very hard to use" (owner, 2026-10-12).
    '--p-secondary-solid': secondary,
    '--p-title': sheet,
    '--p-tabs': sheet,
    // The active tab is told by its ink, not a fill. On glass it must paint
    // NOTHING: it sits on the strip, and a second translucent coat of the same
    // colour is a visibly darker tab, which is a fill by accident.
    '--p-tab-active': glass ? bg + '00' : bg,
    '--p-text': fg,
    '--p-text-soft': floorOn(mixHex(fg, bg, 0.14), TEXT_FLOOR),
    '--p-dim': dim,
    // The quietest ink, a hint or a disabled button's word: on a light theme
    // held to the body floor too, so a disabled Save changes still reads.
    '--p-dim2': light
      ? floorOn(mixHex(fg, bg, 0.42), TEXT_FLOOR)
      : floorOn(mixHex(fg, bg, 0.55), QUIET_FLOOR),
    '--p-accent': accent,
    '--p-accent-solid': solid,
    '--p-accent-hi': accentHi,
    '--p-on-accent': onAccent,
    '--p-icon': icon,
    '--p-hover': ink + pctHex(light ? 7 : 6),
    '--p-hover-hi': ink + pctHex(light ? 12 : 11),
    '--p-divider': ink + pctHex(edgeAlpha.divider[shade]),
    '--p-line': ink + pctHex(edgeAlpha.line[shade]),
    '--p-preview': stage,
    // Form controls sit INTO the page, not on a platform: quieter than the stage.
    '--p-control': mixHex(bg, fg, light ? 0.09 : 0.035),
    // The unfilled part of a bar sits ON the stage, where a divider-strength
    // grey disappears.
    // An off switch's track: on a light theme a mid grey the white knob stands
    // out on, not a pale one.
    '--p-track': mixHex(stage, fg, light ? 0.5 : 0.26),
    '--p-sel-bg': selBg,
    // The folder in the + menu's list of places: the accent's brighter cut,
    // already held to the non-text floor on the panel it is drawn on.
    '--p-tree-folder': accentHi,
    // THE ON SWITCH'S KNOB (owner, 2026-10-10: "keep that to being black on
    // dark themes and white on light themes ... only when the color is very
    // close"): the theme's own ink, measured off the ground, flipped only where
    // it reads under 2:1 on the ON track (`--p-sel-bg`, as the eye sees it over
    // the ground: a see-through accent's fill is measured composited).
    '--p-switch-knob': switchKnob(composite(selBg, bg), !light),
    // A PRESSED SEGMENT (owner, 2026-10-12: "make sure to fix the contrast on
    // light themes ... white themes having a very light gray color for
    // buttons"): on a light theme the text colour as a pill with the ground's
    // ink on it, the clearest pair the theme has; on a dark one the quiet grey
    // it always was.
    '--p-pressed': light ? mixHex(fg, bg, 0.08) : mixHex(mixHex(bg, fg, 0.035), fg, 0.16),
    '--p-pressed-ink': light ? bg : fg,
    ...sideInks
  }
  return { mode, vars }
}

export function applyChrome(t: ChromeTokens, el: HTMLElement = document.documentElement): void {
  for (const [k, v] of Object.entries(t.vars)) el.style.setProperty(k, v)
  el.dataset.mode = t.mode
  el.style.colorScheme = t.mode
}
