import { MARK_BADGE } from '../components/markClasses'
import { floorMark, opaqueOver, rainbowGradient, rainbowOn } from './markColours'
import { groundIsDark, nameInk } from './nameInk'
import type { MarkState } from './tabMark'

/**
 * EVERY COLOUR A STRIP'S MARKS WEAR (#143), worked out once from what the
 * window paints. Pure, so both apps' strips colour the marks the same way.
 *
 * - The LINE colours (a run, a line, a Prompt edge) are the agent colours
 *   (`useAgentColors`), made opaque on the solid ground and held to 3:1 on
 *   every ground the mark can sit on: the bare strip, and under Prompt both
 *   segment shades. Where they already clear it nothing moves.
 * - The rainbow is the icon's seven, floored the same way, as a looping
 *   gradient along a line and down an edge.
 * - The FILL colours are Full's: SOLID (owner, 2026-10-10), so a see-through
 *   working colour (#112) is laid on the ground first, and NOT floored: the
 *   fill is the state's own colour. Finished with the rainbow on is the icon's
 *   dark badge, its rainbow floored against the badge.
 * - The name INK on each fill follows the owner's rule (`nameInk`), once per
 *   state colour.
 */
export interface MarkPalette {
  line: Record<MarkState, string>
  rainbowX: string
  rainbowY: string
  fill: Record<MarkState, string>
  ink: Record<MarkState, string>
  /** The rainbow along the finished badge's foot. */
  badgeFoot: string
}

export function markPalette({
  colours,
  grounds,
  solidGround,
  text,
  rainbow
}: {
  colours: { working: string; finished: string; question: string; failed: string }
  /** Every ground a mark can sit on, opaque. */
  grounds: readonly string[]
  /** The window's own opaque ground. */
  solidGround: string
  /** The theme's text colour. */
  text: string
  rainbow: boolean
}): MarkPalette {
  const solid = {
    working: opaqueOver(colours.working, solidGround),
    done: opaqueOver(colours.finished, solidGround),
    question: opaqueOver(colours.question, solidGround),
    failed: opaqueOver(colours.failed, solidGround)
  }
  const line = {
    working: floorMark(solid.working, grounds),
    done: floorMark(solid.done, grounds),
    question: floorMark(solid.question, grounds),
    failed: floorMark(solid.failed, grounds)
  }
  const seven = rainbowOn(grounds)
  const fill = { ...solid, done: rainbow ? MARK_BADGE : solid.done }
  const dark = groundIsDark(solidGround)
  const ink = {
    working: nameInk(fill.working, text, dark),
    done: nameInk(fill.done, text, dark),
    question: nameInk(fill.question, text, dark),
    failed: nameInk(fill.failed, text, dark)
  }
  return {
    line,
    rainbowX: rainbowGradient(seven, 'x'),
    rainbowY: rainbowGradient(seven, 'y'),
    fill,
    ink,
    badgeFoot: rainbowGradient(rainbowOn([MARK_BADGE]), 'x')
  }
}
