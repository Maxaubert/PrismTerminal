import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { readFile, readdir, rename, rm, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { createAtomicWriter } from '@core/main/atomicWrite'
import { setSessionsFile, tabToken, writeTerm } from '@core/main/terminal'
import { agentUnder } from '@core/main/agentPoll'
import { createLedger, type LedgerTab, type Presence } from './sessionLedger'
import { decideSend, pasteOf, SEND_ENTER_MS } from './orchestratorSend'

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
  channels: { tabs: string; front: string; link: string; engage: string; enable: string }
  now?: () => number
}

/** The presence reading's beat, and the longest a seen stamp waits unwritten. */
const TICK_MS = 5000
const LATER_MS = 60_000
/** How often the orchestrator's outbox is read while the feature is on. */
const OUTBOX_MS = 750
/** A request file's name: the script's 32-hex id. Results and temp files differ. */
const REQUEST = /^[0-9a-f]{32}\.json$/
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
  // OFF until the page says the orchestrator is switched on (beta, off by
  // default): no file written, no PRISM_SESSIONS_FILE given to a shell.
  let enabled = false
  /** The promoted tab's PRISM_TAB_ID, for the orchestrator plugin's role hook. */
  const leadFile = join(dirname(d.file), 'orchestrator-tab.txt')
  let leadToken: string | null = null
  const setLead = (token: string | null): void => {
    if (token === leadToken) return
    leadToken = token
    try {
      if (token) writeFileSync(leadFile, token)
      else rmSync(leadFile, { force: true })
    } catch {
      /* the role hook then stays quiet; the next change tries again */
    }
  }

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
    if (!enabled) {
      ledger.takeChanged()
      return
    }
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
      tabs.push({ id, tab: tabToken(id) ?? '', label, cwd, agent, state, orchestrator: t.orchestrator === true })
    }
    ledger.tabs(tabs)
    const lead = tabs.find((t) => t.orchestrator)
    if (enabled) setLead(lead?.tab || null)
    write()
  })
  d.on(d.channels.enable, (on: unknown) => {
    const next = on === true
    if (next === enabled) return
    enabled = next
    setSessionsFile(enabled ? d.file : null)
    if (!enabled) setLead(null)
    else writer.save(body())
    if (enabled) {
      try {
        mkdirSync(outbox, { recursive: true })
      } catch {
        /* the drain says nothing until it exists */
      }
      outboxTimer ??= setInterval(() => void drain(), OUTBOX_MS)
    } else if (outboxTimer) {
      clearInterval(outboxTimer)
      outboxTimer = null
    }
  })

  /**
   * THE ORCHESTRATOR'S OUTBOX (owner, 2026-10-16: send "to any session, not
   * just whichever is in focus"). Its script drops `<id>.json` ({ from, to,
   * text }, written to a temp name and renamed); main reads and removes it,
   * decides (orchestratorSend: only from the promoted tab, only into a tab
   * whose Claude is running and not asking), types it, and answers with
   * `<id>.result.json`. Off the main thread but for the write into the pty.
   */
  const outbox = join(dirname(d.file), 'orchestrator-outbox')
  let outboxTimer: ReturnType<typeof setInterval> | null = null
  let draining = false
  const drain = async (): Promise<void> => {
    if (!enabled || draining) return
    draining = true
    try {
      const names = await readdir(outbox).catch(() => [] as string[])
      for (const name of names) {
        if (!REQUEST.test(name)) continue
        const file = join(outbox, name)
        let req: { from?: unknown; to?: unknown; text?: unknown } = {}
        try {
          req = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
        } catch {
          /* unreadable: answered as such below */
        }
        await rm(file, { force: true }).catch(() => {})
        const asked = {
          from: typeof req.from === 'string' ? req.from : '',
          to: typeof req.to === 'string' ? req.to : '',
          text: typeof req.text === 'string' ? req.text : ''
        }
        let said = decideSend(asked, ledger.live(), enabled)
        // The tab's Claude mark is only what the tab's own output said; a
        // program printing the same signal would earn it. So the process tree
        // is asked (security review, 2026-10-16).
        if (said.ok && (await agentUnder(said.target.id)) !== 'claude')
          said = { ok: false, reason: `no Claude is running in ${said.target.label} (checked with Windows)` }
        // That question takes about a second, in which the switch, the tab or
        // its state can change: decide again, synchronously, right before
        // typing, and the same tab must win (security review, 2026-10-16).
        if (said.ok) {
          const was = said.target
          const now = decideSend(asked, ledger.live(), enabled)
          said = now.ok && now.target.id === was.id && now.target.session === was.session ? now : { ok: false, reason: `${was.label} changed while it was checked: send again` }
        }
        if (said.ok) {
          const id = said.target.id
          writeTerm(id, pasteOf(asked.text))
          // And once more before Enter: a question that opened in between
          // would take the Enter as its answer. The text then waits, unsent.
          setTimeout(() => {
            const still = decideSend(asked, ledger.live(), enabled)
            if (still.ok && still.target.id === id) writeTerm(id, '\r')
          }, SEND_ENTER_MS)
        }
        const out = join(outbox, name.replace(/\.json$/, '.result.json'))
        const answer = said.ok ? { ok: true, to: said.target.label } : { ok: false, reason: said.reason }
        await writeFile(`${out}.tmp`, JSON.stringify(answer)).catch(() => {})
        await rename(`${out}.tmp`, out).catch(() => {})
      }
    } finally {
      draining = false
    }
  }
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
      if (!enabled) return
      try {
        ledger.takeChanged()
        writer.saveNow(body())
      } catch {
        /* a lost write is the last one standing */
      }
    },
    stop: () => {
      clearInterval(timer)
      if (outboxTimer) clearInterval(outboxTimer)
    }
  }
}
