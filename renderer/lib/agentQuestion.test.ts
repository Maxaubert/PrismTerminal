import { describe, expect, it } from 'vitest'
import { looksLikeQuestion } from './agentQuestion'

// The bottom of Claude Code's screen in each state (Claude Code 2.1.283,
// 2026-09-28), trimmed to the rows that matter. The question box's footer and
// the finished screen were captured from a real session in a pty. The
// permission prompt could not be: the owner's own hooks approved the command
// before a prompt was drawn, so its shape here is Claude Code's documented
// "Do you want to proceed?" over numbered choices, and is the least certain.
const QUESTION_BOX = [
  '● Which colour do you prefer?',
  '',
  '  ❯ 1. Red',
  '    2. Blue',
  '    3. Type something.',
  '',
  'Enter to select · ↑/↓ to navigate · Esc to cancel'
]
const PERMISSION = [
  ' Bash command',
  '',
  '   echo hello-signals',
  '   Print a test string',
  '',
  ' Do you want to proceed?',
  ' ❯ 1. Yes',
  "   2. Yes, and don't ask again for echo commands in this folder",
  '   3. No, and tell Claude what to do differently (esc)'
]
const FINISHED = [
  '● I ran the command and it printed: hello-signals',
  '',
  '✻ Worked for 7s · done 18:49',
  '',
  '────────────────────────────────────────',
  '❯ ',
  '────────────────────────────────────────',
  '  ⏵⏵ auto mode on (shift+tab to cycle)'
]

describe('looksLikeQuestion', () => {
  it("knows the question tool's box", () => {
    expect(looksLikeQuestion(QUESTION_BOX)).toBe(true)
  })
  it('knows a permission prompt', () => {
    expect(looksLikeQuestion(PERMISSION)).toBe(true)
  })
  it('does not take a finished answer, or an idle prompt, for a question', () => {
    expect(looksLikeQuestion(FINISHED)).toBe(false)
    expect(looksLikeQuestion(['PS C:\\Users\\me> '])).toBe(false)
  })
  it('does not take an answer that merely mentions the words for a question', () => {
    expect(looksLikeQuestion(['Press Esc to cancel a build.', 'Done.'])).toBe(false)
    expect(looksLikeQuestion(['Do you want to know more? Read the docs.'])).toBe(false)
  })
})
