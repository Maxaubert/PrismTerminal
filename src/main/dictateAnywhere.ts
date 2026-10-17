import { BrowserWindow, screen } from 'electron'
import type { Hotkey, DictMode } from '@core/renderer/lib/dictationKey'
import { OVERLAY_CH, type OverlayLook, type OverlayRow, type OverlayState } from '@shared/dictOverlay'
import { createKeyFeed, keysFor, masksStart, startKeyHelper, type HelperLine, type KeyHelper } from './globalDictKey'
import type { Sessions } from './sessionsWire'
import { dictationRoute, type SendDecision, type SendTab } from './orchestratorSend'
import { startLinkClient, startLinkService, type LinkService } from './dictationLink'

/**
 * DICTATE FROM ANY APP (owner, 2026-10-16; spec:
 * docs/superpowers/specs/2026-10-16-dictate-anywhere.md). With another app in
 * front, the dictation key (globalDictKey) starts a recording in the page
 * (core `dictationOutside`), the widget shows it, and what was heard goes to
 * the orchestrator when it is ACTIVE, or to the session the owner picks from
 * the widget (a click or its number). Sent through the same checked path as
 * the orchestrator's sends (sessionsWire.sendInto).
 *
 * ONE DICTATION (owner, 2026-10-17; spec:
 * docs/superpowers/specs/2026-10-17-one-dictation.md): the hook reads the key
 * with the app in front too, so there is one key path and one widget. The
 * copy whose helper holds the lock is the SERVICE: it records, and every
 * other copy is a CLIENT on the link (dictationLink), its page not reading
 * the key. The words go to the copy whose window was in front at the press
 * (pasted at its front tab's cursor, no Enter, as dictation in the app always
 * did), else to the active orchestrator or the list, which holds the tabs of
 * every copy.
 */

/** service: this copy runs the dictation. client: another copy does, and this
 *  one answers on the link. none: no other copy; the page reads its own key. */
export type Role = 'none' | 'service' | 'client'

export interface AnywhereConfig {
  on: boolean
  hotkey: Hotkey
  mode: DictMode
}

export type RouteResult = { text: string } | { message: string }
export interface LiveView {
  phase: 'listening' | 'transcribing' | 'idle'
  text: string
  level: number
  starting: boolean
}

export interface AnywhereDeps {
  preload: string
  loadPage: (w: BrowserWindow) => void
  mainWindow: () => BrowserWindow | null
  sessions: () => Sessions | null
  /** Tell the page to start, stop or cancel the outside recording. */
  toPage: (action: 'start' | 'stop' | 'cancel') => void
  onIpc: (channel: string, fn: (...args: unknown[]) => void) => void
  channels: { anywhere: string; live: string; routed: string; look: string }
  /** This copy's main process id: what the hook names when its window is in front. */
  selfPid?: number
  /** The pipe every copy of the app meets on, the user's link key, and this
   *  copy's name; null: this copy alone. */
  link?: { pipe: string; key: Buffer; name: string } | null
  /** The page's part: it reads the key itself only with no service in reach. */
  pageRole?: (role: Role) => void
  /** Paste into this copy's front tab (its window was in front at the press). */
  pastePage?: (text: string) => void
  /** A diag crumb (never a key but the binding's; never typed text). */
  log?: (what: Record<string, unknown>) => void
  /** Under --e2e: no real hook; `line` is the only way keys arrive. */
  e2e?: boolean
}

const WIDTH = 480
const PICK_MS = 30_000
const SHOW_MS = 2200

/** The last two folders of a path: enough to tell two `api` tabs apart. */
export const folderTail = (p: string): string => p.split(/[\\/]+/).filter(Boolean).slice(-2).join('\\')

/** A tab as the list holds it: `copy` names the copy of the app it is in,
 *  when more than one is open. A tab of another copy has the id `<pid>:<id>`. */
export type ListTab = SendTab & { copy?: string | null }

