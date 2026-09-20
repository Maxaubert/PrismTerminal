import { describe, expect, it } from 'vitest'
import { CH } from '../shared/channels'
import { CLIPBOARD_WRITE_MAX, registerTermIpc } from './ipc'

// THE ONE WRITE THE PAGE MAY MAKE TO THE CLIPBOARD (#12, the help panel's copy
// buttons). It is text, it is bounded, and an oversized write is REFUSED, not
// trimmed: a trimmed command is a different command.

function wire(): { write: (text: unknown) => unknown; written: string[]; stop: () => void } {
  const handlers = new Map<string, (e: unknown, ...args: unknown[]) => unknown>()
  const written: string[] = []
  const stop = registerTermIpc({
    ipcMain: {
      handle: (channel, listener) => handlers.set(channel, listener),
      on: () => undefined
    },
    send: () => undefined,
    clipboard: {
      availableFormats: () => [],
      readBuffer: () => Buffer.alloc(0),
      readText: () => '',
      writeText: (text) => {
        written.push(text)
      }
    },
    openExternal: () => undefined,
    spawnDir: async () => null,
    mayPrewarm: async () => false,
    mayCd: () => false
  })
  return { write: (text) => handlers.get(CH.clipboardWrite)?.({}, text), written, stop }
}

describe('clipboard:write', () => {
  it('writes the exact text it was handed', () => {
    const w = wire()
    const command = "Get-ChildItem -Recurse -File | Sort-Object Length -Descending | Select-Object -First 20"
    expect(w.write(command)).toBe(true)
    expect(w.written).toEqual([command])
    w.stop()
  })

  it('refuses what is not text, what is empty and what is too long, and writes none of it', () => {
    const w = wire()
    for (const bad of [undefined, null, 7, {}, ['x'], '', 'x'.repeat(CLIPBOARD_WRITE_MAX + 1)]) expect(w.write(bad)).toBe(false)
    expect(w.written).toEqual([])
    expect(w.write('x'.repeat(CLIPBOARD_WRITE_MAX))).toBe(true)
    w.stop()
  })
})
