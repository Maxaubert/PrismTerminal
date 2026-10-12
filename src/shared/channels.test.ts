import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { APP_CH, E2E_CH } from './channels'

// BOTH ENDS OF EVERY CHANNEL READ THE TABLE (audit 2026-10-12). A channel
// only one side names is a call that hangs or a message nobody hears.
const main = readFileSync(join(__dirname, '..', 'main', 'index.ts'), 'utf8')
const preload = readFileSync(join(__dirname, '..', 'preload', 'index.ts'), 'utf8')

describe('the app channels', () => {
  it('each is named by main and by preload', () => {
    const oneSided = Object.keys(APP_CH).filter(
      (k) => !main.includes(`APP_CH.${k}`) || !preload.includes(`APP_CH.${k}`)
    )
    expect(oneSided).toEqual([])
    const e2eOneSided = Object.keys(E2E_CH).filter(
      (k) => !main.includes(`E2E_CH.${k}`) || !preload.includes(`E2E_CH.${k}`)
    )
    expect(e2eOneSided).toEqual([])
  })
  it('no channel is typed as a string beside the table', () => {
    const names = [...Object.values(APP_CH), ...Object.values(E2E_CH)]
    const typed = names.filter((n) => main.includes(`'${n}'`) || preload.includes(`'${n}'`))
    expect(typed).toEqual([])
  })
  it('none is spelled twice', () => {
    const names = [...Object.values(APP_CH), ...Object.values(E2E_CH)]
    expect(new Set(names).size).toBe(names.length)
  })
})
