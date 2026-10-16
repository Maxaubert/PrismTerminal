import { mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'

/**
 * Perf review 2026-10-16: the async save's rename ran synchronously on main.
 * It now runs on the threadpool, and a `saveNow` made while it is on its way
 * must still be what the file holds afterwards. The rename is held here until
 * the test lets it go, to make that window as wide as a starved disk does.
 */
const gate = vi.hoisted(() => ({ hold: false, held: [] as Array<() => void>, calls: 0 }))

vi.mock('fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('fs/promises')>()
  return {
    ...real,
    rename: async (from: string, to: string): Promise<void> => {
      gate.calls += 1
      if (gate.hold) await new Promise<void>((resolve) => gate.held.push(resolve))
      return real.rename(from, to)
    }
  }
})

const { createAtomicWriter } = await import('./atomicWrite')

describe('createAtomicWriter: the rename is off main too', () => {
  it('a save renames on the threadpool, and a saveNow made during that rename is what stays', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'pt-atomic-')), 'tabs.json')
    const w = createAtomicWriter(file)
    gate.hold = true
    w.save('{"old":true}')
    await vi.waitFor(() => expect(gate.held).toHaveLength(1), { timeout: 2000 })
    expect(gate.calls).toBe(1)
    w.saveNow('{"close":true}')
    expect(readFileSync(file, 'utf8')).toBe('{"close":true}')
    // The older rename lands now, over the close's file ...
    gate.hold = false
    gate.held.shift()?.()
    await w.idle()
    // ... and the close's data is put back at once.
    expect(readFileSync(file, 'utf8')).toBe('{"close":true}')
  })
})
