import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { CODEX_RESUME, claudeSessions, validResume } from './agentResume'

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
