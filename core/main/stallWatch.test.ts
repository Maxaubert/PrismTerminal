import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DiagLog, DiagSource } from './diagLog'
import { startStallWatch, type StallWatchDeps } from './stallWatch'

interface Line {
  src: DiagSource
  k: string
  fields: Record<string, unknown>
}

function fakeLog(): DiagLog & { lines: Line[] } {
  const lines: Line[] = []
  return {
    lines,
    dir: '',
    file: '',
    write: (src, k, fields = {}) => lines.push({ src, k, fields }),
    writeAt: (src, k, _at, fields = {}) => lines.push({ src, k, fields }),
    verbose: () => false,
    setVerbose: () => {},
    flush: async () => {},
    flushSync: () => {},
    failed: () => false,
    close: () => {}
  }
}

/** The watch's monotonic clock, moved by hand: a fake timer fires exactly on
 *  time, so lateness is the clock running ahead of it. */
let t = 0
let wall = 1_000_000
let log: ReturnType<typeof fakeLog>
let stops: Array<() => void> = []

function watch(extra: Partial<StallWatchDeps> = {}): ReturnType<typeof startStallWatch> {
  const w = startStallWatch({
    log,
    inflight: () => [{ ch: 'folder:sizes', ms: 2900 }],
    canary: () => Promise.resolve(),
    now: () => t,
    wall: () => wall,
    ...extra
  })
  stops.push(w.stop)
  return w
}

/** Move both clocks and the timers by `ms`, the clocks first. */
async function pass(ms: number, late = 0): Promise<void> {
  t += ms + late
  wall += ms + late
  await vi.advanceTimersByTimeAsync(ms)
}

beforeEach(() => {
  vi.useFakeTimers()
  t = 0
  wall = 1_000_000
  log = fakeLog()
})
afterEach(() => {
  stops.forEach((s) => s())
  stops = []
  vi.useRealTimers()
})

describe('the event loop', () => {
  it('logs main-lag when the 50 ms tick came 100 ms or more late, with the calls in flight', async () => {
    watch()
    await pass(50)
    await pass(50, 30)
    expect(log.lines).toEqual([])
    await pass(50, 240)
    expect(log.lines).toEqual([
      { src: 'main', k: 'main-lag', fields: { ms: 240, inflight: [{ ch: 'folder:sizes', ms: 2900 }] } }
    ])
  })
})

describe('the fs canary', () => {
  it('logs fs-slow when one stat took 500 ms or more, and never runs two at once', async () => {
    let calls = 0
    let release!: () => void
    watch({
      canary: () => {
        calls += 1
        return new Promise<void>((r) => (release = r))
      }
    })
    for (let i = 0; i < 100; i += 1) await pass(50)
    expect(calls).toBe(1)
    // Starved: still pending five seconds later, so no second stat started.
    for (let i = 0; i < 100; i += 1) await pass(50)
    expect(calls).toBe(1)
    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(log.lines.filter((l) => l.k === 'fs-slow')).toEqual([{ src: 'main', k: 'fs-slow', fields: { ms: 5000 } }])
  })

  it('says nothing about a quick stat', async () => {
    watch()
    for (let i = 0; i < 220; i += 1) await pass(50)
    expect(log.lines).toEqual([])
  })
})

describe('the page heartbeat', () => {
  const STACK = '\n    at spinHard (file:///app/index.js:2:58)'

  it('asks for the stack after a 2 s gap, and writes it only when an overlapping page-stall arrives', async () => {
    const collect = vi.fn(() => Promise.resolve(STACK))
    const w = watch({ collectStack: collect })
    w.beat()
    const gapStart = wall
    for (let i = 0; i < 39; i += 1) await pass(50)
    expect(collect).not.toHaveBeenCalled()
    for (let i = 0; i < 5; i += 1) await pass(50)
    expect(collect).toHaveBeenCalledTimes(1)
    // Asked once per gap, however long it lasts.
    for (let i = 0; i < 20; i += 1) await pass(50)
    expect(collect).toHaveBeenCalledTimes(1)
    expect(log.lines).toEqual([])
    // The page comes back and reports its long frame: it covered the moment
    // the stack was taken.
    w.beat()
    w.pageStall(gapStart, 3200)
    expect(log.lines).toEqual([{ src: 'main', k: 'page-stack', fields: { stack: STACK, ms: 2000 } }])
  })

  it('drops the stack when no stall covers it: a throttled timer is not a freeze', async () => {
    const w = watch({ collectStack: () => Promise.resolve(STACK) })
    w.beat()
    for (let i = 0; i < 45; i += 1) await pass(50)
    w.beat()
    // A stall far away from the stack's moment.
    w.pageStall(wall + 60_000, 300)
    expect(log.lines).toEqual([])
  })

  it('ignores what the frame answers when the page has not opted in', async () => {
    const w = watch({
      collectStack: () => Promise.resolve('Website owner has not opted in for JS call stacks in crash reports.')
    })
    const gapStart = wall
    w.beat()
    for (let i = 0; i < 45; i += 1) await pass(50)
    w.pageStall(gapStart, 3000)
    expect(log.lines).toEqual([])
  })

  it('writes a held stack when the window says it is unresponsive: a real hang, not a throttle', async () => {
    const w = watch({ collectStack: () => Promise.resolve(STACK) })
    w.beat()
    for (let i = 0; i < 45; i += 1) await pass(50)
    w.unresponsive()
    expect(log.lines).toEqual([{ src: 'main', k: 'page-stack', fields: { stack: STACK, ms: 2000, unresponsive: true } }])
  })

  it('does not watch a page that has never beaten (it is still loading)', async () => {
    const collect = vi.fn(() => Promise.resolve(STACK))
    watch({ collectStack: collect })
    for (let i = 0; i < 100; i += 1) await pass(50)
    expect(collect).not.toHaveBeenCalled()
  })
})

describe('stop', () => {
  it('ends every timer', async () => {
    const w = watch()
    w.stop()
    await pass(50, 500)
    expect(log.lines).toEqual([])
  })
})
