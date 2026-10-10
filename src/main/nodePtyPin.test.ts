import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// #127/#128 pinned node-pty to 1.2.0-beta.15: 1.1.0's exit threads race on an
// unlocked vector and its prebuild asserts ("Assertion failed! remove_pty_baton"),
// a modal dialog that holds the app open. #130 (an icon PR) put ^1.1.0 back in a
// merge and nothing noticed until the owner saw the dialog again (#159). The
// quit e2e only catches the race sometimes; this catches the pin every run.
const PIN = '1.2.0-beta.15'
const root = join(__dirname, '..', '..')
const json = (f: string): Record<string, any> => JSON.parse(readFileSync(join(root, f), 'utf8'))

describe('node-pty pin (#159)', () => {
  it('package.json asks for exactly the pinned build', () => {
    const pkg = json('package.json')
    expect(pkg.dependencies['node-pty']).toBe(PIN)
    expect(JSON.stringify(pkg)).not.toContain('node-pty@1.1.0')
  })

  // A `^1.1.0` peer matches no prerelease, so Prism's npm refused the pin. It
  // still allows 1.1.0 so Prism's core bump installs before Prism's own pin lands.
  it('the core lets its hosts take the pinned build', () => {
    expect(json('core/package.json').peerDependencies['node-pty'].split(' || ')).toContain(PIN)
  })

  it('the lockfile resolves it', () => {
    expect(json('package-lock.json').packages['node_modules/node-pty'].version).toBe(PIN)
  })
})
