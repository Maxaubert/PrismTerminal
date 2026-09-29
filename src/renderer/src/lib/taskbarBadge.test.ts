import { describe, expect, it } from 'vitest'
import { attentionCount, badgeText } from './taskbarBadge'

const set = (...ids: string[]): ReadonlySet<string> => new Set(ids)

describe('attentionCount', () => {
  it('counts every tab showing a mark, once, a question and a finish alike', () => {
    expect(
      attentionCount({ doneIds: set('a', 'b'), questionIds: set('b', 'c'), workingIds: set(), doneOn: true, questionOn: true })
    ).toEqual({ count: 3, question: true })
  })
  it('counts only the marks whose switch is on', () => {
    expect(
      attentionCount({ doneIds: set('a'), questionIds: set('c'), workingIds: set(), doneOn: false, questionOn: true })
    ).toEqual({ count: 1, question: true })
    expect(
      attentionCount({ doneIds: set('a'), questionIds: set('c'), workingIds: set(), doneOn: true, questionOn: false })
    ).toEqual({ count: 1, question: false })
  })
  it('does not count a tab that is working again', () => {
    expect(
      attentionCount({ doneIds: set('a'), questionIds: set(), workingIds: set('a'), doneOn: true, questionOn: true })
    ).toEqual({ count: 0, question: false })
  })
})

describe('badgeText', () => {
  it('is the count, and 9+ past nine', () => {
    expect(badgeText(1)).toBe('1')
    expect(badgeText(9)).toBe('9')
    expect(badgeText(10)).toBe('9+')
  })
})
