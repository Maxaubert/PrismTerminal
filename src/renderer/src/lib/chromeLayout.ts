/**
 * THE CHROME'S NUMBERS THAT MUST MOVE TOGETHER (audit 2026-10-12): each was
 * typed in two places, and the owner saw the gap the day one moved without
 * the other (2026-10-12, the slid-out sidebar's cut-away lagging its slide).
 */

/** The bar across the window's top: the tab row, or the bar above the
 *  vertical tabs' sidebar, which starts under it. */
export const BAR_H = 36

/** The collapsed sidebar's slide, and the page cut away under it (App's
 *  COVER_CUT): one motion, so the cut never runs ahead of the panel. */
export const SIDEBAR_SLIDE = '240ms cubic-bezier(.16,1,.3,1)'

/** A dragged tab's neighbours sliding open the gap (#70), in both layouts. */
export const CARRY_SLIDE = '170ms cubic-bezier(.23,1,.32,1)'

/** How far the pointer must travel before a press on a tab becomes a drag. */
export const DRAG_SLOP = 4
