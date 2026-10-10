/**
 * THE PROMPT TAB STYLE'S GEOMETRY (#143), MEASURED in the approved mockup
 * (research/prism-terminal/mockups/2026-10-10-prompt-style, `placeEdges()`).
 *
 * Each segment's arrow is 12 px deep; the next segment's notch is PARALLEL to
 * it, and the two overlap by 9.5 px, so the ground-coloured chevron between
 * them, the EDGE, is 2.5 px across (2 px square to the slant, the top rule's
 * own width). The edge is the agent mark: a band drawn BEHIND the segments,
 * from 1 px inside this segment to 1 px inside the next, so both segments'
 * own shapes cut it and it fills the gap flush, from the tip to both corners.
 *
 * Pure numbers and CSS strings: the strip draws them, a test holds them.
 */

/** How deep a segment's arrow (and the next one's notch) is. */
export const ARROW = 12
/** The ground-coloured gap between two segments, across. */
export const GAP = 2.5
/** How far the edge band reaches under each segment it meets. */
export const TUCK = 1
/** How far the active tab's top rule runs past the arrow's slant. Inside the
 *  segment its clip left a one-pixel darker hairline where rule met band
 *  (MEASURED in the mockup, about 80% brightness at 4x); half a pixel over
 *  covers it and reads as the rule's own anti-aliased end. */
export const SEAM = 0.5
/** The overlap of two neighbouring segments: the arrow less the gap. */
export const OVERLAP = ARROW - GAP

/** A segment's shape: the arrow on the right and, unless it is the first, the
 *  notch on the left that the previous arrow sits in. */
export function segmentClip(first: boolean): string {
  return first
    ? `polygon(0 0, calc(100% - ${ARROW}px) 0, 100% 50%, calc(100% - ${ARROW}px) 100%, 0 100%)`
    : `polygon(0 0, calc(100% - ${ARROW}px) 0, 100% 50%, calc(100% - ${ARROW}px) 100%, 0 100%, ${ARROW}px 50%)`
}

/**
 * The edge band of a segment, placed in the SEGMENT's own box: it starts
 * `ARROW + TUCK` in from the segment's right end (1 px inside its arrow) and
 * reaches `o` past the arrow line, 1 px inside the next segment's notch. The
 * last segment has no neighbour: its band stops exactly on the notch line a
 * next one would have.
 */
export function edgeBand(last: boolean): { right: number; width: number; o: number; clip: string } {
  const o = TUCK + GAP + (last ? 0 : TUCK)
  return {
    // From the segment's right edge, the band's right edge sits o - TUCK out.
    right: -(o - TUCK),
    width: ARROW + o,
    o,
    clip: `polygon(0 0, ${o}px 0, ${o + ARROW}px 50%, ${o}px 100%, 0 100%, ${ARROW}px 50%)`
  }
}

/**
 * The tab in front's 2 px top rule, cut along the arrow's own slant at its
 * right end and the notch's at its left (none on the first segment), running
 * SEAM past the slant. `d` is the slant's run over the rule's 2 px.
 */
export function ruleClip(height: number, first: boolean): { d: number; clip: string } {
  const d = (ARROW * 2) / (height / 2)
  const l = first ? 0 : d
  return {
    d,
    clip: `polygon(0 0, calc(100% - ${ARROW - SEAM}px) 0, calc(100% - ${ARROW - d - SEAM}px) 100%, ${l}px 100%)`
  }
}
