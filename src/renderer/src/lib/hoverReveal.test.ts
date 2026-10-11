import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REVEAL, createReveal } from './hoverReveal'

describe('the hover reveal (#162)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const make = (): { seen: boolean[]; r: ReturnType<typeof createReveal> } => {
    const seen: boolean[] = []
    return { seen, r: createReveal((v) => seen.push(v)) }
  }

  it('opens only after the pointer has stayed near for the open delay', () => {
    const { seen, r } = make()
    r.feel(true)
    vi.advanceTimersByTime(REVEAL.openDelay - 1)
    expect(seen).toEqual([])
    vi.advanceTimersByTime(1)
    expect(seen).toEqual([true])
  })

  it('a pointer that only passes the edge opens nothing', () => {
    const { seen, r } = make()
    r.feel(true)
    vi.advanceTimersByTime(REVEAL.openDelay / 2)
    r.feel(false)
    vi.advanceTimersByTime(1000)
    expect(seen).toEqual([])
  })

  it('stays through a slip shorter than the grace, and goes after it', () => {
    const { seen, r } = make()
    r.feel(true)
    vi.advanceTimersByTime(REVEAL.openDelay)
    r.feel(false)
    vi.advanceTimersByTime(REVEAL.closeDelay - 10)
    r.feel(true)
    vi.advanceTimersByTime(1000)
    expect(seen).toEqual([true])
    r.feel(false)
    vi.advanceTimersByTime(REVEAL.closeDelay)
    expect(seen).toEqual([true, false])
  })

  it('a pointer moving about inside does not restart the wait', () => {
    const { seen, r } = make()
    r.feel(true)
    vi.advanceTimersByTime(50)
    r.feel(true)
    vi.advanceTimersByTime(REVEAL.openDelay - 50)
    expect(seen).toEqual([true])
  })

  it('a hold keeps it shown while the pointer is away, and lets go after the grace', () => {
    const { seen, r } = make()
    r.feel(true)
    vi.advanceTimersByTime(REVEAL.openDelay)
    r.hold(true)
    r.feel(false)
    vi.advanceTimersByTime(5000)
    expect(seen).toEqual([true])
    r.hold(false)
    vi.advanceTimersByTime(REVEAL.closeDelay)
    expect(seen).toEqual([true, false])
  })

  it('hide puts it away at once, unless held', () => {
    const { seen, r } = make()
    r.feel(true)
    vi.advanceTimersByTime(REVEAL.openDelay)
    r.hide()
    expect(seen).toEqual([true, false])
    r.feel(true)
    vi.advanceTimersByTime(REVEAL.openDelay)
    r.hold(true)
    r.hide()
    expect(seen).toEqual([true, false, true])
  })
})
