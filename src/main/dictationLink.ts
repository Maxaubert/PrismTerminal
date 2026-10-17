import { createServer, connect, type Server, type Socket } from 'net'
import type { SendDecision, SendTab } from './orchestratorSend'

/**
 * ONE DICTATION FOR EVERY COPY OF THE APP (owner, 2026-10-17: "when you have
 * two instances of pt open, there should be one dictation engine for both ...
 * it should show all sessions open in one ui from both instances"; spec:
 * docs/superpowers/specs/2026-10-17-one-dictation.md). The copy whose key
 * helper holds the lock runs the dictation (the SERVICE); every other copy is
 * a CLIENT on this pipe: it answers for its own tabs, and pastes or sends
 * into them through its own checked path when the service asks.
 *
 * A local named pipe, one per Windows user; nothing leaves the PC. JSON, one
 * message per line. The service asks; a client only answers:
 *   client -> service  {t:'hello', pid, name}
 *   service -> client  {t:'tabs?', rid}            -> {t:'tabs', rid, tabs}
 *   service -> client  {t:'send', rid, id, text}   -> {t:'sent', rid, res}
 *   service -> client  {t:'paste', text}           (into its front tab, no Enter)
 */

export type ToClient = { t: 'tabs?'; rid: number } | { t: 'send'; rid: number; id: string; text: string } | { t: 'paste'; text: string }
export type ToService = { t: 'hello'; pid: number; name: string } | { t: 'tabs'; rid: number; tabs: SendTab[] } | { t: 'sent'; rid: number; res: SendDecision }

const MAX_LINE = 64 * 1024
const MAX_TEXT = 8000
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max
const int = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0

function tabOf(v: unknown): SendTab | null {
  const t = v as Partial<SendTab> | null
  if (!t || !str(t.id, 128) || !str(t.tab, 128) || !str(t.label, 256) || !str(t.cwd, 1024)) return null
  const opt = (x: unknown): string | null => (str(x, 256) ? x : null)
  return { id: t.id, tab: t.tab, label: t.label, cwd: t.cwd, agent: opt(t.agent), state: opt(t.state), orchestrator: t.orchestrator === true, session: opt(t.session) }
}

/** A line from a client, checked field by field; anything else is null. */
export function parseToService(line: string): ToService | null {
  if (line.length > MAX_LINE) return null
  let m: Record<string, unknown>
  try {
    m = JSON.parse(line) as Record<string, unknown>
  } catch {
    return null
  }
  if (!m || typeof m !== 'object') return null
  if (m.t === 'hello' && int(m.pid) && str(m.name, 64)) return { t: 'hello', pid: m.pid, name: m.name }
  if (m.t === 'tabs' && int(m.rid) && Array.isArray(m.tabs)) return { t: 'tabs', rid: m.rid, tabs: m.tabs.slice(0, 64).map(tabOf).filter((x): x is SendTab => !!x) }
  if (m.t === 'sent' && int(m.rid) && m.res && typeof m.res === 'object') {
    const r = m.res as Record<string, unknown>
    if (r.ok === true) {
      const target = tabOf(r.target)
      if (target) return { t: 'sent', rid: m.rid, res: { ok: true, target } }
    } else if (str(r.reason, 200)) return { t: 'sent', rid: m.rid, res: { ok: false, reason: r.reason } }
  }
  return null
}

/** A line from the service, checked; anything else is null. */
export function parseToClient(line: string): ToClient | null {
  if (line.length > MAX_LINE) return null
  let m: Record<string, unknown>
  try {
    m = JSON.parse(line) as Record<string, unknown>
  } catch {
    return null
  }
  if (!m || typeof m !== 'object') return null
  if (m.t === 'tabs?' && int(m.rid)) return { t: 'tabs?', rid: m.rid }
  if (m.t === 'send' && int(m.rid) && str(m.id, 128) && str(m.text, MAX_TEXT)) return { t: 'send', rid: m.rid, id: m.id, text: m.text }
  if (m.t === 'paste' && str(m.text, MAX_TEXT)) return { t: 'paste', text: m.text }
  return null
}

/** The copy's name in the list: "Stable" for the stable copy, else the app's. */
export function copyName(execPath: string): string {
  const base = (execPath.split(/[\\/]/).pop() ?? '').replace(/\.exe$/i, '')
  if (/^PrismTerminalStable$/i.test(base)) return 'Stable'
  if (/^PrismTerminal$/i.test(base)) return 'Prism Terminal'
  return base || 'Prism Terminal'
}

function lines(sock: Socket, onLine: (l: string) => void): void {
  let buf = ''
  sock.setEncoding('utf8')
  sock.on('data', (d: string) => {
    buf += d
    if (buf.length > MAX_LINE * 4) {
      sock.destroy()
      return
    }
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const l = buf.slice(0, i)
      buf = buf.slice(i + 1)
      if (l.trim()) onLine(l)
    }
  })
}
const write = (sock: Socket, m: ToClient | ToService): void => {
  try {
    sock.write(JSON.stringify(m) + '\n')
  } catch {
    /* gone: its close says so */
  }
}

