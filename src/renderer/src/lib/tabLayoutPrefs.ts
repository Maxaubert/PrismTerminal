import { useSyncExternalStore } from 'react'

// WHERE THE TABS SIT (#162; owner, 2026-10-11: "we have a switch for horizontal
// and vertical"): `horizontal`, the strip under the title bar as it has always
// been and the DEFAULT, so nobody's window changes with the update; or
// `vertical`, a sidebar down the window's left side. This app's own setting
// (the window's chrome), so its key is not `prism.term.*`. Read defensively:
// anything unknown is horizontal.

export type TabLayout = 'horizontal' | 'vertical'

const KEY = 'prism.window.tabLayout'

let listeners: Array<() => void> = []

export function validTabLayout(v: unknown): TabLayout {
  return v === 'vertical' ? 'vertical' : 'horizontal'
}

export function tabLayout(): TabLayout {
  return validTabLayout(localStorage.getItem(KEY))
}

export function setTabLayout(layout: TabLayout): void {
  localStorage.setItem(KEY, validTabLayout(layout))
  listeners.forEach((l) => l())
}

export function onTabLayoutChange(cb: () => void): () => void {
  listeners.push(cb)
  return () => {
    listeners = listeners.filter((l) => l !== cb)
  }
}

export const useTabLayout = (): TabLayout => useSyncExternalStore(onTabLayoutChange, tabLayout)
