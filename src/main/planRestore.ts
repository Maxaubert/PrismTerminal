import type { Restored, RestoredTab, SavedTabs } from '@shared/types'
import { CODEX_RESUME } from '@core/main/agentResume'

/**
 * What a saved tab list comes back as. A folder that has gone is dropped
 * without a word. Two claude tabs in one folder take the newest and the
 * second-newest session, in order; no session on disk means no resume at all,
 * never a bare --continue guessing.
 *
 * (Which conversation belonged to which tab is unknowable after the fact -
 * newest-first in strip order is the honest guess.) Codex needs no lookup:
 * `codex resume --last` continues the most recent session FOR THIS FOLDER (its
 * picker filters by cwd), so the marker is enough and the shell starts in the
 * tab's folder anyway.
 *
 * SAVED order, exactly, and the active tab stays the active tab: when tabs in
 * front of it were dropped its index moves down with it, and when IT was the
 * one dropped the first tab takes over.
 */
export function planRestore(
  saved: SavedTabs,
  exists: (p: string) => boolean,
  sessions: (cwd: string) => string[]
): Restored {
  const taken = new Map<string, number>()
  const tabs: RestoredTab[] = []
  let active = 0
  saved.tabs.forEach((t, i) => {
    if (!t.cwd || !exists(t.cwd)) return
    if (i === saved.active) active = tabs.length
    let resume: string | undefined
    if (t.agent === 'codex') resume = CODEX_RESUME
    else if (t.agent === 'claude') {
      const key = t.cwd.toLowerCase()
      const n = taken.get(key) ?? 0
      // Not shape-checked here: term:spawn runs validResume on whatever comes
      // back across the renderer, which is the check that cannot be skipped.
      resume = sessions(t.cwd)[n]
      if (resume) taken.set(key, n + 1)
    }
    tabs.push(resume ? { cwd: t.cwd, resume } : { cwd: t.cwd })
  })
  return { tabs, active: Math.min(active, Math.max(0, tabs.length - 1)) }
}
