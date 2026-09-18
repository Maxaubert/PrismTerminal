import { mkdtempSync, existsSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The registry is never touched here: shellVerb's reg.exe callers are stood in
// for, and what is asserted is which of them the switch reaches for.
const calls = vi.hoisted(() => ({
  installed: false,
  install: 0,
  remove: 0
}))
vi.mock('./shellVerb', () => ({
  shouldWriteVerb: (saidNo: boolean, installed: boolean): boolean => !saidNo && !installed,
  verbInstalled: async (): Promise<boolean> => calls.installed,
  installVerb: async (): Promise<boolean> => {
    calls.install += 1
    return true
  },
  removeVerb: async (): Promise<boolean> => {
    calls.remove += 1
    return true
  }
}))

import { createVerbSwitch } from './verbSwitch'

let dir = ''
const make = (allowed: boolean): ReturnType<typeof createVerbSwitch> =>
  createVerbSwitch({
    allowed,
    exe: () => 'C:\\Apps\\PrismTerminal.exe',
    offMarker: () => join(dir, 'shell-verb-off')
  })

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pt-verb-'))
  calls.installed = false
  calls.install = 0
  calls.remove = 0
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('the verb switch', () => {
  it('writes nothing at all when the build is not the installed app', async () => {
    const v = make(false)
    await v.reconcile()
    expect(await v.set(true)).toBe(false)
    expect(await v.set(false)).toBe(false)
    expect(v.writes()).toBe(0)
    expect(calls.install + calls.remove).toBe(0)
    // Not even the marker: a dev build must not record a "no" the installed
    // app would then honour for ever.
    expect(existsSync(join(dir, 'shell-verb-off'))).toBe(false)
  })

  it('puts an absent verb back on launch, and leaves a present one alone', async () => {
    const v = make(true)
    await v.reconcile()
    expect(calls.install).toBe(1)
    calls.installed = true
    await v.reconcile()
    expect(calls.install).toBe(1)
    expect(v.writes()).toBe(1)
  })

  it('honours an explicit off across launches, until it is turned on again', async () => {
    const v = make(true)
    expect(await v.set(false)).toBe(true)
    expect(calls.remove).toBe(1)
    expect(existsSync(join(dir, 'shell-verb-off'))).toBe(true)
    await make(true).reconcile()
    expect(calls.install).toBe(0)
    expect(await v.set(true)).toBe(true)
    expect(existsSync(join(dir, 'shell-verb-off'))).toBe(false)
    expect(calls.install).toBe(1)
  })

  it('refuses anything that is not a boolean', async () => {
    const v = make(true)
    expect(await v.set('yes' as unknown as boolean)).toBe(false)
    expect(v.writes()).toBe(0)
  })
})
