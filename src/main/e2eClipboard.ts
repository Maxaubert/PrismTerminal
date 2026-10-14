import type { Clipboard, NativeImage } from 'electron'

/**
 * UNDER --e2e THE CLIPBOARD IS A STAND-IN, IN MEMORY (#183; found 2026-10-11
 * tracing the owner's "paste is completely broken": a test run had replaced
 * the screenshot on the clipboard). Scenarios copy and paste for real, and
 * every write landed on the owner's own Windows clipboard; the ones that put
 * it back restored text, html, rtf and an image at best, never copied files.
 *
 * So under --e2e the methods of Electron's own `clipboard` object are swapped
 * for this store: the app's main-side reads and writes (the paste rule, the
 * copy channels, OSC 52) and every scenario's `app.evaluate(({ clipboard })
 * => ...)` reach the same object and so the same store, and nothing reaches
 * Windows. The page's own `navigator.clipboard` would still go to Windows, so
 * under --e2e the page is refused it (index.ts) and its copy falls back to
 * main's channel, as it already does whenever the page is refused.
 *
 * Only what the app and the scenarios use: text, html, rtf, an image, raw
 * buffers by format (FileNameW, copied files), and the format list Windows
 * would report for them.
 */
export interface ClipStore {
  text: string
  html: string
  rtf: string
  image: NativeImage | null
  buffers: Map<string, Buffer>
}

export function stubClipboard(clipboard: Clipboard, emptyImage: () => NativeImage): ClipStore {
  const s: ClipStore = { text: '', html: '', rtf: '', image: null, buffers: new Map() }
  const clear = (): void => {
    s.text = ''
    s.html = ''
    s.rtf = ''
    s.image = null
    s.buffers.clear()
  }
  // A write replaces what was there, as a copy on Windows does; `write` with
  // several formats sets them together.
  const put = (data: { text?: string; html?: string; rtf?: string; image?: NativeImage }): void => {
    clear()
    if (data.text !== undefined) s.text = data.text
    if (data.html !== undefined) s.html = data.html
    if (data.rtf !== undefined) s.rtf = data.rtf
    if (data.image && !data.image.isEmpty()) s.image = data.image
  }
  const formats = (): string[] => [
    ...(s.text ? ['text/plain'] : []),
    ...(s.html ? ['text/html'] : []),
    ...(s.rtf ? ['text/rtf'] : []),
    ...(s.image ? ['image/png'] : []),
    ...s.buffers.keys()
  ]
  const swap: Partial<Clipboard> = {
    readText: () => s.text,
    writeText: (text: string) => put({ text }),
    readHTML: () => s.html,
    writeHTML: (html: string) => put({ html }),
    readRTF: () => s.rtf,
    writeRTF: (rtf: string) => put({ rtf }),
    readImage: () => s.image ?? emptyImage(),
    writeImage: (image: NativeImage) => put({ image }),
    write: (data) => put(data),
    availableFormats: () => formats(),
    has: (format: string) => formats().includes(format),
    readBuffer: (format: string) => s.buffers.get(format) ?? Buffer.alloc(0),
    writeBuffer: (format: string, buffer: Buffer) => {
      clear()
      s.buffers.set(format, buffer)
    },
    clear
  }
  Object.assign(clipboard, swap)
  return s
}
