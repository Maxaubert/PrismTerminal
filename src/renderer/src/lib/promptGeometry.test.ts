import { describe, expect, it } from 'vitest'
import { ARROW, GAP, OVERLAP, SEAM, TUCK, edgeBand, ruleClip, segmentClip } from './promptGeometry'

// Checked against the mockup's placeEdges(): band left = right - ARROW - TUCK,
// width = ARROW + o, o = TUCK + GAP + (next ? TUCK : 0).
describe('the Prompt geometry (#143)', () => {
  it('overlaps two segments by the arrow less the gap: 9.5 px', () => {
    expect(OVERLAP).toBe(9.5)
    expect([ARROW, GAP, TUCK, SEAM]).toEqual([12, 2.5, 1, 0.5])
  })

  it('places a band from 1 px inside this segment to 1 px inside the next', () => {
    const b = edgeBand(false)
    expect(b.o).toBe(4.5)
    expect(b.width).toBe(16.5)
    // A 122 px segment: the mockup's left is 122 - 12 - 1 = 109, so right sits at 125.5.
    const segment = 122
    // CSS `right` is measured inward, so a negative one reaches past the box.
    const left = segment - b.right - b.width
    expect(left).toBe(segment - ARROW - TUCK)
    expect(segment - b.right).toBe(125.5)
    // Along the top row the gap runs from this arrow's corner (segment - 12) to
    // the next segment's start (segment - 9.5); the band covers it with a TUCK
    // to spare at each end.
    expect(left + TUCK).toBe(segment - ARROW)
    expect(left + b.o - TUCK).toBe(segment - OVERLAP)
  })

  it('stops the last band on the notch line a next segment would have', () => {
    const b = edgeBand(true)
    expect(b.o).toBe(3.5)
    expect(b.width).toBe(15.5)
    expect(b.clip).toBe('polygon(0 0, 3.5px 0, 15.5px 50%, 3.5px 100%, 0 100%, 12px 50%)')
  })

  it('cuts the active rule along the slant, half a pixel past it, no notch on the first', () => {
    const r = ruleClip(32, false)
    expect(r.d).toBe(1.5)
    expect(r.clip).toBe('polygon(0 0, calc(100% - 11.5px) 0, calc(100% - 10px) 100%, 1.5px 100%)')
    expect(ruleClip(32, true).clip.endsWith(', 0px 100%)')).toBe(true)
  })

  it('gives the first segment no notch', () => {
    expect(segmentClip(true)).not.toContain('12px 50%')
    expect(segmentClip(false)).toContain('12px 50%')
  })
})
