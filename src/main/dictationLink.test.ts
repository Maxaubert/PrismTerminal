import { describe, expect, it } from 'vitest'
import { copyName, parseToClient, parseToService, startLinkClient, startLinkService } from './dictationLink'
import type { SendTab } from './orchestratorSend'

/**
 * One dictation for every copy of the app (owner, 2026-10-17): the service
 * asks the other copies for their tabs, and sends or pastes into them.
 */

const tab = (over: Partial<SendTab> = {}): SendTab => ({
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

describe('the messages', () => {
  it('reads what a client may say, and nothing else', () => {
    expect(parseToService('{"t":"hello","pid":42,"name":"Stable"}')).toEqual({ t: 'hello', pid: 42, name: 'Stable' })
    expect(parseToService(JSON.stringify({ t: 'tabs', rid: 3, tabs: [tab(), { id: 5 }] }))).toEqual({ t: 'tabs', rid: 3, tabs: [tab()] })
    expect(parseToService(JSON.stringify({ t: 'sent', rid: 4, res: { ok: false, reason: 'asking' } }))).toEqual({ t: 'sent', rid: 4, res: { ok: false, reason: 'asking' } })
    expect(parseToService('{"t":"paste","text":"x"}')).toBeNull()
    expect(parseToService('not json')).toBeNull()
    expect(parseToService('{"t":"hello","pid":-1,"name":"x"}')).toBeNull()
  })
  it('reads what the service may say, and caps the text', () => {
    expect(parseToClient('{"t":"tabs?","rid":1}')).toEqual({ t: 'tabs?', rid: 1 })
    expect(parseToClient('{"t":"paste","text":"hi"}')).toEqual({ t: 'paste', text: 'hi' })
    expect(parseToClient(JSON.stringify({ t: 'send', rid: 2, id: 'p1', text: 'x'.repeat(9000) }))).toBeNull()
    expect(parseToClient('{"t":"hello","pid":1,"name":"x"}')).toBeNull()
  })
  it('names a copy by its exe', () => {
    expect(copyName('C:\\Users\\a\\AppData\\Local\\PrismTerminalStable\\PrismTerminalStable.exe')).toBe('Stable')
    expect(copyName('C:\\x\\PrismTerminal.exe')).toBe('Prism Terminal')
  })
})

describe('the pipe', () => {
  it('asks a connected copy for its tabs, sends into one, and forgets it when it closes', async () => {
    const pipe = `\\\\.\\pipe\\pt-dict-test-${process.pid}-${Date.now()}`
    const svc = startLinkService(pipe)
    const pasted: string[] = []
    const sent: string[] = []
    const client = startLinkClient(
      pipe,
      { pid: 777, name: 'Stable' },
      {
        tabs: async () => [tab({ id: 'r1', label: 'Sonara' })],
        send: async (id, text) => {
          sent.push(`${id}:${text}`)
          return { ok: true, target: tab({ id, label: 'Sonara' }) }
        },
        paste: (t) => pasted.push(t)
      },
      50
    )
    const until = async (f: () => boolean): Promise<void> => {
      for (let i = 0; i < 100 && !f(); i++) await new Promise((r) => setTimeout(r, 20))
    }
    await until(() => svc.copies().length === 1)
    expect(svc.copies()).toEqual([{ pid: 777, name: 'Stable' }])
    expect(await svc.tabs()).toEqual([{ copy: { pid: 777, name: 'Stable' }, tabs: [tab({ id: 'r1', label: 'Sonara' })] }])
    expect(await svc.send(777, 'r1', 'hello')).toEqual({ ok: true, target: tab({ id: 'r1', label: 'Sonara' }) })
    expect(sent).toEqual(['r1:hello'])
    expect(svc.paste(777, 'typed')).toBe(true)
    await until(() => pasted.length === 1)
    expect(pasted).toEqual(['typed'])
    client.close()
    await until(() => svc.copies().length === 0)
    expect(await svc.send(777, 'r1', 'x')).toEqual({ ok: false, reason: 'that copy of the app has closed' })
    svc.close()
  })
})
