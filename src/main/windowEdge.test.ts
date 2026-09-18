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
