import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CHORDS, appOwnsKey, chordOf, keyLabel, type ChordId, type KeyContext } from './keymap'

const ev = (key: string, mods: Partial<{ ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }> = {}) => ({
  key,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ...mods
})
const on: KeyContext = { help: true, vertical: true, fullScreen: false, agentKeys: false }

/** The key a label names, as an event: "Ctrl+Shift+K" is K with Ctrl and Shift. */
const fromLabel = (label: string) => {
  const parts = label.replace('1..9', '1').split('+')
  const key = parts.pop()!
  return ev(key, { ctrlKey: parts.includes('Ctrl'), shiftKey: parts.includes('Shift'), altKey: parts.includes('Alt') })
}

describe('the keymap', () => {
  it('every label is the key that chord answers to', () => {
    for (const id of Object.keys(CHORDS) as ChordId[]) expect(chordOf(fromLabel(keyLabel(id)), on), id).toBe(id)
  })

  it('the app takes from the shell exactly the chords it acts on (F11 the shell hears too)', () => {
    for (const id of Object.keys(CHORDS) as ChordId[])
      expect(appOwnsKey(fromLabel(keyLabel(id)), on), id).toBe(id !== 'fullscreen')
  })

  // AGENT HOTKEYS (#198, owner, 2026-10-13): on by default, a second key for
  // the sidebar and the tabs; off, those keys are the shell's again.
  it('agent hotkeys: Ctrl+S is the sidebar (vertical only), Ctrl+PgDn/PgUp the tabs', () => {
    const agent = { ...on, agentKeys: true }
    expect(chordOf(ev('s', { ctrlKey: true }), agent)).toBe('sidebar')
    expect(chordOf(ev('s', { ctrlKey: true }), { ...agent, vertical: false })).toBeNull()
    expect(chordOf(ev('PageDown', { ctrlKey: true }), agent)).toBe('next-tab')
    expect(chordOf(ev('PageUp', { ctrlKey: true }), agent)).toBe('next-tab')
    expect(appOwnsKey(ev('s', { ctrlKey: true }), agent)).toBe(true)
    // The usual keys still work with them on.
    expect(chordOf(ev('b', { ctrlKey: true, shiftKey: true }), agent)).toBe('sidebar')
    expect(chordOf(ev('Tab', { ctrlKey: true }), agent)).toBe('next-tab')
    // Off: the shell's.
    for (const e of [ev('s', { ctrlKey: true }), ev('PageDown', { ctrlKey: true }), ev('PageUp', { ctrlKey: true })]) {
      expect(chordOf(e, on), e.key).toBeNull()
      expect(appOwnsKey(e, on), e.key).toBe(false)
    }
    // Claude Code's own keys stay its, on or off: Ctrl+B, Ctrl+O, Ctrl+R,
    // Ctrl+G, Ctrl+K, Ctrl+L, Ctrl+J (code.claude.com interactive mode).
    for (const k of ['b', 'o', 'r', 'g', 'k', 'l', 'j']) expect(chordOf(ev(k, { ctrlKey: true }), agent), k).toBeNull()
    expect(keyLabel('sidebar', true)).toBe('Ctrl+S')
    expect(keyLabel('sidebar')).toBe('Ctrl+Shift+B')
  })

  it('leaves the shell its own keys', () => {
    // Claude Code's Ctrl+B, PowerShell's Ctrl+S, readline's Ctrl+K.
    for (const k of ['b', 's', 'k', 'c', 'v']) expect(chordOf(ev(k, { ctrlKey: true }), on), k).toBeNull()
    expect(chordOf(ev('B', { ctrlKey: true, shiftKey: true, altKey: true }), on)).toBeNull()
    expect(chordOf(ev('F1', { shiftKey: true }), on)).toBeNull()
  })

  it('the sidebar and find-a-tab keys only while the tabs are vertical', () => {
    const flat = { ...on, vertical: false }
    expect(chordOf(ev('B', { ctrlKey: true, shiftKey: true }), flat)).toBeNull()
    expect(chordOf(ev('K', { ctrlKey: true, shiftKey: true }), flat)).toBeNull()
    expect(chordOf(ev('b', { ctrlKey: true, shiftKey: true }), on)).toBe('sidebar')
  })

  it('F1 only while command help is on; Ctrl+F not over a full-screen program, Ctrl+Shift+F always', () => {
    expect(chordOf(ev('F1'), { ...on, help: false })).toBeNull()
    expect(chordOf(ev('f', { ctrlKey: true }), { ...on, fullScreen: true })).toBeNull()
    expect(chordOf(ev('F', { ctrlKey: true, shiftKey: true }), { ...on, fullScreen: true })).toBe('find')
  })

  // A label typed by hand is a label that can go stale: the UI's shortcut
  // text comes from keyLabel (audit 2026-10-12).
  it('no component types a shortcut label by hand', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const p = join(dir, f)
        return statSync(p).isDirectory() ? walk(p) : /\.tsx$/.test(f) && !/\.test\./.test(f) ? [p] : []
      })
    const labels = (Object.keys(CHORDS) as ChordId[])
      .flatMap((id) => [keyLabel(id), keyLabel(id, true)])
      .filter((l) => l.includes('+'))
    const typed = walk(join(__dirname, '..')).flatMap((f) =>
      readFileSync(f, 'utf8')
        .split(/\r?\n/)
        .filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l))
        .filter((l) => labels.some((lab) => new RegExp(`['">\`(]${lab.replace(/[+.,]/g, '\\$&')}[)'"<\`]`).test(l)))
        .map((l) => `${f}: ${l.trim()}`)
    )
    expect(typed).toEqual([])
  })
})
