import { describe, expect, it } from 'vitest'
import { dropSlot, type Lane } from './tabDrop'

const lanes = (...widths: number[]): Lane[] => {
  let x = 0
  return widths.map((width) => {
    const lane = { left: x, width, mid: x + width / 2 }
    x += width
    return lane
  })
}

describe('dropSlot', () => {
  it('stays put without a move', () => {
    expect(dropSlot(lanes(100, 100, 100), 1, 0)).toBe(1)
  })

  it('reaches first place when the carried tab is wider than the first (#125)', () => {
    // Prism 90 wide, Github 120: clamped at the strip's edge, dx = -90.
    expect(dropSlot(lanes(90, 120, 100), 1, -90)).toBe(0)
  })

  it('reaches first place with equal widths at the clamp', () => {
    expect(dropSlot(lanes(100, 100, 100), 1, -100)).toBe(0)
  })

  it('passes a lane going left once the left edge is past its middle', () => {
    expect(dropSlot(lanes(100, 100, 100), 2, -49)).toBe(2)
    expect(dropSlot(lanes(100, 100, 100), 2, -51)).toBe(1)
    expect(dropSlot(lanes(100, 100, 100), 2, -151)).toBe(0)
  })

  it('passes a lane going right once the right edge is past its middle, as reorderTabs counts', () => {
    expect(dropSlot(lanes(100, 100, 100), 0, 49)).toBe(0)
    expect(dropSlot(lanes(100, 100, 100), 0, 51)).toBe(2)
    expect(dropSlot(lanes(100, 100, 100), 0, 151)).toBe(3)
  })

  it('reaches last place when the carried tab is wider than the last', () => {
    expect(dropSlot(lanes(120, 100, 90), 0, 190)).toBe(3)
  })

  it('answers the slot it started in for an unknown lane', () => {
    expect(dropSlot([], 0, 40)).toBe(0)
  })
})
