import type { CSSProperties, JSX } from 'react'

/**
 * THE SKELETON OF AN AGENT COMING BACK (#106; owner, 2026-09-30, of the
 * mockups: "C is good"). While a restored tab resumes Claude or Codex, this is
 * drawn over its terminal: the agent's own layout as quiet placeholders (the
 * logo block and its three lines, a prompt, a reply, the input box, the
 * footer), so the wait reads as the app loading and not a script running.
 *
 * Every colour is the theme's (`--p-text` over the panel's ground), so it
 * follows any preset and a picked background. The bars pulse slowly; under
 * reduced motion they are still. In the page only while it shows, so it
 * leaves no status line behind (the copied badge's rule, #58).
 */
const bar = (width: string, extra: CSSProperties = {}): CSSProperties => ({
  width,
  height: 9,
  borderRadius: 3,
  background: 'color-mix(in srgb, var(--p-text) 7%, transparent)',
  ...extra
})

export function ResumeSkeleton({ leaving = false }: { leaving?: boolean }): JSX.Element {
  return (
    <div
      role="status"
      aria-label="Resuming conversation"
      data-resume-skeleton={leaving ? 'leaving' : 'shown'}
      className={`absolute inset-0 z-[1] bg-[var(--p-bg)] p-3 transition-opacity duration-[180ms] ${
        leaving ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      <div className="flex flex-col gap-[7px] motion-safe:animate-pulse">
        {/* The logo block, and the name, model and folder beside it. */}
        <div className="flex gap-4">
          <div className="flex flex-col gap-[5px]">
            <span style={bar('8ch')} />
            <span style={bar('9ch')} />
            <span style={bar('8ch')} />
          </div>
          <div className="flex flex-col gap-[5px]">
            <span style={bar('22ch')} />
            <span style={bar('18ch')} />
            <span style={bar('34ch')} />
          </div>
        </div>
        {/* What was asked, and the reply. */}
        <span style={bar('46ch', { marginTop: 14 })} />
        <span style={bar('60ch', { marginTop: 10 })} />
        <span style={bar('52ch')} />
        <span style={bar('24ch')} />
        {/* The input box and the footer under it. */}
        <div
          style={{
            marginTop: 16,
            height: 26,
            maxWidth: '100%',
            borderRadius: 4,
            border: '1px solid color-mix(in srgb, var(--p-text) 9%, transparent)'
          }}
        />
        <span style={bar('30ch', { marginTop: 4 })} />
      </div>
    </div>
  )
}
