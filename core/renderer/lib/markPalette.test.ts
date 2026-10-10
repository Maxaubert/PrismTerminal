import { describe, expect, it } from 'vitest'
import { MARK_BADGE } from '../components/markClasses'
import { markPalette } from './markPalette'
import { contrastRatio, mixHex } from './termAnsi'

// Volt as the r4 mockup computed it.
const VOLT = { working: '#d8ff26', finished: '#22c55e', question: '#3b82f6', failed: '#ff3b5c' }
const GROUND = '#050706'
const TEXT = '#eef2e6'
const SEGS = [GROUND, mixHex(GROUND, TEXT, 0.04), mixHex(GROUND, TEXT, 0.11)]

describe('the marks palette (#143)', () => {
  it('leaves Volt\'s bright marks as they are, and floors every line to 3:1 on every ground', () => {
    const p = markPalette({ colours: VOLT, grounds: SEGS, solidGround: GROUND, text: TEXT, rainbow: true })
    expect(p.line.working).toBe('#d8ff26')
    for (const c of Object.values(p.line)) for (const g of SEGS) expect(contrastRatio(c, g)).toBeGreaterThanOrEqual(3)
  })

  it('names Volt\'s Full inks by the owner\'s rule: only working flips', () => {
    const p = markPalette({ colours: VOLT, grounds: SEGS, solidGround: GROUND, text: TEXT, rainbow: true })
    expect(p.ink).toEqual({ working: '#0b0b0b', done: TEXT, question: TEXT, failed: TEXT })
  })

  it('fills finished with the dark badge only while the rainbow is on', () => {
    expect(markPalette({ colours: VOLT, grounds: SEGS, solidGround: GROUND, text: TEXT, rainbow: true }).fill.done).toBe(MARK_BADGE)
    expect(markPalette({ colours: VOLT, grounds: SEGS, solidGround: GROUND, text: TEXT, rainbow: false }).fill.done).toBe('#22c55e')
  })

  it('fills SOLID: a half-alpha working colour is laid on the ground first', () => {
    const p = markPalette({ colours: { ...VOLT, working: '#d8ff2680' }, grounds: SEGS, solidGround: GROUND, text: TEXT, rainbow: true })
    expect(p.fill.working).toMatch(/^#[0-9a-f]{6}$/)
    expect(p.fill.working).toBe(mixHex(GROUND, '#d8ff26', 0x80 / 255))
  })

  it('loops both rainbow gradients', () => {
    const p = markPalette({ colours: VOLT, grounds: SEGS, solidGround: GROUND, text: TEXT, rainbow: true })
    expect(p.rainbowX.startsWith('linear-gradient(90deg, #12cee5')).toBe(true)
    expect(p.rainbowY.startsWith('linear-gradient(180deg, #12cee5')).toBe(true)
    expect(p.rainbowX.endsWith('#12cee5)')).toBe(true)
  })
})
