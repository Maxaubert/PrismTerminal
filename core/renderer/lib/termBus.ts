/**
 * Reaching a live terminal from outside its own component.
 *
 * The dock's right-click menu wants Paste, and pasting into a terminal is not
 * "write these bytes to the pty" (2026-08-30). It is xterm's `paste()`, which
 * wraps the text in the bracketed-paste escape the shell is waiting for -
 * without it a multi-line paste arrives as a run of Enter presses, so the
 * first line executes and the rest are typed in after it. An image on the
 * clipboard is different again: the ^V KEYSTROKE is forwarded so the TUI
 * reads the clipboard itself, which is how Claude Code takes a screenshot.
 *
 * All of that already exists, once, in TerminalPanel's key handler. This lets
 * the menu call THAT rather than growing a second, wrong copy of it.
 */

const pasters = new Map<string, () => void>()

/** TerminalPanel registers its own paste while it is mounted. */
export function registerPaste(sessionId: string, fn: () => void): () => void {
  if (!sessionId) return () => {}
  pasters.set(sessionId, fn)
  return () => {
    if (pasters.get(sessionId) === fn) pasters.delete(sessionId)
  }
}

/** True when there was a terminal to paste into. */
export function pasteInto(sessionId: string): boolean {
  const fn = pasters.get(sessionId)
  if (!fn) return false
  fn()
  return true
}

/**
 * TEXT THE USER SPOKE (#13). The panel owns the xterm instances, and it sits
 * behind a lazy boundary in Prism so that xterm stays out of the launch bundle;
 * dictation's controller is armed from the app shell, so it must not import the
 * panel. The panel hands its paste in when its module loads, and until then
 * there is no session to paste into anyway.
 */
/**
 * THE BOTTOM OF A SESSION'S SCREEN, as text rows (2026-09-28), for the question
 * indicator (`agentQuestion`). The panel owns the xterm instances and sits
 * behind Prism's lazy boundary, so the indicator hook reads through here and
 * never imports it. No reader yet: no rows.
 */
let screenTail: ((sessionId: string, rows: number) => string[]) | null = null
export function setScreenTail(fn: (sessionId: string, rows: number) => string[]): void {
  screenTail = fn
}
export function readScreenTail(sessionId: string, rows = 16): string[] {
  return screenTail ? screenTail(sessionId, rows) : []
}

let textPaster: ((sessionId: string, text: string) => boolean) | null = null
export function setTextPaster(fn: (sessionId: string, text: string) => boolean): void {
  textPaster = fn
}
/** True when the session exists and took the text. */
export function pasteTextInto(sessionId: string, text: string): boolean {
  return textPaster ? textPaster(sessionId, text) : false
}

// Where each shell says it is (#99). TerminalPanel hears the prompt's report
// through xterm's OSC parser and posts it here; App listens, because the
// tree and the tab root are its to move.
const cwdListeners = new Set<(sessionId: string, path: string) => void>()

export function reportCwd(sessionId: string, path: string): void {
  cwdListeners.forEach((fn) => fn(sessionId, path))
}

export function onCwd(fn: (sessionId: string, path: string) => void): () => void {
  cwdListeners.add(fn)
  return () => {
    cwdListeners.delete(fn)
  }
}

// What each shell's TITLE says (2026-09-04): Claude Code writes its working
// state into it, and App turns that into the tab indicator the moment it
// arrives. TerminalPanel hears xterm's title event and posts it here.
const titleListeners = new Set<(sessionId: string, title: string) => void>()

export function reportTitle(sessionId: string, title: string): void {
  titleListeners.forEach((fn) => fn(sessionId, title))
}

export function onTitle(fn: (sessionId: string, title: string) => void): () => void {
  titleListeners.add(fn)
  return () => {
    titleListeners.delete(fn)
  }
}

// WHICH SESSIONS ARE STILL COMING BACK (#106): a tab resuming Claude or Codex
// wears a skeleton until the agent has drawn itself. TerminalPanel says when a
// session starts and stops resuming; its own overlay and a host's tab strip
// (a ring before the name) read it here. A fresh Set on every change, so
// `useSyncExternalStore` sees a new snapshot.
let resuming: ReadonlySet<string> = new Set()
const resumingListeners = new Set<() => void>()

export function setResuming(sessionId: string, on: boolean): void {
  if (resuming.has(sessionId) === on) return
  const next = new Set(resuming)
  if (on) next.add(sessionId)
  else next.delete(sessionId)
  resuming = next
  resumingListeners.forEach((fn) => fn())
}

export const resumingIds = (): ReadonlySet<string> => resuming

export function onResumingChange(fn: () => void): () => void {
  resumingListeners.add(fn)
  return () => {
    resumingListeners.delete(fn)
  }
}
