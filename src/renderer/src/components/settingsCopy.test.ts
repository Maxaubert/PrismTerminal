import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { copyProblem, settingsDescriptions } from '@core/shared/settingsCopy'

describe("this app's settings", () => {
  it('describe every setting in plain words, as the core does', () => {
    const text = readFileSync(join(__dirname, 'Settings.tsx'), 'utf8')
    const found = settingsDescriptions(text)
    expect(found.length).toBeGreaterThan(5)
    expect(found.map((t) => ({ t, problem: copyProblem(t) })).filter((p) => p.problem)).toEqual([])
  })
})
