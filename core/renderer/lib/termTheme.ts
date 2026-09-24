import { deriveAnsi, legiblePalette, normalizeColor, type Ansi16 } from './termAnsi'
import { liveThemeId } from './termThemeRetired'
import { customTermTheme } from './termLook'
import { followsHostStyle, hostDefaults } from '../host'

// The terminal owns its colours. Inside Prism it could also WEAR THE APP STYLE
// (read --p-bg / --p-text / --p-accent-hi off :root); Prism Terminal has no app
// styles, so that path is gone and the direction is reversed: the chosen
// terminal theme is what drives the window chrome (lib/chromeTheme).

export interface TermTheme extends Partial<Ansi16> {
  background: string
  foreground: string
  cursor: string
  selectionBackground: string
}

/**
 * FOLLOWING THE HOST'S STYLE (theme id 'style'). Only where the host HAS styles
 * (Prism): it publishes its surfaces as CSS custom properties on :root, so the
 * terminal reads those instead of owning colours, and a style switch restyles
 * running shells. Prism Terminal has no styles to follow; there the terminal
 * theme drives the window, and `followsHostStyle` is false.
 */

/** Pure: style surfaces in, xterm theme out. Fallbacks are the default dark,
 *  for the moment before the style has painted. */
export function buildTermTheme(bg: string, text: string, accent: string, flatBg?: string): TermTheme {
  const b = bg.trim() || '#0b0b0f'
  const t = text.trim() || '#d7dae1'
  const a = accent.trim() || '#5b5bd6'
  // The ANSI sixteen are DERIVED from the base, not assumed: edit a style's
  // background toward red and red text adapts instead of vanishing into it.
  // The maths run against the FLAT surface: an acrylic style publishes an
  // rgba() background, which is fine to PAINT but not to measure against -
  // unparsed it turned every hue pure black.
  return {
    background: b,
    foreground: t,
    cursor: a,
    selectionBackground: `${a}55`,
    ...deriveAnsi(normalizeColor(flatBg?.trim() || b, '#101215'), t)
  }
}

/** What the host's style says, right now. */
export function readTermTheme(): TermTheme {
  const cs = getComputedStyle(document.documentElement)
  return buildTermTheme(
    cs.getPropertyValue('--p-bg'),
    cs.getPropertyValue('--p-text'),
    cs.getPropertyValue('--p-accent-hi'),
    // The flat twin of --p-bg: guaranteed hex, exists exactly because
    // "the contrast maths read it, and neither wants an rgba".
    cs.getPropertyValue('--p-side-flat')
  )
}

/** Call `cb` whenever the host's style repaints :root. Returns the stop function. */
export function watchTermTheme(cb: (t: TermTheme) => void): () => void {
  const mo = new MutationObserver(() => cb(readTermTheme()))
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] })
  return () => mo.disconnect()
}

/**
 * Preset terminal themes, whole palettes each. Presets rather than variants
 * of the app styles on purpose: a style's material (acrylic, mica, gradients)
 * does not translate into a terminal palette, so half-derived themes looked
 * wrong. Inside Prism the default was 'style' (follow the app); there is no
 * app style here, so the default is the 'prism' preset and a stored 'style'
 * resolves to it.
 */
export interface TermPreset {
  id: string
  name: string
  bg: string
  fg: string
  cursor: string
  /** The window chrome's accent, when the theme has an opinion. Absent, the
   *  chrome takes the palette's blue. */
  accent?: string
  /** A curated full palette (extracted from Tabby's schemes, or the user's
   *  own). Absent, the sixteen are derived from bg/fg by the engine. */
  ansi?: Ansi16
}

/**
 * Preset terminal themes, two kinds. A few carry an exact palette (the owner's
 * PT Default, Nord, Dracula); the rest are BASES: background, foreground,
 * cursor and an accent, their sixteen derived by the same engine
 * (deriveAnsi). Names are the terminal's own, deliberately not Prism's app
 * styles' names.
 */
