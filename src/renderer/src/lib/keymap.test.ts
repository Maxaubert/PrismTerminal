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
const on: KeyContext = { help: true, vertical: true, fullScreen: false, agentKeys: false, agentGuard: true, agentHere: true, agentWorking: false }

/** The key a label names, as an event: "Ctrl+Shift+K" is K with Ctrl and Shift. */
const fromLabel = (label: string) => {
  const parts = label.replace('1..9', '1').split('+')
  const key = parts.pop()!
  return ev(key, { ctrlKey: parts.includes('Ctrl'), shiftKey: parts.includes('Shift'), altKey: parts.includes('Alt') })
}

// KEEP AGENT SESSIONS OPEN (owner, 2026-10-16): Ctrl+C and Ctrl+D never clear
// or close an agent, except Ctrl+C stopping one that works.
describe('keep agent sessions open', () => {
  const c = ev('c', { ctrlKey: true })
  const d = ev('d', { ctrlKey: true })
  it('takes Ctrl+D always, and Ctrl+C while the agent is idle', () => {
    expect(chordOf(d, on)).toBe('agent-guard')
    expect(chordOf(c, on)).toBe('agent-guard')
    expect(chordOf(d, { ...on, agentWorking: true })).toBe('agent-guard')
  })
  it('leaves Ctrl+C to an agent at work: it is how it is stopped', () => {
    expect(chordOf(c, { ...on, agentWorking: true })).toBeNull()
  })
  it('a plain shell keeps both, and so does everything with the setting off', () => {
    expect(chordOf(c, { ...on, agentHere: false })).toBeNull()
    expect(chordOf(d, { ...on, agentHere: false })).toBeNull()
    expect(chordOf(c, { ...on, agentGuard: false })).toBeNull()
    expect(chordOf(d, { ...on, agentGuard: false })).toBeNull()
  })
  it('matches the physical key on another layout, and leaves Ctrl+Shift+C alone', () => {
    expect(chordOf({ ...ev('\u0441', { ctrlKey: true }), code: 'KeyC' }, on)).toBe('agent-guard')
    expect(chordOf(ev('C', { ctrlKey: true, shiftKey: true }), on)).toBeNull()
  })
})

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
    // (In a plain shell: an agent's Ctrl+C is the keep-open rule's, above.)
    for (const k of ['b', 's', 'k', 'c', 'v']) expect(chordOf(ev(k, { ctrlKey: true }), { ...on, agentHere: false }), k).toBeNull()
    expect(chordOf(ev('B', { ctrlKey: true, shiftKey: true, altKey: true }), on)).toBeNull()
    expect(chordOf(ev('F1', { shiftKey: true }), on)).toBeNull()
  })

  it('the sidebar key only while the tabs are vertical; find-a-tab in both layouts (#146)', () => {
    const flat = { ...on, vertical: false }
    expect(chordOf(ev('B', { ctrlKey: true, shiftKey: true }), flat)).toBeNull()
    expect(chordOf(ev('K', { ctrlKey: true, shiftKey: true }), flat)).toBe('find-tab')
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
