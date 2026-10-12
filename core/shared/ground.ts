/**
 * THE GROUND'S TWO CONSTANTS, once for both apps (audit 2026-10-12: the
 * default ground was typed in ten places, some fallbacks a different
 * #101215, so a palette could be made from one ground and painted on
 * another; the light/dark threshold in four).
 */

/** The ground when none can be read: the Prism preset's. */
export const DEFAULT_GROUND = '#0b0b0f'

/** Relative luminance above which a ground is LIGHT (regression rule 15:
 *  measured, never read off a name). The chrome's `data-mode`, the name on a
 *  Full tab, the default see-through and what a program is told it runs on
 *  all decide with this one number, so they cannot disagree. */
export const LIGHT_GROUND = 0.4
