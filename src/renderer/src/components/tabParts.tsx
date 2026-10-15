import type { JSX, ReactNode } from 'react'
import { AgentIcon } from '@core/renderer/components/AgentIcon'
import { iconKind } from '@core/renderer/lib/agentIcon'
import type { DetectedAgent } from '@core/shared/types'

/**
 * THE PIECES EVERY TAB IS MADE OF, once for the strip and the sidebar (audit
 * 2026-10-12: each layout pasted its own close button and loading ring, and
 * the copies had drifted).
 */

/** Both layouts' icon size (owner, 2026-10-12: 18 px on the tabs and in the
 *  sidebar). */
export const TAB_ICON = 18

/** The X: shown on the tab in front and on hover. */
export function TabClose({
  label,
  on,
  ink,
  size,
  onClose
}: {
  label: string
  on: boolean
  ink?: string
  /** 16 on the strip, 18 in the sidebar's taller rows. */
  size: 16 | 18
  onClose: () => void
}): JSX.Element {
  return (
    <button
      className={`relative z-[1] grid shrink-0 place-items-center rounded-sm text-[var(--p-icon)] transition-opacity hover:bg-[var(--p-hover-hi)] hover:text-[var(--p-text)] ${
        on ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      }`}
      style={{ width: size, height: size, ...(ink ? { color: ink } : {}) }}
      data-tab-close
      title="Close"
      aria-label={`Close ${label}`}
      onClick={(e) => {
        e.stopPropagation()
        onClose()
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width={10}
        height={10}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        aria-hidden
      >
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  )
}

/**
 * THE END OF A TAB (owner, 2026-10-12: "the ring goes on the right where you
 * close the tab"). The ring STAYS while the tab is hovered: the close slides
 * in after it (owner, 2026-10-14, of the mockups: "4 Beside the ring genius").
 * The close used to take the ring's place on hover, which hid that the agent
 * was working ("the X appears on the same spot, which don't let you see that
 * it's working"). With no ring the close is as it always was.
 */
export function TabEnd({
  ring,
  label,
  on,
  size,
  onClose
}: {
  /** The ring mark, or null when the tab has none. */
  ring: ReactNode | null
  label: string
  on: boolean
  size: 16 | 18
  onClose: () => void
}): JSX.Element {
  if (!ring) return <TabClose label={label} on={on} size={size} onClose={onClose} />
  return (
    <span data-tab-end className="flex shrink-0 items-center gap-0.5">
      <span data-tab-end-ring className="grid place-items-center" style={{ width: size, height: size }}>
        {ring}
      </span>
      {/* No room until the tab is hovered (or the close has the keyboard),
          then its own width, on the same quick curve as the sidebar. */}
      <span
        data-tab-end-close
        className={`grid overflow-hidden transition-[width] duration-150 ease-[cubic-bezier(.16,1,.3,1)] motion-reduce:transition-none w-0 ${
          size === 16 ? 'group-hover:w-4 focus-within:w-4' : 'group-hover:w-[18px] focus-within:w-[18px]'
        }`}
      >
        <TabClose label={label} on={false} size={size} onClose={onClose} />
      </span>
    </span>
  )
}

/** The agent's mark on its tab (core `AgentIcon`): Clawd, OpenAI, the prompt,
 *  the cog for Settings. */
export function TabIcon({
  agent,
  settings
}: {
  agent: DetectedAgent | null | undefined
  settings: boolean
}): JSX.Element {
  return (
    <span data-tab-icon className="relative z-[1] grid shrink-0 place-items-center">
      <AgentIcon kind={iconKind(agent, settings)} size={TAB_ICON} />
    </span>
  )
}

/** A tab still coming back to its agent (#106): a ring before the name, until
 *  the agent has drawn itself. */
export function TabLoading({ className = '' }: { className?: string }): JSX.Element {
  return (
    <span
      data-tab-loading
      aria-hidden
      className={`pointer-events-none relative z-[1] inline-block h-[9px] w-[9px] shrink-0 rounded-full border-[1.5px] border-[color-mix(in_srgb,var(--p-text)_22%,transparent)] border-t-[var(--p-accent-solid)] motion-safe:animate-spin ${className}`}
    />
  )
}
