import { useSyncExternalStore } from 'react'

// THE TAB SIDEBAR'S OWN STATE (#162; owner, 2026-10-11: "a sidebar you can have
// open as a static sidebar, or it can open as the cursor moves near it").
// `open` keeps it beside the terminal, the DEFAULT; `collapsed` hides it, and
// it slides over the terminal while the pointer is at the window's left edge.
// Its width is the user's, dragged at its edge, kept between launches. This
// app's own settings; read defensively.

export type SidebarMode = 'open' | 'collapsed'

const MODE_KEY = 'prism.window.sidebar'
const WIDTH_KEY = 'prism.window.sidebarWidth'

/** The width a new sidebar opens at, and the range a drag may take it to. */
export const SIDEBAR_WIDTH = { initial: 220, min: 150, max: 420 } as const

let listeners: Array<() => void> = []
const tell = (): void => listeners.forEach((l) => l())

export function validSidebarMode(v: unknown): SidebarMode {
  return v === 'collapsed' ? 'collapsed' : 'open'
}

/** A stored width, as a whole number within the range; anything else is the initial width. */
export function validSidebarWidth(v: unknown): number {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : typeof v === 'number' ? v : NaN
  if (!Number.isFinite(n)) return SIDEBAR_WIDTH.initial
  return Math.round(Math.min(SIDEBAR_WIDTH.max, Math.max(SIDEBAR_WIDTH.min, n)))
}

export function sidebarMode(): SidebarMode {
  return validSidebarMode(localStorage.getItem(MODE_KEY))
}

export function setSidebarMode(mode: SidebarMode): void {
  localStorage.setItem(MODE_KEY, validSidebarMode(mode))
  tell()
}

export function sidebarWidth(): number {
  return validSidebarWidth(localStorage.getItem(WIDTH_KEY))
}

export function setSidebarWidth(px: number): void {
  localStorage.setItem(WIDTH_KEY, String(validSidebarWidth(px)))
  tell()
}

export function onSidebarChange(cb: () => void): () => void {
  listeners.push(cb)
  return () => {
    listeners = listeners.filter((l) => l !== cb)
  }
}

export const useSidebarMode = (): SidebarMode => useSyncExternalStore(onSidebarChange, sidebarMode)
export const useSidebarWidth = (): number => useSyncExternalStore(onSidebarChange, sidebarWidth)

/** Open becomes collapsed, collapsed becomes open. */
export function toggleSidebar(): void {
  setSidebarMode(sidebarMode() === 'open' ? 'collapsed' : 'open')
}
