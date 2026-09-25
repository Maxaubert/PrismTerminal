import { readFileSync } from 'fs'
import { writeAtomic } from './atomicWrite'
import type { SavedTab, SavedTabs } from '@shared/types'

// tabs.json: the strip as it was, so a relaunch brings every shell back in its
// folder and every resumable agent back to its conversation. The renderer owns
// the tab list and reports it; this only remembers the last report.

/** A suggestion, not a record: a file this long was not written by the app. */
const MAX_TABS = 50

/** A fresh one each time: callers are free to keep and change what they get. */
const none = (): SavedTabs => ({ tabs: [], active: 0 })

/** Reads whatever is there and keeps only what has the right shape. */
export function parseTabs(raw: string): SavedTabs {
  try {
    const j = JSON.parse(raw) as { tabs?: unknown; active?: unknown } | null
    if (!j || !Array.isArray(j.tabs)) return none()
    const tabs = j.tabs
      .filter(
        (t): t is { cwd: string; agent?: unknown } =>
          !!t && typeof (t as { cwd?: unknown }).cwd === 'string' && (t as { cwd: string }).cwd !== ''
      )
      .slice(0, MAX_TABS)
      // Only an agent that can be resumed is worth remembering; anything else
      // in that field is dropped and the tab comes back as a plain shell.
      .map(
        (t): SavedTab =>
          t.agent === 'claude' || t.agent === 'codex' ? { cwd: t.cwd, agent: t.agent } : { cwd: t.cwd }
      )
    const active =
      typeof j.active === 'number' &&
      Number.isInteger(j.active) &&
      j.active >= 0 &&
      j.active < tabs.length
        ? j.active
        : 0
    return { tabs, active }
  } catch {
    return none()
  }
}

/**
 * Save on a delay, as the window state does: switching tabs from the keyboard
 * fires a report continuously and the disk need not hear about each one.
 */
export function createTabsStore(
  file: string,
  delayMs = 400
): {
  load(): SavedTabs
  save(s: SavedTabs): void
  flush(): void
} {
  let pending: SavedTabs | null = null
  let timer: NodeJS.Timeout | null = null
  const write = (): void => {
    if (timer) clearTimeout(timer)
    timer = null
    if (!pending) return
    try {
      writeAtomic(file, JSON.stringify(pending))
    } catch {
      /* a lost save is a tab that does not come back, not a crash */
    }
    pending = null
  }
  return {
    load: () => {
      // A save still inside its debounce IS the newest state: a window hidden
      // and shown again within 400ms must not restore the strip before last.
      if (pending) return parseTabs(JSON.stringify(pending))
      try {
        return parseTabs(readFileSync(file, 'utf8'))
      } catch {
        return none() // no file yet, or one we cannot read
      }
    },
    save: (s) => {
      pending = s
      if (timer) clearTimeout(timer)
      timer = setTimeout(write, delayMs)
    },
    // Close flushes the debounce: a report still in its 400ms window (an agent
    // flag lands up to 2.5s after claude appears) must not die with the app -
    // a lost last write is a Claude session that never resumes.
    flush: write
  }
}
