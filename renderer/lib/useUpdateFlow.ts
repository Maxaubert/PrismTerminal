import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { UpdateInfo } from '../../shared/updateTypes'
import { NO_UPDATE, updateFlow, type UpdateFlow } from './updateFlow'

// The update chip and its window, wired to a host (#28). The rules are
// `updateFlow`'s; this is only the plumbing both apps would otherwise write
// twice: listen for the offer and the progress, run the install, clear the
// line under the chip after a while.
//
// THE BRIDGE IS HANDED IN, as everything a host owns is (core/README.md): the
// core never reads `window.prism`. Both apps' preloads already spell these
// three members the same way, so each passes its own bridge object as it is.

/** The three members of a host's preload this needs. */
export interface UpdateBridge {
  /** Subscribe to the offer; returns the unsubscribe. */
  onUpdate(cb: (info: UpdateInfo) => void): () => void
  /** Subscribe to the download percentage; returns the unsubscribe. */
  onUpdateProgress(cb: (pct: number) => void): () => void
  /** Download and hand off. Resolves false when nothing was installed; on
   *  success the app quits under the installer and this never matters. */
  installUpdate(url: string): Promise<boolean>
}

/**
 * What a host wants settled BEFORE an install starts, because a real install
 * ends in the app quitting: this app asks about an agent that is mid-answer,
 * Prism asks about unsaved text as well. It is given `start` and calls it if
 * and when the answer is yes; never calling it is the cancel.
 */
export type InstallGuard = (start: () => void) => void

/** How long the line under the chip stays if nobody dismisses it. */
const NOTICE_MS = 8000

export interface UpdateFlowHandle {
  state: UpdateFlow
  /** The chip was clicked. */
  open: () => void
  /** Cancel, Escape, a click outside. */
  cancel: () => void
  /** Install was chosen in the window. */
  install: () => void
  dismissNotice: () => void
}

export function useUpdateFlow(bridge: UpdateBridge, guard?: InstallGuard): UpdateFlowHandle {
  const [state, dispatch] = useReducer(updateFlow, NO_UPDATE)
  // The latest of both, for callbacks that must stay stable.
  const live = useRef({ state, guard })
  useEffect(() => {
    live.current = { state, guard }
  })

  useEffect(() => bridge.onUpdate((info) => dispatch({ type: 'available', info })), [bridge])
  useEffect(() => bridge.onUpdateProgress((pct) => dispatch({ type: 'progress', pct })), [bridge])

  useEffect(() => {
    if (state.notice === null) return
    const t = setTimeout(() => dispatch({ type: 'dismiss' }), NOTICE_MS)
    return () => clearTimeout(t)
  }, [state.notice])

  const open = useCallback(() => dispatch({ type: 'open' }), [])
  const cancel = useCallback(() => dispatch({ type: 'cancel' }), [])
  const dismissNotice = useCallback(() => dispatch({ type: 'dismiss' }), [])

  const install = useCallback(() => {
    const { state: s, guard: g } = live.current
    const info = s.info
    if (!info || s.phase !== 'idle') return
    // The window goes either way: the host's own question, if it has one, must
    // not be asked from behind it, and progress is the chip's to show.
    dispatch({ type: 'cancel' })
    const start = (): void => {
      dispatch({ type: 'install' })
      void bridge.installUpdate(info.url).then(
        (ok) => dispatch({ type: 'settled', ok }),
        () => dispatch({ type: 'settled', ok: false })
      )
    }
    // A PREVIEW ASKS NOTHING. The host's question is "this will close the app
    // and end what your agent is doing", and a preview closes nothing: asking
    // it there would be the app lying to make a demo look real.
    if (info.mock || !g) start()
    else g(start)
  }, [bridge])

  return { state, open, cancel, install, dismissNotice }
}
