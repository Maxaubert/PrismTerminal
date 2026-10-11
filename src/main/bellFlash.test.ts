import { describe, expect, it } from 'vitest'
import { bellFlash, wantsFlash, type FlashWindow } from './bellFlash'

// THE BELL FLASHES THE TASKBAR ONLY WHILE THE WINDOW IS NOT FOCUSED (#177,
// decided under the owner's delegation): a bell while focused is most often
// the user's own bad key (PSReadLine rings on one), and no sound, ever.

function fakeWindow(focused: boolean): FlashWindow & { flashes: boolean[]; focus(): void; focusHandlers: number } {
  const handlers: Array<() => void> = []
  const w = {
    flashes: [] as boolean[],
    focused,
    get focusHandlers(): number {
      return handlers.length
    },
    isFocused: () => w.focused,
    isDestroyed: () => false,
    flashFrame: (on: boolean) => {
      w.flashes.push(on)
    },
    on: (_event: 'focus', fn: () => void) => {
      handlers.push(fn)
    },
    focus: () => {
      w.focused = true
      handlers.forEach((h) => h())
    }
  }
  return w
}

describe('wantsFlash', () => {
  it('flashes only when the window is not focused', () => {
    expect(wantsFlash(false)).toBe(true)
    expect(wantsFlash(true)).toBe(false)
  })
})

describe('bellFlash', () => {
  it('flashes an unfocused window, and stops when it gains the focus', () => {
    const w = fakeWindow(false)
    bellFlash(w)
    expect(w.flashes).toEqual([true])
    w.focus()
    expect(w.flashes).toEqual([true, false])
  })

  it('does nothing to a focused window', () => {
    const w = fakeWindow(true)
    bellFlash(w)
    expect(w.flashes).toEqual([])
  })

  it('registers its focus handler once, however many bells ring', () => {
    const w = fakeWindow(false)
    bellFlash(w)
    bellFlash(w)
    bellFlash(w)
    expect(w.focusHandlers).toBe(1)
  })

  it('does nothing without a window', () => {
    expect(() => bellFlash(null)).not.toThrow()
  })
})
