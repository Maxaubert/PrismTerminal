/**
 * THE CUT CORNER, ONE CURVE FOR BOTH SIDES OF IT (owner, 2026-10-12: the corner
 * "looks pretty bad", then "a weird border, its square darker and not
 * following the curve"). Where the terminal meets the bar beside the sidebar,
 * the terminal is cut round (radius 10) and a small piece in the sidebar's
 * colour fills the outside of the curve. Both are masks from the SAME path, one
 * the inverse of the other, so every pixel on the curve is covered once
 * between them. A border-radius beside a gradient, or a small mask layer over
 * a big one, each left a line: the two edges never quite matched, and a layer's
 * own edges sampled half clear.
 */
export const CORNER_R = 10

const svg = (body: string, size: number): string =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>${body}</svg>`
  )}")`

/** Everything from the top-left on, less the outside of the corner's curve. As
 *  big as any window, placed at the cut's top-left. */
const PAGE = 8000
export const INSIDE_CORNER = svg(
  `<path d='M${CORNER_R} 0H${PAGE}V${PAGE}H0V${CORNER_R}A${CORNER_R} ${CORNER_R} 0 0 1 ${CORNER_R} 0Z'/>`,
  PAGE
)
export const INSIDE_SIZE = `${PAGE}px ${PAGE}px`

/** The outside of the curve alone: the corner piece, CORNER_R square. */
export const OUTSIDE_CORNER = svg(
  `<path d='M0 0H${CORNER_R}A${CORNER_R} ${CORNER_R} 0 0 0 0 ${CORNER_R}Z'/>`,
  CORNER_R
)
