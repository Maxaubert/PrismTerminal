import { describe, expect, it } from 'vitest'
import { createLedger, DWELL_MS, KEEP_MS, type LedgerTab, type Presence } from './sessionLedger'

/**
 * The catch-up report's "have I seen it" (2026-10-16): every row of the spec's
 * edge-case table that the ledger owns, on a hand-turned clock.
 */

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

const tab = (id: string, label = id): LedgerTab => ({ id, tab: `tok-${id}`, label, cwd: `C:\\${label}`, agent: 'claude', state: null })
const here = (idleS = 1): Presence => ({ focused: true, shown: true, locked: false, asleep: false, idleS })
const away: Presence = { focused: true, shown: true, locked: false, asleep: false, idleS: 600 }

function world() {
  let t = Date.parse('2026-10-16T08:00:00.000Z')
  const l = createLedger(() => t)
  const seen = (sid: string): number | null => {
    const s = l.snapshot('PrismTerminal', 1).sessions[sid]?.seen
    return s ? Date.parse(s) : null
  }
  /** Ticks every 5 s for `forMs`, reading presence from `p` at each. */
  const run = (forMs: number, p: (at: number) => Presence): void => {
    const end = t + forMs
    while (t < end) {
      t = Math.min(end, t + 5000)
      l.tick(p(t))
    }
  }
  return { l, seen, run, now: () => t, set: (v: number) => (t = v) }
}

