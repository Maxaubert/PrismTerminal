import { useSyncExternalStore } from 'react'
import { SIDEBAR_SLIDE_MS } from './chromeLayout'
import { holdTermFit } from '@core/renderer/lib/fitHold'

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

// PINNED OR UNPINNED, THE SIDEBAR AND THE TERMINAL SLIDE TOGETHER (owner,
// 2026-10-14: a sidebar pinned from hidden must slide in; 2026-10-16: "the
// sidebar animates but the main view just switches"). For one slide the
// sidebar's room grows or shrinks on the slide's own curve while the sidebar
// itself slides in or out, so the edge between it and the terminal moves as
// one. The terminals keep their size all the while (core lib/fitHold) and fit
// once at the end: a shell resized every frame redraws every frame.
let sliding = false
let slideTimer: ReturnType<typeof setTimeout> | null = null

export function setSidebarMode(mode: SidebarMode): void {
  const was = sidebarMode()
  const next = validSidebarMode(mode)
  localStorage.setItem(MODE_KEY, next)
  if (was !== next) {
    if (slideTimer) clearTimeout(slideTimer)
    sliding = true
    // A frame past the slide, so its last frame is laid out before the fit.
    holdTermFit(SIDEBAR_SLIDE_MS + 40)
    slideTimer = setTimeout(() => {
      sliding = false
      slideTimer = null
      tell()
    }, SIDEBAR_SLIDE_MS + 40)
  }
  tell()
}

/** The mode the window is laid out in: the stored one, from the first frame
 *  of a slide (the room itself animates, `sidebarSliding`). */
export function sidebarLayout(): SidebarMode {
  return sidebarMode()
}

/** True while the sidebar slides in or out after a pin or an unpin. */
export function sidebarSliding(): boolean {
  return sliding
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
export const useSidebarLayout = (): SidebarMode => useSyncExternalStore(onSidebarChange, sidebarLayout)
export const useSidebarSliding = (): boolean => useSyncExternalStore(onSidebarChange, sidebarSliding)

/** Open becomes collapsed, collapsed becomes open. */
export function toggleSidebar(): void {
  setSidebarMode(sidebarMode() === 'open' ? 'collapsed' : 'open')
}
