import { readFileSync } from 'fs'
import { createAtomicWriter } from '@core/main/atomicWrite'
import { setSessionsFile, tabToken } from '@core/main/terminal'
import { createLedger, type LedgerTab, type Presence } from './sessionLedger'

/**
 * The catch-up report's ledger, wired to the window, the power monitor and the
 * page (2026-10-16; spec: docs/superpowers/specs/2026-10-16-catch-up-report.md).
 * Index only calls `startSessions` and `flush`.
 *
 * What the page sends is checked here: it names tabs by their pty id, and
 * the PRISM_TAB_ID each shell carries is main's own (`tabToken`), never the
 * page's word.
 */

export interface WindowLike {
  isFocused(): boolean
  isVisible(): boolean
  isMinimized(): boolean
}

export interface PowerLike {
  getSystemIdleTime(): number
  on(event: string, fn: () => void): unknown
}

export interface SessionsDeps {
  file: string
  app: string
  window: () => WindowLike | null
  power: () => PowerLike
  on: (channel: string, fn: (...args: unknown[]) => void) => void
  channels: { tabs: string; front: string; link: string; engage: string }
  now?: () => number
}

/** The presence reading's beat, and the longest a seen stamp waits unwritten. */
const TICK_MS = 5000
const LATER_MS = 60_000
const STATES = new Set(['working', 'question', 'done', 'failed'])
const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length <= max ? v : null)

export function startSessions(d: SessionsDeps): { flush(): void; stop(): void } {
  const now = d.now ?? Date.now
  let saved: unknown
  try {
    saved = JSON.parse(readFileSync(d.file, 'utf8'))
  } catch {
    /* none yet, or not ours: start empty */
  }
  const ledger = createLedger(now, saved)
  const writer = createAtomicWriter(d.file)
  setSessionsFile(d.file)

  let locked = false
  let asleep = false
  let lastWrite = 0
  const body = (): string => JSON.stringify(ledger.snapshot(d.app, process.pid), null, 1)

  const presence = (): Presence => {
    const w = d.window()
    let idleS = Number.POSITIVE_INFINITY
    try {
      idleS = d.power().getSystemIdleTime()
    } catch {
      /* no reading: away */
    }
    return {
      focused: !!w?.isFocused(),
      shown: !!w && w.isVisible() && !w.isMinimized(),
      locked,
      asleep,
      idleS
    }
  }

  // A seen stamp alone waits for the minute; anything else is written at once
  // (off the main thread), carrying the newest stamps with it.
  let laterDue = false
  const write = (): void => {
    const c = ledger.takeChanged()
    if (c === 'later') laterDue = true
    if (c === 'now' || (laterDue && now() - lastWrite >= LATER_MS)) {
      laterDue = false
      lastWrite = now()
      writer.save(body())
    }
  }

  const tick = (): void => {
    ledger.tick(presence())
    write()
  }
  const timer = setInterval(tick, TICK_MS)
  timer.unref?.()

  try {
    const p = d.power()
    p.on('lock-screen', () => {
      locked = true
      tick()
    })
    p.on('unlock-screen', () => {
      locked = false
      tick()
    })
    p.on('suspend', () => {
      asleep = true
      tick()
    })
    p.on('resume', () => {
      asleep = false
      tick()
    })
  } catch {
    /* no power monitor: idle time alone */
  }

  d.on(d.channels.tabs, (list: unknown) => {
    if (!Array.isArray(list) || list.length > 200) return
    const tabs: LedgerTab[] = []
    for (const t of list as Array<Record<string, unknown>>) {
      const id = str(t?.id, 100)
      const label = str(t?.label, 200)
      const cwd = str(t?.cwd, 2000)
      if (!id || label === null || cwd === null) continue
      const agent = str(t.agent, 40)
      const state = typeof t.state === 'string' && STATES.has(t.state) ? t.state : null
      tabs.push({ id, tab: tabToken(id) ?? '', label, cwd, agent, state })
    }
    ledger.tabs(tabs)
    write()
  })
  d.on(d.channels.front, (id: unknown) => {
    // The front tab first, then a fresh reading: a switch made while present
    // starts the new tab's look at once.
    ledger.tick(presence())
    ledger.front(typeof id === 'string' ? id : null)
    write()
  })
  d.on(d.channels.link, (id: unknown, session: unknown, hook: unknown) => {
    if (typeof id !== 'string' || typeof session !== 'string') return
    ledger.link(id, session, hook === true)
    write()
  })
  d.on(d.channels.engage, (id: unknown) => {
    if (typeof id !== 'string') return
    ledger.tick(presence())
    ledger.engage(id)
    write()
  })

  return {
    // The close, the quit and a Windows shutdown: written now (rule 7).
    flush: () => {
      try {
        ledger.takeChanged()
        writer.saveNow(body())
      } catch {
        /* a lost write is the last one standing */
      }
    },
    stop: () => clearInterval(timer)
  }
}
