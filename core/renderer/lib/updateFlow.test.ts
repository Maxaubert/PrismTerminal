import { describe, expect, it } from 'vitest'
import type { UpdateInfo } from '../../shared/updateTypes'
import { INSTALL_FAILED, NO_UPDATE, PREVIEW_DONE, updateFlow, type UpdateFlow } from './updateFlow'

const REAL: UpdateInfo = {
  version: '0.5.0',
  url: 'https://github.com/o/r/releases/download/v0.5.0/a.exe',
  notes: '* x'
}
const MOCK: UpdateInfo = { version: '0.5.0', url: '', notes: '* x', mock: true }

const run = (from: UpdateFlow, ...actions: Parameters<typeof updateFlow>[1][]): UpdateFlow =>
  actions.reduce(updateFlow, from)
const offered = (info: UpdateInfo = REAL): UpdateFlow => run(NO_UPDATE, { type: 'available', info })

describe('updateFlow: the offer and its window', () => {
  it('starts with nothing: no chip, no window', () => {
    expect(NO_UPDATE).toEqual({ info: null, phase: 'idle', pct: 0, open: false, notice: null })
  })

  it('an offer shows the chip and does NOT open the window by itself', () => {
    const s = offered()
    expect(s.info).toEqual(REAL)
    expect(s.open).toBe(false)
  })

  it('a click opens the window; Cancel closes it and changes nothing else', () => {
    const open = run(offered(), { type: 'open' })
    expect(open.open).toBe(true)
    expect(run(open, { type: 'cancel' })).toEqual(offered())
  })

  it('cannot open a window about nothing', () => {
    expect(run(NO_UPDATE, { type: 'open' }).open).toBe(false)
  })

  it('takes a newer offer while idle, the window staying as it was', () => {
    const newer = { ...REAL, version: '0.6.0' }
    const s = run(offered(), { type: 'open' }, { type: 'available', info: newer })
    expect(s.info).toEqual(newer)
    expect(s.open).toBe(true)
  })
})

describe('updateFlow: installing', () => {
  it('Install closes the window and the chip starts from 0', () => {
    const s = run(offered(), { type: 'open' }, { type: 'install' })
    expect(s).toMatchObject({ open: false, phase: 'downloading', pct: 0, notice: null })
  })

  it('progress fills the chip, and 100 is "installing"', () => {
    const s = run(offered(), { type: 'install' }, { type: 'progress', pct: 42 })
    expect(s).toMatchObject({ phase: 'downloading', pct: 42 })
    expect(run(s, { type: 'progress', pct: 100 })).toMatchObject({ phase: 'installing', pct: 100 })
  })

  it('reads a percentage defensively', () => {
    const s = run(offered(), { type: 'install' })
    expect(run(s, { type: 'progress', pct: 250 }).pct).toBe(100)
    expect(run(s, { type: 'progress', pct: -5 }).pct).toBe(0)
    expect(run(s, { type: 'progress', pct: Number.NaN }).pct).toBe(0)
    expect(run(s, { type: 'progress', pct: 41.6 }).pct).toBe(42)
  })

  it('never runs the bar backwards', () => {
    const s = run(
      offered(),
      { type: 'install' },
      { type: 'progress', pct: 60 },
      { type: 'progress', pct: 30 }
    )
    expect(s.pct).toBe(60)
  })

  it('ignores progress nobody asked for', () => {
    expect(run(offered(), { type: 'progress', pct: 50 })).toEqual(offered())
  })

  it('cannot be opened, or started twice, while it runs', () => {
    const s = run(offered(), { type: 'install' }, { type: 'progress', pct: 10 })
    expect(run(s, { type: 'open' })).toEqual(s)
    expect(run(s, { type: 'install' })).toEqual(s)
  })

  it('holds the offer it is installing: a newer one waits for the next launch', () => {
    const s = run(
      offered(),
      { type: 'install' },
      { type: 'available', info: { ...REAL, version: '9.9.9' } }
    )
    expect(s.info).toEqual(REAL)
  })

  it('cannot install nothing', () => {
    expect(run(NO_UPDATE, { type: 'install' })).toEqual(NO_UPDATE)
  })
})

describe('updateFlow: how an install ends', () => {
  it('a success changes nothing: the app is quitting under the installer', () => {
    const s = run(offered(), { type: 'install' }, { type: 'progress', pct: 100 })
    expect(run(s, { type: 'settled', ok: true })).toEqual(s)
  })

  it('a failure goes back to idle and says so', () => {
    const s = run(
      offered(),
      { type: 'install' },
      { type: 'progress', pct: 30 },
      { type: 'settled', ok: false }
    )
    expect(s).toMatchObject({
      phase: 'idle',
      pct: 0,
      open: false,
      notice: INSTALL_FAILED,
      info: REAL
    })
  })

  it('a preview goes back to idle and says it was one', () => {
    const s = run(
      offered(MOCK),
      { type: 'install' },
      { type: 'progress', pct: 100 },
      { type: 'settled', ok: false }
    )
    expect(s).toMatchObject({ phase: 'idle', pct: 0, notice: PREVIEW_DONE })
    expect(PREVIEW_DONE).toBe('Preview only: nothing was installed')
  })

  it('the line goes when dismissed, and when the window is opened again', () => {
    const s = run(offered(MOCK), { type: 'install' }, { type: 'settled', ok: false })
    expect(run(s, { type: 'dismiss' }).notice).toBeNull()
    expect(run(s, { type: 'open' })).toMatchObject({ notice: null, open: true })
  })

  it('can be run again afterwards, which is what a preview is for', () => {
    const s = run(
      offered(MOCK),
      { type: 'install' },
      { type: 'settled', ok: false },
      { type: 'open' },
      { type: 'install' }
    )
    expect(s).toMatchObject({ phase: 'downloading', pct: 0, notice: null })
  })

  it('ignores an ending with nothing running', () => {
    expect(run(offered(), { type: 'settled', ok: false })).toEqual(offered())
  })
})
