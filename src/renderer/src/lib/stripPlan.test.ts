import { describe, expect, it } from 'vitest'
import { ICON_TAB, MORE_BUTTON, TAB_FLOOR, planStrip, type StripSlot } from './stripPlan'

const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `t${i}`)
const count = (s: StripSlot[], k: StripSlot): number => s.filter((x) => x === k).length
/** The width a plan takes, as TabStrip lays it out at the floor. */
const used = (s: StripSlot[]): number =>
  count(s, 'full') * TAB_FLOOR + count(s, 'icon') * ICON_TAB + (count(s, 'hidden') ? MORE_BUTTON : 0)

describe('planStrip (#146: icons first, then the list)', () => {
  it('names every tab while they fit at the floor', () => {
    expect(planStrip({ ids: ids(10), activeId: 't0', needs: new Set(), room: 10 * TAB_FLOOR })).toEqual(Array(10).fill('full'))
  })

  it('past the floor, resting tabs become icons; the tab in front and those that need you keep names', () => {
    const s = planStrip({ ids: ids(12), activeId: 't5', needs: new Set(['t2', 't9']), room: 900 })
    expect(s[5]).toBe('full')
    expect(s[2]).toBe('full')
    expect(s[9]).toBe('full')
    expect(count(s, 'icon')).toBe(9)
    expect(count(s, 'hidden')).toBe(0)
    expect(used(s)).toBeLessThanOrEqual(900)
  })

  it('the tabs that need you become icons, newest first, before any tab hides', () => {
    const needs = new Set(ids(12))
    const s = planStrip({ ids: ids(12), activeId: 't0', needs, room: TAB_FLOOR * 3 + ICON_TAB * 9 })
    expect(s.slice(0, 3)).toEqual(['full', 'full', 'full'])
    expect(s.slice(3).every((x) => x === 'icon')).toBe(true)
  })

  it('then resting tabs go into the list, newest first, and those that need you last', () => {
    const s = planStrip({ ids: ids(40), activeId: 't0', needs: new Set(['t39', 't1']), room: 1000 })
    expect(count(s, 'hidden')).toBeGreaterThan(0)
    expect(s[39]).not.toBe('hidden')
    expect(s[1]).not.toBe('hidden')
    // Resting tabs hide from the end: the first hidden one has only hidden
    // resting tabs (or the two that need you) after it.
    const first = s.indexOf('hidden')
    expect(s.slice(first).every((x, k) => x === 'hidden' || ['t39'].includes(`t${first + k}`))).toBe(true)
    expect(used(s)).toBeLessThanOrEqual(1000)
  })

  it('the tab in front is never an icon and never hidden, wherever it sits', () => {
    for (const active of ['t0', 't20', 't39']) {
      const s = planStrip({ ids: ids(40), activeId: active, needs: new Set(), room: 300 })
      expect(s[Number(active.slice(1))]).toBe('full')
    }
  })

  it('a bar too narrow for anything still shows the tab in front', () => {
    const s = planStrip({ ids: ids(5), activeId: 't3', needs: new Set(['t1']), room: 10 })
    expect(s[3]).toBe('full')
    expect(count(s, 'hidden')).toBe(4)
  })

  it('no tabs, no plan', () => {
    expect(planStrip({ ids: [], activeId: null, needs: new Set(), room: 500 })).toEqual([])
  })
})