export interface RemoteCopy {
  pid: number
  name: string
}

/** The service's end: the copies connected now, and asking them. */
export interface LinkService {
  copies(): RemoteCopy[]
  /** Every copy's tabs; a copy that does not answer in time is left out. */
  tabs(timeoutMs?: number): Promise<{ copy: RemoteCopy; tabs: SendTab[] }[]>
  send(pid: number, id: string, text: string, timeoutMs?: number): Promise<SendDecision>
  paste(pid: number, text: string): boolean
  close(): void
}

export function startLinkService(pipe: string, onError?: (e: unknown) => void): LinkService {
  type Peer = { sock: Socket; copy: RemoteCopy | null }
  const peers = new Set<Peer>()
  const waits = new Map<number, (m: ToService) => void>()
  let rid = 1
  const server: Server = createServer((sock) => {
    const p: Peer = { sock, copy: null }
    peers.add(p)
    lines(sock, (l) => {
      const m = parseToService(l)
      if (!m) return
      if (m.t === 'hello') p.copy = { pid: m.pid, name: m.name }
      else waits.get(m.rid)?.(m)
    })
    sock.on('close', () => peers.delete(p))
    sock.on('error', () => peers.delete(p))
  })
  server.on('error', (e) => onError?.(e))
  server.listen(pipe)
  const ask = <T>(p: Peer, m: ToClient & { rid: number }, pick: (r: ToService) => T | null, timeoutMs: number, fallback: T): Promise<T> =>
    new Promise((resolve) => {
      const done = (v: T): void => {
        clearTimeout(timer)
        waits.delete(m.rid)
        resolve(v)
      }
      const timer = setTimeout(() => done(fallback), timeoutMs)
      waits.set(m.rid, (r) => {
        const v = pick(r)
        if (v !== null) done(v)
      })
      write(p.sock, m)
    })
  const named = (): Peer[] => [...peers].filter((p) => p.copy)
  return {
    copies: () => named().map((p) => p.copy!),
    tabs: (timeoutMs = 800) =>
      Promise.all(
        named().map(async (p) => ({
          copy: p.copy!,
          tabs: await ask(p, { t: 'tabs?', rid: rid++ }, (r) => (r.t === 'tabs' ? r.tabs : null), timeoutMs, [] as SendTab[])
        }))
      ),
    send: (pid, id, text, timeoutMs = 15000) => {
      const p = named().find((x) => x.copy!.pid === pid)
      if (!p) return Promise.resolve({ ok: false, reason: 'that copy of the app has closed' })
      return ask<SendDecision>(p, { t: 'send', rid: rid++, id, text }, (r) => (r.t === 'sent' ? r.res : null), timeoutMs, {
        ok: false,
        reason: 'that copy of the app did not answer'
      })
    },
    paste: (pid, text) => {
      const p = named().find((x) => x.copy!.pid === pid)
      if (!p) return false
      write(p.sock, { t: 'paste', text })
      return true
    },
    close: () => {
      for (const p of peers) p.sock.destroy()
      peers.clear()
      server.close()
    }
  }
}

export interface ClientHandlers {
  tabs(): Promise<SendTab[]>
  send(id: string, text: string): Promise<SendDecision>
  paste(text: string): void
}

/** A client's end: connects, and keeps trying while it is not the service.
 *  `onState` hears when it is connected to a service and when it is not. */
export function startLinkClient(pipe: string, me: RemoteCopy, h: ClientHandlers, retryMs = 1000, onState?: (connected: boolean) => void): { close(): void } {
  let sock: Socket | null = null
  let closed = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let up = false
  const state = (on: boolean): void => {
    if (on === up) return
    up = on
    onState?.(on)
  }
  const again = (): void => {
    sock = null
    if (!closed) state(false)
    if (!closed && !timer) timer = setTimeout(go, retryMs)
  }
  const go = (): void => {
    timer = null
    if (closed) return
    const s = connect(pipe)
    sock = s
    s.on('connect', () => {
      write(s, { t: 'hello', pid: me.pid, name: me.name })
      state(true)
    })
    lines(s, (l) => {
      const m = parseToClient(l)
      if (!m) return
      if (m.t === 'tabs?') void h.tabs().then((tabs) => write(s, { t: 'tabs', rid: m.rid, tabs }), () => write(s, { t: 'tabs', rid: m.rid, tabs: [] }))
      else if (m.t === 'send') void h.send(m.id, m.text).then((res) => write(s, { t: 'sent', rid: m.rid, res }), () => write(s, { t: 'sent', rid: m.rid, res: { ok: false, reason: 'it failed' } }))
      else h.paste(m.text)
    })
    s.on('error', () => {})
    s.on('close', again)
  }
  go()
  return {
    close: () => {
      closed = true
      if (timer) clearTimeout(timer)
      sock?.destroy()
    }
  }
}
