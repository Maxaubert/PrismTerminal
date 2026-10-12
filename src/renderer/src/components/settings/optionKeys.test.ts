import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TERMINAL_OPTIONS } from '@core/renderer/settings/options'
import { APP_OPTIONS } from './appOptions'

// A SETTINGS ROW NAMES THE KEY ITS SETTING IS STORED UNDER, AND THE MODULE
// THAT STORES IT USES THE SAME ONE (audit 2026-10-12). The lists stay flat
// text (Prism's gate reads options.ts as text), so the key is typed twice:
// this holds the two together. A key renamed in its module and not in its row
// (or the other way round) fails here instead of searching for nothing.
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return walk(p)
    return /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : []
  })
const root = join(__dirname, '..', '..', '..', '..', '..')
const readers = [...walk(join(root, 'core', 'renderer', 'lib')), ...walk(join(root, 'src', 'renderer', 'src', 'lib'))].map(
  (f) => readFileSync(f, 'utf8')
)
const read = (key: string): boolean => readers.some((src) => src.includes(`'${key}'`) || src.includes(`"${key}"`))

describe('every settings row', () => {
  it("in the core's list names a key its module stores under", () => {
    expect(TERMINAL_OPTIONS.filter((o) => !read(o.key)).map((o) => `${o.id}: ${o.key}`)).toEqual([])
  })
  it("in this app's list names keys their modules store under", () => {
    const keys = APP_OPTIONS.flatMap((o) => (Array.isArray(o.store) ? o.store.map((k) => ({ id: o.id, k })) : []))
    expect(keys.filter(({ k }) => !read(k)).map(({ id, k }) => `${id}: ${k}`)).toEqual([])
  })
})
