import { describe, expect, it } from 'vitest'
import { armAtStart, armOnPoll, armOnPrompt, armOnTitle } from './agentArm'

const IDLE = '✳ Claude Code'

describe('agentArm', () => {
  it('starts armed for a resumed agent, bare otherwise', () => {
    expect(armAtStart('claude')).toMatchObject({ here: true, kind: 'claude' })
    expect(armAtStart(null)).toMatchObject({ here: false, kind: null })
  })

  it("is armed by the agent's own title before the poll (#175)", () => {
    expect(armOnTitle(armAtStart(null), IDLE)).toMatchObject({ here: true, kind: 'claude' })
  })

  it('is not armed by a bare braille spinner', () => {
    expect(armOnTitle(armAtStart(null), '⠙ npm')).toMatchObject({ here: false, kind: null })
  })

  it("is disarmed by the poll's left (#73)", () => {
    const s = armOnPoll(armOnTitle(armAtStart(null), IDLE), true, 'claude')
    expect(armOnPoll(s, false, null)).toMatchObject({ here: false, kind: null })
  })

  it("keeps the title's agent when the poll only sees a wrapper", () => {
    expect(armOnPoll(armOnTitle(armAtStart(null), IDLE), true, 'other')).toMatchObject({ here: true, kind: 'claude' })
  })

  // Review 2026-10-11: in a WSL tab the poll only ever sees wsl.exe, so it
  // never says "left", and a title-armed tab kept Shift+Enter as Ctrl+J and
  // Ctrl+V as ESC v at the plain pwsh prompt after `exit`. The shell's own
  // prompt report says nothing runs in front of it.
  it('is disarmed by the prompt when only the title armed it', () => {
    expect(armOnPrompt(armOnTitle(armAtStart(null), IDLE))).toMatchObject({ here: false, kind: null })
  })

  it('is disarmed by the prompt after a resumed agent ends', () => {
    expect(armOnPrompt(armAtStart('codex'))).toMatchObject({ here: false, kind: null })
  })

  // An agent the poll saw is the poll's to take back: a codex restarted inside
  // one poll interval is never reported again, and Codex's title arms only
  // while it asks.
  it('leaves an agent the poll saw to the poll', () => {
    const s = armOnPoll(armAtStart(null), true, 'codex')
    expect(armOnPrompt(s)).toMatchObject({ here: true, kind: 'codex' })
  })
})
