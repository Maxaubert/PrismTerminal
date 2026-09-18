import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { verbKeys } from './shellVerb'

// The app writes the Explorer verbs itself, so only the uninstaller can remove
// them. Prism's uninstaller once deleted none of its keys and nothing noticed;
// this is the thing that notices.
describe('uninstaller parity', () => {
  const nsh = readFileSync(join(__dirname, '../../build/installer.nsh'), 'utf8')

  it('deletes every key the app writes', () => {
    expect(verbKeys().length).toBeGreaterThan(0)
    for (const key of verbKeys()) {
      const sub = key.slice('HKCU\\'.length)
      expect(nsh).toContain(`DeleteRegKey HKCU "${sub}"`)
    }
  })

  it('does it inside customUnInstall, the macro the uninstaller runs', () => {
    const body = nsh.slice(nsh.indexOf('!macro customUnInstall'))
    expect(body).toContain('DeleteRegKey')
  })
})
