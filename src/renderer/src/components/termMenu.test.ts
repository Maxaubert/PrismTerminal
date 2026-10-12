import { describe, expect, it, vi } from 'vitest'
import { termMenuItems, type TermMenuAt } from './termMenu'

const at = (over: Partial<TermMenuAt> = {}): TermMenuAt => ({
  id: 't1',
  x: 0,
  y: 0,
  selection: '',
  link: null,
  path: null,
  ...over
})
const act = () => ({
  openPath: vi.fn(),
  copy: vi.fn(),
  openLink: vi.fn(),
  paste: vi.fn(),
  find: vi.fn()
})
const labels = (m: TermMenuAt, help = false): string[] =>
  termMenuItems(m, { ...act(), help: help ? () => undefined : undefined }).map((i) => i.label)

describe("the terminal's menu", () => {
  it('fits what was clicked: plain, a selection, a link, a path', () => {
    expect(labels(at())).toEqual(['Paste', 'Find in scrollback'])
    expect(labels(at({ selection: 'x' }))).toEqual(['Copy', 'Paste', 'Find in scrollback'])
    expect(labels(at({ link: 'https://a.b' }))).toEqual(['Copy link', 'Open link', 'Paste', 'Find in scrollback'])
    expect(labels(at({ path: { kind: 'dir', abs: 'C:\\x' } as TermMenuAt['path'] }))).toEqual([
      'Open folder',
      'Show in Explorer',
      'Copy path',
      'Paste',
      'Find in scrollback'
    ])
  })
  it('offers command help only while it is switched on, and always last', () => {
    expect(labels(at(), true).at(-1)).toBe('Command help')
    expect(labels(at())).not.toContain('Command help')
  })
  it('has no Close tab (owner, 2026-09-23: "remove close tab from the right click menu")', () => {
    expect(labels(at({ selection: 'x', link: 'https://a.b' }), true)).not.toContain('Close tab')
  })
  it('copies exactly what was under the pointer', () => {
    const a = act()
    const items = termMenuItems(at({ selection: 'sel', link: 'https://a.b' }), a)
    items.find((i) => i.label === 'Copy link')!.onPick!()
    items.find((i) => i.label === 'Copy')!.onPick!()
    expect(a.copy.mock.calls).toEqual([['https://a.b'], ['sel']])
  })
})
