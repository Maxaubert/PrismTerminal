import { useSyncExternalStore } from 'react'

/**
 * THE TASKBAR BADGE (2026-09-28; owner: "a badge on the taskbar icon, where
 * it says how many sessions have completed without me having taken a look at
 * them yet"). The number is every tab showing an attention mark (finished or
 * a question, each only while its own switch is on), since both are sessions
 * that need a look. Windows has no numeric badge for a desktop app, so it is
 * a disc drawn ONTO the app icon here, set by main as the window icon. This
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

/** The app icon is drawn at this size, and the badge on it. */
export const ICON_PX = 256
/** The disc's radius on the 256px icon, and the clear ring round it that
 *  keeps it off the orange. The disc touches the icon's top right corner. */
export const BADGE_R = 70
export const BADGE_GAP = 8

/**
 * THE BADGE IS PART OF THE ICON, NOT AN OVERLAY (#108; owner, 2026-10-01:
 * "the badge is very low res compared to gpts"). Windows draws a desktop
 * app's overlay icon from a small picture and STRETCHES it: MEASURED on the
 * real taskbar at 225%, a 36px overlay, plain or marked 2.25x, came out soft
 * either way. ChatGPT's crisp badge is the badge API of a packaged (MSIX)
 * app, which this app is not. The taskbar draws the WINDOW icon sharp, so the
 * disc is drawn onto the app icon at 256px and main sets that as the window
 * icon (MEASURED side by side: as crisp as ChatGPT's). Returns a PNG data url,
 * or '' when there is no canvas.
 */
export function drawBadgedIcon(count: number, icon: CanvasImageSource): string {
  const canvas = document.createElement('canvas')
  canvas.width = ICON_PX
  canvas.height = ICON_PX
  const g = canvas.getContext('2d')
  if (!g) return ''
  g.drawImage(icon, 0, 0, ICON_PX, ICON_PX)
  const cx = ICON_PX - BADGE_R
  const cy = BADGE_R
  g.globalCompositeOperation = 'destination-out'
  g.beginPath()
  g.arc(cx, cy, BADGE_R + BADGE_GAP, 0, Math.PI * 2)
  g.fill()
  g.globalCompositeOperation = 'source-over'
  g.fillStyle = BADGE_FILL
  g.beginPath()
  g.arc(cx, cy, BADGE_R, 0, Math.PI * 2)
  g.fill()
  const text = badgeText(count)
  const d = BADGE_R * 2
  g.fillStyle = BADGE_INK
  g.font = `400 ${Math.round(d * (text.length > 1 ? 0.5 : 0.66))}px "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  // Segoe's figures sit a touch high on the middle line: a nudge down centres them.
  g.fillText(text, cx, cy + d * 0.04)
  return canvas.toDataURL('image/png')
}

let iconLoad: Promise<HTMLImageElement> | null = null
/** The app icon as an image, loaded once. */
export function appIcon(url: string): Promise<HTMLImageElement> {
  iconLoad ??= new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => {
      iconLoad = null
      reject(new Error('app icon did not load'))
    }
    img.src = url
  })
  return iconLoad
}

