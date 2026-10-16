import { BrowserWindow, screen } from 'electron'
import type { Hotkey, DictMode } from '@core/renderer/lib/dictationKey'
import { OVERLAY_CH, type OverlayLook, type OverlayRow, type OverlayState } from '@shared/dictOverlay'
import { createKeyFeed, keysFor, masksStart, startKeyHelper, type HelperLine, type KeyHelper } from './globalDictKey'
import type { Sessions } from './sessionsWire'
import type { SendTab } from './orchestratorSend'

/**
 * DICTATE FROM ANY APP (owner, 2026-10-16; spec:
 * docs/superpowers/specs/2026-10-16-dictate-anywhere.md). With another app in
 * front, the dictation key (globalDictKey) starts a recording in the page
 * (core `dictationOutside`), the widget shows it, and what was heard goes to
 * the orchestrator when it is ACTIVE, or to the session the owner picks from
 * the widget (a click or its number). Sent through the same checked path as
 * the orchestrator's sends (sessionsWire.sendInto).
 */

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
  script: string
  preload: string
  loadPage: (w: BrowserWindow) => void
  mainWindow: () => BrowserWindow | null
  sessions: () => Sessions | null
  /** Tell the page to start, stop or cancel the outside recording. */
  toPage: (action: 'start' | 'stop' | 'cancel') => void
  onIpc: (channel: string, fn: (...args: unknown[]) => void) => void
  channels: { anywhere: string; live: string; routed: string; look: string }
  /** Under --e2e: no real hook; `line` is the only way keys arrive. */
  e2e?: boolean
}

const WIDTH = 480
const PICK_MS = 30_000
const SHOW_MS = 2200

/** The last two folders of a path: enough to tell two `api` tabs apart. */
export const folderTail = (p: string): string => p.split(/[\\/]+/).filter(Boolean).slice(-2).join('\\')

/** The picker's rows: numbered 1 to 9, a tab that is asking disabled. */
export function pickRows(tabs: readonly SendTab[]): OverlayRow[] {
  return tabs.slice(0, 9).map((t, i) => ({
    id: t.id,
    n: i + 1,
    label: t.label,
    folder: folderTail(t.cwd),
    state: t.state,
    disabled: t.state === 'question' ? 'Waiting on a question: answer it there first' : null,
    lead: t.orchestrator
  }))
}

export function startDictateAnywhere(d: AnywhereDeps): { stop(): void; line(l: HelperLine): void } {
  let cfg: AnywhereConfig | null = null
  let helper: KeyHelper | null = null
  let outside = false
  let tick: ReturnType<typeof setTimeout> | null = null
  let picking: { text: string; rows: OverlayRow[]; timer: ReturnType<typeof setTimeout> } | null = null
  let hideTimer: ReturnType<typeof setTimeout> | null = null
  let look: OverlayLook | null = null
  let win: BrowserWindow | null = null

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

  /* ----- sending ----- */
  const sendTo = async (id: string, label: string, text: string): Promise<void> => {
    const s = d.sessions()
    if (!s) return note('Not sent: the app is not ready', 'warn')
    show({ phase: 'sending', to: label })
    const res = await s.sendInto(id, text)
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
    if ('message' in r) return note(r.message, r.message === 'Cancelled' || r.message === 'Heard nothing' ? 'quiet' : 'warn')
    const s = d.sessions()
    if (!s) return note('Not sent: the app is not ready', 'warn')
    const where = await s.route()
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
    if (a === 'start') {
      endPick()
      outside = true
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
    if (!cfg?.on) return
    // With the app in front its own page reads the key (as it always has),
    // unless this recording started outside.
    if (d.mainWindow()?.isFocused() && !outside) {
      feed.reset()
      return
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
    if (!keys) {
      helper?.stop()
      helper = null
      return
    }
    if (d.e2e) return
    helper ??= startKeyHelper(d.script, onLine)
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

  return {
    line: onLine,
    stop: () => {
      helper?.stop()
      helper = null
      endPick()
      if (win && !win.isDestroyed()) win.destroy()
    }
  }
}
