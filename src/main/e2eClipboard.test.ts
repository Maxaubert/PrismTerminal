import { describe, expect, it } from 'vitest'
import type { Clipboard, NativeImage } from 'electron'
import { stubClipboard } from './e2eClipboard'

// A clipboard whose every method would reach Windows: after the swap, none of
// these may ever be called (#183).
function realOne(): { cb: Clipboard; touched: string[] } {
  const touched: string[] = []
  const names = ['readText', 'writeText', 'readHTML', 'writeHTML', 'readRTF', 'writeRTF', 'readImage', 'writeImage', 'write', 'availableFormats', 'has', 'readBuffer', 'writeBuffer', 'clear']
  const cb = Object.fromEntries(names.map((n) => [n, () => touched.push(n)])) as unknown as Clipboard
  return { cb, touched }
}
const image = (empty: boolean): NativeImage => ({ isEmpty: () => empty }) as unknown as NativeImage

describe('the e2e clipboard stand-in', () => {
  it('answers every read and write from memory, never from Windows', () => {
    const { cb, touched } = realOne()
    stubClipboard(cb, () => image(true))
    cb.writeText('HELD-52')
    expect(cb.readText()).toBe('HELD-52')
    expect(cb.availableFormats()).toEqual(['text/plain'])
    cb.writeImage(image(false))
    expect(cb.readText()).toBe('')
    expect(cb.readImage().isEmpty()).toBe(false)
    expect(cb.availableFormats()).toEqual(['image/png'])
    cb.write({ text: 'a', html: '<b>a</b>' })
    expect(cb.availableFormats()).toEqual(['text/plain', 'text/html'])
    expect(cb.readImage().isEmpty()).toBe(true)
    cb.writeBuffer('FileNameW', Buffer.from('C:\\a.txt\0', 'ucs2'))
    expect(cb.has('FileNameW')).toBe(true)
    expect(cb.readBuffer('FileNameW').toString('ucs2')).toBe('C:\\a.txt\0')
    cb.clear()
    expect(cb.availableFormats()).toEqual([])
    expect(touched).toEqual([])
  })
})
