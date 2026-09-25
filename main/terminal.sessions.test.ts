import { beforeEach, describe, expect, it, vi } from 'vitest'

// The session store against FAKE ptys (code review 2026-09-24, #2 and #12): a
// real node-pty would start real shells. Each fake records whether it was
// killed and lets the test fire its exit.
interface FakePty {
  pid: number
  killed: boolean
  exit: () => void
  kill: () => void
  onData: (cb: (d: string) => void) => { dispose: () => void }
  onExit: (cb: () => void) => { dispose: () => void }
  write: () => void
  resize: () => void
}
const made: FakePty[] = []
let gate: Promise<void> = Promise.resolve()

vi.mock('node-pty', () => ({
  spawn: () => {
    const exits: Array<() => void> = []
    const p: FakePty = {
      pid: 1000 + made.length,
      killed: false,
      exit: () => exits.forEach((cb) => cb()),
      kill: () => {
        p.killed = true
        p.exit()
      },
      onData: () => ({ dispose: () => {} }),
      onExit: (cb) => {
        exits.push(cb)
        return { dispose: () => exits.splice(exits.indexOf(cb), 1) }
      },
      write: () => {},
      resize: () => {}
    }
    made.push(p)
    return p
  }
}))

vi.mock('./shells', () => ({
  // The shell list waits on `gate`, standing in for a cold `where` and `wsl`.
  detectShells: async () => {
    await gate
    return [{ id: 'pwsh', name: 'PowerShell 7', exe: 'pwsh.exe', args: [] }]
  },
  shellById: (_id: unknown, list: Array<{ id: string }>) => list[0]
}))

const { killAll, killTerm, livePids, prewarmShell, spawnTerm } = await import('./terminal')
const send = (): void => {}

beforeEach(() => {
  killAll()
  made.length = 0
  gate = Promise.resolve()
})

describe('a tab closed while its shell is starting (#12)', () => {
  it('starts no shell, or kills the one that started, and registers nothing', async () => {
    let open!: () => void
    gate = new Promise((r) => (open = r))
    const spawning = spawnTerm('t1', 'C:\\x', 'pwsh', send)
    killTerm('t1') // the tab closes while the shell list is still being read
    open()
    expect(await spawning).toBe(false)
    expect(made.every((p) => p.killed)).toBe(true)
    expect(livePids().some((s) => s.id === 't1')).toBe(false)
  })

  it('a second spawn for the same id while the first is pending is refused', async () => {
    let open!: () => void
    gate = new Promise((r) => (open = r))
    const first = spawnTerm('t2', 'C:\\x', 'pwsh', send)
    const second = spawnTerm('t2', 'C:\\x', 'pwsh', send)
    open()
    expect(await second).toBe(false)
    expect(await first).toBe(true)
    expect(made).toHaveLength(1)
  })
})

describe('the warm shell (#2)', () => {
  it('closing an adopted tab does not drop the NEXT warm shell for that folder', async () => {
    await prewarmShell('C:\\home', 'pwsh') // W1
    expect(await spawnTerm('tab', 'C:\\home', 'pwsh', send)).toBe(true) // adopts W1
    await prewarmShell('C:\\home', 'pwsh') // W2, same key
    expect(made).toHaveLength(2)
    killTerm('tab') // W1 exits; its old warm handler must not remove W2
    // W2 is still there to adopt: the next tab takes it, no third shell.
    expect(await spawnTerm('next', 'C:\\home', 'pwsh', send)).toBe(true)
    expect(made).toHaveLength(2)
    expect(made[1].killed).toBe(false)
  })
})
