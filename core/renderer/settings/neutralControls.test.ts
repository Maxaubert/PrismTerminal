import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROW_BUTTON, SEGMENT_ON, SWITCH_KNOB_ON, SWITCH_ON } from './fields'

// Settings controls are neutral and only Save wears the accent (owner,
// 2026-09-23). The e2e measures it on a real page; this holds the source, so
// an accent slipped back into a control fails before anything is built.
const ACCENT = /--p-(accent|accent-hi|on-accent|sel-bg)\b/

describe('settings controls', () => {
  it('row button, pressed segment and switch carry no accent token', () => {
    for (const cls of [ROW_BUTTON, SEGMENT_ON, SWITCH_ON, SWITCH_KNOB_ON]) {
      // The focus ring may be the accent: it marks the keyboard, not the button.
      expect(cls.replace(/focus-visible:\S+/g, '')).not.toMatch(ACCENT)
    }
  })

  it("dictation's buttons carry no accent", () => {
    const src = readFileSync(resolve(__dirname, 'Dictation.tsx'), 'utf8')
    for (const name of ['button', 'primary']) {
      const m = src.match(new RegExp(`const ${name} =\\s*'([^']*)'`))
      expect(m, name).not.toBeNull()
      expect(m![1]).not.toMatch(ACCENT)
    }
  })

  it('the save button still does', () => {
    const src = readFileSync(resolve(__dirname, 'fields.tsx'), 'utf8')
    const save = src.slice(src.indexOf('export function SaveButton'), src.indexOf('export function ThemeHead'))
    expect(save).toMatch(/bg-\[var\(--p-accent\)\]/)
  })
})
