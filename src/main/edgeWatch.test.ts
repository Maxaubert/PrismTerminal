import { describe, expect, it } from 'vitest'
import { EDGE, edgeNear } from './edgeWatch'

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
