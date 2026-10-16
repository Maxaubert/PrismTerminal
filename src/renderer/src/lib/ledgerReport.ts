import { useEffect, useRef } from 'react'
import { onAgentSignal, onTermKey } from '@core/renderer/lib/termBus'
import type { LedgerTabReport } from '@shared/types'

/**
 * WHAT THE CATCH-UP REPORT'S LEDGER HEARS FROM THE PAGE (2026-10-16; spec:
 * docs/superpowers/specs/2026-10-16-catch-up-report.md). Main decides what
 * counts as seen; the page only says what it alone knows:
 *
 * - the tabs (label, folder, agent, the indicator's state), debounced;
 * - the tab in FRONT, at once (a stale front tab would stamp the tab the owner
 *   just left);
 * - each Claude session a tab's hooks name (and a restore's resume id);
 * - that the owner typed into a tab, at most once a second per tab.
 */

/** The report's word for a tab's mark, from the indicator's sets. */
export function ledgerState(
  id: string,
  s: { workingIds: ReadonlySet<string>; questionIds: ReadonlySet<string>; doneIds: ReadonlySet<string>; failedIds: ReadonlySet<string> }
): LedgerTabReport['state'] {
  if (s.questionIds.has(id)) return 'question'
  if (s.failedIds.has(id)) return 'failed'
  if (s.workingIds.has(id)) return 'working'
  if (s.doneIds.has(id)) return 'done'
  return null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** A restored tab's resume, when it names a Claude session (not Codex's marker). */
export const claudeResume = (resume: string | undefined): string | null => (resume && UUID.test(resume) ? resume : null)

const ENGAGE_GAP_MS = 1000
const TABS_DEBOUNCE_MS = 500

/**
 * Only with the orchestrator switched on (beta, off by default): off, main
 * keeps no list, writes no file and gives shells no PRISM_SESSIONS_FILE.
 */
export function useLedgerReport(tabs: LedgerTabReport[], frontId: string | null, on: boolean): void {
  useEffect(() => {
    window.prism.ledgerEnable(on)
  }, [on])
  const key = JSON.stringify(tabs)
  useEffect(() => {
    const t = window.setTimeout(() => window.prism.ledgerTabs(JSON.parse(key) as LedgerTabReport[]), TABS_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [key])
  useEffect(() => {
    window.prism.ledgerFront(frontId)
  }, [frontId])
  useEffect(
    () =>
      onAgentSignal((id, signal) => {
        if (signal.session) window.prism.ledgerLink(id, signal.session, true)
      }),
    []
  )
  const lastKey = useRef(new Map<string, number>())
  useEffect(
    () =>
      onTermKey((id) => {
        const now = Date.now()
        if (now - (lastKey.current.get(id) ?? 0) < ENGAGE_GAP_MS) return
        lastKey.current.set(id, now)
        window.prism.ledgerEngage(id)
      }),
    []
  )
}
