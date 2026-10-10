import { record } from './diag'

/**
 * THE AGENT INDICATOR IN THE DIAGNOSTICS LOG (#152; owner, 2026-10-10). Bugs
 * like #151 (restored tabs showed Finished after a restart, though nothing
 * finished) could only be guessed at: the log said nothing about the marks. It
 * now says, at the quiet level and always on:
 *
 * - `agent-hook`: every Claude Code hook signal (OSC 777 prism-agent): the
 *   tab, the state, the failure's kind. A run of the SAME state on a tab (a
 *   tool call is a PreToolUse and a PostToolUse, both `working`, dozens a turn)
 *   is folded: the first is written at once, the rest are counted and written
 *   as ONE line with `repeats` when the tab's state changes, or after
 *   `HOOK_QUIET_MS` with no signal from the tab (the line's `t` is the last
 *   repeat's). So a turn of 40 tool calls is two lines, not 80.
 * - `agent-title`: the agent title's MEANING (`idle`, `working`, `starting`,
 *   `question`, `none` once it is no agent's title), only when it changes:
 *   Claude repaints its spinner title about every 960 ms while working.
 * - `agent-mark`: each change of the mark a tab's indicator holds (`none`,
 *   `working`, `question`, `failed`, `done`, in the strip's own order), with
 *   `held` (every attention mark under it) and `why`, the rule that fired.
 *   The mark is the indicator's, before the host's Finished / Question /
 *   Failed switches and its indicator style decide what is drawn.
 * - `agent-restore`: a tab restored over an agent conversation, so the marks
 *   just after a restart are easy to find; a mark within `RESTORED_MS` of it
 *   carries `restored` (ms since).
 *
 * NEVER typed text, screen text, a title's text or anything of the
 * conversation (`PRIVACY.md`): states, rule names, tab ids and the folder.
 */

export const HOOK_QUIET_MS = 5000
/** A reason noted longer ago than this belongs to no change. */
const WHY_MS = 1000
const RESTORED_MS = 60_000

export type ShownMark = 'none' | 'working' | 'question' | 'failed' | 'done'

export interface MarkSets {
  workingIds: ReadonlySet<string>
  questionIds: ReadonlySet<string>
  failedIds: ReadonlySet<string>
  doneIds: ReadonlySet<string>
}

/** The mark a tab holds, in the strip's order (`TabStrip`: working first). */
export function shownMark(s: MarkSets, id: string): ShownMark {
  if (s.workingIds.has(id)) return 'working'
  if (s.questionIds.has(id)) return 'question'
  if (s.failedIds.has(id)) return 'failed'
  if (s.doneIds.has(id)) return 'done'
  return 'none'
}

/** Every attention mark a tab holds, the shown one or under it. */
export function heldMarks(s: MarkSets, id: string): string[] {
  const out: string[] = []
  if (s.questionIds.has(id)) out.push('question')
  if (s.failedIds.has(id)) out.push('failed')
  if (s.doneIds.has(id)) out.push('done')
  return out
}

export interface MarkChange {
  id: string
  from: ShownMark
  to: ShownMark
  held: string[]
}

/** The tabs whose mark (or the marks under it) changed since `prev`, which is
 *  brought up to date. A tab back at `none` with nothing held is forgotten. */
export function markChanges(prev: Map<string, string>, s: MarkSets): MarkChange[] {
  const ids = new Set<string>([...prev.keys(), ...s.workingIds, ...s.questionIds, ...s.failedIds, ...s.doneIds])
  const out: MarkChange[] = []
  for (const id of ids) {
    const to = shownMark(s, id)
    const held = heldMarks(s, id)
    const key = `${to}|${held.join(',')}`
    const was = prev.get(id) ?? 'none|'
    if (key === was) continue
    out.push({ id, from: was.split('|')[0] as ShownMark, to, held })
    if (to === 'none' && held.length === 0) prev.delete(id)
    else prev.set(id, key)
  }
  return out
}

export interface HookLine {
  id: string
  state: string
  kind?: string
  repeats?: number
  at: number
}

/** The folding of `agent-hook` lines (above). Pure: `offer` a signal, `sweep`
 *  for the runs gone quiet, `forget` a tab that closed. */
