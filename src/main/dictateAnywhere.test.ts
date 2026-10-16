import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ BrowserWindow: class {}, screen: {} }))

import { decideInto, dictationRoute, type SendTab } from './orchestratorSend'
import { folderTail, pickRows } from './dictateAnywhere'

/**
 * Where dictated words go from outside the app (owner, 2026-10-16): to the
 * orchestrator "only if the orchestrator is actually active", else the
 * numbered list of Claude sessions.
 */

const tab = (over: Partial<SendTab>): SendTab => ({
  id: 'p1',
  tab: 't1',
  label: 'Wind',
  cwd: 'C:\\src\\wind',
  agent: 'claude',
  state: null,
  orchestrator: false,
  session: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  ...over
})

describe('dictationRoute', () => {
  it('goes to the orchestrator when it is switched on, promoted and its Claude can take it', () => {
    const lead = tab({ id: 'p0', label: 'Lead', orchestrator: true })
    expect(dictationRoute([lead, tab({})], true)).toEqual({ lead })
  })
  it('lists the sessions when the orchestrator is not ACTIVE: switched off, asking, or no Claude in it', () => {
    const lead = tab({ id: 'p0', label: 'Lead', orchestrator: true })
    for (const [tabs, on] of [
      [[lead, tab({})], false],
      [[{ ...lead, state: 'question' }, tab({})], true],
      [[{ ...lead, agent: null, session: null }, tab({})], true]
    ] as Array<[SendTab[], boolean]>) {
      const r = dictationRoute(tabs, on)
      expect('pick' in r).toBe(true)
    }
  })
  it('lists only tabs with a Claude, the orchestrator first, nine at most', () => {
    const many = Array.from({ length: 12 }, (_, i) => tab({ id: `p${i}`, label: `t${i}` }))
    const r = dictationRoute([tab({ id: 'sh', agent: null, session: null }), ...many, tab({ id: 'L', orchestrator: true, state: 'question' })], true)
    expect('pick' in r && r.pick.map((t) => t.id)).toEqual(['L', 'p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'])
  })
})

describe('pickRows', () => {
  it('numbers the rows and disables a tab that is asking', () => {
    const rows = pickRows([tab({ orchestrator: true }), tab({ id: 'p2', label: 'Web', cwd: 'C:\\a\\b\\web', state: 'question' })])
    expect(rows.map((r) => [r.n, r.label, r.folder, !!r.disabled, r.lead])).toEqual([
      [1, 'Wind', 'src\\wind', false, true],
      [2, 'Web', 'b\\web', true, false]
    ])
  })
  it('shows a folder by its last two parts', () => {
    expect(folderTail('C:\\Users\\me\\code\\api')).toBe('code\\api')
    expect(folderTail('/home/me/api/')).toBe('me\\api')
  })
})

describe('decideInto', () => {
  it('sends to the picked tab only while its Claude can take it', () => {
    expect(decideInto('p1', [tab({})])).toMatchObject({ ok: true })
    expect(decideInto('gone', [tab({})])).toEqual({ ok: false, reason: 'that tab has closed' })
    expect(decideInto('p1', [tab({ state: 'question' })])).toMatchObject({ ok: false })
    expect(decideInto('p1', [tab({ agent: null, session: null })])).toMatchObject({ ok: false })
  })
})
