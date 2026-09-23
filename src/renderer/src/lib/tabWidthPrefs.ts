import { useSyncExternalStore } from 'react'

// HOW WIDE A TAB IS (owner, 2026-09-23: "add a setting for tab width, where the
// user can pick fixed size or dynamic, so essentially what we got now and what
// we had before"). `fixed` is every tab one width (2026-09-21, #35), the
// default, so nobody's strip changes with the update; `fit` is the tab as wide
// as its name, up to a cap, which is how the strip was before #35. THIS APP'S
// OWN setting: the strip is the app's shell, not the terminal's, so its key is
// not `prism.term.*`. Read defensively: an unknown or missing value is fixed.

export type TabWidth = 'fixed' | 'fit'

const KEY = 'prism.window.tabWidth'

let listeners: Array<() => void> = []

export function validTabWidth(v: unknown): TabWidth {
  return v === 'fit' ? 'fit' : 'fixed'
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
