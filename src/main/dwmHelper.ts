/**
 * ONE PowerShell, compiled once, for every DWM attribute the app sets
 * (2026-09-03). The border and the corner preference used to spawn a fresh
 * powershell.exe per change, and each one paid `Add-Type`'s C# compile - a
 * good two seconds on this machine - so leaving fullscreen showed a window
 * whose edge arrived two seconds after it did (owner). This process is
 * started once, compiles the P/Invoke once, and then reads one line per
 * call from stdin: "<hwnd> <attribute> <value>". A call is a write to a
 * pipe, which is milliseconds. If the helper dies it is restarted on the
 * next call; if PowerShell is missing nothing is thrown, because every
 * attribute here is cosmetic.
 *
 * Attributes: 33 DWMWA_WINDOW_CORNER_PREFERENCE (0 default, 1 do not round),
 * 34 DWMWA_BORDER_COLOR (a COLORREF 0x00BBGGRR, -1 default, -2 none).
 *
 * PLAIN -Command, NEVER -EncodedCommand (#180). Windows Defender inspects an
 * encoded PowerShell inside CreateProcess, and spawn() runs that on main's
 * thread: measured from the packaged app (2026-10-11), 1.4 s at every launch,
 * the window and every IPC call standing still; the same script as plain
 * -Command, 10 ms. So the script is ONE line with no double quote in it (the
 * mediaPause rule): the C# string's quotes are made inside PowerShell.
 *
 * SINCE 2026-10-17 THE APP'S ONE HELPER (`appHelper.ts`, `hook/appHelper.ps1`)
 * does it, beside the dictation key's hook: one PowerShell started with the
 * app instead of two (owner: merge the helpers, for the startup). A line
 * "dwm <hwnd> <attribute> <value>".
 */
import { appHelperSend, stopAppHelper, warmAppHelper } from './appHelper'

/** The HWND as a decimal string, from Electron's native handle buffer. */
export function hwndOf(buf: Buffer): string {
  return (buf.length >= 8 ? buf.readBigUInt64LE(0) : BigInt(buf.readUInt32LE(0))).toString()
}

function send(hwnd: string, attribute: number, value: number): void {
  appHelperSend(`dwm ${hwnd} ${attribute} ${value}`)
}

/** Square or default corners while the window is up. */
export function setCornersRounded(hwnd: string, rounded: boolean): void {
  send(hwnd, 33, rounded ? 0 : 1)
}

/** `'none'` strips the border, `'default'` gives DWM's back, a hex colour
 *  (`#rrggbb`) draws it in that colour - the way to a QUIETER edge, since the
 *  border is always one physical pixel and only its contrast can change. */
export function setBorder(hwnd: string, colour: 'none' | 'default' | `#${string}`): void {
  if (colour === 'none') return send(hwnd, 34, -2)
  if (colour === 'default') return send(hwnd, 34, -1)
  send(hwnd, 34, colorrefOf(colour))
}

/** A CSS hex colour as a Win32 COLORREF, which is 0x00BBGGRR - red in the
 *  LOW byte, the reverse of the hex string. Pure, and tested, because a
 *  swapped channel is a border that is quietly the wrong colour. */
export function colorrefOf(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return (b << 16) | (g << 8) | r
}

/** Warm the helper at startup so the first change is not the compile. */
export function warmDwmHelper(): void {
  warmAppHelper()
}

export function stopDwmHelper(): void {
  stopAppHelper()
}
