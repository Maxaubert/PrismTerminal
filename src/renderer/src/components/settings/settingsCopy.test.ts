import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { copyProblem, labelProblem, settingsDescriptions, settingsListCopy, subTooLong } from '@core/shared/settingsCopy'

// Every file of this folder is the grouped cards page (2026-10-05), so the
// eight word limit holds for all of it.
const files = readdirSync(__dirname)
  .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
  .map((f) => ({ f, src: readFileSync(join(__dirname, f), 'utf8') }))

describe("this app's settings", () => {
  it('describe every setting in plain words, as the core does', () => {
    const found = files.flatMap(({ src }) => settingsDescriptions(src))
    expect(found.length).toBeGreaterThan(2)
    expect(found.map((t) => ({ t, problem: copyProblem(t) })).filter((p) => p.problem)).toEqual([])
  })

  it('keep each subtext to one short line, and each label plain', () => {
    const subs = files.flatMap(({ src }) => [...settingsDescriptions(src), ...settingsListCopy(src).subs])
    const labels = files.flatMap(({ src }) => settingsListCopy(src).labels)
    expect(subs.length).toBeGreaterThan(10)
    expect(subs.filter(subTooLong)).toEqual([])
    expect(subs.filter((t) => copyProblem(t))).toEqual([])
    expect(labels.filter((t) => labelProblem(t))).toEqual([])
  })
})
