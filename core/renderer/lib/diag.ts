import type { DiagApi, DiagPageLine } from '../../preload/diagApi'

/**
 * THE PAGE'S HALF OF THE DIAGNOSTICS LOG (#140), for both hosts.
 *
 * - PAGE-STALL: Chromium's long-animation-frame entries of 200 ms or more.
 *   A LoAF names the scripts that ran in the frame, their function and what
 *   started them (a click, a timer, a message), which is what a stall report
 *   needs and what a long task alone never said. The last five crumbs ride
 *   along, so the line says what the user had just done.
 * - PAGE-TASK (Detailed logging only): long tasks from 50 ms.
 * - PAGE-ERROR / PAGE-REJECTION: `error` and `unhandledrejection`.
 * - THE HEARTBEAT: one message every 500 ms. Main asks for the page's stack
 *   when it stops (`core/main/stallWatch`).
 * - CRUMBS: `crumb(action, fields)` from anywhere in either app. The last 50
 *   are kept in memory whether or not anything is sent; a crumb marked
 *   `often` (a scroll settling) is sent only while logging is detailed.
 *
 * Lines go to main in one batch every 250 ms. A crumb said before `startDiag`
 * (or in a host that never starts it) only joins the ring.
 */

export interface Crumb {
  a: string
  at: number
}

const RING_MAX = 50
const QUEUE_MAX = 200
const STALL_MS = 200
const TASK_MS = 50
const CRUMBS_PER_STALL = 5

let api: DiagApi | null = null
let verbose = false
let ring: Crumb[] = []
let queue: DiagPageLine[] = []
let stopFn: (() => void) | null = null

/** A script's own name, without where the app happens to be installed. */
export function shortSrc(url: string | undefined | null): string | null {
  if (!url) return null
  const clean = url.split(/[?#]/)[0]
  const out = clean.lastIndexOf('/out/renderer/')
  if (out >= 0) return clean.slice(out + '/out/renderer/'.length)
  const m = /^[a-z]+:\/\/[^/]*\/(.*)$/i.exec(clean)
  if (m && /^https?:/i.test(clean)) return m[1] || null
  return clean.split('/').slice(-2).join('/') || null
}

/** The crumbs said before a stall ended, the last five, each with how long
 *  before the stall began it was (negative: during it). */
export function crumbsBefore(crumbs: readonly Crumb[], startAt: number, ms: number): Array<{ a: string; ago: number }> {
  return crumbs
    .filter((c) => c.at <= startAt + ms)
    .slice(-CRUMBS_PER_STALL)
    .map((c) => ({ a: c.a, ago: Math.round(startAt - c.at) }))
}

interface LoafScript {
  sourceURL?: string
  sourceFunctionName?: string
  invoker?: string
  duration?: number
}
interface LoafEntry {
  startTime: number
  duration: number
  blockingDuration?: number
  scripts?: readonly LoafScript[]
}

/** A long-animation-frame entry as a `page-stall` line. */
export function loafLine(entry: LoafEntry, timeOrigin: number, crumbs: readonly Crumb[]): DiagPageLine {
  const at = Math.round(timeOrigin + entry.startTime)
  const ms = Math.round(entry.duration)
  const scripts = [...(entry.scripts ?? [])]
    .sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0))
    .slice(0, 3)
    .map((s) => ({
      src: shortSrc(s.sourceURL),
      fn: s.sourceFunctionName || null,
      invoker: s.invoker || null,
      ms: Math.round(s.duration ?? 0)
    }))
  return {
    k: 'page-stall',
    at,
    ms,
    blocking: Math.round(entry.blockingDuration ?? 0),
    scripts,
    crumbs: crumbsBefore(crumbs, at, ms)
  }
}

/** An `error` event or an `unhandledrejection` as a line. */
export function errorLine(
  k: 'page-error' | 'page-rejection',
  ev: { message?: string; error?: unknown; filename?: string; lineno?: number; colno?: number; reason?: unknown }
): DiagPageLine {
  const err = k === 'page-error' ? ev.error : ev.reason
  const msg =
    err instanceof Error ? err.message : typeof err === 'string' ? err : (ev.message ?? String(err ?? 'unknown'))
  const stack = err instanceof Error && err.stack ? err.stack : null
  const loc = ev.filename ? `${shortSrc(ev.filename)}:${ev.lineno ?? 0}:${ev.colno ?? 0}` : null
  return { k, at: Date.now(), msg, stack, loc }
}

