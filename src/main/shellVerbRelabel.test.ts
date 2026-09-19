import { beforeEach, describe, expect, it, vi } from 'vitest'

// A FAKE REGISTRY behind reg.exe: a map of key -> default value, answered in
// reg.exe's own words (the format MEASURED on this machine, 2026-09-19, CRLF
// included). Nothing here reaches the real registry: `execFile` is the only
// way shellVerb talks to Windows, and it is stood in for.
const fake = vi.hoisted(() => ({
  values: new Map<string, string>(),
  adds: [] as string[][]
}))
vi.mock('child_process', () => ({
  execFile: (
    _exe: string,
    args: string[],
    _opts: unknown,
    cb: (err: Error | null, stdout: string) => void
  ): void => {
    const [verb, key] = args
    if (verb === 'query') {
      const v = fake.values.get(key)
      if (v === undefined) return cb(new Error('ERROR: unable to find the specified registry key'), '')
      const shown = key.replace('HKCU', 'HKEY_CURRENT_USER')
      return cb(null, `\r\n${shown}\r\n    (Default)    REG_SZ    ${v}\r\n\r\n`)
    }
    if (verb === 'add') {
      fake.adds.push(args)
      if (args.includes('/ve')) fake.values.set(key, args[args.indexOf('/d') + 1])
      return cb(null, 'The operation completed successfully.\r\n')
    }
    cb(null, '')
  }
}))

import { VERB_LABEL, relabelVerb, staleLabelKeys, verbKeys } from './shellVerb'

const EXE = 'C:\\Apps\\PrismTerminal\\PrismTerminal.exe'
const [DIR, BG] = verbKeys()
/** An entry as an older build wrote it. */
const entry = (key: string, label: string, exe: string, arg: string): void => {
  fake.values.set(key, label)
  fake.values.set(`${key}\\command`, `"${exe}" "${arg}"`)
}

beforeEach(() => {
  fake.values.clear()
  fake.adds = []
})

describe('which labels are stale (#27)', () => {
  it('names both keys of an install made before the label changed', async () => {
    entry(DIR, 'Open in Prism Terminal', EXE, '%1')
    entry(BG, 'Open Prism Terminal here', EXE, '%V')
    expect(await staleLabelKeys(EXE)).toEqual([DIR, BG])
  })

  it('names nothing once the label is right, so the relabel happens once', async () => {
    entry(DIR, VERB_LABEL, EXE, '%1')
    entry(BG, VERB_LABEL, EXE, '%V')
    expect(await staleLabelKeys(EXE)).toEqual([])
  })

  it('names nothing when the entry is OFF: absent keys are never stale', async () => {
    expect(await staleLabelKeys(EXE)).toEqual([])
  })

  it('never names a key that points at some other copy of the app', async () => {
    // A build folder, or a second install: that row is not ours to rename.
    entry(DIR, 'Open in Prism Terminal', 'D:\\builds\\PrismTerminal.exe', '%1')
    entry(BG, 'Open Prism Terminal here', EXE, '%V')
    expect(await staleLabelKeys(EXE)).toEqual([BG])
  })

  it('judges each key on its own: one missing key does not invent the other', async () => {
    entry(DIR, 'Open in Prism Terminal', EXE, '%1')
    expect(await staleLabelKeys(EXE)).toEqual([DIR])
  })
})

describe('the relabel itself', () => {
  it('rewrites the label and nothing else, and the entry then reads as current', async () => {
    entry(DIR, 'Open in Prism Terminal', EXE, '%1')
    entry(BG, 'Open Prism Terminal here', EXE, '%V')
    expect(await relabelVerb(await staleLabelKeys(EXE))).toBe(true)
    expect(fake.adds).toHaveLength(2)
    for (const a of fake.adds) {
      expect(a).toContain('/ve')
      expect(a).toContain(VERB_LABEL)
      expect(a).not.toContain('Icon')
      expect(a[1].endsWith('\\command')).toBe(false)
    }
    // The command the older build wrote is untouched.
    expect(fake.values.get(`${BG}\\command`)).toBe(`"${EXE}" "%V"`)
    expect(await staleLabelKeys(EXE)).toEqual([])
  })

  it('refuses a key that is not one of the two it owns', async () => {
    expect(await relabelVerb(['HKCU\\Software\\Classes\\Directory\\shell\\OpenWithPrism'])).toBe(
      false
    )
    expect(fake.adds).toHaveLength(0)
  })
})