describe('sessionLedger', () => {
  it('stamps the tab in front once it has been looked at for the dwell', () => {
    const w = world()
    w.l.tabs([tab('t1')])
    w.l.link('t1', A, true)
    w.l.front('t1')
    w.l.tick(here())
    w.run(DWELL_MS - 5000, () => here())
    expect(w.seen(A)).toBeNull()
    w.run(5000, () => here())
    expect(w.seen(A)).not.toBeNull()
  })

  // The owner's case: tab 3 in front, away all day; back, a mouse move wakes
  // the PC and they switch to the orchestrator. Tab 3 was NOT read.
  it('does not mark the tab left in front as seen when the owner comes back and switches away', () => {
    const w = world()
    w.l.tabs([tab('t3', 'Three'), tab('orch')])
    w.l.link('t3', A, true)
    w.l.link('orch', B, true)
    w.l.front('t3')
    w.run(30_000, () => here())
    const left = w.now()
    const before = w.seen(A)
    expect(before).not.toBeNull()
    // Away for hours (the idle clock past 120 s), work lands in tab 3.
    let lastInput = left
    w.run(6 * 3600_000, (at) => ({ ...here(), idleS: (at - lastInput) / 1000 }))
    w.l.link('t3', A, true)
    // Back: input now, then the switch 5 s later.
    lastInput = w.now()
    w.run(5000, (at) => here((at - lastInput) / 1000))
    w.l.front('orch')
    w.run(60_000, () => here())
    expect(w.seen(A)).toBeLessThanOrEqual(left + DWELL_MS)
    expect(w.seen(B)).not.toBeNull()
  })

  // The owner types a prompt and walks off; the answer lands 60 s later. The
  // idle clock still says "present" for two minutes, but the stamp is capped.
  it('never stamps past the last input plus the dwell', () => {
    const w = world()
    w.l.tabs([tab('t1')])
    w.l.link('t1', A, true)
    w.l.front('t1')
    w.run(20_000, () => here())
    const lastInput = w.now()
    w.l.engage('t1')
    w.run(115_000, (at) => here((at - lastInput) / 1000))
    expect(w.seen(A)).toBeLessThanOrEqual(lastInput + DWELL_MS)
  })

  it('stamps none of the tabs Ctrl+Tab passes through', () => {
    const w = world()
    w.l.tabs([tab('t1'), tab('t2'), tab('t3')])
    w.l.link('t1', A, true)
    w.l.link('t2', B, true)
    w.l.link('t3', C, true)
    w.l.front('t3')
    w.l.tick(here())
    for (const id of ['t1', 't2', 't3', 't1']) {
      w.l.front(id)
      w.run(3000, () => here())
    }
    expect([w.seen(A), w.seen(B), w.seen(C)]).toEqual([null, null, null])
  })

  it('takes typing into the front tab as reading it, at once, but only when present', () => {
    const w = world()
    w.l.tabs([tab('t1'), tab('t2')])
    w.l.link('t1', A, true)
    w.l.link('t2', B, true)
    w.l.front('t1')
    w.l.engage('t1')
    expect(w.seen(A)).toBeNull() // no presence reading yet
    w.l.tick(here())
    w.l.engage('t2') // not in front
    expect(w.seen(B)).toBeNull()
    w.l.engage('t1')
    expect(w.seen(A)).toBe(w.now())
  })

  it('counts a locked, asleep, unfocused or minimised window as away', () => {
    for (const p of [
      { ...here(), locked: true },
      { ...here(), asleep: true },
      { ...here(), focused: false },
      { ...here(), shown: false }
    ]) {
      const w = world()
      w.l.tabs([tab('t1')])
      w.l.link('t1', A, true)
      w.l.front('t1')
      w.run(60_000, () => p)
      expect(w.seen(A), JSON.stringify(p)).toBeNull()
    }
  })

  it('restarts the look after time away, even with the same tab in front', () => {
    const w = world()
    w.l.tabs([tab('t1')])
    w.l.link('t1', A, true)
    w.l.front('t1')
    w.run(5000, () => here())
    w.run(300_000, () => away)
    w.run(5000, () => here())
    expect(w.seen(A)).toBeNull()
  })

  it('keeps a session whose tab closed (its shell exited) for the report', () => {
    const w = world()
    w.l.tabs([tab('t1'), tab('t2')])
    w.l.link('t1', A, true)
    w.l.tabs([tab('t2')])
    expect(w.l.snapshot('PrismTerminal', 1).sessions[A]).toMatchObject({ open: false })
  })

  it('keeps the old session after a /clear names a new one', () => {
    const w = world()
    w.l.tabs([tab('t1')])
    w.l.link('t1', A, true)
    w.l.link('t1', B, true)
    const s = w.l.snapshot('PrismTerminal', 1)
    expect(s.sessions[A]).toMatchObject({ open: false })
    expect(s.sessions[B]).toMatchObject({ open: true })
    expect(s.tabs[0].session).toBe(B)
  })

  it('carries what it knew across a restart, every session closed until relinked', () => {
    const w = world()
    w.l.tabs([tab('t1')])
    w.l.link('t1', A, true)
    w.l.front('t1')
    w.run(30_000, () => here())
    const saved = JSON.parse(JSON.stringify(w.l.snapshot('PrismTerminal', 1)))
    const again = createLedger(() => w.now(), saved)
    const s = again.snapshot('PrismTerminal', 2)
    expect(s.sessions[A]).toMatchObject({ open: false, seen: saved.sessions[A].seen, firstKnownAt: saved.sessions[A].firstKnownAt })
    again.tabs([tab('n1')])
    again.link('n1', A, false) // the restore's resume id
    expect(again.snapshot('PrismTerminal', 2).sessions[A]).toMatchObject({ open: true, lastHookAt: saved.sessions[A].lastHookAt })
  })

  // A restore names its resume as the shell spawns; the tab list follows,
  // debounced. The link waits for its tab instead of being dropped.
  it('keeps a link that comes before its tab', () => {
    const w = world()
    w.l.link('t1', A, false)
    w.l.tabs([tab('t1')])
    const s = w.l.snapshot('PrismTerminal', 1)
    expect(s.tabs[0].session).toBe(A)
    expect(s.sessions[A]).toMatchObject({ open: true, lastHookAt: null })
  })

  it('ignores a session id that is not a UUID, and a saved file that is not its own', () => {
    const w = world()
    w.l.tabs([tab('t1')])
    w.l.link('t1', '..\\x', true)
    expect(Object.keys(w.l.snapshot('PrismTerminal', 1).sessions)).toEqual([])
    expect(() => createLedger(() => 0, { sessions: { bad: {}, [A]: null } })).not.toThrow()
    expect(() => createLedger(() => 0, 'garbage')).not.toThrow()
  })

  it('forgets sessions with no hook for two weeks, never an open one', () => {
    const w = world()
    w.l.tabs([tab('t1'), tab('t2')])
    w.l.link('t1', A, true)
    w.l.link('t2', B, true)
    w.l.tabs([tab('t2')])
    w.set(w.now() + KEEP_MS + 1000)
    const s = w.l.snapshot('PrismTerminal', 1)
    expect(s.sessions[A]).toBeUndefined()
    expect(s.sessions[B]).toBeDefined()
  })

  it('says when something a reader wants changed', () => {
    const w = world()
    w.l.tabs([tab('t1')])
    expect(w.l.takeChanged()).toBe('now')
    expect(w.l.takeChanged()).toBeNull()
    w.l.tabs([tab('t1')])
    expect(w.l.takeChanged()).toBeNull()
    w.l.tabs([{ ...tab('t1'), state: 'done' }])
    expect(w.l.takeChanged()).toBe('now')
    w.l.link('t1', A, true)
    w.l.front('t1')
    w.l.takeChanged()
    w.run(20_000, () => here())
    // A stamp alone is written later, not at once.
    expect(w.l.takeChanged()).toBe('later')
  })
})
