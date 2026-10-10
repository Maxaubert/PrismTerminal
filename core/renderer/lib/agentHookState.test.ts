import { describe, expect, it } from 'vitest'
import { hookStep, raisedWhileSeen, type HookEvent, type HookSession } from './agentHookState'

/** Run events through the rules from no state, as the indicator does. */
function run(events: HookEvent[]): { s: HookSession | undefined; last: ReturnType<typeof hookStep> } {
  let s: HookSession | undefined
  let last: ReturnType<typeof hookStep> = null
  for (const ev of events) {
    last = hookStep(s, ev)
    if (last) s = { phase: last.phase, kind: last.kind }
  }
  return { s, last }
}

describe('hookStep', () => {
  it('a prompt is work, and clears every mark', () => {
    const o = hookStep(undefined, { state: 'working' })
    expect(o).toMatchObject({ phase: 'working', working: true, raise: [] })
    expect(o?.clear.sort()).toEqual(['failed', 'finished', 'question'])
  })

  it('a Stop finishes: the Finished line, and no question or failure left', () => {
    const { last } = run([{ state: 'working' }, { state: 'done' }])
    expect(last).toMatchObject({ phase: 'done', working: false, raise: ['finished'] })
    expect(last?.clear.sort()).toEqual(['failed', 'question'])
  })

  it('a permission prompt or a question is the Question line, and not a finish', () => {
    const { last } = run([{ state: 'working' }, { state: 'question' }])
    expect(last).toMatchObject({ phase: 'question', working: false, raise: ['question'] })
    expect(last?.raise).not.toContain('finished')
  })

  it('answering it is work again, which takes the question down', () => {
    const { last } = run([{ state: 'working' }, { state: 'question' }, { state: 'working' }])
    expect(last?.working).toBe(true)
    expect(last?.clear).toContain('question')
  })

  it('a failure is Failed with its kind, and Finished under it for when the Failed line is off', () => {
    const { last } = run([{ state: 'working' }, { state: 'failed', kind: 'rate_limit' }])
    expect(last).toMatchObject({ phase: 'failed', kind: 'rate_limit', working: false })
    expect(last?.raise).toEqual(['failed', 'finished'])
  })

  it('keeps the kind whichever of the two failure hooks lands first', () => {
    expect(run([{ state: 'failed', kind: 'overloaded' }, { state: 'failed' }]).s?.kind).toBe('overloaded')
    expect(run([{ state: 'failed' }, { state: 'failed', kind: 'overloaded' }]).s?.kind).toBe('overloaded')
    expect(run([{ state: 'failed' }]).s?.kind).toBeUndefined()
  })

  it('a new prompt clears a failure, and the next failure starts without the old kind', () => {
    const { last } = run([{ state: 'failed', kind: 'rate_limit' }, { state: 'working' }])
    expect(last?.clear).toContain('failed')
    expect(run([{ state: 'failed', kind: 'rate_limit' }, { state: 'working' }, { state: 'failed' }]).s?.kind).toBeUndefined()
  })

  it('an idle title after work with no Stop is an Esc: idle, and no Finished line', () => {
    const { last } = run([{ state: 'working' }, { state: 'idle-title' }])
    expect(last).toEqual({ phase: 'stopped', working: false, raise: [], clear: [] })
  })

  it('an idle title anywhere else changes nothing', () => {
    for (const before of ['question', 'done', 'failed'] as const)
      expect(run([{ state: before }, { state: 'idle-title' }]).last).toBeNull()
    expect(hookStep(undefined, { state: 'idle-title' })).toBeNull()
  })

  it('a Stop that lands after the idle title still finishes', () => {
    const { last } = run([{ state: 'working' }, { state: 'idle-title' }, { state: 'done' }])
    expect(last?.raise).toEqual(['finished'])
  })
})

// A QUESTION LASTS UNTIL IT IS ANSWERED (#144; owner, 2026-10-09: "it should
// only disappear if you actually answered the question").
describe('raisedWhileSeen', () => {
  it('a question goes up on the tab in front too: being seen is not an answer', () => {
    expect(raisedWhileSeen('question')).toBe(true)
  })
  it('finished and failed are news, which a look has already told', () => {
    expect(raisedWhileSeen('finished')).toBe(false)
    expect(raisedWhileSeen('failed')).toBe(false)
  })
})
