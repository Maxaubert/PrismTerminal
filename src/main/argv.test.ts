import { mkdtempSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { foldersFromArgv, pathsFromArgv, unquoteArg } from './argv'

describe('relative paths and drive roots (code review 2026-09-24, #16 and #17)', () => {
  const base = mkdtempSync(join(tmpdir(), 'prism-argv-base-'))
  mkdirSync(join(base, 'src'))

  it('a relative path is resolved against the folder it was typed in, and comes back absolute', () => {
    expect(foldersFromArgv(['exe', 'src'], [], base)).toEqual([join(base, 'src')])
    expect(foldersFromArgv(['exe', '.'], [], base)).toEqual([base])
  })

  it('a drive root handed over as `C:"` (the escaped quote of "%V") is the root again', () => {
    expect(unquoteArg('C:"')).toBe('C:\\')
    expect(unquoteArg('C:\\Users')).toBe('C:\\Users')
    const root = base.slice(0, 2) // the drive this machine's temp folder is on
    expect(foldersFromArgv(['exe', `${root}"`], [], base)).toEqual([`${root}\\`])
  })
})

/**
 * What the command line asked for.
 *
 * Two bugs live here, and the second one was caused by fixing the first.
 *
 * It used to walk argv BACKWARDS and return at the first hit, so
 * `prism a.jpg b.jpg` showed b.jpg and dropped a.jpg without a word.
 *
 * Walking forwards then opened Electron's OWN ENTRY SCRIPT: unpackaged,
 * argv[1] is `out/main/index.js`, which exists, so Prism opened a second tab
 * called "main" beside the one you asked for. Six e2e scenarios caught it.
 */

const dir = mkdtempSync(join(tmpdir(), 'prism-argv-'))
const a = join(dir, 'a.jpg')
const b = join(dir, 'b.jpg')
const sub = join(dir, 'sub')
writeFileSync(a, 'x')
writeFileSync(b, 'x')
mkdirSync(sub)

describe('reading the command line', () => {
  it('takes every path, in the order they were named', () => {
    expect(pathsFromArgv(['prism.exe', a, b], [])).toEqual([
      { path: a, dir: false },
      { path: b, dir: false }
    ])
  })

  it('skips the app own entry script, wherever it sits', () => {
    // By IDENTITY, not by position: Chromium reorders its own switches, so a
    // second instance arrives with the script AFTER them. The positional
    // version passed at launch and failed on every handoff.
    const own = join(dir, 'index.js')
    writeFileSync(own, 'x')
    expect(pathsFromArgv(['electron.exe', own, a], [own])).toEqual([{ path: a, dir: false }])
    expect(pathsFromArgv(['electron.exe', '--user-data-dir=C:\\x', '--e2e', own, a], [own])).toEqual(
      [{ path: a, dir: false }]
    )
  })

  it('skips switches', () => {
    expect(pathsFromArgv(['prism.exe', '--e2e', '--user-data-dir=C:\\x', a], [])).toEqual([
      { path: a, dir: false }
    ])
  })

  it('says which are folders', () => {
    expect(pathsFromArgv(['prism.exe', sub], [])).toEqual([{ path: sub, dir: true }])
  })

  it('ignores what does not exist', () => {
    expect(pathsFromArgv(['prism.exe', join(dir, 'nope.jpg'), a], [])).toEqual([
      { path: a, dir: false }
    ])
  })

  it('opens a repeated path once', () => {
    expect(pathsFromArgv(['prism.exe', a, a], [])).toEqual([{ path: a, dir: false }])
  })

  it('answers nothing for a bare launch', () => {
    expect(pathsFromArgv(['prism.exe'], [])).toEqual([])
  })
})

describe('foldersFromArgv', () => {
  it('turns a file argument into its folder, once', () => {
    const d = mkdtempSync(join(tmpdir(), 'pt-'))
    const file = join(d, 'a.txt')
    writeFileSync(file, 'x')
    expect(foldersFromArgv(['exe', file, d, '--e2e'], [])).toEqual([d])
  })

  it('keeps two different folders, in the order they were named', () => {
    const one = mkdtempSync(join(tmpdir(), 'pt-'))
    const two = mkdtempSync(join(tmpdir(), 'pt-'))
    expect(foldersFromArgv(['exe', two, one], [])).toEqual([two, one])
  })

  it('answers nothing for a bare launch', () => {
    expect(foldersFromArgv(['exe', '--e2e'], [])).toEqual([])
  })
})
