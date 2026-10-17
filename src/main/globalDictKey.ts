import { initialKeyState, reduceKey, type DictMode, type Hotkey, type KeyAction, type KeyEvt, type KeyState } from '@core/renderer/lib/dictationKey'
import { appHelperSend, onAppHelperExit, onAppHelperLine } from './appHelper'

/**
 * THE DICTATION KEY FROM ANY APP (owner, 2026-10-16; spec:
 * docs/superpowers/specs/2026-10-16-dictate-anywhere.md). The hook
 * (`hook/appHelper.ps1`) reports the binding's keys; this turns them into
 * the same key events the page's reducer reads (`reduceKey`, core), so the
 * key behaves exactly as it does in the app: hold or toggle, the solo rules
 * that keep Ctrl+Win+Left a desktop switch. Pure parts first, tested.
 */

/** A key code (KeyboardEvent.code) and its Windows virtual key. */
const VK: Record<string, number> = {
  ControlLeft: 0xa2, ControlRight: 0xa3, AltLeft: 0xa4, AltRight: 0xa5,
  ShiftLeft: 0xa0, ShiftRight: 0xa1, MetaLeft: 0x5b, MetaRight: 0x5c,
  Pause: 0x13, ScrollLock: 0x91, Space: 0x20, Backquote: 0xc0
}
for (let i = 1; i <= 24; i++) VK[`F${i}`] = 0x6f + i
for (let c = 0; c < 26; c++) VK[`Key${String.fromCharCode(65 + c)}`] = 65 + c
for (let d = 0; d < 10; d++) VK[`Digit${d}`] = 0x30 + d
const CODE_OF: Record<number, string> = Object.fromEntries(Object.entries(VK).map(([c, v]) => [v, c]))

const MOD_KEYS = {
  ctrl: ['ControlLeft', 'ControlRight'],
  alt: ['AltLeft', 'AltRight'],
  shift: ['ShiftLeft', 'ShiftRight'],
  meta: ['MetaLeft', 'MetaRight']
} as const
const FLAG_OF: Record<string, keyof typeof MOD_KEYS> = {
  ControlLeft: 'ctrl', ControlRight: 'ctrl', AltLeft: 'alt', AltRight: 'alt',
  ShiftLeft: 'shift', ShiftRight: 'shift', MetaLeft: 'meta', MetaRight: 'meta'
}

/** The virtual keys the helper must watch for a binding: its key, and both
 *  sides of every modifier it names (and of its own key's, for a chord of
 *  modifiers). Null when the key has no Windows equivalent here. */
export function keysFor(h: Hotkey): number[] | null {
  const main = VK[h.code]
  if (main === undefined) return null
  const out = new Set<number>([main])
  const own = FLAG_OF[h.code]
  for (const f of ['ctrl', 'alt', 'shift', 'meta'] as const)
    if (h[f] || (own === f && (h.ctrl || h.alt || h.shift || h.meta))) for (const c of MOD_KEYS[f]) out.add(VK[c])
  return [...out].sort((a, b) => a - b)
}

/** The Start menu needs masking only when the binding holds Win with Ctrl. */
export const masksStart = (h: Hotkey): boolean => (h.meta || FLAG_OF[h.code] === 'meta') && (h.ctrl || FLAG_OF[h.code] === 'ctrl')

/** `front`: the main process of the Prism Terminal copy (this one or another)
 *  whose window was in front at a down. */
export type HelperLine =
  | { kind: 'key'; type: 'down' | 'up'; code: string; front?: number }
  | { kind: 'other' }
  | { kind: 'digit'; n: number }
  | { kind: 'esc' }
  | { kind: 'ready' }
  | { kind: 'failed' }
  | { kind: 'waiting' }

