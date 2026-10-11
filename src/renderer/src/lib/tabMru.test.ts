import { describe, expect, it } from 'vitest'
import { startWalk, stepWalk, syncMru, touchMru, walkHolds, walkTarget, type Walk } from './tabMru'

/** A hold of Ctrl: the walk started from `mru`, then each Tab (1) or
 *  Shift+Tab (-1) pressed while it is held. Returns the tab landed on. */
const hold = (mru: readonly string[], presses: Array<1 | -1>): string | null => {
  let walk: Walk | null = startWalk(mru)
  if (!walk) return null
  for (const dir of presses) walk = stepWalk(walk, dir)
  return walkTarget(walk)
}

describe('touchMru', () => {
  it('puts the tab in front, once', () => {
    expect(touchMru(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b'])
    expect(touchMru(['a', 'b'], 'a')).toEqual(['a', 'b'])
    expect(touchMru([], 'a')).toEqual(['a'])
  })

  it('returns the same list when the tab is already in front, so nothing re-renders', () => {
    const mru = ['a', 'b']
    expect(touchMru(mru, 'a')).toBe(mru)
  })
})

describe('syncMru', () => {
  it('drops closed tabs and keeps the order of the rest', () => {
    expect(syncMru(['c', 'a', 'b'], ['a', 'b'], 'a')).toEqual(['a', 'b'])
  })

  it('adds new tabs after the known ones, in strip order', () => {
    expect(syncMru(['b', 'a'], ['a', 'b', 'x', 'y'], 'b')).toEqual(['b', 'a', 'x', 'y'])
  })

  it('starts an empty list from the tab in front, then the strip (a launch, a restore)', () => {
    expect(syncMru([], ['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c'])
    expect(syncMru(['gone'], ['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b'])
    expect(syncMru([], [], null)).toEqual([])
  })
})

describe('the walk (Most recent, #158)', () => {
  const mru = ['c', 'b', 'a'] // c in front, b used before it, a before that

  it('a single Ctrl+Tab goes to the tab used before this one', () => {
    expect(hold(mru, [1])).toBe('b')
  })

  it('each further Tab while Ctrl is held goes one further back, and wraps', () => {
    expect(hold(mru, [1, 1])).toBe('a')
    expect(hold(mru, [1, 1, 1])).toBe('c')
  })

  it('Ctrl+Shift+Tab walks the other way, from the far end on a fresh hold', () => {
    expect(hold(mru, [-1])).toBe('a')
    expect(hold(mru, [-1, -1])).toBe('b')
    expect(hold(mru, [1, 1, -1])).toBe('b')
  })

  it('does not ping-pong: the order changes only when the hold ends', () => {
    // Visit a, b, c by hand; then one Ctrl+Tab per hold.
    let list: readonly string[] = []
    for (const id of ['a', 'b', 'c']) list = touchMru(list, id)
    const first = hold(list, [1])
    expect(first).toBe('b')
    list = touchMru(list, first!) // Ctrl released on b
    const second = hold(list, [1])
    expect(second).toBe('c') // a flip back, the two last used
    list = touchMru(list, second!)
    // A long hold reaches the oldest, and releasing there brings it to the front.
    const third = hold(list, [1, 1])
    expect(third).toBe('a')
    list = touchMru(list, third!)
    expect(list).toEqual(['a', 'c', 'b'])
  })

  it('the walk is a snapshot: the list it came from is not changed', () => {
    const list = ['c', 'b', 'a']
    const walk = stepWalk(startWalk(list)!, 1)
    expect(list).toEqual(['c', 'b', 'a'])
    expect(walkTarget(walk)).toBe('b')
  })

  it('the walk holds only while the tab in front is its own and the strip is its snapshot', () => {
    const walk = stepWalk(startWalk(['d', 'c', 'b', 'a'])!, 1) // landed on c
    expect(walkHolds(walk, ['a', 'b', 'c', 'd'], 'c')).toBe(true)
    // A click on another tab mid-hold is a use, not a step: the hold ends.
    expect(walkHolds(walk, ['a', 'b', 'c', 'd'], 'a')).toBe(false)
    // A tab opened without Ctrl (a folder from Explorer) is not in the snapshot.
    expect(walkHolds(walk, ['a', 'b', 'c', 'd', 'x'], 'x')).toBe(false)
    expect(walkHolds(walk, ['a', 'b', 'c', 'd', 'x'], 'c')).toBe(false)
    // A closed tab could be its next stop.
    expect(walkHolds(walk, ['b', 'c', 'd'], 'c')).toBe(false)
  })

  it('over one tab or none there is nothing to walk', () => {
    expect(startWalk(['a'])).toBeNull()
    expect(startWalk([])).toBeNull()
  })
})
