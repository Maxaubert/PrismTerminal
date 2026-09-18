import { useSyncExternalStore } from 'react'

// What the + opens: a chooser every time, or one fixed folder.
export type NewTabMode = 'ask' | 'folder'

const MODE_KEY = 'prism.newtab.mode'
const FOLDER_KEY = 'prism.newtab.folder'

let listeners: Array<() => void> = []
const notify = (): void => listeners.forEach((l) => l())

export function newTabFolder(): string {
  return localStorage.getItem(FOLDER_KEY) ?? ''
}
/** 'folder' only counts while a folder is actually chosen. */
export function newTabMode(): NewTabMode {
  return localStorage.getItem(MODE_KEY) === 'folder' && newTabFolder() ? 'folder' : 'ask'
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
