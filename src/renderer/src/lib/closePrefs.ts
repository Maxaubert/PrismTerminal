import { useSyncExternalStore } from 'react'

// Whether closing a tab, or the window, while an agent is WORKING asks first.
// On until switched off, and off means off: a confirmation that appears anyway
// is a setting that lies.

const KEY = 'prism.close.confirm'

let listeners: Array<() => void> = []
const notify = (): void => listeners.forEach((l) => l())

/** Default ON: only an explicit '0' turns it off, so "never set" still asks. */
export function confirmClose(): boolean {
  return localStorage.getItem(KEY) !== '0'
}
export function setConfirmClose(on: boolean): void {
  localStorage.setItem(KEY, on ? '1' : '0')
  notify()
}
const sub = (cb: () => void): (() => void) => {
  listeners.push(cb)
  return () => {
    listeners = listeners.filter((l) => l !== cb)
  }
}
export const useConfirmClose = (): boolean => useSyncExternalStore(sub, confirmClose)
