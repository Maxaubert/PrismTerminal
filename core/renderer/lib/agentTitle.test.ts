import { beforeEach, describe, expect, it } from 'vitest'
import { forgetAgentTitle, readAgentTitle } from './agentTitle'

const read = (t: string): string | null => {
  const r = readAgentTitle('s', t)
  return r ? `${r.kind}:${r.state}` : null
}

beforeEach(() => forgetAgentTitle('s'))

describe('readAgentTitle, the Claude dialect (measured 2026-09-04)', () => {
  it('idle at birth, working from the spinner, idle again when the answer lands', () => {
    expect(read('claude')).toBeNull() // pwsh titling the command it runs
    expect(read('✳ Claude Code')).toBe('claude:idle')
    expect(read('◐ Claude Code')).toBe('claude:working')
    expect(read('◑ Create and read note.txt')).toBe('claude:working')
    expect(read('✳ Create and read note.txt')).toBe('claude:idle')
  })

  it('a spinner before any idle is the agent starting, not working', () => {
    expect(read('◐ Claude Code')).toBe('claude:starting')
    expect(read('✳ Claude Code')).toBe('claude:idle')
    expect(read('◐ Claude Code')).toBe('claude:working')
  })
})

describe('readAgentTitle, the Codex dialect (measured 2026-09-04)', () => {
  it('spins through its startup, is ready at the bare folder name, then works and rests', () => {
    expect(read('yeah')).toBeNull() // nothing learned yet: any shell can be titled a word
    expect(read('⠙ yeah')).toBe('codex:starting')
    expect(read('npm exec @upstash/context7-mcp')).toBeNull() // a child process, mid-startup
    expect(read('⠼ yeah')).toBe('codex:starting')
    expect(read('yeah')).toBe('codex:idle') // MCP loaded: ready
    expect(read('⠴ yeah')).toBe('codex:working')
    expect(read('C:\\WINDOWS\\system32\\cmd.exe ')).toBeNull() // a tool running: no change
    expect(read('⠦ yeah')).toBe('codex:working')
    expect(read('yeah')).toBe('codex:idle')
  })
})

describe('readAgentTitle, Codex asking (#131, measured on 0.153.2)', () => {
  it('reads "Action Required" as waiting on you, in both of its frames', () => {
    expect(read('⠙ proj')).toBe('codex:starting')
    expect(read('proj')).toBe('codex:idle')
    expect(read('⠴ proj')).toBe('codex:working')
    expect(read('[ ! ] Action Required | proj')).toBe('codex:question')
    expect(read('[ . ] Action Required | proj')).toBe('codex:question')
    // Answered: back to work, then at rest under the name it had.
    expect(read('⠦ proj')).toBe('codex:working')
    expect(read('proj')).toBe('codex:idle')
  })

  it('is Codex asking even before anything else was seen', () => {
    expect(read('[ ! ] Action Required | proj')).toBe('codex:question')
  })

  it('is not set off by a title that only mentions it', () => {
    expect(read('Action Required')).toBeNull()
    expect(read('notes [ ! ] Action Required')).toBeNull()
  })
})

describe('readAgentTitle, everything else', () => {
  it('is null for the shell, a command, a path, an empty title', () => {
    expect(read('C:\\Program Files\\PowerShell\\7\\pwsh.exe')).toBeNull()
    expect(read('')).toBeNull()
    expect(read('* not the glyph')).toBeNull()
  })

  it('forgets a session', () => {
    expect(read('✳ Claude Code')).toBe('claude:idle')
    forgetAgentTitle('s')
    expect(read('◐ Claude Code')).toBe('claude:starting')
  })
})
