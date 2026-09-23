import { useSyncExternalStore } from 'react'

// HOW WIDE A TAB IS (owner, 2026-09-23: "add a setting for tab width, where the
// user can pick fixed size or dynamic, so essentially what we got now and what
// we had before"; then "call it dynamic ... have dynamic be the default").
// `dynamic` is the tab as wide as its name, up to a cap, the strip from before
// #35, and the DEFAULT, by the owner's word, so a strip that was fixed since
// #35 goes back to dynamic with this update; `fixed` is every tab one width.
// THIS APP'S OWN setting: the strip is the app's shell, not the terminal's, so
// its key is not `prism.term.*`. Read defensively: anything unknown is dynamic.

export type TabWidth = 'dynamic' | 'fixed'

const KEY = 'prism.window.tabWidth'

let listeners: Array<() => void> = []

export function validTabWidth(v: unknown): TabWidth {
  return v === 'fixed' ? 'fixed' : 'dynamic'
}

export function tabWidth(): TabWidth {
  return validTabWidth(localStorage.getItem(KEY))
}

export function setTabWidth(width: TabWidth): void {
  localStorage.setItem(KEY, validTabWidth(width))
  listeners.forEach((l) => l())
}

export function onTabWidthChange(cb: () => void): () => void {
  listeners.push(cb)
  return () => {
    listeners = listeners.filter((l) => l !== cb)
  }
}

export const useTabWidth = (): TabWidth => useSyncExternalStore(onTabWidthChange, tabWidth)
