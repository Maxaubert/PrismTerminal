// How strongly the window draws its EDGES (owner, 2026-09-19, #27: "add the
// option to specify the edges that you have in the Terminal app, like we have
// in the main app, where you can choose like Hairline, Faint, or like Solid
// edges, or even No edges").
//
// One choice, read in two places, which is why it lives in shared/: the
// renderer derives every line token from it (`chromeTheme.ts`), and main draws
// the DWM border round the window from it (`windowEdge.ts`). Both must agree on
// the four words, and main must refuse anything that is not one of them, since
// what arrives over IPC is whatever a page sent.
//
// HAIRLINE IS THE DEFAULT BECAUSE IT IS WHAT THE WINDOW ALREADY WAS: its
// numbers are the ones chromeTheme and windowEdge used before there was a
// choice, so nobody's window changes until they choose. The other steps are
// Prism's own (`lib/theme.ts`, `borders`): faint is a third of a hairline
// ("edges you sense more than see"), solid is what Prism calls `strong`. The
// owner's word for it was Solid, so that is the name here; it is a stronger
// line, still an alpha over whatever is behind it, not an opaque rule.

export type WindowEdges = 'hairline' | 'faint' | 'solid' | 'none'

/** In the order the control offers them: weakest to strongest, which is the
 *  order of Prism's own Edges row (None, Faint, Hairline, Strong). */
export const WINDOW_EDGES: readonly WindowEdges[] = ['none', 'faint', 'hairline', 'solid']

export const DEFAULT_WINDOW_EDGES: WindowEdges = 'hairline'

/** Anything that is not one of the four words is the default: a stored value
 *  from a build that spelt them differently, a hand-edited profile, or an IPC
 *  argument that is not even a string. */
export function validWindowEdges(v: unknown): WindowEdges {
  return WINDOW_EDGES.includes(v as WindowEdges) ? (v as WindowEdges) : DEFAULT_WINDOW_EDGES
}

/**
 * The alpha, in percent, of the two line tokens on a dark and on a light
 * ground. `divider` is the chrome's line (the title bar's rule, the tab strip,
 * a control's outline, a menu's border); `line` is the list's (between settings
 * rows), which has always sat two points above it.
 *
 * Hairline is 7/10 and 9/12, EXACTLY what chromeTheme hard-coded before #27.
 * Faint and solid are Prism's 2.2/3.5 and 16/18 for the divider, with the list
 * line kept the same small step above. None is 0: the token stays a colour
 * (#rrggbb00), so a border keeps its pixel of layout and nothing shifts.
 */
export const EDGE_ALPHA: Record<
  WindowEdges,
  { divider: { dark: number; light: number }; line: { dark: number; light: number } }
> = {
  hairline: { divider: { dark: 7, light: 10 }, line: { dark: 9, light: 12 } },
  faint: { divider: { dark: 2.2, light: 3.5 }, line: { dark: 3, light: 4.5 } },
  solid: { divider: { dark: 16, light: 18 }, line: { dark: 18, light: 20 } },
  none: { divider: { dark: 0, light: 0 }, line: { dark: 0, light: 0 } }
}

/**
 * How far the DWM border round the window is stepped off the theme's ground,
 * as a share of the way to white (dark ground) or black (light ground), or
 * null for no border at all. Hairline is 0.13/0.16, what windowEdge.ts used
 * before #27; faint is a third of it and solid a little over double, the same
 * proportions the line tokens keep.
 */
export const EDGE_BORDER_STEP: Record<WindowEdges, { dark: number; light: number } | null> = {
  hairline: { dark: 0.13, light: 0.16 },
  faint: { dark: 0.045, light: 0.055 },
  solid: { dark: 0.3, light: 0.34 },
  none: null
}