/** One line of the helper's output, or null for anything else. */
export function parseHelperLine(line: string): HelperLine | null {
  const t = line.trim()
  if (t === 'ready') return { kind: 'ready' }
  if (t === 'failed') return { kind: 'failed' }
  if (t === 'waiting') return { kind: 'waiting' }
  if (t === 'o') return { kind: 'other' }
  if (t === 'x') return { kind: 'esc' }
  let m = /^([du]) ([0-9A-F]{2})(?: f ([0-9]{1,10}))?$/.exec(t)
  if (m) {
    const code = CODE_OF[parseInt(m[2], 16)]
    if (!code) return null
    const type = m[1] === 'd' ? 'down' : 'up'
    return m[3] && type === 'down' ? { kind: 'key', type, code, front: Number(m[3]) } : { kind: 'key', type, code }
  }
  m = /^p ([1-9])$/.exec(t)
  if (m) return { kind: 'digit', n: Number(m[1]) }
  return null
}

/**
 * The binding's key events as the reducer reads them: the modifier flags are
 * kept here from the downs and ups seen (the helper reports only the
 * binding's keys), and "another key" is a key named `Other` with them.
 */
export function createKeyFeed(cfg: () => { hotkey: Hotkey; mode: DictMode }): {
  feed(l: HelperLine, at: number): KeyAction
  tick(at: number): KeyAction
  arming(): boolean
  reset(): void
} {
  let state: KeyState = initialKeyState()
  const held = new Set<string>()
  const flags = (): Pick<Extract<KeyEvt, { type: 'down' | 'up' }>, 'ctrl' | 'alt' | 'shift' | 'meta'> => {
    const has = (f: keyof typeof MOD_KEYS): boolean => MOD_KEYS[f].some((c) => held.has(c))
    return { ctrl: has('ctrl'), alt: has('alt'), shift: has('shift'), meta: has('meta') }
  }
  const run = (evt: KeyEvt): KeyAction => {
    const c = cfg()
    const out = reduceKey(state, evt, { hotkey: c.hotkey, mode: c.mode })
    state = out.state
    return out.action
  }
  return {
    feed(l, at) {
      if (l.kind === 'other') return run({ type: 'down', code: 'Other', ...flags(), at })
      if (l.kind === 'esc') return run({ type: 'down', code: 'Escape', ...flags(), at })
      if (l.kind !== 'key') return null
      const repeat = l.type === 'down' && held.has(l.code)
      if (l.type === 'down') held.add(l.code)
      const evt: KeyEvt = { type: l.type, code: l.code, ...flags(), repeat, at }
      if (l.type === 'up') held.delete(l.code)
      return run(evt)
    },
    tick: (at) => run({ type: 'tick', at }),
    arming: () => state.phase === 'arming',
    reset() {
      state = initialKeyState()
      held.clear()
    }
  }
}

/** The hook, in the app's one helper (`appHelper.ts`): turned on and off there. */
export interface KeyHelper {
  send(line: string): void
  stop(): void
}

/**
 * The dictation key's hook, in the app's one helper (2026-10-17; it had its
 * own PowerShell). `hook 1` installs it; what was sent for it (the keys, the
 * mask) is kept, so a helper that died and came back is armed the same again.
 */
export function startKeyHelper(onLine: (l: HelperLine) => void): KeyHelper {
  let stopped = false
  const sent = new Map<string, string>()
  const offLine = onAppHelperLine((raw) => {
    const l = parseHelperLine(raw)
    if (l && !stopped) onLine(l)
  })
  const arm = (): void => {
    appHelperSend('hook 1')
    for (const line of sent.values()) appHelperSend(line)
  }
  const offExit = onAppHelperExit(() => {
    if (stopped) return
    // Gone without being told: whatever it held (the key, the service) it no
    // longer does. Started and armed again a moment later.
    onLine({ kind: 'failed' })
    setTimeout(() => {
      if (!stopped) arm()
    }, 1000).unref()
  })
  arm()
  return {
    send: (line) => {
      const verb = line.split(' ')[0]
      if (verb === 'keys' || verb === 'mask') sent.set(verb, line)
      appHelperSend(line)
    },
    stop: () => {
      if (stopped) return
      stopped = true
      offLine()
      offExit()
      appHelperSend('pick 0')
      appHelperSend('hook 0')
    }
  }
}
