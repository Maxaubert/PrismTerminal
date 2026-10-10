import { describe, expect, it } from 'vitest'
import { answersQuestion, looksLikeQuestion, questionAnswered } from './agentQuestion'

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

// A QUESTION LASTS UNTIL IT IS ANSWERED (#144). No hook fires when a
// permission prompt is turned down or a question is cancelled with Esc, so
// the keys that settle a box, and the box gone after them, are the answer.
describe('answersQuestion', () => {
  it('Enter, Esc, Ctrl+C and a numbered choice settle a question box', () => {
    for (const k of ['\r', '\x1b', '\x03', '1', '3', '9']) expect(answersQuestion(k)).toBe(true)
  })
  it('walking the choices or typing a letter does not', () => {
    for (const k of ['\x1b[A', '\x1b[B', '\t', 'a', ' ', '0', '12', '']) expect(answersQuestion(k)).toBe(false)
  })
})

describe('questionAnswered', () => {
  it('an answering key with the box gone is an answer', () => {
    expect(questionAnswered('\r', FINISHED)).toBe(true)
    expect(questionAnswered('\x1b', ['PS C:\\Users\\me> '])).toBe(true)
  })
  it('the box still up (the next of several questions) is not', () => {
    expect(questionAnswered('\r', QUESTION_BOX)).toBe(false)
    expect(questionAnswered('1', PERMISSION)).toBe(false)
  })
  it('a key that answers nothing is not, whatever the screen says', () => {
    expect(questionAnswered('\x1b[B', FINISHED)).toBe(false)
  })
})
