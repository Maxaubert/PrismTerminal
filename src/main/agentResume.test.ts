import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { CODEX_RESUME, claudeSessions, planRestore, validResume } from './agentResume'

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

describe('validResume', () => {
  it('accepts a session id and the codex marker, refuses a command', () => {
    expect(validResume('3f2a9c1e-77aa-4c0d-9b1e-0a1b2c3d4e5f')).toBeTruthy()
    expect(validResume(CODEX_RESUME)).toBe(CODEX_RESUME)
    expect(validResume('x; rm -rf')).toBeUndefined()
  })
  it('refuses an id with a command riding behind it, and nothing at all', () => {
    expect(validResume('3f2a9c1e-77aa-4c0d-9b1e-0a1b2c3d4e5f; calc')).toBeUndefined()
    expect(validResume('')).toBeUndefined()
    expect(validResume(undefined)).toBeUndefined()
  })
})

describe('claudeSessions', () => {
  it("reads claude's own store for the folder, newest first", () => {
    const home = mkdtempSync(join(tmpdir(), 'pt-home-'))
    // claude's encoding: every non-alphanumeric character becomes a dash.
    const dir = join(home, '.claude', 'projects', 'C--Users-me-my-project')
    mkdirSync(dir, { recursive: true })
    const at = (name: string, secs: number): void => {
      writeFileSync(join(dir, name), '')
      utimesSync(join(dir, name), secs, secs)
    }
    at('old.jsonl', 1_000_000)
    at('new.jsonl', 2_000_000)
    at('notes.txt', 3_000_000)
    expect(claudeSessions('C:\\Users\\me\\my project', home)).toEqual(['new', 'old'])
  })
  it('answers nothing for a folder claude never recorded', () => {
    const home = mkdtempSync(join(tmpdir(), 'pt-home-'))
    expect(claudeSessions('C:\\nowhere', home)).toEqual([])
  })
})