export const TERM_PRESETS: TermPreset[] = [
  // FEWER, AND EACH ITS OWN (owner, 2026-09-23: "clean up the themes. there's
  // too many similar themes. i want them to be more unique, like sure most
  // should be normal themes grey, white, black, and so on. but have some brown
  // themes, pink, green, etc"). Forty became sixteen: the neutrals first (the
  // app's own four, a plain grey, a blue-black, a white and a light grey), then
  // a pair, dark and light, per colour: brown, pink, green; then the two public
  // schemes nothing else here resembles (Nord, Dracula), kept in their real
  // colours. A retired theme is not a dead end: RETIRED_THEMES
  // (termThemeRetired.ts) moves whoever wore it to the nearest one kept. The
  // new themes give their base colours only; the sixteen are derived from
  // them, which clears the legibility floor by construction.

  // PT DEFAULT is the owner's own palette (2026-09-22, saved as Custom and handed
  // over: "let this be the default theme ... for prism terminal"): Wombat's
  // colours on a darker #121212, the two blacks lifted so they read, and the
  // app icon's orange as the accent. Prism Terminal's default; a preset like
  // any other everywhere else.
  {
    id: 'pt-default',
    name: 'PT Default',
    bg: '#121212',
    fg: '#dedacf',
    cursor: '#bbbbbb',
    accent: '#fe8f34',
    ansi: { black: '#646464', red: '#ff615a', green: '#b1e969', yellow: '#ebd99c', blue: '#5da9f6', magenta: '#e86aff', cyan: '#82fff7', white: '#dedacf', brightBlack: '#6b6b6b', brightRed: '#f58c80', brightGreen: '#ddf88f', brightYellow: '#eee5b2', brightBlue: '#a5c7ff', brightMagenta: '#ddaaff', brightCyan: '#b7fff9', brightWhite: '#ffffff' }
  },
  // Prism's own dark look: what the terminal wore by default inside Prism.
  { id: 'prism', name: 'Prism', bg: '#0b0b0f', fg: '#e7e7ee', cursor: '#7c7cf0', accent: '#5b5bd6' },
  // THE APP ICON'S TWO THEMES (owner, 2026-09-21: "two themes that match the
  // app icon colour scheme, one with orange and black, and one with orange and
  // dark grey"). The icon is orange #ec9448 over a charcoal and dark-grey
  // swirl, with a cream chevron. The ACCENT is the icon's orange too, so the
  // chrome (the active tab, the update chip, a selection) wears it as well as
  // the cursor.
  {
    id: 'pitch',
    name: 'Pitch',
    bg: '#000000',
    // The icon's cream, dimmed a touch: pure #fbeedd on black glares.
    fg: '#efe7da',
    cursor: '#ec9448',
    accent: '#ec9448'
  },
  {
    id: 'cinder',
    name: 'Cinder',
    // The icon's own dark grey, the swirl's body: grey, and meant to read as
    // grey beside Pitch's black rather than as a second black.
    bg: '#383c44',
    fg: '#f3eadc',
    cursor: '#ec9448',
    accent: '#ec9448'
  },
  // A plain grey, no tint and no opinion: the neutral the others are not.
  { id: 'graphite', name: 'Graphite', bg: '#1f1f1f', fg: '#d6d6d6', cursor: '#d6d6d6', accent: '#9a9a9a' },
  { id: 'ink', name: 'Ink', bg: '#0d1117', fg: '#dbe2ea', cursor: '#7aa5d8' },
  { id: 'paper', name: 'Paper', bg: '#f6f4ee', fg: '#2a2620', cursor: '#3a63c2' },
  // A light grey, cooler than Paper's cream.
  { id: 'mist', name: 'Mist', bg: '#e4e4e2', fg: '#26262a', cursor: '#4a4a52', accent: '#5c5c66' },
  // BROWN AND BEIGE (owner: "i want a noctua theme, don't call it that but use
  // that nice brown beige colour scheme"). The beige of the fan frame and the
  // brown of its blades: Umber is the brown ground with beige text, Fawn the
  // beige ground with brown text.
  { id: 'umber', name: 'Umber', bg: '#2b211b', fg: '#e8d8c0', cursor: '#d9b38c', accent: '#c4966a' },
  { id: 'fawn', name: 'Fawn', bg: '#e6d8c0', fg: '#3d2a1f', cursor: '#7a4e35', accent: '#8a5a3c' },
  // Pink: a dusk rose, and a pale blossom.
  { id: 'rosewood', name: 'Rosewood', bg: '#24161d', fg: '#f2dce5', cursor: '#ee85aa', accent: '#e4719a' },
  { id: 'blossom', name: 'Blossom', bg: '#fbeef2', fg: '#3b2230', cursor: '#c64a78', accent: '#c64a78' },
  // Green: a deep moss, and a pale sage.
  { id: 'moss', name: 'Moss', bg: '#141c16', fg: '#d8e4d2', cursor: '#8cc07a', accent: '#78ad66' },
  { id: 'sage', name: 'Sage', bg: '#e9efe5', fg: '#223024', cursor: '#4c7d47', accent: '#4c7d47' },
  // The two public schemes kept, in their real colours: a scheme called Nord
  // that is not Nord would be a lie.
  {
    id: 'nord',
    name: 'Nord',
    bg: '#2e3440',
    fg: '#d8dee9',
    cursor: '#d8dee9',
    ansi: { black: '#3b4252', red: '#bf616a', green: '#a3be8c', yellow: '#ebcb8b', blue: '#81a1c1', magenta: '#b48ead', cyan: '#88c0d0', white: '#e5e9f0', brightBlack: '#373e4d', brightRed: '#94545d', brightGreen: '#809575', brightYellow: '#b29e75', brightBlue: '#68809a', brightMagenta: '#8c738c', brightCyan: '#6d96a5', brightWhite: '#aeb3bb' }
  },
  {
    id: 'dracula',
    name: 'Dracula',
    bg: '#1e1f29',
    fg: '#f8f8f2',
    cursor: '#bbbbbb',
    ansi: { black: '#000000', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c', blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#bbbbbb', brightBlack: '#555555', brightRed: '#ff5555', brightGreen: '#50fa7b', brightYellow: '#f1fa8c', brightBlue: '#bd93f9', brightMagenta: '#ff79c6', brightCyan: '#8be9fd', brightWhite: '#ffffff' }
  }
]

