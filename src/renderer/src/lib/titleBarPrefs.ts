import { useSyncExternalStore } from 'react'

// WHETHER THE WINDOW HAS A TITLE BAR (#91; owner, 2026-09-28: "add a no title
// bar option for pt in appearance as well, not theme related", and of the
// shapes offered, "tabs in the top row"). `hidden` drops the title bar's row:
// the tabs move up into it, and its buttons sit at the tab row's right end.
// `shown` is the window as it always was, and the DEFAULT, so nobody's window
// changes with the update. This app's own setting (the window's chrome), so
// its key is not `prism.term.*`. Read defensively: anything unknown is shown.

export type TitleBarMode = 'shown' | 'hidden'

const KEY = 'prism.window.titleBar'

let listeners: Array<() => void> = []

export function validTitleBar(v: unknown): TitleBarMode {
  return v === 'hidden' ? 'hidden' : 'shown'
}

export function titleBarMode(): TitleBarMode {
  return validTitleBar(localStorage.getItem(KEY))
}

export function setTitleBarMode(mode: TitleBarMode): void {
  localStorage.setItem(KEY, validTitleBar(mode))
  listeners.forEach((l) => l())
}

export function onTitleBarChange(cb: () => void): () => void {
  listeners.push(cb)
  return () => {
    listeners = listeners.filter((l) => l !== cb)
  }
}

export const useTitleBarMode = (): TitleBarMode => useSyncExternalStore(onTitleBarChange, titleBarMode)
