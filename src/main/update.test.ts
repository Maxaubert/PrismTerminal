import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getVersion: () => '0.7.0', isPackaged: false } }))

const { newerVersion, isReleaseAssetUrl, isInstallerName } = await import('./update')

describe('newerVersion', () => {
  it('orders plain x.y.z triples', () => {
    expect(newerVersion('0.7.1', '0.7.0')).toBe(true)
    expect(newerVersion('0.8.0', '0.7.9')).toBe(true)
    expect(newerVersion('1.0.0', '0.9.9')).toBe(true)
    expect(newerVersion('0.7.0', '0.7.0')).toBe(false)
    expect(newerVersion('0.6.9', '0.7.0')).toBe(false)
  })
  it('accepts a v prefix, the way tags are spelled', () => {
    expect(newerVersion('v0.7.1', '0.7.0')).toBe(true)
    expect(newerVersion('v0.7.0', 'v0.7.0')).toBe(false)
  })
  it('never lets a malformed tag claim to be an upgrade', () => {
    expect(newerVersion('nightly', '0.7.0')).toBe(false)
    expect(newerVersion('', '0.7.0')).toBe(false)
  })
})

describe('isReleaseAssetUrl', () => {
  it("accepts only this repo's release installers", () => {
    expect(
      isReleaseAssetUrl('https://github.com/Maxaubert/PrismTerminal/releases/download/v0.7.1/PrismTerminal-Setup-x64-0.7.1.exe')
    ).toBe(true)
    expect(isReleaseAssetUrl('https://github.com/evil/repo/releases/download/v1/x.exe')).toBe(false)
    expect(isReleaseAssetUrl('https://example.com/PrismTerminal-Setup-x64-0.7.1.exe')).toBe(false)
    expect(
      isReleaseAssetUrl('http://github.com/Maxaubert/PrismTerminal/releases/download/v0.7.1/a.exe')
    ).toBe(false)
  })
  it('refuses the sibling app: a Prism installer is not an update to this one', () => {
    // The two repos share an owner and a prefix, which is exactly the pair a
    // loose startsWith would let through.
    expect(
      isReleaseAssetUrl('https://github.com/Maxaubert/Prism/releases/download/v0.7.1/Prism-Setup-x64-0.7.1.exe')
    ).toBe(false)
  })
  it('rejects lookalikes: userinfo tricks, query strings, non-exe payloads', () => {
    expect(
      isReleaseAssetUrl('https://github.com@evil.com/Maxaubert/PrismTerminal/releases/download/v1/a.exe')
    ).toBe(false)
    expect(
      isReleaseAssetUrl('https://github.com/Maxaubert/PrismTerminal/releases/download/v1/a.exe?x=1')
    ).toBe(false)
    expect(
      isReleaseAssetUrl('https://github.com/Maxaubert/PrismTerminal/releases/download/v1/a.msi')
    ).toBe(false)
    expect(isReleaseAssetUrl('not a url')).toBe(false)
  })
})

describe('isInstallerName', () => {
  it("picks this app's installer out of a release's assets", () => {
    expect(isInstallerName('PrismTerminal-Setup-x64-0.1.0.exe')).toBe(true)
    expect(isInstallerName('prismterminal-setup-x64-1.2.3.EXE')).toBe(true)
  })
  it('passes over everything else a release can carry', () => {
    expect(isInstallerName('Prism-Setup-x64-0.50.3.exe')).toBe(false)
    expect(isInstallerName('PrismTerminal-Setup-x64-0.1.0.exe.blockmap')).toBe(false)
    expect(isInstallerName('latest.yml')).toBe(false)
    expect(isInstallerName('')).toBe(false)
  })
})
