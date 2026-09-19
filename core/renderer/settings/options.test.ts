import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { DICTATION_OPTIONS, dictationOptionIds } from './dictationOptions'
import { TERMINAL_OPTIONS, terminalOptionIds } from './options'

// The list and the sections must say the same thing: the list is what each
// host's parity check compares its Settings page against, so a row added to a
// section and not to the list (or the other way round) would let the two apps
// drift while every test stayed green.

const sections = readdirSync(__dirname)
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => readFileSync(join(__dirname, f), 'utf8'))
  .join('\n')

/** Every row id a shared section renders: `<Pref id="x"` and `data-pref="x"`. */
const rendered = new Set(
  [...sections.matchAll(/<Pref\s+id="([a-z-]+)"|data-pref="([a-z-]+)"/g)].map((m) => m[1] ?? m[2])
)

describe('the terminal options list', () => {
  it('names every row the shared sections render, and nothing they do not', () => {
    expect([...rendered].sort()).toEqual([...TERMINAL_OPTIONS, ...DICTATION_OPTIONS].map((o) => o.id).sort())
  })

  it('has one storage key per option, all under prism.term', () => {
    const keys = TERMINAL_OPTIONS.map((o) => o.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const k of keys) expect(k.startsWith('prism.term.')).toBe(true)
  })

  it('drops only the opacity slider where the host style owns the window material', () => {
    const all = terminalOptionIds({ windowAcrylic: true })
    const prism = terminalOptionIds({ windowAcrylic: false })
    expect(all.filter((id) => !prism.includes(id))).toEqual(['term-opacity'])
  })

  it('gives dictation one key per option, under prism.dictation, and only the GPU row none', () => {
    const keys = DICTATION_OPTIONS.map((o) => o.key).filter((k): k is string => k !== null)
    expect(new Set(keys).size).toBe(keys.length)
    for (const k of keys) expect(k.startsWith('prism.dictation.')).toBe(true)
    expect(DICTATION_OPTIONS.filter((o) => o.key === null).map((o) => o.id)).toEqual(['dictation-gpu'])
  })

  it('offers the GPU row only where an NVIDIA adapter is present', () => {
    const all = dictationOptionIds({ nvidia: true })
    const without = dictationOptionIds({ nvidia: false })
    expect(all.filter((id) => !without.includes(id))).toEqual(['dictation-gpu'])
  })
})
