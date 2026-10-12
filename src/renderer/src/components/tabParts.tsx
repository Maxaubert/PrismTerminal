import type { CSSProperties, JSX } from 'react'
import { motionClass } from '@core/renderer/components/markClasses'
import type { MarkState, TabMark } from '@core/renderer/lib/tabMark'
import { keyLabel } from '../lib/keymap'

/**
 * THE PIECES EVERY TAB IS MADE OF, once for the strip and the sidebar (audit
 * 2026-10-12: each layout pasted its own close button, loading ring and
 * Powerline edge, and the copies had drifted: the sidebar's edge lacked
 * `data-rainbow`, and its flow tile was 34 px on a 46 px row).
 */

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
      title={`Close ${label} (${keyLabel('close-tab')})`}
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

/** A Powerline segment's edge wearing its mark: the colour and the motion. */
export function PromptEdge({
  mark,
  state,
  background,
  tile,
  className,
  style
}: {
  mark: TabMark
  state: MarkState
  background: string
  /** How tall one tile of a flowing colour is: the height the edge spans. */
  tile: number
  className: string
  style: CSSProperties
}): JSX.Element {
  return (
    <span
      data-mark="edge"
      data-prompt-edge={state}
      data-mark-motion={mark.motion ?? undefined}
      data-attention={state !== 'working' ? state : undefined}
      data-rainbow={mark.colour === 'rainbow' ? '' : undefined}
      aria-hidden
      className={`pointer-events-none absolute ${className}`}
      style={style}
    >
      <i
        className={`absolute inset-0 ${motionClass(mark.motion, 'y')}`}
        style={{
          background,
          ...(mark.motion === 'flow'
            ? { backgroundSize: `100% ${tile}px`, ['--tile-y' as string]: `${tile}px` }
            : {})
        }}
      />
    </span>
  )
}
