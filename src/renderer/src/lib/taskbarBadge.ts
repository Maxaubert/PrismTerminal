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

/** A DARK DISC WITH A WHITE NUMBER, AS CRISP AS THE OTHER APPS' (owner,
 *  2026-09-29: "it should be grey with white number"; then 2026-10-01, beside
 *  ChatGPT's: "its so much clearer and high res fix that"). One look whatever
 *  the marks are: the tab lines carry the colour; the taskbar only counts.
 *  The fill is the reference's own near-black (sampled from the owner's
 *  screenshot), and white on it is over 15:1. */
export const BADGE_FILL = '#25242c'
export const BADGE_INK = '#ffffff'

/** The overlay is 16 logical pixels, drawn at this many physical ones. */
export function badgePixels(scale: number): number {
  const s = Number.isFinite(scale) && scale > 0 ? Math.min(scale, 4) : 1
  return Math.round(16 * s)
}

/**
 * The disc as a PNG data url, drawn at the display's REAL pixel size (36 at
 * 225%), so Windows shows it as drawn: a fixed 32px canvas handed over as a
 * 1x image was stretched, which is what made it soft. Main is told the scale
 * with it (`setTaskbarBadge`), so the image is that scale's own picture. The
 * disc fills the overlay, as the reference does.
 */
export function drawBadge(count: number, scale: number): string {
  const size = badgePixels(scale)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const g = canvas.getContext('2d')
  if (!g) return ''
  const c = size / 2
  g.fillStyle = BADGE_FILL
  g.beginPath()
  g.arc(c, c, c, 0, Math.PI * 2)
  g.fill()
  const text = badgeText(count)
  g.fillStyle = BADGE_INK
  g.font = `600 ${Math.round(size * (text.length > 1 ? 0.5 : 0.66))}px "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  // Segoe's figures sit a touch high on the middle line: a nudge down centres them.
  g.fillText(text, c, c + size * 0.04)
  return canvas.toDataURL('image/png')
}
