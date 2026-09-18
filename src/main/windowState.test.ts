import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '' }, screen: { getAllDisplays: () => [] } }))

const { parseWindowState } = await import('./windowState')

const ONE = [{ x: 0, y: 0, width: 1920, height: 1040 }]
const FALLBACK = { width: 1180, height: 780 }

describe('parseWindowState', () => {
  it('falls back for no file, a broken one, and one written by something else', () => {
    expect(parseWindowState('', ONE)).toEqual(FALLBACK)
    expect(parseWindowState('not json', ONE)).toEqual(FALLBACK)
    expect(parseWindowState('null', ONE)).toEqual(FALLBACK)
    expect(parseWindowState('{"width":"wide","height":700}', ONE)).toEqual(FALLBACK)
  })

  it('brings back size, position and the maximised flag', () => {
    expect(
      parseWindowState('{"width":1400.4,"height":900,"x":100,"y":50.6,"maximised":true}', ONE)
    ).toEqual({ width: 1400, height: 900, x: 100, y: 51, maximised: true })
  })

  it('never opens smaller than a window you can use', () => {
    const s = parseWindowState('{"width":10,"height":10}', ONE)
    expect([s.width, s.height]).toEqual([560, 400])
  })

  it('drops the position of a window on a monitor that is no longer there', () => {
    // Remembered on a second display to the right; only the first is attached.
    const s = parseWindowState('{"width":1200,"height":800,"x":2500,"y":100}', ONE)
    expect(s).toEqual({ width: 1200, height: 800, maximised: false })
  })

  it('keeps a position on a second monitor that IS there, negative coordinates included', () => {
    const left = { x: -1920, y: 0, width: 1920, height: 1040 }
    const s = parseWindowState('{"width":1200,"height":800,"x":-1800,"y":100}', [left, ...ONE])
    expect([s.x, s.y]).toEqual([-1800, 100])
  })
})
