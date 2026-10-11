/**
 * THE BELL (#177; decided under the owner's delegation, spec decision 1): a
 * bell flashes the taskbar button while the window is NOT focused, does
 * nothing while it is, and never makes a sound. A bell while unfocused cannot
 * be the user's own bad keystroke (PSReadLine rings on one), and a flash is
 * what Windows Terminal does; a sound in a tool the owner hears through screen
 * narration would be noise. The page already lets at most one bell a second
 * per tab through (core `bellGate`).
 */

/** The slice of a BrowserWindow this needs. */
export interface FlashWindow {
  isFocused(): boolean
  isDestroyed(): boolean
  flashFrame(flag: boolean): void
  on(event: 'focus', listener: () => void): unknown
}

/** A bell flashes only an unfocused window. */
export function wantsFlash(focused: boolean): boolean {
  return !focused
}

// The windows whose focus already stops the flash: one handler per window,
// however many bells ring.
const stopsOnFocus = new WeakSet<FlashWindow>()

/** Flash `win`'s taskbar button if it is not focused; the flash stops when it
 *  gains the focus (Windows keeps flashing until told otherwise). */
export function bellFlash(win: FlashWindow | null): void {
  if (!win || win.isDestroyed() || !wantsFlash(win.isFocused())) return
  if (!stopsOnFocus.has(win)) {
    stopsOnFocus.add(win)
    win.on('focus', () => {
      if (!win.isDestroyed()) win.flashFrame(false)
    })
  }
  win.flashFrame(true)
}
