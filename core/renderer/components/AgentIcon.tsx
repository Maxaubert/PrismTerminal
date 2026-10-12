import type { JSX } from 'react'
import type { DetectedAgent } from '../../shared/types'

/**
 * THE AGENT'S OWN MARK ON ITS TAB (owner, 2026-10-12, from the tab looks
 * mockups: "use the actual icons for claude and chatgpt"; spec
 * `docs/superpowers/specs/2026-10-12-tab-icons-design.md`). Every tab shows
 * what runs in it, so a tab is found by its shape before its name is read.
 *
 * - Claude Code: CLAWD, its own mascot, in its orange (the owner's pick over
 *   the Claude spark and the Anthropic A).
 * - Codex: the OpenAI mark, in the name's ink (monochrome).
 * - No agent, or another: a `>_` prompt, in the name's ink.
 * - Settings: the cog.
 *
 * Core, so Prism's tabs can wear it too; nothing there changes until they do.
 */
export type IconKind = DetectedAgent | 'shell' | 'settings'

/** Which mark a tab wears: the agent in its shell, else the shell's own. */
export function iconKind(agent: DetectedAgent | null | undefined, settings = false): IconKind {
  if (settings) return 'settings'
  return agent === 'claude' || agent === 'codex' ? agent : 'shell'
}

/** Clawd's colour, as Claude Code draws it in the terminal. */
export const CLAWD_ORANGE = '#d77757'

/**
 * CLAWD, from Claude Code's start screen, which draws it in block characters:
 *
 *      ▐▛███▜▌
 *     ▝▜█████▛▘
 *       ▘▘ ▝▝
 *
 * One quadrant of a character cell is one pixel here, [x, y] on an 18 x 6
 * grid. A terminal cell is twice as tall as it is wide, so each pixel is
 * drawn twice as tall too, or Clawd comes out squat.
 */
export const CLAWD_PIXELS: ReadonlyArray<readonly [number, number]> = (() => {
  const px: Array<[number, number]> = [
    // ▐ and ▛ (its missing quarter is the left eye), ▜ (the right eye) and ▌
    [3, 0], [3, 1], [4, 0], [5, 0], [4, 1], [12, 0], [13, 0], [13, 1], [14, 0], [14, 1],
    // ▝▜ and ▛▘: the arms
    [1, 2], [2, 2], [3, 2], [3, 3], [14, 2], [15, 2], [14, 3], [16, 2],
    // ▘▘ ▝▝: the legs
    [4, 4], [6, 4], [11, 4], [13, 4]
  ]
  for (let x = 6; x <= 11; x++) px.push([x, 0], [x, 1])
  for (let x = 4; x <= 13; x++) px.push([x, 2], [x, 3])
  return px
})()

/** The OpenAI mark (Simple Icons 15, CC0 path data; the mark is OpenAI's). */
const OPENAI_PATH =
  'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z'

export function AgentIcon({ kind, size }: { kind: IconKind; size: number }): JSX.Element {
  const common = { width: size, height: size, 'aria-hidden': true as const, 'data-agent-icon': kind }
  switch (kind) {
    case 'claude':
      return (
        <svg {...common} viewBox="0.5 -2.5 17 17" fill={CLAWD_ORANGE} shapeRendering="crispEdges">
          {CLAWD_PIXELS.map(([x, y]) => (
            <rect key={`${x}.${y}`} x={x} y={y * 2} width={1.02} height={2.04} />
          ))}
        </svg>
      )
    case 'codex':
      return (
        <svg {...common} viewBox="0 0 24 24" fill="currentColor">
          <path d={OPENAI_PATH} />
        </svg>
      )
    case 'settings':
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
        </svg>
      )
    default:
      return (
        <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 7l5 5-5 5M12 17h7" />
        </svg>
      )
  }
}
