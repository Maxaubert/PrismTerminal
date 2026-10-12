import { describe, expect, it } from 'vitest'
import { REVEAL } from './hoverReveal'
import { KEEP, sideWants } from './revealZones'

describe('where the pointer keeps a revealed panel (#162)', () => {
  it('the sidebar comes within the left zone, below its top', () => {
    expect(sideWants({ x: REVEAL.left, y: 300 }, false, 0, 220)).toBe(true)
    expect(sideWants({ x: REVEAL.left + 1, y: 300 }, false, 0, 220)).toBe(false)
    expect(sideWants({ x: 5, y: 10 }, false, 36, 220)).toBe(false)
  })

  it('the sidebar stays on itself, its grab strip at the top included, and a few pixels past it', () => {
    expect(sideWants({ x: 100, y: 10 }, true, 0, 220)).toBe(true)
    expect(sideWants({ x: 220 + KEEP, y: 400 }, true, 0, 220)).toBe(true)
    expect(sideWants({ x: 220 + KEEP + 1, y: 400 }, true, 0, 220)).toBe(false)
  })

  it('nothing without a point', () => {
    expect(sideWants(null, true, 0, 220)).toBe(false)
  })
})

describe('one reveal zone (audit 2026-10-12)', () => {
  it("the page's reveal reads the shared REVEAL_ZONE (main's: edgeWatch.test)", async () => {
    const { REVEAL_ZONE } = await import('@shared/revealZones')
    const { REVEAL } = await import('./hoverReveal')
    expect({ top: REVEAL.top, left: REVEAL.left }).toEqual({ top: REVEAL_ZONE.top, left: REVEAL_ZONE.left })
  })
})
