import { describe, expect, it } from 'vitest'
import { REVEAL } from './hoverReveal'
import { KEEP, barWants, sideWants } from './revealZones'

describe('where the pointer keeps a revealed panel (#162)', () => {
  it('the bar comes within the top zone, right of the sidebar only', () => {
    expect(barWants({ x: 500, y: REVEAL.top }, false, 220, 36)).toBe(true)
    expect(barWants({ x: 500, y: REVEAL.top + 1 }, false, 220, 36)).toBe(false)
    expect(barWants({ x: 100, y: 2 }, false, 220, 36)).toBe(false)
    expect(barWants({ x: 500, y: -5 }, false, 220, 36)).toBe(true)
  })

  it('the bar stays on itself and a few pixels below it, then goes', () => {
    expect(barWants({ x: 500, y: 30 }, true, 220, 36)).toBe(true)
    expect(barWants({ x: 500, y: 36 + KEEP }, true, 220, 36)).toBe(true)
    expect(barWants({ x: 500, y: 36 + KEEP + 1 }, true, 220, 36)).toBe(false)
  })

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
    expect(barWants(null, true, 0, 36)).toBe(false)
    expect(sideWants(null, true, 0, 220)).toBe(false)
  })
})