/** The picker's rows: numbered 1 to 9, a tab that is asking disabled. */
export function pickRows(tabs: readonly ListTab[]): OverlayRow[] {
  return tabs.slice(0, 9).map((t, i) => ({
    id: t.id,
    n: i + 1,
    label: t.label,
    folder: folderTail(t.cwd),
    state: t.state,
    disabled: t.state === 'question' ? 'Waiting on a question: answer it there first' : null,
    lead: t.orchestrator,
    copy: t.copy ?? null
  }))
}

/** This copy's tabs and every linked copy's, as one list. */
export function mergeTabs(local: readonly SendTab[], remote: readonly { copy: { pid: number; name: string }; tabs: readonly SendTab[] }[], me: string): ListTab[] {
  const many = remote.length > 0
  return [
    ...local.map((t) => ({ ...t, copy: many ? me : null })),
    ...remote.flatMap((r) => r.tabs.map((t) => ({ ...t, id: `${r.copy.pid}:${t.id}`, copy: r.copy.name })))
  ]
}

export function startDictateAnywhere(d: AnywhereDeps): {
  stop(): void
  line(l: HelperLine): void
  /** What a recording heard, as if it began with copy `front`'s window in front (the e2e's seam). */
  route(r: RouteResult, front: number | null): void
} {
  let cfg: AnywhereConfig | null = null
  let helper: KeyHelper | null = null
  let outside = false
  let tick: ReturnType<typeof setTimeout> | null = null
  let picking: { text: string; rows: OverlayRow[]; timer: ReturnType<typeof setTimeout> } | null = null
  let hideTimer: ReturnType<typeof setTimeout> | null = null
  let look: OverlayLook | null = null
  let win: BrowserWindow | null = null
  const selfPid = d.selfPid ?? process.pid
  let role: Role = 'none'
  let svc: LinkService | null = null
  let client: { close(): void } | null = null
  /** The copy whose window was in front at the last binding key down. */
  let lastFront: number | null = null
  /** ... and at the press that started the recording. */
  let recFront: number | null = null

  const feed = createKeyFeed(() => ({ hotkey: cfg!.hotkey, mode: cfg!.mode }))

  /* ----- the widget ----- */
  const ensure = (): BrowserWindow => {
    if (win && !win.isDestroyed()) return win
    win = new BrowserWindow({
      width: WIDTH,
      height: 200,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      show: false,
      webPreferences: { preload: d.preload, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
    })
    // Above full-screen windows too, and on every virtual desktop.
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setVisibleOnAllWorkspaces(true)
    // Rule 4: it never navigates and never opens a window.
    win.webContents.on('will-navigate', (e) => e.preventDefault())
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.on('closed', () => {
      win = null
    })
    d.loadPage(win)
    return win
  }
  const heightFor = (s: OverlayState): number => (s.phase === 'pick' ? 196 + s.rows.length * 48 : s.phase === 'listening' ? 196 : 104)
  const show = (s: OverlayState): void => {
    const w = ensure()
    if (hideTimer) clearTimeout(hideTimer)
    hideTimer = null
    const h = heightFor(s)
    // On the display the pointer is on, above its taskbar, centred.
    const wa = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
    w.setBounds({ x: Math.round(wa.x + (wa.width - WIDTH) / 2), y: Math.round(wa.y + wa.height - h - 16), width: WIDTH, height: h })
    // Clicks pass through to the app behind, except while there is a list to pick from.
    w.setIgnoreMouseEvents(s.phase !== 'pick')
    const send = (): void => {
      if (look) w.webContents.send(OVERLAY_CH.look, look)
      w.webContents.send(OVERLAY_CH.state, s)
    }
    if (w.webContents.isLoading()) w.webContents.once('did-finish-load', send)
    else send()
    if (!w.isVisible()) w.showInactive()
  }
  const hideAfter = (ms: number): void => {
    if (hideTimer) clearTimeout(hideTimer)
    hideTimer = setTimeout(() => {
      hideTimer = null
      if (!picking) win?.hide()
    }, ms)
  }
  const note = (message: string, tone: 'quiet' | 'warn' = 'quiet'): void => {
    outside = false
    show({ phase: 'note', message, tone })
    hideAfter(SHOW_MS + 800)
  }

  /* ----- the copies of the app ----- */
  const setRole = (r: Role): void => {
    if (r === role) return
    role = r
    d.log?.({ role: r })
    d.pageRole?.(r)
  }
  const becomeClient = (): void => {
    svc?.close()
    svc = null
    if (!d.link) return setRole('none')
    if (client) return
    const link = d.link
    client = startLinkClient(
      link.pipe,
      link.key,
      { pid: selfPid, name: link.name },
      {
        tabs: () => d.sessions()?.published() ?? Promise.resolve([]),
        send: (id, text) => d.sessions()?.sendInto(id, text) ?? Promise.resolve<SendDecision>({ ok: false, reason: 'the app is not ready' }),
        paste: (t) => d.pastePage?.(t)
      },
      1000,
      (on) => setRole(on ? 'client' : 'none')
    )
  }
  const becomeService = (): void => {
    client?.close()
    client = null
    if (d.link && !svc) svc = startLinkService(d.link.pipe, d.link.key, (e) => d.log?.({ link: String(e).slice(0, 120) }))
    setRole('service')
  }

  /* ----- sending ----- */
  const sendTo = async (id: string, label: string, text: string): Promise<void> => {
    const s = d.sessions()
    if (!s) return note('Not sent: the app is not ready', 'warn')
    show({ phase: 'sending', to: label })
    // Another copy's tab: that copy types it, through its own checks.
    const other = /^([0-9]+):(.+)$/.exec(id)
    const res = other ? (svc ? await svc.send(Number(other[1]), other[2], text) : { ok: false as const, reason: 'that copy of the app has closed' }) : await s.sendInto(id, text)
    outside = false
    if (res.ok) {
      show({ phase: 'sent', to: res.target.label })
      hideAfter(SHOW_MS)
    } else note(`Not sent: ${res.reason}`, 'warn')
  }
  const endPick = (): void => {
    if (!picking) return
    clearTimeout(picking.timer)
    picking = null
    helper?.send('pick 0')
  }
  const choose = (id: string): void => {
    const p = picking
    if (!p) return
    const row = p.rows.find((r) => r.id === id)
    if (!row || row.disabled) return
    endPick()
    void sendTo(row.id, row.label, p.text)
  }
  const routed = async (r: RouteResult): Promise<void> => {
    const front = recFront
    recFront = null
    if ('message' in r) return note(r.message, r.message === 'Cancelled' || r.message === 'Heard nothing' ? 'quiet' : 'warn')
    // A Prism Terminal window was in front: the words go to its front tab, at
    // the cursor, never Enter (dictation in the app as it always was).
    if (front === selfPid && d.pastePage) {
      d.pastePage(r.text)
      return note('Typed into the tab in front')
    }
    if (front !== null && svc?.paste(front, r.text)) return note('Typed into the tab in front')
    const s = d.sessions()
    if (!s) return note('Not sent: the app is not ready', 'warn')
    const all = mergeTabs(await s.published(), svc ? await svc.tabs() : [], d.link?.name ?? 'Prism Terminal')
    const where = dictationRoute(all, true)
    if ('lead' in where) return sendTo(where.lead.id, where.lead.label, r.text)
    if (!where.pick.length) return note('No Claude session to send to', 'warn')
    const rows = pickRows(where.pick)
    endPick()
    picking = { text: r.text, rows, timer: setTimeout(() => {
      endPick()
      note('Not sent')
    }, PICK_MS) }
    helper?.send('pick 1')
    show({ phase: 'pick', text: r.text, rows })
  }

  /* ----- the key ----- */
  const act = (a: 'start' | 'stop' | 'cancel' | null): void => {
    if (!a) return
    d.log?.({ key: a })
    if (a === 'start') {
      endPick()
      outside = true
      recFront = lastFront
      show({ phase: 'listening', text: '', level: 0, starting: false })
    }
    d.toPage(a)
  }
  const onLine = (l: HelperLine): void => {
    // A list on screen answers its digits and Esc whatever else changed.
    if (l.kind === 'digit' || l.kind === 'esc') {
      if (picking) {
        if (l.kind === 'esc') {
          endPick()
          note('Not sent')
        } else {
          const row = picking.rows.find((r) => r.n === l.n)
          if (row) choose(row.id)
        }
        return
      }
    }
    if (l.kind === 'ready' || l.kind === 'failed' || l.kind === 'waiting') {
      d.log?.({ hook: l.kind })
      if (l.kind === 'ready') becomeService()
      else becomeClient()
      return
    }
    if (!cfg?.on) return
    if (l.kind === 'key' && l.type === 'down') {
      lastFront = l.front ?? null
      // Another copy's window, and that copy is not on the link: it reads its
      // own key, so this one stays out of it.
      if (lastFront !== null && lastFront !== selfPid && !svc?.copies().some((c) => c.pid === lastFront) && !outside) {
        feed.reset()
        d.log?.({ key: 'left to that copy' })
        return
      }
    }
    const now = performance.now()
    act(feed.feed(l, now))
    if (tick) clearTimeout(tick)
    tick = null
    if (feed.arming()) tick = setTimeout(() => act(feed.tick(performance.now())), 210)
  }
  const apply = (next: AnywhereConfig): void => {
    const keys = next.on ? keysFor(next.hotkey) : null
    cfg = { ...next, on: !!keys }
    feed.reset()
    // The page says this as it loads: the part it may have missed, again.
    d.pageRole?.(role)
    if (!keys) {
      helper?.stop()
      helper = null
      becomeClient()
      return
    }
    if (d.e2e) return
    helper ??= startKeyHelper(onLine)
    helper.send(`keys ${keys.map((k) => k.toString(16).toUpperCase()).join(' ')}`)
    helper.send(`mask ${masksStart(next.hotkey) ? 1 : 0}`)
  }

  /* ----- the page and the widget talk here ----- */
  d.onIpc(d.channels.anywhere, (c: unknown) => {
    const x = c as Partial<AnywhereConfig> | null
    if (!x || typeof x.hotkey !== 'object' || !x.hotkey || typeof x.hotkey.code !== 'string') return
    apply({ on: x.on === true, hotkey: x.hotkey as Hotkey, mode: x.mode === 'toggle' ? 'toggle' : 'hold' })
  })
  d.onIpc(d.channels.live, (v: unknown) => {
    const x = v as Partial<LiveView> | null
    if (!outside || !x) return
    if (x.phase === 'listening')
      show({ phase: 'listening', text: typeof x.text === 'string' ? x.text : '', level: Number(x.level) || 0, starting: x.starting === true })
    else if (x.phase === 'transcribing') show({ phase: 'transcribing' })
  })
  d.onIpc(d.channels.routed, (r: unknown) => {
    const x = r as Partial<{ text: string; message: string }> | null
    if (!x) return
    if (typeof x.text === 'string') void routed({ text: x.text.slice(0, 8000) })
    else if (typeof x.message === 'string') void routed({ message: x.message.slice(0, 200) })
  })
  d.onIpc(d.channels.look, (l: unknown) => {
    const x = l as Partial<OverlayLook> | null
    const ok = (s: unknown): s is string => typeof s === 'string' && s.length < 64
    if (x && ok(x.ground) && ok(x.text) && ok(x.dim) && ok(x.accent) && ok(x.edge)) look = x as OverlayLook
  })
  d.onIpc(OVERLAY_CH.pick, (id: unknown) => {
    if (typeof id === 'string') choose(id)
  })
  d.onIpc(OVERLAY_CH.dismiss, () => {
    endPick()
    win?.hide()
  })

  // Every copy looks for a service from the start; holding the key makes it one.
  becomeClient()

  return {
    line: onLine,
    route: (r, front) => {
      recFront = front
      void routed(r)
    },
    stop: () => {
      helper?.stop()
      helper = null
      svc?.close()
      svc = null
      client?.close()
      client = null
      endPick()
      if (win && !win.isDestroyed()) win.destroy()
    }
  }
}
