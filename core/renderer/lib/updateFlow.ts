import type { UpdateInfo, UpdatePhase } from '../../shared/updateTypes'

// What the update chip and its window are doing, as one pure reducer (#28).
//
// The chip used to install on a click. Owner, 2026-09-19: "when you click the
// Update badge, it opens like a pop window, which shows the change log or like
// patch notes for the new update, and then you can choose cancel or install."
// So there are now two things on screen that must agree (a chip and a window),
// and three ways for an install to end (the app quits under the installer, the
// download fails, or it was a preview). Written as a reducer so every one of
// those is a test and not a sequence of setState calls in two apps.
//
// The hook that drives it is `useUpdateFlow`; this file knows nothing about
// React, the bridge or a host.

/** Said under the chip when a preview's fake install finishes. */
export const PREVIEW_DONE = 'Preview only: nothing was installed'
/** Said under the chip when a real download failed. It used to fail silently:
 *  the chip went from 37% back to "Update" and said nothing about why. */
export const INSTALL_FAILED = 'The update could not be downloaded. Nothing was installed.'

export interface UpdateFlow {
  /** The offer. Null means no chip at all. */
  info: UpdateInfo | null
  phase: UpdatePhase
  /** 0 to 100, whole, and only ever rising within one install. */
  pct: number
  /** The window with the notes is up. */
  open: boolean
  /** A line under the chip, about the install that just ended. */
  notice: string | null
}

export const NO_UPDATE: UpdateFlow = {
  info: null,
  phase: 'idle',
  pct: 0,
  open: false,
  notice: null
}

export type UpdateAction =
  | { type: 'available'; info: UpdateInfo }
  /** The chip was clicked. */
  | { type: 'open' }
  /** Cancel, Escape, or a click outside the window. */
  | { type: 'cancel' }
  /** Install was chosen AND the host let it start (its close question, if it
   *  has one to ask, comes before this). */
  | { type: 'install' }
  | { type: 'progress'; pct: number }
  /** The bridge answered. `ok` means the app is about to quit under the
   *  installer; false means nothing was installed. */
  | { type: 'settled'; ok: boolean }
  | { type: 'dismiss' }

/** `Number(undefined)` is NaN and a bar at NaN% is a bar at 0: read it as one. */
const wholePct = (n: number): number =>
  Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0

export function updateFlow(s: UpdateFlow, a: UpdateAction): UpdateFlow {
  switch (a.type) {
    case 'available':
      // An offer that arrives mid-install is not swapped in under the bar: what
      // is downloading is the one the user read the notes for.
      return s.phase === 'idle' ? { ...s, info: a.info } : s
    case 'open':
      return s.info && s.phase === 'idle' ? { ...s, open: true, notice: null } : s
    case 'cancel':
      return s.open ? { ...s, open: false } : s
    case 'install':
      return s.info && s.phase === 'idle'
        ? { ...s, open: false, phase: 'downloading', pct: 0, notice: null }
        : s
    case 'progress': {
      if (s.phase === 'idle') return s
      const pct = Math.max(s.pct, wholePct(a.pct))
      return { ...s, pct, phase: pct >= 100 ? 'installing' : s.phase }
    }
    case 'settled':
      if (s.phase === 'idle' || a.ok) return s
      return {
        ...s,
        phase: 'idle',
        pct: 0,
        open: false,
        notice: s.info?.mock ? PREVIEW_DONE : INSTALL_FAILED
      }
    case 'dismiss':
      return s.notice === null ? s : { ...s, notice: null }
  }
}
