/**
 * WHICH CLAUDE SESSION RUNS IN WHICH TAB, AND WHEN THE OWNER REALLY LOOKED AT IT
 * (the catch-up report, 2026-10-16; spec:
 * docs/superpowers/specs/2026-10-16-catch-up-report.md). Owner: the report
 * must work off "whether I've seen the session", and a tab left in front while
 * away is not seen ("since I was on the third session it will think that I've
 * already read that and skip that").
 *
 * Pure: main feeds it the tab list, the front tab, the hooks' session ids, the
 * keys typed and a presence reading, and writes `snapshot()` to
 * `sessions.json`. The bundled catch-up script reads that file; nothing here
 * reads a transcript.
 *
 * LOOKING IS ENGAGEMENT, NOT A TIMER (review 2026-10-16). The tab in front is
 * stamped seen only after it has been in front for `DWELL_MS` in a row while
 * the owner is present, or at once when they type into it. The dwell starts
 * over on every tab change and after ANY time away, so the mouse move that
 * wakes the PC does not mark the tab that sat in front all day: switching to
 * the orchestrator within the dwell leaves it unseen. A stamp is never later
 * than the last input plus `DWELL_MS`, so the two minutes before the idle
 * clock calls the owner away are not counted as read.
 */

/** Keyboard or mouse input within this long is someone at the PC. */
export const PRESENT_IDLE_S = 120
/** In front this long, while present, is having looked at it. */
export const DWELL_MS = 10_000
/** Sessions with no hook for this long are forgotten; Claude keeps ~30 days. */
export const KEEP_MS = 14 * 24 * 3600_000
export const KEEP_MAX = 300

export interface Presence {
  focused: boolean
  /** Shown and not minimised. */
  shown: boolean
  locked: boolean
  asleep: boolean
  /** Seconds since the last keyboard or mouse input, system-wide. */
  idleS: number
}

export interface LedgerTab {
  /** The pty session id. */
  id: string
  /** Its shell's PRISM_TAB_ID. */
  tab: string
  label: string
  cwd: string
  agent: string | null
  state: string | null
}

interface SessionRec {
  label: string
  cwd: string
  firstKnownAt: number
  lastHookAt: number | null
  open: boolean
  seen: number | null
}

export interface SessionsFile {
  version: 1
  app: string
  pid: number
  updatedAt: string
  tabs: Array<{
    tab: string
    label: string
    cwd: string
    agent: string | null
    state: string | null
    stateSince: string | null
    front: boolean
    session: string | null
  }>
  sessions: Record<
    string,
    { label: string; cwd: string; firstKnownAt: string; lastHookAt: string | null; open: boolean; seen: string | null }
  >
}

