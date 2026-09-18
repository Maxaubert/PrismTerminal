import { useSyncExternalStore } from 'react'

// What the + opens: a folder with nothing asked, or a chooser every time.
//
// A FOLDER IS THE DEFAULT, and with none chosen it is the user's own (owner,
// 2026-09-18, after using the first build, where asking was the default: the +
// should simply open). '' is "the user's folder": it is main that knows where
// that is, so the caller resolves it (App asks `homeDir()` once at mount).
export type NewTabMode = 'folder' | 'ask'

const MODE_KEY = 'prism.newtab.mode'
const FOLDER_KEY = 'prism.newtab.folder'

let listeners: Array<() => void> = []
const notify = (): void => listeners.forEach((l) => l())

/** The chosen folder; '' means the user's own. */
export function newTabFolder(): string {
  return localStorage.getItem(FOLDER_KEY) ?? ''
}

export function newTabMode(): NewTabMode {
  return localStorage.getItem(MODE_KEY) === 'ask' ? 'ask' : 'folder'
}

export function setNewTabMode(mode: NewTabMode, folder?: string): void {
  localStorage.setItem(MODE_KEY, mode)
  if (folder !== undefined) localStorage.setItem(FOLDER_KEY, folder)
  notify()
}

const sub = (cb: () => void): (() => void) => {
  listeners.push(cb)
  return () => {
    listeners = listeners.filter((l) => l !== cb)
  }
}

export const useNewTabMode = (): NewTabMode => useSyncExternalStore(sub, newTabMode)
export const useNewTabFolder = (): string => useSyncExternalStore(sub, newTabFolder)
