import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { copyProblem, settingsDescriptions } from './settingsCopy'

describe('copyProblem', () => {
  it('passes plain words with commas and full stops', () => {
    expect(copyProblem('The shell that new terminals start with.')).toBeNull()
    expect(copyProblem('The official CUDA 12.4 build, which runs in under a second.')).toBeNull()
  })
  it('refuses any other symbol, apostrophes and ellipses included', () => {
    for (const s of ['Needs Windows 11: yes', "The theme's colour", 'Asking Windows…', 'a - b', 'a (b)', '"quoted"', '50%', 'x/y'])
      expect(copyProblem(s), s).not.toBeNull()
  })
  it('refuses a key name, but not a word that merely contains one', () => {
    expect(copyProblem('Press F1 to open it.')).toMatch(/key/)
    expect(copyProblem('Hold Ctrl while you scroll.')).toMatch(/key/)
    expect(copyProblem('Needs Windows 11.')).toBeNull()
    expect(copyProblem('The tabs and the title bar.')).toBeNull()
  })
})

describe('settingsDescriptions', () => {
  it('finds literal, ternary and template descriptions', () => {
    const src = `<Pref hint="One." /> <Pref hint={on ? 'Two words.' : \`Three \${x} here.\`} /> note: 'Four five.'`
    expect(settingsDescriptions(src)).toEqual(['One.', 'Two words.', 'Three  here.', 'Four five.'])
  })
})

describe("the core's own settings", () => {
  it('describe every setting in plain words', () => {
    const dir = join(__dirname, '..', 'renderer', 'settings')
    const files = [
      ...readdirSync(dir).filter((f) => f.endsWith('.tsx')).map((f) => join(dir, f)),
      join(__dirname, 'dictationCatalog.ts')
    ]
    const problems = files.flatMap((f) =>
      settingsDescriptions(readFileSync(f, 'utf8'))
        .map((text) => ({ f, text, problem: copyProblem(text) }))
        .filter((p) => p.problem)
    )
    expect(problems).toEqual([])
  })
})
