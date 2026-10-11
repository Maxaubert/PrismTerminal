import { describe, expect, it } from 'vitest'
import { colorrefOf, DWM_HELPER_SCRIPT, dwmHelperArgs, hwndOf } from './dwmHelper'

describe('the DWM helper arithmetic', () => {
  it('turns a hex colour into a COLORREF with red in the low byte', () => {
    expect(colorrefOf('#ff0000')).toBe(0x0000ff)
    expect(colorrefOf('#0000ff')).toBe(0xff0000)
    expect(colorrefOf('#34373d')).toBe(0x3d3734)
    expect(colorrefOf('c9ccd3')).toBe(0xd3ccc9)
  })

  it('reads a 64-bit handle out of the native buffer, and a 32-bit one', () => {
    const b64 = Buffer.alloc(8)
    b64.writeBigUInt64LE(0x123456789n)
    expect(hwndOf(b64)).toBe(String(0x123456789n))
    const b32 = Buffer.alloc(4)
    b32.writeUInt32LE(0x1234)
    expect(hwndOf(b32)).toBe('4660')
  })
})

describe('the DWM helper launch', () => {
  it('passes its script as plain -Command, never -EncodedCommand (#180)', () => {
    // MEASURED from the packaged app (2026-10-11): Windows Defender held the
    // spawn() of an -EncodedCommand PowerShell for 1.4 s, on main's thread, at
    // every launch; the same script as plain -Command took 10 ms.
    expect(dwmHelperArgs()).toEqual(['-NoProfile', '-NonInteractive', '-Command', DWM_HELPER_SCRIPT])
    expect(dwmHelperArgs().join(' ')).not.toMatch(/-Enc/i)
  })

  it('carries a script that survives being ONE argument', () => {
    // Node escapes a double quote for CreateProcess and -Command reads the
    // result a second time: no double quote and no newline is safe from both.
    expect(DWM_HELPER_SCRIPT).not.toMatch(/["\r\n]/)
    expect(DWM_HELPER_SCRIPT.endsWith('\\')).toBe(false)
    expect(DWM_HELPER_SCRIPT).toContain('DwmSetWindowAttribute')
  })
})
