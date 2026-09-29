import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'
import { isRunnable, openTermPath, pathKinds, resolveTermPath } from './termPathOpen'

const tree = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'pt-paths-'))
  mkdirSync(join(root, 'docs', 'sign-off'), { recursive: true })
  writeFileSync(join(root, 'docs', 'sign-off', 'rapport.pdf'), 'pdf')
  writeFileSync(join(root, 'run.bat'), '@echo off')
  return root
}

describe('resolveTermPath', () => {
  it('resolves against the shell folder, either separator', () => {
    expect(resolveTermPath('C:\\work', 'docs/a.pdf')).toBe('C:\\work\\docs\\a.pdf')
    expect(resolveTermPath('C:\\work', '..\\up.txt')).toBe('C:\\up.txt')
    expect(resolveTermPath('C:\\work', 'D:/x/y.md')).toBe('D:\\x\\y.md')
    expect(resolveTermPath('C:\\work', '\\rooted.txt')).toBe('C:\\rooted.txt')
    expect(resolveTermPath('C:\\work', '~/n.txt', 'C:\\Users\\me')).toBe('C:\\Users\\me\\n.txt')
  })
  it('refuses a network share, a NUL, and a relative path with no folder', () => {
    expect(resolveTermPath('C:\\work', '\\\\server\\share\\a.txt')).toBeNull()
    expect(resolveTermPath('C:\\work', '//server/share/a.txt')).toBeNull()
    expect(resolveTermPath('C:\\work', 'a\0.txt')).toBeNull()
    expect(resolveTermPath('', 'docs/a.pdf')).toBeNull()
    expect(resolveTermPath('relative', 'docs/a.pdf')).toBeNull()
  })
})

describe('pathKinds', () => {
  it('says what exists, a file or a folder, and null for the rest', async () => {
    const root = tree()
    const got = await pathKinds(root, ['docs/sign-off/rapport.pdf', 'docs/sign-off/', 'missing/x.txt', 'and/or'])
    expect(got.map((g) => g?.kind ?? null)).toEqual(['file', 'dir', null, null])
    expect(got[0]?.abs).toBe(join(root, 'docs', 'sign-off', 'rapport.pdf'))
  })
})

describe('openTermPath', () => {
  const openers = () => ({ openPath: vi.fn(), revealPath: vi.fn() })
  it('opens a file and a folder', async () => {
    const root = tree()
    const o = openers()
    expect(await openTermPath(root, 'docs/sign-off/rapport.pdf', 'open', o)).toBe('opened')
    expect(await openTermPath(root, 'docs', 'open', o)).toBe('opened')
    expect(o.openPath).toHaveBeenCalledTimes(2)
    expect(o.revealPath).not.toHaveBeenCalled()
  })
  it('NEVER runs anything: a runnable file is shown in Explorer instead', async () => {
    const root = tree()
    const o = openers()
    expect(await openTermPath(root, 'run.bat', 'open', o)).toBe('revealed')
    expect(o.openPath).not.toHaveBeenCalled()
    expect(o.revealPath).toHaveBeenCalledWith(join(root, 'run.bat'))
  })
  it('reveals when asked, and does nothing for what does not exist', async () => {
    const root = tree()
    const o = openers()
    expect(await openTermPath(root, 'docs/sign-off/rapport.pdf', 'reveal', o)).toBe('revealed')
    expect(await openTermPath(root, 'missing.txt', 'open', o)).toBeNull()
    expect(o.openPath).not.toHaveBeenCalled()
  })
})

describe('isRunnable', () => {
  it('knows programs, scripts, shortcuts and installers, and not documents', () => {
    for (const f of ['a.exe', 'b.BAT', 'c.ps1', 'd.lnk', 'e.msi', 'f.js', 'g.vbs', 'h.py', 'i.url', 'j.reg'])
      expect(isRunnable(f)).toBe(true)
    for (const f of ['a.pdf', 'b.md', 'c.png', 'd.txt', 'e.docx', 'f.ts', 'g.json', 'README']) expect(isRunnable(f)).toBe(false)
  })
})
