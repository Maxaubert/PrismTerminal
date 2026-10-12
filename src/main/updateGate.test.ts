import { describe, expect, it, vi } from 'vitest'
import type { UpdateInfo } from '@shared/types'
import { createUpdateGate } from './updateGate'

const OFFER = { version: '9.9.9', url: 'https://github.com/x/releases/download/v9.9.9/Setup.exe', notes: '' } as UpdateInfo

const gate = (offer: UpdateInfo | null) => {
  const d = {
    offer: () => offer,
    preview: vi.fn(async () => false),
    install: vi.fn(async () => true),
    agree: vi.fn()
  }
  return { d, g: createUpdateGate(d) }
}

// Regression rule 3: main installs only what main offered.
describe('the update gate', () => {
  it('installs the offer it made, handing the installer the close pre-answer', async () => {
    const { d, g } = gate(OFFER)
    expect(await g.install(OFFER.url)).toBe(true)
    expect(d.install).toHaveBeenCalledWith(OFFER.url, expect.any(AbortSignal), d.agree)
    expect(d.agree).not.toHaveBeenCalled() // only the installer, at the quit
  })
  it('refuses any other url, a non-string, and everything with no offer', async () => {
    const { d, g } = gate(OFFER)
    expect(await g.install('https://github.com/x/releases/download/v1.0.0/Setup.exe')).toBe(false)
    expect(await g.install(42)).toBe(false)
    expect(await gate(null).g.install(OFFER.url)).toBe(false)
    expect(d.install).not.toHaveBeenCalled()
  })
  it('a preview downloads nothing, whatever url it is handed', async () => {
    const { d, g } = gate({ ...OFFER, mock: true })
    expect(await g.install(OFFER.url)).toBe(false)
    expect(d.preview).toHaveBeenCalled()
    expect(d.install).not.toHaveBeenCalled()
  })
  it('runs one at a time, and cancel aborts the one running', async () => {
    let release: (v: boolean) => void = () => {}
    let seen: AbortSignal | null = null
    const g = createUpdateGate({
      offer: () => OFFER,
      preview: async () => false,
      install: (_u, signal) => {
        seen = signal
        return new Promise((r) => (release = r))
      },
      agree: () => {}
    })
    const first = g.install(OFFER.url)
    expect(await g.install(OFFER.url)).toBe(false)
    g.cancel()
    expect(seen!.aborted).toBe(true)
    release(false)
    expect(await first).toBe(false)
  })
})