/** What an unknown id, and the legacy 'style', resolve to. */
export const DEFAULT_TERM_THEME = 'prism'

/** The theme the settings say, resolved: a preset by id, else the 'prism'
 *  preset (unknown ids, and the 'style' an imported Prism save may carry). */
/** The chrome accent a preset asks for, if it asks. */
export function presetAccent(themeId: string): string | undefined {
  return TERM_PRESETS.find((x) => x.id === liveThemeId(themeId))?.accent
}

export function resolveTermTheme(themeId: string): TermTheme {
  // The host's own style, where it has one to follow.
  if (themeId === 'style' && followsHostStyle()) return readTermTheme()
  if (themeId === 'custom') {
    const c = customTermTheme()
    if (c)
      return {
        background: c.bg,
        foreground: c.fg,
        cursor: c.cursor,
        selectionBackground: `${c.cursor}55`,
        ...legiblePalette(c.ansi, c.bg)
      }
  }
  // DEFAULT_TERM_THEME is in the list; that find cannot miss, the last fallback is for the type.
  const p =
    TERM_PRESETS.find((x) => x.id === liveThemeId(themeId)) ??
    // An id nothing answers to: the host's own default, where that is a preset.
    TERM_PRESETS.find((x) => x.id === hostDefaults().theme) ??
    TERM_PRESETS.find((x) => x.id === DEFAULT_TERM_THEME) ??
    TERM_PRESETS[0]
  return {
    background: p.bg,
    foreground: p.fg,
    cursor: p.cursor,
    selectionBackground: `${p.cursor}55`,
    // A curated palette is taste and stays as exact as legibility allows:
    // only a colour that fails the floor against the background moves, and
    // only as far as the floor (owner, 2026-09-04). Base-only presets get
    // the derived sixteen, which clear it by construction.
    ...legiblePalette(p.ansi ?? deriveAnsi(p.bg, p.fg), p.bg)
  }
}