function enqueue(line: DiagPageLine): void {
  if (!api) return
  queue.push(line)
  if (queue.length > QUEUE_MAX) queue.splice(0, queue.length - QUEUE_MAX)
}

function send(): void {
  if (!api || queue.length === 0) return
  const lines = queue
  queue = []
  try {
    api.diagBatch(lines)
  } catch {
    /* the log never breaks the page */
  }
}

/**
 * Something the user did, for the timeline: `crumb('tab-open', { cwd })`.
 * `often`: a high-rate action, sent only while logging is detailed.
 */
export function crumb(a: string, fields: Record<string, unknown> = {}, opts: { often?: boolean } = {}): void {
  const at = Date.now()
  ring.push({ a, at })
  if (ring.length > RING_MAX) ring.splice(0, ring.length - RING_MAX)
  if (opts.often && !verbose) return
  enqueue({ ...fields, k: 'crumb', at, a })
}

/**
 * Run `fn`, and log it as `k` (an app's own `-slow` kind: `sort-slow`) when it
 * took `minMs` or more. Returns what `fn` returned; a throw passes through.
 */
export function time<T>(
  k: string,
  fn: () => T,
  fields: Record<string, unknown> = {},
  minMs = 50,
  clock: () => number = () => performance.now()
): T {
  const t0 = clock()
  try {
    return fn()
  } finally {
    const ms = Math.round(clock() - t0)
    if (ms >= minMs) enqueue({ ...fields, k, at: Date.now(), ms })
  }
}

/** The ring, oldest first (the e2e and the tests read it). */
export const recentCrumbs = (): Crumb[] => [...ring]

/** Settings' switch moved: the page filters by it at once. */
export function noteDiagVerbose(on: boolean): void {
  verbose = on
}

interface PageTarget {
  addEventListener?(type: string, fn: (ev: never) => void): void
  removeEventListener?(type: string, fn: (ev: never) => void): void
}

/** Start the page's half; returns the function that stops it. Once per page. */
export function startDiag(bridge: DiagApi, target: PageTarget = globalThis as unknown as PageTarget): () => void {
  stopFn?.()
  api = bridge
  void bridge
    .diagInfo()
    .then((i) => {
      verbose = !!i?.verbose
    })
    .catch(() => {})

  const flush = setInterval(send, 250)
  const beat = setInterval(() => {
    try {
      bridge.diagBeat()
    } catch {
      /* silent */
    }
  }, 500)

  const observers: PerformanceObserver[] = []
  const supported = typeof PerformanceObserver !== 'undefined' ? (PerformanceObserver.supportedEntryTypes ?? []) : []
  const origin = typeof performance !== 'undefined' ? performance.timeOrigin : Date.now()
  if (supported.includes('long-animation-frame')) {
    const o = new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as LoafEntry[])
        if (e.duration >= STALL_MS) enqueue(loafLine(e, origin, ring))
    })
    o.observe({ type: 'long-animation-frame', buffered: true })
    observers.push(o)
  }
  if (supported.includes('longtask')) {
    const o = new PerformanceObserver((list) => {
      if (!verbose) return
      for (const e of list.getEntries())
        if (e.duration >= TASK_MS) enqueue({ k: 'page-task', at: Math.round(origin + e.startTime), ms: Math.round(e.duration) })
    })
    o.observe({ type: 'longtask', buffered: true })
    observers.push(o)
  }

  const onError = (ev: never): void => enqueue(errorLine('page-error', ev))
  const onRejection = (ev: never): void => enqueue(errorLine('page-rejection', ev))
  // A page going away (a reload) sends what it has rather than losing it.
  const onHide = (): void => send()
  target.addEventListener?.('error', onError)
  target.addEventListener?.('unhandledrejection', onRejection)
  target.addEventListener?.('pagehide', onHide)

  const stop = (): void => {
    clearInterval(flush)
    clearInterval(beat)
    observers.forEach((o) => o.disconnect())
    target.removeEventListener?.('error', onError)
    target.removeEventListener?.('unhandledrejection', onRejection)
    target.removeEventListener?.('pagehide', onHide)
    send()
    if (stopFn === stop) stopFn = null
  }
  stopFn = stop
  return stop
}

/** For tests: forget everything, as a fresh page. */
export function resetDiag(): void {
  stopFn?.()
  stopFn = null
  api = null
  verbose = false
  ring = []
  queue = []
}
