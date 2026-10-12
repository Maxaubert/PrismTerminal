/**
 * HOW CLOSE TO THE WINDOW'S EDGE COUNTS AS "AT" IT (#162), in CSS pixels / DIPs:
 * the one table main's cursor reading (edgeWatch) and the page's own pointer
 * moves (hoverReveal, revealZones) both read, so a retune cannot leave one
 * behind and bring the flicker back (audit 2026-10-12: it was typed three times).
 *
 * The left edge 24 (owner, 2026-10-11: "it reacts a bit too late, my cursor
 * needs to be essentially at the edge, could be better if it was like 20px
 * further into the window"), the top 16, where the terminal's first row also
 * lives. `outside`: how far outside the window still counts, the resize
 * border's band, where Windows has the pointer.
 */
export const REVEAL_ZONE = { top: 16, left: 24, outside: 8 } as const
