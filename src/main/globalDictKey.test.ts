import { execFileSync } from 'child_process'
import { join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { DEFAULT_HOTKEY, type Hotkey } from '@core/renderer/lib/dictationKey'
import { createKeyFeed, keysFor, masksStart, parseHelperLine, startKeyHelper, type HelperLine, type KeyHelper } from './globalDictKey'
import { appHelperSend, configureAppHelper, stopAppHelper } from './appHelper'

/**
 * The dictation key from any app (owner, 2026-10-16): the helper's lines turned
 * into the reducer's events, so Ctrl+Win behaves as it does in the app.
 */

const F9: Hotkey = { code: 'F9', ctrl: false, alt: false, shift: false, meta: false }

describe('keysFor', () => {
  it('watches both sides of each modifier of Ctrl+Win, and masks Start for it', () => {
    expect(keysFor(DEFAULT_HOTKEY)).toEqual([0x5b, 0x5c, 0xa2, 0xa3])
    expect(masksStart(DEFAULT_HOTKEY)).toBe(true)
  })
  it('watches a plain key alone, and a chord with its modifiers', () => {
    expect(keysFor(F9)).toEqual([0x78])
    expect(masksStart(F9)).toBe(false)
    expect(keysFor({ code: 'KeyD', ctrl: true, alt: false, shift: true, meta: false })).toEqual([0x44, 0xa0, 0xa1, 0xa2, 0xa3])
    expect(keysFor({ code: 'AltRight', ctrl: false, alt: false, shift: false, meta: false })).toEqual([0xa5])
  })
})

describe('parseHelperLine', () => {
  it('reads keys, another key, digits and Esc, and nothing else', () => {
    expect(parseHelperLine('d 5B')).toEqual({ kind: 'key', type: 'down', code: 'MetaLeft' })
    expect(parseHelperLine('u A2\r')).toEqual({ kind: 'key', type: 'up', code: 'ControlLeft' })
    expect(parseHelperLine('o')).toEqual({ kind: 'other' })
    expect(parseHelperLine('p 3')).toEqual({ kind: 'digit', n: 3 })
    expect(parseHelperLine('x')).toEqual({ kind: 'esc' })
    expect(parseHelperLine('p 0')).toBeNull()
    expect(parseHelperLine('d ZZ')).toBeNull()
    expect(parseHelperLine('d 5B f 4242')).toEqual({ kind: 'key', type: 'down', code: 'MetaLeft', front: 4242 })
    expect(parseHelperLine('d 5B f')).toBeNull()
    expect(parseHelperLine('waiting')).toEqual({ kind: 'waiting' })
    expect(parseHelperLine('hello')).toBeNull()
  })
})

describe('createKeyFeed', () => {
  const key = (type: 'down' | 'up', code: string): HelperLine => ({ kind: 'key', type, code })
  it('starts a hold of Ctrl+Win after the solo wait and stops on release', () => {
    const f = createKeyFeed(() => ({ hotkey: DEFAULT_HOTKEY, mode: 'hold' }))
    expect(f.feed(key('down', 'ControlLeft'), 0)).toBeNull()
    expect(f.feed(key('down', 'MetaLeft'), 10)).toBeNull()
    expect(f.arming()).toBe(true)
    expect(f.tick(220)).toBe('start')
    expect(f.feed(key('up', 'MetaLeft'), 900)).toBe('stop')
  })
  it('lets Ctrl+Win+Left switch desktops: another key while it decides is no dictation', () => {
    const f = createKeyFeed(() => ({ hotkey: DEFAULT_HOTKEY, mode: 'hold' }))
    f.feed(key('down', 'ControlLeft'), 0)
    f.feed(key('down', 'MetaLeft'), 10)
    expect(f.feed({ kind: 'other' }, 50)).toBeNull()
    expect(f.tick(220)).toBeNull()
  })
  it('cancels a recording on Esc', () => {
    const f = createKeyFeed(() => ({ hotkey: F9, mode: 'toggle' }))
    expect(f.feed(key('down', 'F9'), 0)).toBe('start')
    f.feed(key('up', 'F9'), 50)
    expect(f.feed({ kind: 'esc' }, 400)).toBe('cancel')
  })
})

// The real helper, on a key no application uses (F24): what it reports, how
// fast. Nothing is typed anywhere. Since 2026-10-17 it is the app's one helper
// (it sets the DWM attributes too), and the hook is turned on and off in it.
describe.runIf(process.platform === 'win32')('the hook helper', () => {
  afterAll(() => stopAppHelper())
  const started = (lines: HelperLine[]): Promise<KeyHelper> =>
    new Promise((res) => {
      const h: KeyHelper = startKeyHelper((l) => {
        lines.push(l)
        if (l.kind === 'ready') res(h)
      })
    })
  it('reports the binding key down and up, and stops when told', async () => {
    configureAppHelper(join(__dirname, 'hook', 'appHelper.ps1'), null)
    const lines: HelperLine[] = []
    const h = await started(lines)
    // A DWM line on a window that does not exist: answered, nothing breaks.
    appHelperSend('dwm 0 34 -1')
    h.send('keys 87')
    await new Promise((r) => setTimeout(r, 200))
    execFileSync('powershell.exe', ['-NoProfile', '-Command', TAP_F24], { windowsHide: true })
    await new Promise((r) => setTimeout(r, 400))
    h.stop()
    // `front` says whether a Prism Terminal window is in front, which depends on
    // where the suite runs from: not this test's business.
    expect(lines.filter((l) => l.kind !== 'ready').map((l) => (l.kind === 'key' ? { kind: l.kind, type: l.type, code: l.code } : l))).toEqual([
      { kind: 'key', type: 'down', code: 'F24' },
      { kind: 'key', type: 'up', code: 'F24' }
    ])
  }, 30_000)

  it('hooks again in the same helper after it was turned off (the lock was let go)', async () => {
    const lines: HelperLine[] = []
    const h = await started(lines)
    expect(lines).toEqual([{ kind: 'ready' }])
    h.stop()
  }, 30_000)
})

const TAP_F24 =
  "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public static class T{[StructLayout(LayoutKind.Sequential)]struct K{public ushort v;public ushort s;public uint f;public uint t;public IntPtr e;}[StructLayout(LayoutKind.Explicit,Size=40)]struct I{[FieldOffset(0)]public uint y;[FieldOffset(8)]public K k;}[DllImport(\"user32.dll\")]static extern uint SendInput(uint n,I[] i,int s);public static void Tap(){var a=new I[2];a[0].y=1;a[0].k.v=0x87;a[1].y=1;a[1].k.v=0x87;a[1].k.f=2;SendInput(2,a,Marshal.SizeOf(typeof(I)));}}'; [T]::Tap()"
