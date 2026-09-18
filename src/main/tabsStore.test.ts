import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createTabsStore, parseTabs } from './tabsStore'

const tmp = (): string => join(mkdtempSync(join(tmpdir(), 'pt-')), 'tabs.json')

describe('tabsStore', () => {
  it('keeps only well-shaped tabs and a valid active index', () => {
    expect(
      parseTabs(
        '{"tabs":[{"cwd":"C:\\\\a","agent":"claude"},{"x":1},{"cwd":"C:\\\\b","agent":"vim"}],"active":9}'
      )
    ).toEqual({ tabs: [{ cwd: 'C:\\a', agent: 'claude' }, { cwd: 'C:\\b' }], active: 0 })
    expect(parseTabs('not json')).toEqual({ tabs: [], active: 0 })
  })
  it('reads a file written by something else as an empty strip, never a crash', () => {
    for (const raw of ['null', '[]', '{}', '{"tabs":"no"}', '{"tabs":[null,1,"a",{"cwd":5},{"cwd":""}]}'])
      expect(parseTabs(raw), raw).toEqual({ tabs: [], active: 0 })
  })
  it('keeps the active index when it names a tab, and only then', () => {
    const two = '"tabs":[{"cwd":"C:\\\\a"},{"cwd":"C:\\\\b"}]'
    expect(parseTabs(`{${two},"active":1}`).active).toBe(1)
    expect(parseTabs(`{${two},"active":2}`).active).toBe(0)
    expect(parseTabs(`{${two},"active":-1}`).active).toBe(0)
    expect(parseTabs(`{${two},"active":0.5}`).active).toBe(0)
    expect(parseTabs(`{${two},"active":"1"}`).active).toBe(0)
  })
  it('caps the list: tabs.json is a suggestion, not a record', () => {
    const many = JSON.stringify({ tabs: Array.from({ length: 80 }, (_, i) => ({ cwd: `C:\\${i}` })), active: 0 })
    expect(parseTabs(many).tabs).toHaveLength(50)
  })
  it('never hands out the same empty object twice', () => {
    const a = parseTabs('not json')
    a.tabs.push({ cwd: 'C:\\mutated' })
    expect(parseTabs('not json').tabs).toEqual([])
  })
  it('loads an empty strip when there is no file yet', () => {
    expect(createTabsStore(tmp()).load()).toEqual({ tabs: [], active: 0 })
  })
  it('flush writes a pending save at once', () => {
    const file = tmp()
    const store = createTabsStore(file, 60000)
    store.save({ tabs: [{ cwd: 'C:\\a' }], active: 0 })
    store.flush()
    expect(JSON.parse(readFileSync(file, 'utf8')).tabs[0].cwd).toBe('C:\\a')
    expect(store.load().tabs).toHaveLength(1)
  })
  it('writes the LAST of several saves, once the debounce runs out', async () => {
    const file = tmp()
    const store = createTabsStore(file, 20)
    store.save({ tabs: [{ cwd: 'C:\\a' }], active: 0 })
    store.save({ tabs: [{ cwd: 'C:\\a' }, { cwd: 'C:\\b', agent: 'codex' }], active: 1 })
    expect(existsSync(file)).toBe(false)
    await new Promise((r) => setTimeout(r, 80))
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      tabs: [{ cwd: 'C:\\a' }, { cwd: 'C:\\b', agent: 'codex' }],
      active: 1
    })
  })
  it('loads a save that is still inside its debounce, not the file before it', () => {
    const file = tmp()
    writeFileSync(file, JSON.stringify({ tabs: [{ cwd: 'C:\\old' }], active: 0 }))
    const store = createTabsStore(file, 60000)
    store.save({ tabs: [{ cwd: 'C:\\new' }], active: 0 })
    expect(store.load().tabs).toEqual([{ cwd: 'C:\\new' }])
    store.flush()
  })
  it('flush with nothing pending leaves the file alone', () => {
    const file = tmp()
    createTabsStore(file).flush()
    expect(existsSync(file)).toBe(false)
  })
})
