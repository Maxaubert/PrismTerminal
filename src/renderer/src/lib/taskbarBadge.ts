import { useEffect } from 'react'
import { useAgentDoneOn, useAgentFailedOn, useAgentQuestionOn } from '@core/renderer/lib/termLook'
import { boolPref } from '@core/renderer/lib/prefStore'

/**
 * THE TASKBAR BADGE (2026-09-28; owner: "a badge on the taskbar icon, where
 * it says how many sessions have completed without me having taken a look at
 * them yet"). The number is every tab showing an attention mark (finished,
 * a question or failed (#131), each only while its own switch is on), since all are sessions
 * that need a look. Windows has no numeric badge for a desktop app, so it is
 * the window's OVERLAY icon: a small disc drawn here and set by main. This
 * app's own setting, on by default (`prism.window.taskbarBadge`).
 */
const pref = boolPref('prism.window.taskbarBadge', true)

export const taskbarBadgeOn = pref.get
export const setTaskbarBadgeOn = pref.set
export const useTaskbarBadgeOn = pref.use

/** How many tabs want a look: the marks the strip is showing. Pure. */
export function attentionCount(p: {
  doneIds: ReadonlySet<string>
  questionIds: ReadonlySet<string>
  workingIds: ReadonlySet<string>
  doneOn: boolean
  questionOn: boolean
  /** A turn that ended on an error (#131); absent, nothing failed. */
  failedIds?: ReadonlySet<string>
  failedOn?: boolean
}): { count: number; question: boolean } {
  const ids = new Set<string>()
  let question = false
  if (p.questionOn)
    for (const id of p.questionIds)
      if (!p.workingIds.has(id)) {
        ids.add(id)
        question = true
      }
  if (p.failedOn && p.failedIds) for (const id of p.failedIds) if (!p.workingIds.has(id)) ids.add(id)
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
  g.font = `400 ${Math.round(size * (text.length > 1 ? 0.56 : 0.8))}px "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  // Segoe's figures sit a touch high on the middle line: a nudge down centres them.
  g.fillText(text, c, c + size * 0.04)
  return canvas.toDataURL('image/png')
}

/** The badge kept in step with the marks, the switches and the setting
 *  (moved out of App, audit 2026-10-12): a small grey disc with a white
 *  number (2026-09-29, the owner's look), or none. */
export function useTaskbarBadge(ids: {
  doneIds: ReadonlySet<string>
  questionIds: ReadonlySet<string>
  workingIds: ReadonlySet<string>
  failedIds: ReadonlySet<string>
}): void {
  const badgeOn = useTaskbarBadgeOn()
  const doneOn = useAgentDoneOn()
  const questionOn = useAgentQuestionOn()
  const failedOn = useAgentFailedOn()
  const need = attentionCount({ ...ids, doneOn, questionOn, failedOn })
  useEffect(() => {
    if (!badgeOn || need.count === 0) {
      window.prism.setTaskbarBadge(null, '')
      return
    }
    const said = `${need.count} ${need.count === 1 ? 'tab needs' : 'tabs need'} a look`
    const scale = window.devicePixelRatio || 1
    window.prism.setTaskbarBadge(drawBadge(need.count, scale) || null, said, scale)
  }, [badgeOn, need.count])
}
