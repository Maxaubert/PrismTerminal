import { describe, expect, it } from 'vitest'
import { CODEX_RESUME } from '@core/main/agentResume'
import { planRestore } from './planRestore'

describe('planRestore', () => {
  const all = (): boolean => true
  it('drops a folder that has gone and keeps the active tab pointing right', () => {
    const r = planRestore(
      { tabs: [{ cwd: 'C:\\gone' }, { cwd: 'C:\\a' }, { cwd: 'C:\\b' }], active: 2 },
      (p) => p !== 'C:\\gone',
      () => []
    )
    expect(r).toEqual({ tabs: [{ cwd: 'C:\\a' }, { cwd: 'C:\\b' }], active: 1 })
  })
  it('falls back to the first tab when the active one is the folder that went', () => {
    const r = planRestore(
      { tabs: [{ cwd: 'C:\\a' }, { cwd: 'C:\\gone' }], active: 1 },
      (p) => p !== 'C:\\gone',
      () => []
    )
    expect(r).toEqual({ tabs: [{ cwd: 'C:\\a' }], active: 0 })
  })
  it('answers an empty strip for an empty save, or one whose folders have all gone', () => {
    expect(planRestore({ tabs: [], active: 0 }, all, () => [])).toEqual({ tabs: [], active: 0 })
    expect(planRestore({ tabs: [{ cwd: 'C:\\gone' }], active: 0 }, () => false, () => [])).toEqual({
      tabs: [],
      active: 0
    })
  })
  it('hands two claude tabs in one folder the newest and second-newest session', () => {
    const r = planRestore(
      { tabs: [{ cwd: 'C:\\a', agent: 'claude' }, { cwd: 'c:\\A', agent: 'claude' }], active: 0 },
      all,
      () => ['new-id', 'old-id']
    )
    expect(r.tabs.map((t) => t.resume)).toEqual(['new-id', 'old-id'])
  })
  it('looks a session up by the folder of the tab it is for', () => {
    const asked: string[] = []
    planRestore(
      { tabs: [{ cwd: 'C:\\a', agent: 'claude' }, { cwd: 'C:\\a\\sub', agent: 'claude' }], active: 0 },
      all,
      (cwd) => {
        asked.push(cwd)
        return []
      }
    )
    expect(asked).toEqual(['C:\\a', 'C:\\a\\sub'])
  })
  it('resumes nothing when claude recorded no session', () => {
    expect(
      planRestore({ tabs: [{ cwd: 'C:\\a', agent: 'claude' }], active: 0 }, all, () => []).tabs[0]
    ).toEqual({ cwd: 'C:\\a' })
  })
  it('resumes nothing for a tab that hosted no agent, sessions on disk or not', () => {
    expect(planRestore({ tabs: [{ cwd: 'C:\\a' }], active: 0 }, all, () => ['new-id']).tabs[0]).toEqual({
      cwd: 'C:\\a'
    })
  })
  it('gives codex its own resume', () => {
    expect(
      planRestore({ tabs: [{ cwd: 'C:\\a', agent: 'codex' }], active: 0 }, all, () => []).tabs[0].resume
    ).toBe(CODEX_RESUME)
  })
})
