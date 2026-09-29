import { describe, expect, it } from 'vitest'
import { workingRuns } from './workingRuns'

describe('workingRuns', () => {
  it('joins neighbours into one run', () => {
    expect(workingRuns([true, true, true])).toEqual([{ start: 0, end: 2 }])
  })
  it('leaves tabs apart alone, as the owner put it: 1 and 3 are not a run', () => {
    expect(workingRuns([true, false, true])).toEqual([])
  })
  it('finds several runs, and ignores a lone tab between them', () => {
    expect(workingRuns([true, true, false, true, false, true, true, true])).toEqual([
      { start: 0, end: 1 },
      { start: 5, end: 7 }
    ])
  })
  it('handles the empty strip and a strip with nothing working', () => {
    expect(workingRuns([])).toEqual([])
    expect(workingRuns([false, false])).toEqual([])
  })
})
