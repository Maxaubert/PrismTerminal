import { useSyncExternalStore } from 'react'

/**
 * WHERE THE SIDEBAR'S RIGHT EDGE IS ON SCREEN RIGHT NOW (#162): its width while
 * it is open or slid out, 0 while it is collapsed away. The pop-out title bar
 * starts there (owner, 2026-10-11: "the titlebar should drop down from the
 * sidebar edge and until the right edge. not overlay over the sidebar"), which
 * a stored width alone could not say: a collapsed sidebar that has slid out,
 * or one being resized, is not where the setting says.
 */
let edge = 0
let listeners: Array<() => void> = []

export function setSidebarEdge(px: number): void {
  if (px === edge) return
  edge = px
  listeners.forEach((l) => l())
}

export function onSidebarEdge(cb: () => void): () => void {
  listeners.push(cb)
  return () => {
    listeners = listeners.filter((l) => l !== cb)
  }
}

export const useSidebarEdge = (): number => useSyncExternalStore(onSidebarEdge, () => edge)
