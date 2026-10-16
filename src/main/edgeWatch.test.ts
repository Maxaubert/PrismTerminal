import type { BrowserWindow } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { EDGE, EDGE_FAR_DIP, FAR, createEdgeWatch, edgeNear, type EdgeNear } from './edgeWatch'

const box = { x: 100, y: 200, width: 800, height: 600 }

describe('the pointer at the window edge (#162)', () => {
  it('is at the top inside the content band, and in the resize border above it', () => {
    expect(edgeNear({ x: 500, y: 200 }, box).top).toBe(true)
    expect(edgeNear({ x: 500, y: 200 + EDGE.top - 1 }, box).top).toBe(true)
    expect(edgeNear({ x: 500, y: 200 - EDGE.outside }, box).top).toBe(true)
    expect(edgeNear({ x: 500, y: 200 + EDGE.top }, box).top).toBe(false)
    expect(edgeNear({ x: 500, y: 200 - EDGE.outside - 1 }, box).top).toBe(false)
  })

  it('is not at the top beside the window', () => {
    expect(edgeNear({ x: 100 - EDGE.outside - 1, y: 202 }, box).top).toBe(false)
    expect(edgeNear({ x: 900 + EDGE.outside, y: 202 }, box).top).toBe(false)
  })

  it('is at the left edge the same way, along the window only', () => {
    expect(edgeNear({ x: 100, y: 500 }, box).left).toBe(true)
    expect(edgeNear({ x: 100 - EDGE.outside, y: 500 }, box).left).toBe(true)
    expect(edgeNear({ x: 100 + EDGE.left, y: 500 }, box).left).toBe(false)
    expect(edgeNear({ x: 100, y: 800 + EDGE.outside }, box).left).toBe(false)
  })

  it('says where the cursor is against the content', () => {
    const n = edgeNear({ x: 350, y: 203 }, box)
    expect([n.x, n.y]).toEqual([250, 3])
  })
})

describe('the watch (perf review 2026-10-16)', () => {
  const run = (path: Array<{ x: number; y: number }>): EdgeNear[] => {
    vi.useFakeTimers()
    try {
      const win = {
        isDestroyed: () => false,
        isMinimized: () => false,
        isVisible: () => true,
        getContentBounds: () => box
      } as unknown as BrowserWindow
      let at = 0
      const sent: EdgeNear[] = []
      const w = createEdgeWatch(
        () => win,
        () => path[Math.min(at++, path.length - 1)],
        (n) => sent.push(n)
      )
      w.set(true)
      vi.advanceTimersByTime(EDGE.everyMs * path.length)
      w.stop()
      return sent
    } finally {
      vi.useRealTimers()
    }
  }

  it('tells the page once when the cursor wanders far from the window, not every move', () => {
    const away = Array.from({ length: 20 }, (_, i) => ({ x: 2000 + i * 7, y: 900 + i }))
    const sent = run([{ x: 500, y: 202 }, ...away, { x: 500, y: 203 }])
    expect(sent).toEqual([edgeNear({ x: 500, y: 202 }, box), FAR, edgeNear({ x: 500, y: 203 }, box)])
  })

  it('still follows every move near the window, the resize border included', () => {
    const near = [
      { x: 100 - EDGE_FAR_DIP + 1, y: 400 },
      { x: 100 - EDGE.outside, y: 400 },
      { x: 300, y: 200 - 2 }
    ]
    expect(run(near)).toEqual(near.map((p) => edgeNear(p, box)))
  })

  it('FAR is at no edge and wanted by no reveal zone', () => {
    expect(FAR.top || FAR.left).toBe(false)
    expect(FAR.x).toBeLessThan(-EDGE.outside)
    expect(FAR.y).toBeLessThan(-EDGE.outside)
  })
})

describe('one reveal zone (audit 2026-10-12)', () => {
  it("main's edge reads the shared REVEAL_ZONE (the page's: revealZones.test)", async () => {
    const { REVEAL_ZONE } = await import('@shared/revealZones')
    expect({ top: EDGE.top, left: EDGE.left, outside: EDGE.outside }).toEqual(REVEAL_ZONE)
  })
})