const iso = (t: number | null): string | null => (t === null ? null : new Date(t).toISOString())
const ms = (s: unknown): number | null => {
  if (typeof s !== 'string') return null
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : null
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export interface Ledger {
  /** The live tab list (debounced is fine). A tab gone is a session closed. */
  tabs(list: LedgerTab[]): void
  /** The tab in front changed (sent at once, never debounced). */
  front(id: string | null): void
  /** A hook named this tab's session; `hook` false for a restore's resume id. */
  link(id: string, session: string, hook: boolean): void
  /** The owner typed into tab `id`. */
  engage(id: string): void
  /** Read presence now; stamps the front tab when it has been looked at. */
  tick(p: Presence): void
  snapshot(app: string, pid: number): SessionsFile
  /**
   * What changed since the last take: 'now' for the tab list, a link, the
   * front tab or a state (write it soon); 'later' for a seen stamp alone,
   * which moves every few seconds while the owner works (write it at most
   * once a minute: a stale stamp only means a line reported twice); null.
   */
  takeChanged(): 'now' | 'later' | null
}

export function createLedger(now: () => number, saved?: unknown): Ledger {
  const tabs = new Map<string, LedgerTab & { session: string | null; stateSince: number | null }>()
  const sessions = new Map<string, SessionRec>()
  let frontId: string | null = null
  let present = false
  let lastInput = 0
  /** When the front tab's look began, while present; null while away. */
  let dwellFrom: number | null = null
  let changed = false
  let seenMoved = false
  /** Links that came before their tab did (a restore names its resume as the
   *  shell spawns; the tab list follows, debounced). */
  const early = new Map<string, { session: string; hook: boolean }>()

  // What a previous run knew survives a restart, a crash or a reboot.
  const old = (saved as Partial<SessionsFile> | undefined)?.sessions
  if (old && typeof old === 'object')
    for (const [id, r] of Object.entries(old)) {
      if (!UUID.test(id) || !r) continue
      const first = ms(r.firstKnownAt)
      if (first === null) continue
      sessions.set(id, {
        label: String(r.label ?? ''),
        cwd: String(r.cwd ?? ''),
        firstKnownAt: first,
        lastHookAt: ms(r.lastHookAt),
        open: false,
        seen: ms(r.seen)
      })
    }

  const stamp = (at: number): void => {
    const t = frontId ? tabs.get(frontId) : undefined
    const sid = t?.session
    const rec = sid ? sessions.get(sid) : undefined
    if (!rec) return
    if (rec.seen === null || at > rec.seen) {
      rec.seen = at
      seenMoved = true
    }
  }

  const prune = (): void => {
    const cutoff = now() - KEEP_MS
    const live = new Set([...tabs.values()].map((t) => t.session))
    for (const [id, r] of sessions)
      if (!live.has(id) && (r.lastHookAt ?? r.firstKnownAt) < cutoff) sessions.delete(id)
    if (sessions.size > KEEP_MAX) {
      const byAge = [...sessions.entries()]
        .filter(([id]) => !live.has(id))
        .sort((a, b) => (a[1].lastHookAt ?? a[1].firstKnownAt) - (b[1].lastHookAt ?? b[1].firstKnownAt))
      for (const [id] of byAge.slice(0, sessions.size - KEEP_MAX)) sessions.delete(id)
    }
  }

  const api: Ledger = {
    tabs(list) {
      const seenIds = new Set<string>()
      for (const t of list) {
        seenIds.add(t.id)
        const was = tabs.get(t.id)
        const stateSince = was && was.state === t.state ? was.stateSince : now()
        if (!was || was.state !== t.state || was.label !== t.label || was.cwd !== t.cwd) changed = true
        tabs.set(t.id, { ...t, session: was?.session ?? null, stateSince })
        const sid = was?.session
        const rec = sid ? sessions.get(sid) : undefined
        if (rec) {
          rec.label = t.label
          rec.cwd = t.cwd
        }
      }
      for (const [id, l] of early)
        if (tabs.has(id)) {
          early.delete(id)
          api.link(id, l.session, l.hook)
        }
      for (const [id, t] of tabs)
        if (!seenIds.has(id)) {
          tabs.delete(id)
          const rec = t.session ? sessions.get(t.session) : undefined
          if (rec && ![...tabs.values()].some((o) => o.session === t.session)) rec.open = false
          changed = true
        }
      if (frontId && !tabs.has(frontId)) frontId = null
    },
    front(id) {
      if (id === frontId) return
      frontId = id
      // A new tab in front starts its own look; nothing is stamped on leaving.
      dwellFrom = present ? now() : null
      changed = true
    },
    link(id, session, hook) {
      if (!UUID.test(session)) return
      const t = tabs.get(id)
      if (!t) {
        if (early.size < 50) early.set(id, { session, hook })
        return
      }
      const at = now()
      let rec = sessions.get(session)
      if (!rec) {
        rec = { label: t.label, cwd: t.cwd, firstKnownAt: at, lastHookAt: null, open: true, seen: null }
        sessions.set(session, rec)
      }
      rec.open = true
      rec.label = t.label
      rec.cwd = t.cwd
      if (hook) rec.lastHookAt = at
      if (t.session !== session) {
        const before = t.session
        t.session = session
        const prev = before ? sessions.get(before) : undefined
        if (prev && before && ![...tabs.values()].some((o) => o.session === before)) prev.open = false
      }
      changed = true
      prune()
    },
    engage(id) {
      if (!present || id !== frontId) return
      stamp(now())
    },
    tick(p) {
      const at = now()
      const isPresent = p.focused && p.shown && !p.locked && !p.asleep && p.idleS < PRESENT_IDLE_S
      if (!isPresent) {
        present = false
        dwellFrom = null
        return
      }
      lastInput = at - Math.max(0, p.idleS) * 1000
      if (!present || dwellFrom === null) {
        // Back from away (or the first look): the front tab's look starts NOW.
        present = true
        dwellFrom = at
        return
      }
      if (frontId && at - dwellFrom >= DWELL_MS) stamp(Math.min(at, lastInput + DWELL_MS))
    },
    snapshot(app, pid) {
      prune()
      const out: SessionsFile = { version: 1, app, pid, updatedAt: new Date(now()).toISOString(), tabs: [], sessions: {} }
      for (const t of tabs.values())
        out.tabs.push({
          tab: t.tab,
          label: t.label,
          cwd: t.cwd,
          agent: t.agent,
          state: t.state,
          stateSince: iso(t.stateSince),
          front: t.id === frontId,
          session: t.session
        })
      for (const [id, r] of sessions)
        out.sessions[id] = {
          label: r.label,
          cwd: r.cwd,
          firstKnownAt: iso(r.firstKnownAt) as string,
          lastHookAt: iso(r.lastHookAt),
          open: r.open,
          seen: iso(r.seen)
        }
      return out
    },
    takeChanged() {
      const c = changed ? 'now' : seenMoved ? 'later' : null
      changed = false
      seenMoved = false
      return c
    }
  }
  return api
}
