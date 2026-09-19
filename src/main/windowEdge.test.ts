import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({}))

import { edgeFor } from './windowEdge'

const lum = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16)
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
}

describe('edgeFor', () => {
  it('is a small step LIGHTER than a dark ground', () => {
    const e = edgeFor('#0b0b0f')
    expect(lum(e)).toBeGreaterThan(lum('#0b0b0f'))
    expect(lum(e) - lum('#0b0b0f')).toBeLessThan(0.2)
  })
  it('is a small step DARKER than a light ground', () => {
    const e = edgeFor('#f4f4f4')
    expect(lum(e)).toBeLessThan(lum('#f4f4f4'))
    expect(lum('#f4f4f4') - lum(e)).toBeLessThan(0.2)
  })
  it('answers a hex for anything it is handed', () => {
    expect(edgeFor('javascript:1')).toMatch(/^#[0-9a-f]{6}$/)
  })
})

// #27 (owner, 2026-09-19): the DWM border is the outermost edge of the window,
// so it follows the edges setting with everything inside it.
describe('edgeFor, under the edges setting', () => {
  const GROUNDS = ['#0b0b0f', '#f4f4f4']
  /** How far the border stands off its ground. */
  const off = (bg: string, e: 'hairline' | 'faint' | 'solid'): number =>
    Math.abs(lum(edgeFor(bg, e)) - lum(bg))

  it('a hairline is the border as it always was, and the default', () => {
    // 0.13 of the way to white from #0b0b0f, 0.16 of the way to black from
    // #f4f4f4: the numbers this file used before there was a choice.
    expect(edgeFor('#0b0b0f')).toBe('#2b2b2e')
    expect(edgeFor('#f4f4f4')).toBe('#cdcdcd')
    for (const bg of GROUNDS) expect(edgeFor(bg, 'hairline')).toBe(edgeFor(bg))
  })

  it('faint stands off the ground less than a hairline, and solid more', () => {
    for (const bg of GROUNDS) {
      expect(off(bg, 'faint'), bg).toBeGreaterThan(0)
      expect(off(bg, 'faint'), bg).toBeLessThan(off(bg, 'hairline'))
      expect(off(bg, 'hairline'), bg).toBeLessThan(off(bg, 'solid'))
    }
  })

  it('no edges is no border at all, whatever the ground', () => {
    for (const bg of [...GROUNDS, 'javascript:1']) expect(edgeFor(bg, 'none')).toBe('none')
  })

  it('reads a word it does not know as a hairline', () => {
    expect(edgeFor('#0b0b0f', 'dotted' as never)).toBe(edgeFor('#0b0b0f'))
  })
})
