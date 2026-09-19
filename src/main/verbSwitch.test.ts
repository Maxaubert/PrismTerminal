import { mkdtempSync, existsSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The registry is never touched here: shellVerb's reg.exe callers are stood in
// for, and what is asserted is which of them the switch reaches for.
const calls = vi.hoisted(() => ({
  installed: false,
  install: 0,
  remove: 0,
  /** The keys the fake registry holds under an out-of-date label. */
  stale: [] as string[],
  staleAsked: 0,
  relabelled: [] as string[][]
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
  },
  staleLabelKeys: async (): Promise<string[]> => {
    calls.staleAsked += 1
    return calls.stale
  },
  relabelVerb: async (keys: string[]): Promise<boolean> => {
    calls.relabelled.push(keys)
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
  calls.stale = []
  calls.staleAsked = 0
  calls.relabelled = []
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

  // #27 (owner, 2026-09-19): the entries stopped naming the app, and an install
  // that already had them must not be left reading the old text.
  it('relabels an entry that is on, ours, and says the old thing: the label alone', async () => {
    calls.installed = true
    calls.stale = ['HKCU\\dir', 'HKCU\\bg']
    const v = make(true)
    await v.reconcile()
    expect(calls.relabelled).toEqual([['HKCU\\dir', 'HKCU\\bg']])
    // Not a reinstall: the icon and the command were already right.
    expect(calls.install).toBe(0)
    expect(v.writes()).toBe(1)
  })

  it('leaves an entry whose label is already right completely alone', async () => {
    calls.installed = true
    const v = make(true)
    await v.reconcile()
    expect(calls.relabelled).toEqual([])
    expect(v.writes()).toBe(0)
  })

  it('NEVER relabels an entry the user turned off, and does not even look', async () => {
    await make(true).set(false)
    // The worst case on purpose: keys that somehow exist, stale, under a "no".
    calls.installed = true
    calls.stale = ['HKCU\\dir']
    const next = make(true)
    await next.reconcile()
    expect(calls.staleAsked).toBe(0)
    expect(calls.relabelled).toEqual([])
    expect(calls.install).toBe(0)
    expect(next.writes()).toBe(0)
  })

  it('does not relabel on top of a fresh write, which already carries the label', async () => {
    calls.stale = ['HKCU\\dir']
    const v = make(true)
    await v.reconcile()
    expect(calls.install).toBe(1)
    expect(calls.relabelled).toEqual([])
    expect(v.writes()).toBe(1)
  })

  it('relabels nothing in a build that is not the installed app', async () => {
    calls.installed = true
    calls.stale = ['HKCU\\dir']
    const v = make(false)
    await v.reconcile()
    expect(calls.staleAsked).toBe(0)
    expect(calls.relabelled).toEqual([])
    expect(v.writes()).toBe(0)
  })

  it('refuses anything that is not a boolean', async () => {
    const v = make(true)
    expect(await v.set('yes' as unknown as boolean)).toBe(false)
    expect(v.writes()).toBe(0)
  })
})