export function createHookFold(quietMs = HOOK_QUIET_MS) {
  const runs = new Map<string, { state: string; kind?: string; count: number; last: number }>()
  const repeats = (id: string, r: { state: string; kind?: string; count: number; last: number }): HookLine[] =>
    r.count > 0 ? [{ id, state: r.state, ...(r.kind ? { kind: r.kind } : {}), repeats: r.count, at: r.last }] : []
  return {
    offer(id: string, state: string, kind: string | undefined, now: number): HookLine[] {
      const run = runs.get(id)
      if (run && run.state === state && run.kind === kind && now - run.last < quietMs) {
        run.count += 1
        run.last = now
        return []
      }
      const out = run ? repeats(id, run) : []
      runs.set(id, { state, kind, count: 0, last: now })
      out.push({ id, state, ...(kind ? { kind } : {}), at: now })
      return out
    },
    sweep(now: number): HookLine[] {
      const out: HookLine[] = []
      for (const [id, run] of runs) {
        if (now - run.last < quietMs) continue
        out.push(...repeats(id, run))
        runs.delete(id)
      }
      return out
    },
    forget(id: string): HookLine[] {
      const run = runs.get(id)
      runs.delete(id)
      return run ? repeats(id, run) : []
    },
    /** Whether any run still has repeats to say (a sweep is then due). */
    pending(): boolean {
      for (const run of runs.values()) if (run.count > 0) return true
      return false
    }
  }
}

/** The new meaning of a tab's title when it changed, else null. A tab that
 *  never had an agent title says nothing for a title that is none. */
export function titleChange(prev: string | undefined, next: string): string | null {
  return next === (prev ?? 'none') ? null : next
}

// ---- The page's one record (one indicator per page, in either host). ----

let fold = createHookFold()
let sweepTimer: ReturnType<typeof setTimeout> | null = null
const titles = new Map<string, string>()
const whys = new Map<string, { why: string[]; at: number }>()
const marks = new Map<string, string>()
const restoredAt = new Map<string, number>()

const write = (lines: HookLine[]): void => {
  for (const { at, ...l } of lines) record('agent-hook', l, at)
}

function armSweep(): void {
  if (sweepTimer !== null || !fold.pending()) return
  sweepTimer = setTimeout(() => {
    sweepTimer = null
    write(fold.sweep(Date.now()))
    armSweep()
  }, HOOK_QUIET_MS)
}

/** A hook signal reached the tab. */
export function logAgentHook(id: string, state: string, kind?: string): void {
  write(fold.offer(id, state, kind, Date.now()))
  armSweep()
}

/** The tab's title was read as `state` (`none`: no agent's title). */
export function logAgentTitle(id: string, state: string, agent?: string): void {
  const change = titleChange(titles.get(id), state)
  if (change === null) return
  if (change === 'none') titles.delete(id)
  else titles.set(id, change)
  record('agent-title', { id, state: change, ...(agent ? { agent } : {}) })
}

/** The rule about to change a tab's marks: written with the change it makes. */
export function noteWhy(id: string, why: string): void {
  const now = Date.now()
  const w = whys.get(id)
  if (!w || now - w.at > WHY_MS) whys.set(id, { why: [why], at: now })
  else {
    if (!w.why.includes(why)) w.why.push(why)
    w.at = now
  }
}

/** The indicator's sets after a render: a line for each tab whose mark moved. */
export function logAgentMarks(s: MarkSets, agentOf?: (id: string) => string | undefined): void {
  const now = Date.now()
  for (const c of markChanges(marks, s)) {
    const w = whys.get(c.id)
    whys.delete(c.id)
    const why = w && now - w.at <= WHY_MS ? w.why.join(' + ') : 'unknown'
    const restored = restoredAt.get(c.id)
    const agent = agentOf?.(c.id)
    record('agent-mark', {
      id: c.id,
      from: c.from,
      to: c.to,
      held: c.held,
      why,
      ...(agent ? { agent } : {}),
      ...(restored !== undefined && now - restored <= RESTORED_MS ? { restored: now - restored } : {})
    })
  }
}

/** A tab restored over an agent conversation (the resume rides its spawn). */
export function logAgentRestore(id: string, cwd: string | null): void {
  restoredAt.set(id, Date.now())
  record('agent-restore', { id, cwd, resume: true })
}

/** The tab closed: its folded repeats are said, and the rest forgotten. */
export function forgetAgentDiag(id: string): void {
  write(fold.forget(id))
  titles.delete(id)
  restoredAt.delete(id)
}

/** For tests: a fresh page. */
export function resetAgentDiag(): void {
  if (sweepTimer !== null) clearTimeout(sweepTimer)
  sweepTimer = null
  fold = createHookFold()
  titles.clear()
  whys.clear()
  marks.clear()
  restoredAt.clear()
}
