import { useSyncExternalStore } from 'react'

// THE TAB STYLE (#143; owner, 2026-10-10): Classic, the flat strip as it has
// always been and the DEFAULT, so nobody's window changes with the update; or
// Powerline (stored as 'prompt', so saved choices survive), chevron segments whose arrow edge is the agent mark. THIS APP'S OWN
// setting: the strip is the app's shell, not the terminal's, so its key is not
// `prism.term.*`. Read defensively: anything unknown is Classic. The owner
// called the first one "Current"; a choice cannot be named Current once there
// are two, so it is Classic, one word to change if he prefers another.

export type TabStyle = 'classic' | 'prompt'

const KEY = 'prism.window.tabStyle'

let listeners: Array<() => void> = []

export function validTabStyle(v: unknown): TabStyle {
  return v === 'prompt' ? 'prompt' : 'classic'
}

export function tabStyle(): TabStyle {
  return validTabStyle(localStorage.getItem(KEY))
}

export function setTabStyle(style: TabStyle): void {
  localStorage.setItem(KEY, validTabStyle(style))
  listeners.forEach((l) => l())
}

export function onTabStyleChange(cb: () => void): () => void {
  listeners.push(cb)
  return () => {
    listeners = listeners.filter((l) => l !== cb)
  }
}

export const useTabStyle = (): TabStyle => useSyncExternalStore(onTabStyleChange, tabStyle)
