import { useCallback, useEffect, useState, type JSX } from 'react'
import type { UpdateInfo } from '@shared/types'

/**
 * The update chip: quiet accent pill, present only while there is something
 * to install. A mock (unpackaged builds) is inert - it exists so the chip can
 * be seen before a real release carries it.
 *
 * The offer and its progress through install live HERE rather than in the
 * bar, so the chip survives the bar re-rendering under it and the bar needs
 * no props for it.
 */
export default function UpdateChip(): JSX.Element | null {
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [phase, setPhase] = useState<'idle' | 'downloading' | 'installing'>('idle')
  const [pct, setPct] = useState(0)

  useEffect(() => window.prism.onUpdate(setUpdate), [])
  useEffect(
    () =>
      window.prism.onUpdateProgress((p) => {
        setPct(p)
        if (p >= 100) setPhase('installing')
      }),
    []
  )

  const install = useCallback(() => {
    if (!update || update.mock) return
    setPhase('downloading')
    setPct(0)
    void window.prism.installUpdate(update.url).then((ok) => {
      // On success the app quits under the installer; only failure comes back.
      if (!ok) setPhase('idle')
    })
  }, [update])

  if (!update) return null
  return (
    <button
      data-update-chip
      // The chip IS the progress bar: it never changes size, and the same
      // shape carries "available", "42%" and "installing" without the
      // title bar reflowing under it.
      className="no-drag relative flex h-6 shrink-0 items-center gap-1.5 overflow-hidden rounded-md border px-2.5 text-[11.5px] font-medium transition-[filter] hover:brightness-125"
      style={{
        borderColor:
          phase === 'idle'
            ? 'color-mix(in srgb, var(--p-text) 14%, transparent)'
            : 'color-mix(in srgb, var(--p-accent) 55%, transparent)',
        // Working: the unfilled remainder is already accent-tinted, so the
        // label reads against both halves of the bar.
        background:
          phase === 'idle'
            ? 'color-mix(in srgb, var(--p-text) 8%, transparent)'
            : 'color-mix(in srgb, var(--p-accent) 30%, transparent)',
        color: phase === 'idle' ? 'var(--p-text)' : 'var(--p-on-accent)'
      }}
      onClick={install}
      disabled={phase !== 'idle'}
      title={
        update.mock
          ? 'Preview: the installed app only shows this when a newer release exists'
          : `Download and install ${update.version}`
      }
      aria-label={`Update to ${update.version}`}
      {...(phase === 'downloading'
        ? {
            role: 'progressbar',
            'aria-valuenow': pct,
            'aria-valuemin': 0,
            'aria-valuemax': 100
          }
        : {})}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 transition-[width] duration-300 ease-out"
        style={{
          width: phase === 'idle' ? 0 : phase === 'installing' ? '100%' : `${pct}%`,
          background: 'var(--p-accent)'
        }}
      />
      <svg
        viewBox="0 0 24 24"
        width={11}
        height={11}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="relative shrink-0"
        aria-hidden
      >
        <path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 20h14" />
      </svg>
      <span className="relative whitespace-nowrap tabular-nums">
        {phase === 'downloading'
          ? `${pct}%`
          : phase === 'installing'
            ? 'Installing…'
            : `Update ${update.version}`}
      </span>
    </button>
  )
}
