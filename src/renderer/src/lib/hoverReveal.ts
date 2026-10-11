import { useEffect, useRef, useState } from 'react'

/**
 * SOMETHING THAT SHOWS WHILE THE POINTER IS NEAR IT (#162): the collapsed tab
 * sidebar at the window's left edge, and the hidden title bar at its top (owner,
 * 2026-10-11: the sidebar "can open as the cursor moves near it"; the title bar
 * "should be invisible, and only appear when your cursor is near the top").
 *
 * A short wait before it opens, so a pointer passing the edge on its way
 * somewhere does not flash it, and a longer grace before it goes, so a hand
 * that slips off for a moment (the owner works zoomed in, where a few pixels
 * of travel are a long way) does not lose it. `hold` keeps it open whatever the
 * pointer does: a menu it opened is still in use.
 */
export const REVEAL = {
  /** How close to the window's edge the pointer must be, in CSS pixels: the
   *  left edge 24 (owner, 2026-10-11: "it reacts a bit too late, my cursor
   *  needs to be essentially at the edge, could be better if it was like
   *  20px further into the window"), the top 16, where the terminal's first
   *  row also lives. */
  zone: 8,
  left: 24,
  top: 16,
  openDelay: 60,
  closeDelay: 340
} as const

export interface Reveal {
  /** The pointer moved: does it want the thing shown? */
  feel: (wants: boolean) => void
  /** Keep it shown regardless (a menu of its own is open), or let go. */
  hold: (on: boolean) => void
  /** Put it away now (the pointer left the window, the feature was turned off). */
  hide: () => void
  dispose: () => void
}

/** The timing on its own, without React, so a test can drive it. */
export function createReveal(onChange: (shown: boolean) => void, delays = REVEAL): Reveal {
  let shown = false
  let held = false
  let wants = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: boolean | null = null
  const clear = (): void => {
    if (timer) clearTimeout(timer)
    timer = null
    pending = null
  }
  const set = (v: boolean): void => {
    clear()
    if (shown === v) return
    shown = v
    onChange(v)
  }
  const aim = (): void => {
    const target = held || wants
    if (target === shown) {
      clear()
      return
    }
    if (pending === target) return
    clear()
    pending = target
    timer = setTimeout(() => set(target), target ? delays.openDelay : delays.closeDelay)
  }
  return {
    feel: (w) => {
      wants = w
      aim()
    },
    hold: (on) => {
      held = on
      aim()
    },
    hide: () => {
      wants = false
      if (!held) set(false)
    },
    dispose: clear
  }
}

/**
 * The hook: listens to every pointer move in the window while `enabled`, asks
 * `wants` whether this one is near enough, and answers whether it is shown.
 * Leaving the window puts it away after the grace; turning it off, at once.
 */
export function useHoverReveal(
  enabled: boolean,
  wants: (e: PointerEvent) => boolean,
  hold = false
): boolean {
  const [shown, setShown] = useState(false)
  const reveal = useRef<Reveal | null>(null)
  const ask = useRef(wants)
  useEffect(() => {
    ask.current = wants
  })
  useEffect(() => {
    if (!enabled) return
    const r = createReveal(setShown)
    reveal.current = r
    const onMove = (e: PointerEvent): void => r.feel(ask.current(e))
    const onLeave = (): void => r.feel(false)
    window.addEventListener('pointermove', onMove, { capture: true, passive: true })
    document.documentElement.addEventListener('mouseleave', onLeave)
    window.addEventListener('blur', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove, { capture: true })
      document.documentElement.removeEventListener('mouseleave', onLeave)
      window.removeEventListener('blur', onLeave)
      r.dispose()
      reveal.current = null
      setShown(false)
    }
  }, [enabled])
  useEffect(() => {
    reveal.current?.hold(hold)
  }, [hold, enabled])
  return enabled && shown
}
