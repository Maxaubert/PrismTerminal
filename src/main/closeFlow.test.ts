import { describe, expect, it } from 'vitest'
import { createCloseFlow } from './closeFlow'

// Regression rule 7: closing the window QUITS, and a WORKING agent holds every
// way out until the user answers.
describe('the close question', () => {
  it('lets the window go when no agent is working', () => {
    expect(createCloseFlow().onClose()).toBe('close')
  })
  it('holds it while one works, and the go-ahead closes it', () => {
    const f = createCloseFlow()
    f.setBusy(true)
    expect(f.onClose()).toBe('ask')
    expect(f.confirm()).toBe('close')
    expect(f.onClose()).toBe('close')
  })
  it('Cancel (no go-ahead) keeps holding it', () => {
    const f = createCloseFlow()
    f.setBusy(true)
    expect(f.onClose()).toBe('ask')
    expect(f.onClose()).toBe('ask')
  })
  it('a quit the question interrupted is finished by the go-ahead, not turned into a close', () => {
    const f = createCloseFlow()
    f.setBusy(true)
    f.quitStarted()
    expect(f.onClose()).toBe('ask')
    expect(f.confirm()).toBe('quit')
    expect(f.onClose()).toBe('close')
  })
  it('after Cancel, a later go-ahead is a close: the quit was dropped', () => {
    const f = createCloseFlow()
    f.setBusy(true)
    f.quitStarted()
    f.onClose() // asked, and the question was cancelled
    f.setBusy(true)
    f.onClose() // the window's own X this time
    expect(f.confirm()).toBe('close')
  })
  it('an install answered in advance goes straight through, once', () => {
    const f = createCloseFlow()
    f.setBusy(true)
    f.agree()
    expect(f.onClose()).toBe('close')
    f.setBusy(true)
    expect(f.onClose()).toBe('ask')
  })
})
