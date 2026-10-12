import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// A test-only channel never exists in a real run (audit 2026-10-12:
// `e2e:reg-writes` was registered in production builds too). Every
// `ipcMain.handle(E2E_CH....)` in main sits behind `if (E2E)` on its own line.
describe('e2e channels', () => {
  it('are registered only under --e2e', () => {
    const src = readFileSync(join(__dirname, 'index.ts'), 'utf8')
    const lines = src.split(/\r?\n/).filter((l) => /ipcMain\.(handle|on)\(\s*E2E_CH\./.test(l))
    expect(lines.length).toBeGreaterThan(0)
    for (const l of lines) expect(l.trim(), l).toMatch(/^if \(E2E\) ipcMain\./)
  })
})
