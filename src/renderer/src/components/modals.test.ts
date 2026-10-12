import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// This app's dialogs are the core's Modal too (core's Modal.test holds the core).
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : /\.tsx$/.test(f) ? [p] : []
  })

describe("this app's dialogs", () => {
  it('declare no modal of their own', () => {
    const own = walk(join(__dirname, '..')).filter((f) => /aria-modal/.test(readFileSync(f, 'utf8')))
    expect(own).toEqual([])
  })
})
