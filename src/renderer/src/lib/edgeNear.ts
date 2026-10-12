import { useSyncExternalStore } from 'react'
import type { EdgeNear } from '@shared/types'

/**
 * WHERE THE POINTER IS AGAINST THE WINDOW'S TOP AND LEFT EDGES, AS MAIN READS
 * IT (#162 follow-up, `src/main/edgeWatch.ts`): the page gets no pointer move
 * over Windows' resize border or a drag region, so the hidden title bar and the
 * collapsed sidebar also listen to main. Main polls only while someone here is
 * listening; the last one to go stops it.
 */
export type { EdgeNear }

const NONE: EdgeNear = { top: false, left: false, x: -1, y: -1 }
let near: EdgeNear = NONE
let users = 0
let off: (() => void) | null = null
const listeners = new Set<() => void>()

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  users += 1
  if (users === 1) {
    off = window.prism.onEdgeNear((n) => {
      near = n
      listeners.forEach((l) => l())
    })
    window.prism.watchEdges(true)
  }
  return () => {
    listeners.delete(cb)
    users -= 1
    if (users === 0) {
      window.prism.watchEdges(false)
      off?.()
      off = null
      near = NONE
    }
  }
}

const noop = (): (() => void) => () => {}
const none = (): EdgeNear => NONE

/** Main's reading while `on`; nothing (and no polling) while off. */
export function useEdgeNear(on: boolean): EdgeNear {
  return useSyncExternalStore(on ? subscribe : noop, on ? () => near : none)
}

/** Whether main's cursor is where `wants` says, re-rendering only when that
 *  answer changes (the cursor itself moves twenty times a second). `wants`
 *  gets null until main has said anything. */
export function useEdgeWants(
  on: boolean,
  wants: (p: { x: number; y: number } | null) => boolean
): boolean {
  return useSyncExternalStore(on ? subscribe : noop, () => on && wants(near === NONE ? null : near))
}
