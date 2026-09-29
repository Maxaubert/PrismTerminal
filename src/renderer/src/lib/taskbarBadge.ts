import { useSyncExternalStore } from 'react'

/**
 * THE TASKBAR BADGE (2026-09-28; owner: "a badge on the taskbar icon, where
 * it says how many sessions have completed without me having taken a look at
 * them yet"). The number is every tab showing an attention mark (finished or
 * a question, each only while its own switch is on), since both are sessions
 * that need a look. Windows has no numeric badge for a desktop app, so it is
 * the window's OVERLAY icon: a small disc drawn here and set by main. This
 * app's own setting, on by default (`prism.window.taskbarBadge`).
 */
const KEY = 'prism.window.taskbarBadge'
let listeners: Array<() => void> = []

export function taskbarBadgeOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0'
  } catch {
    return true
  }
}
export function setTaskbarBadgeOn(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    /* a blocked store loses the choice, not the app */
  }
  listeners.forEach((l) => l())
}
const sub = (cb: () => void): (() => void) => {
  listeners.push(cb)
  return () => {
    listeners = listeners.filter((l) => l !== cb)
  }
}
export const useTaskbarBadgeOn = (): boolean => useSyncExternalStore(sub, taskbarBadgeOn)

/** How many tabs want a look: the marks the strip is showing. Pure. */
export function attentionCount(p: {
  doneIds: ReadonlySet<string>
  questionIds: ReadonlySet<string>
  workingIds: ReadonlySet<string>
  doneOn: boolean
  questionOn: boolean
}): { count: number; question: boolean } {
  const ids = new Set<string>()
  let question = false
  if (p.questionOn)
    for (const id of p.questionIds)
      if (!p.workingIds.has(id)) {
        ids.add(id)
        question = true
      }
  if (p.doneOn) for (const id of p.doneIds) if (!p.workingIds.has(id)) ids.add(id)
  return { count: ids.size, question }
}

/** What the badge says: the count, and "9+" past nine, since the disc is a
 *  few pixels across. */
export function badgeText(count: number): string {
  return count > 9 ? '9+' : String(count)
}

/** A QUIET GREY DISC WITH A WHITE NUMBER (owner, 2026-09-29, of the first
 *  one: "it's a bit too big and it's green, it should be grey with white
 *  number"). One look whatever the marks are: the tab lines carry the colour;
 *  the taskbar only counts. White on this grey is 7:1. */
export const BADGE_FILL = '#5c5c5c'
export const BADGE_INK = '#ffffff'

/** The disc as a PNG data url, drawn on a 32px canvas (Windows scales it to
 *  the overlay's 16 logical pixels). The disc takes 24 of the 32, in the
 *  bottom-right corner, so it sits smaller on the icon than a full overlay. */
export function drawBadge(count: number): string {
  const size = 32
  const d = 24
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const g = canvas.getContext('2d')
  if (!g) return ''
  const c = size - d / 2
  g.fillStyle = BADGE_FILL
  g.beginPath()
  g.arc(c, c, d / 2, 0, Math.PI * 2)
  g.fill()
  const text = badgeText(count)
  g.fillStyle = BADGE_INK
  g.font = `600 ${text.length > 1 ? 13 : 16}px Segoe UI, system-ui, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, c, c + 1)
  return canvas.toDataURL('image/png')
}
