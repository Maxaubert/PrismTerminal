import { describe, expect, it } from 'vitest'
import { onDevicePixels } from './devicePixels'

describe('an edge on whole screen pixels', () => {
  it('ends on a whole screen pixel at any scale', () => {
    for (const ratio of [1, 1.25, 1.5, 1.75, 2]) {
      for (const px of [150, 220, 235, 241.3, 420]) {
        const w = onDevicePixels(px, ratio)
        expect(Math.abs(w * ratio - Math.round(w * ratio))).toBeLessThan(1e-9)
        expect(Math.abs(w - px)).toBeLessThanOrEqual(0.5 / ratio + 1e-9)
      }
    }
  })

  it('leaves a whole-pixel width alone', () => {
    expect(onDevicePixels(220, 1.25)).toBe(220)
    expect(onDevicePixels(235, 1)).toBe(235)
  })
})
