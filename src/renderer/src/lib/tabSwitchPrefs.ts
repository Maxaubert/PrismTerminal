import { useSyncExternalStore } from 'react'

// WHERE CTRL+TAB GOES (#158; owner, 2026-10-10: "add a new tab switching mode
// called most recent. so you can either switch chronologically or by most
// recently used"). `order` is the strip, left to right, as it always was, and
// the DEFAULT, so nobody's keys change with the update; `recent` walks the
// most-recently-used list (lib/tabMru). THIS APP'S OWN setting: the strip is
// the app's shell, so its key is not `prism.term.*`. Read defensively:
// anything unknown is In order.

export type TabSwitch = 'order' | 'recent'

const KEY = 'prism.window.tabSwitch'

let listeners: Array<() => void> = []

export function validTabSwitch(v: unknown): TabSwitch {
  return v === 'recent' ? 'recent' : 'order'
}

export function tabSwitch(): TabSwitch {
  return validTabSwitch(localStorage.getItem(KEY))
}

export function setTabSwitch(mode: TabSwitch): void {
  localStorage.setItem(KEY, validTabSwitch(mode))
  listeners.forEach((l) => l())
}

export function onTabSwitchChange(cb: () => void): () => void {
  listeners.push(cb)
  return () => {
    listeners = listeners.filter((l) => l !== cb)
  }
}

export const useTabSwitch = (): TabSwitch => useSyncExternalStore(onTabSwitchChange, tabSwitch)
