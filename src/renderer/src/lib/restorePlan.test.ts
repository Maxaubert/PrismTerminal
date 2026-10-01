import { describe, expect, it } from 'vitest'
import { peekState, settleRestore } from './restorePlan'

const ids = (): (() => string) => {
  let n = 0
  return () => `t${(n += 1)}`
}

describe('peekState', () => {
  it('draws every saved tab at once, agent tabs as skeletons, the saved one in front', () => {
    const b = peekState(
      { tabs: [{ cwd: 'C:\\a', agent: 'claude' }, { cwd: 'C:\\b' }, { cwd: 'C:\\c', agent: 'codex' }], active: 2 },
      ids()
    )
    expect(b.state.tabs).toEqual([
      { id: 't1', cwd: 'C:\\a', pending: 'agent' },
      { id: 't2', cwd: 'C:\\b', pending: 'shell' },
      { id: 't3', cwd: 'C:\\c', pending: 'agent' }
    ])
    expect(b.state.activeId).toBe('t3')
    expect(b.slots).toEqual(['t1', 't2', 't3'])
  })
  it('an empty save draws nothing and fronts nothing', () => {
    expect(peekState({ tabs: [], active: 0 }, ids()).state).toEqual({ tabs: [], activeId: null })
  })
})

describe('settleRestore', () => {
  const boot = () =>
    peekState({ tabs: [{ cwd: 'C:\\a', agent: 'claude' }, { cwd: 'C:\\gone' }, { cwd: 'C:\\c' }], active: 0 }, ids())

  it('each restored tab takes over its placeholder, in place, and is spawned with its resume', () => {
    const b = boot()
    const r = settleRestore(
      b.state,
      b.slots,
      { tabs: [{ cwd: 'C:\\a', resume: 'sess-1', from: 0 }, { cwd: 'C:\\c', from: 2 }], active: 0 },
      () => 'new'
    )
    expect(r.state.tabs).toEqual([
      { id: 't1', cwd: 'C:\\a' },
      { id: 't3', cwd: 'C:\\c' }
    ])
    expect(r.state.activeId).toBe('t1')
    expect(r.spawn).toEqual([
      { id: 't1', cwd: 'C:\\a', resume: 'sess-1' },
      { id: 't3', cwd: 'C:\\c' }
    ])
  })

  it('a folder the launch was handed comes after, in front when the restore says so', () => {
    const b = boot()
    const r = settleRestore(
      b.state,
      b.slots,
      { tabs: [{ cwd: 'C:\\a', from: 0 }, { cwd: 'C:\\c', from: 2 }, { cwd: 'D:\\handed' }], active: 2 },
      () => 'new'
    )
    expect(r.state.tabs.map((t) => t.id)).toEqual(['t1', 't3', 'new'])
    expect(r.state.activeId).toBe('new')
    expect(r.spawn.at(-1)).toEqual({ id: 'new', cwd: 'D:\\handed' })
  })

  it('keeps a tab the user opened meanwhile, and the front they picked', () => {
    const b = boot()
    const s = { tabs: [...b.state.tabs, { id: 'mine', cwd: 'C:\\x' }], activeId: 'mine' }
    const r = settleRestore(s, b.slots, { tabs: [{ cwd: 'C:\\a', from: 0 }], active: 0 }, () => 'new')
    expect(r.state.tabs.map((t) => t.id)).toEqual(['t1', 'mine'])
    expect(r.state.activeId).toBe('mine')
  })

  it('a placeholder closed before the restore answered stays closed, and nothing spawns for it', () => {
    const b = boot()
    const s = { tabs: b.state.tabs.filter((t) => t.id !== 't1'), activeId: 't3' }
    const r = settleRestore(s, b.slots, { tabs: [{ cwd: 'C:\\a', resume: 'x', from: 0 }, { cwd: 'C:\\c', from: 2 }], active: 0 }, () => 'new')
    expect(r.state.tabs.map((t) => t.id)).toEqual(['t3'])
    expect(r.spawn.map((x) => x.id)).toEqual(['t3'])
  })

  it('every folder gone: no tabs left, nothing in front', () => {
    const b = boot()
    const r = settleRestore(b.state, b.slots, { tabs: [], active: 0 }, () => 'new')
    expect(r.state).toEqual({ tabs: [], activeId: null })
    expect(r.spawn).toEqual([])
  })
})
