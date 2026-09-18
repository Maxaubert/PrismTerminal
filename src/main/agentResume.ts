import { readdirSync, statSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { Restored, RestoredTab, SavedTabs } from '@shared/types'

// What a tab that hosted an agent comes back to. Lifted out of Prism's index.ts
// so the rules can be tested without a window: main resolves the resume HERE,
// from claude's own store, and the renderer only ever carries the answer back.

/** The marker that means "codex, continue this folder's newest session". Not
 *  an id: codex finds it itself. */
export const CODEX_RESUME = 'codex:last'

/**
 * The Claude sessions recorded for `cwd`, newest first, from claude's own
 * store: ~/.claude/projects/<encoded-cwd>/<session-id>.jsonl. The encoding is
 * claude's (every non-alphanumeric character becomes a dash). Empty when the
 * folder has no sessions - then nothing is resumed.
 *
 * THE FOLDER THE SHELL WAS IN (2026-09-09): claude records its conversation
 * under the cwd it was launched in, so the lookup is by the tab's own folder
 * and never by anything wider. Looking it up by a parent handed a subfolder's
 * tab the PARENT's newest conversation - a resume of the wrong session, which
 * is worse than none.
 *
 * `home` is an argument only so the test can point it at a folder of its own.
 */
export function claudeSessions(cwd: string, home: string = homedir()): string[] {
  const enc = cwd.replace(/[^A-Za-z0-9]/g, '-')
  const dir = join(home, '.claude', 'projects', enc)
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => ({ id: f.slice(0, -'.jsonl'.length), m: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m)
      .map((s) => s.id)
  } catch {
    return []
  }
}

/**
 * The resume id came from main's own scan of ~/.claude/projects, but it
 * crossed the renderer on the way back - shape-check it again before it goes
 * anywhere near a command line. Anything that is not a session id or the codex
 * marker is no resume at all.
 */
export function validResume(r: string | undefined): string | undefined {
  return r === CODEX_RESUME || (r && /^[0-9a-f][0-9a-f-]{6,62}[0-9a-f]$/i.test(r)) ? r : undefined
}

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
