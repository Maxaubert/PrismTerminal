import { performance } from 'perf_hooks'
import type { DiagLog } from './diagLog'
import type { InflightCall } from './ipcTiming'

/**
 * WHAT MAIN WATCHES FOR (#140): its own event loop, the fs threadpool, and the
 * page's heartbeat.
 *
 * - MAIN-LAG. A 50 ms tick; when it fires 100 ms or more after it was due,
 *   main was blocked that long. Logged with the IPC calls in flight, which
 *   is usually the answer. (A drift timer and not `monitorEventLoopDelay`:
 *   the histogram is sampled and says how bad, never WHEN, and a line in a
 *   timeline needs the when.)
 * - FS-SLOW. One `stat` of userData every 5 s. libuv has four threads for
 *   every async fs call in the process, so a dead network drive or a folder
 *   size scan holds up everything behind it; a 500 ms stat of a local folder
 *   is that queue, not the disk. Never two at once: a starved stat is
 *   logged once, with its whole wait, when it finally lands.
 * - PAGE-STACK. The page beats every 500 ms. After a 2 s gap main asks the
 *   frame for the JavaScript it is running (`collectJavaScriptCallStack`,
 *   MEASURED on Electron 43 to answer in about 1 ms during a busy loop, once
 *   the page is served with `Document-Policy:
 *   include-js-call-stacks-in-crash-reports`; without it the answer is a
 *   sentence saying so, which is ignored). The stack is HELD, and written
 *   only when a `page-stall` overlapping that moment arrives, or the window
 *   says it is unresponsive: a timer Chromium throttled also misses beats,
 *   and is not a freeze.
 */

export interface StallWatchDeps {
  log: DiagLog
  inflight(): InflightCall[]
  /** One cheap async fs call: the host stats its userData folder. */
  canary(): Promise<unknown>
  /** The page's JavaScript stack now, or null. Absent: no page-stack. */
  collectStack?(): Promise<string | null>
  /** Monotonic ms. */
  now?: () => number
  /** Epoch ms, the clock a page's stall is reported in. */
  wall?: () => number
  tickMs?: number
  lagMs?: number
  canaryMs?: number
  canarySlowMs?: number
  beatGapMs?: number
  /** How long a held stack waits for its stall. */
  stackKeepMs?: number
}

export interface StallWatch {
  /** `diag:beat`: the page is alive. */
  beat(): void
  /** A `page-stall` arrived: it started at `startAt` (epoch ms) and lasted `ms`. */
  pageStall(startAt: number, ms: number): void
  /** The window's own `unresponsive` event. */
  unresponsive(): void
  stop(): void
}

/** How far either side of a stall a held stack still counts as inside it:
 *  the beat and the frame's clock are not the same clock. */
const SLACK_MS = 250

/** A real stack has frames; the refusal is a sentence. */
const isStack = (s: string | null): s is string => !!s && /\n\s*at /.test(s)

export function startStallWatch(deps: StallWatchDeps): StallWatch {
  const { log } = deps
  const now = deps.now ?? ((): number => performance.now())
  const wall = deps.wall ?? Date.now
  const tickMs = deps.tickMs ?? 50
  const lagMs = deps.lagMs ?? 100
  const canaryMs = deps.canaryMs ?? 5000
  const canarySlowMs = deps.canarySlowMs ?? 500
  const beatGapMs = deps.beatGapMs ?? 2000
  const stackKeepMs = deps.stackKeepMs ?? 60_000

  let last = now()
  let lastBeat: number | null = null
  let askedThisGap = false
  let held: { stack: string; at: number; ms: number; heldAt: number } | null = null
  let canaryBusy = false

  const safe = (fn: () => void): void => {
    try {
      fn()
    } catch {
      /* a watcher never takes the app down */
    }
  }

  const askStack = (gapMs: number): Promise<void> => {
    const collect = deps.collectStack
    if (!collect) return Promise.resolve()
    return collect().then(
      (stack) => {
        if (isStack(stack)) held = { stack, at: wall(), ms: Math.round(gapMs), heldAt: now() }
      },
      () => {}
    )
  }

  const tick = setInterval(() => {
    safe(() => {
      const n = now()
      const late = Math.round(n - last - tickMs)
      last = n
      if (late >= lagMs) log.write('main', 'main-lag', { ms: late, inflight: deps.inflight() })
      if (lastBeat !== null && !askedThisGap && n - lastBeat >= beatGapMs) {
        askedThisGap = true
        void askStack(n - lastBeat)
      }
      if (held && n - held.heldAt > stackKeepMs) held = null
    })
  }, tickMs)
  tick.unref?.()

  const canary = setInterval(() => {
    if (canaryBusy) return
    canaryBusy = true
    const t0 = now()
    const done = (): void => {
      canaryBusy = false
      safe(() => {
        const ms = Math.round(now() - t0)
        if (ms >= canarySlowMs) log.write('main', 'fs-slow', { ms })
      })
    }
    try {
      deps.canary().then(done, done)
    } catch {
      done()
    }
  }, canaryMs)
  canary.unref?.()

  const writeHeld = (extra: Record<string, unknown> = {}): void => {
    if (!held) return
    log.write('main', 'page-stack', { stack: held.stack, ms: held.ms, ...extra })
    held = null
  }

  return {
    beat: () => {
      lastBeat = now()
      askedThisGap = false
    },
    pageStall: (startAt, ms) =>
      safe(() => {
        if (!held) return
        if (held.at >= startAt - SLACK_MS && held.at <= startAt + ms + SLACK_MS) writeHeld()
      }),
    unresponsive: () =>
      safe(() => {
        if (held) return writeHeld({ unresponsive: true })
        // No beat gap seen yet (or no stack held): a hang the window reports
        // is real, so ask now and write what comes back.
        void askStack(lastBeat === null ? 0 : now() - lastBeat).then(() => writeHeld({ unresponsive: true }))
      }),
    stop: () => {
      clearInterval(tick)
      clearInterval(canary)
    }
  }
}
