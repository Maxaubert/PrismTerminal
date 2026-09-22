import { useSyncExternalStore } from 'react'

// THE WINDOW'S ACCENT, chosen (owner, 2026-09-22: "add an accent colour option
// which would pick the accents you see, like the blue highlight effect and tab
// effect"). Unset, the accent is the theme's own, exactly as before: the
// preset's opinion if it has one, else its blue. Set, it is this colour, and
// every token derived from the accent - the selection fill, the ink on it, the
// active tab's rule, the brighter variant - follows it.
//
// THIS APP'S OWN setting, like the edges (edgesPrefs.ts): the accent is the
// window's chrome, which in Prism belongs to the app style and has a picker of
// its own there, so it is not one of the core's options and Prism's terminal
// page never shows it.
//
// Read defensively: anything that is not a six-digit hex is "follow the theme".

const KEY = 'prism.window.accent'

let listeners: Array<() => void> = []

const HEX = /^#[0-9a-f]{6}$/i

/** The chosen accent, lower case, or null to follow the theme. */
export function windowAccent(): string | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw && HEX.test(raw) ? raw.toLowerCase() : null
  } catch {
    return null
  }
}

/** A hex colour to wear it, or null to follow the theme again. */
export function setWindowAccent(hex: string | null): void {
  try {
    if (hex && HEX.test(hex)) localStorage.setItem(KEY, hex.toLowerCase())
    else localStorage.removeItem(KEY)
  } catch {
    /* a full or blocked store loses the choice, not the app */
  }
  listeners.forEach((l) => l())
}

/** For App, which repaints the chrome: Settings writes the store and nothing
 *  else, the same deal the edges have. */
export function onWindowAccentChange(cb: () => void): () => void {
  listeners.push(cb)
  return () => {
    listeners = listeners.filter((l) => l !== cb)
  }
}

export const useWindowAccent = (): string | null => useSyncExternalStore(onWindowAccentChange, windowAccent)
