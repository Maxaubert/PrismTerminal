import { describe, expect, it } from 'vitest'
import { addArgs, pointsAt, queryArgs, removeArgs, shouldWriteVerb, verbKeys, verbSpec } from './shellVerb'

const EXE = 'C:\\Users\\Admin\\AppData\\Local\\Programs\\Prism Terminal\\PrismTerminal.exe'

describe('the Explorer verb', () => {
  it('is written per USER, never machine-wide', () => {
    // HKLM would need elevation, and Prism installs per user.
    for (const k of verbKeys()) expect(k.startsWith('HKCU\\'), k).toBe(true)
  })

  it('covers folders and the empty space inside a folder, and NOT files', () => {
    // A terminal opens folders: a verb under `*` would sit on every file's menu.
    expect(verbKeys()).toHaveLength(2)
    expect(verbKeys().some((k) => k.includes('\\*\\'))).toBe(false)
    expect(verbKeys().some((k) => k.includes('\\Directory\\shell\\'))).toBe(true)
    expect(verbKeys().some((k) => k.includes('\\Directory\\Background\\shell\\'))).toBe(true)
  })

  it('uses its own key name, so it never writes over the verb Prism itself owns', () => {
    for (const k of verbKeys()) {
      expect(k.endsWith('\\PrismTerminal'), k).toBe(true)
      expect(k).not.toContain('OpenWithPrism')
    }
  })

  it('gives the background verb %V, not %1', () => {
    // %1 is empty on a background click: the verb would launch Prism with no
    // path at all, which is exactly the "nothing happens" this fixes.
    const bg = verbKeys().find((k) => k.includes('Background'))!
    expect(verbSpec(bg)).toEqual({ label: 'Open Prism Terminal here', arg: '%V' })
    expect(verbSpec(verbKeys()[0])).toEqual({ label: 'Open in Prism Terminal', arg: '%1' })
  })

  it('says where you land, on the verb that lands you somewhere else', () => {
    const flat = addArgs(EXE).map((a) => a.join(' ')).join('\n')
    expect(flat).toContain('Open Prism Terminal here')
  })

  it('quotes the path inside the command, so a folder with spaces survives', () => {
    const cmd = addArgs(EXE).find((a) => a[1].endsWith('\\command'))
    expect(cmd?.[cmd.length - 2]).toBe(`"${EXE}" "%1"`)
  })

  it('names the menu item and gives it the app icon', () => {
    const flat = addArgs(EXE).map((a) => a.join(' ')).join('\n')
    expect(flat).toContain('Open in Prism Terminal')
    expect(flat).toContain(`${EXE},0`)
  })

  it('forces every write, so a stale verb is replaced rather than refused', () => {
    for (const a of addArgs(EXE)) expect(a, a.join(' ')).toContain('/f')
    for (const a of removeArgs()) expect(a).toContain('/f')
  })

  it('passes the path as an argument, never as a command line', () => {
    // reg.exe is given argv; nothing is ever concatenated into a shell string.
    const weird = 'C:\\Program Files\\A "quoted" & piped\\PrismTerminal.exe'
    const cmd = addArgs(weird).find((a) => a[1].endsWith('\\command'))
    expect(cmd?.[cmd.length - 2]).toContain(weird)
  })

  it('carries the reg verb itself, so a caller cannot leave it out', () => {
    // It was left out once: every write succeeded and the switch still read
    // as off, because `reg <key> /ve` is not a query.
    expect(queryArgs()[0]).toBe('query')
    expect(addArgs(EXE).every((a) => a[0] === 'add')).toBe(true)
    expect(removeArgs().every((a) => a[0] === 'delete')).toBe(true)
  })

  it('asks about the folder verb when checking, and asks for its default value', () => {
    expect(queryArgs()[1]).toContain('\\Directory\\shell\\PrismTerminal\\command')
    expect(queryArgs()).toContain('/ve')
  })
})

describe('reading what Windows says back', () => {
  const output = `
HKEY_CURRENT_USER\\Software\\Classes\\Directory\\shell\\PrismTerminal\\command
    (Default)    REG_SZ    "${EXE}" "%1"
`

  it('recognises a verb pointing at this build', () => {
    expect(pointsAt(output, EXE)).toBe(true)
  })

  it('is case-insensitive, as Windows paths are', () => {
    expect(pointsAt(output, EXE.toUpperCase())).toBe(true)
  })

  it('does NOT claim a verb pointing at some other copy', () => {
    // A build folder, or an install that moved: the switch should read as off
    // so turning it on repoints it here.
    expect(pointsAt(output, 'D:\\builds\\PrismTerminal\\PrismTerminal.exe')).toBe(false)
  })

  it('reads an empty answer as absent', () => {
    expect(pointsAt('', EXE)).toBe(false)
  })
})

// The uninstaller parity (every key written here is one the NSIS macro deletes)
// lives in shellVerbParity.test.ts, beside the installer it reads.

describe('the verb survives an upgrade', () => {
  /**
   * Every upgrade dropped it and it had to be switched on by hand. The
   * uninstaller runs as part of an upgrade and deletes the two keys - which
   * is right for a real uninstall - while userData survives, so a marker
   * reading "the default has been applied" said done over a registry that was
   * empty. The fact worth storing is the NO, not the yes.
   */
  it('puts an absent verb back when nobody said no', () => {
    expect(shouldWriteVerb(false, false)).toBe(true)
  })

  it('leaves a working verb alone', () => {
    expect(shouldWriteVerb(false, true)).toBe(false)
  })

  it('never argues with a deliberate off, even with the keys gone', () => {
    // The rule the old marker existed to enforce, and the one that matters: a
    // default that reapplies itself makes the switch a setting that lies.
    expect(shouldWriteVerb(true, false)).toBe(false)
    expect(shouldWriteVerb(true, true)).toBe(false)
  })
})
