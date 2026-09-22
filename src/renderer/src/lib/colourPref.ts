import { useSyncExternalStore } from 'react'

// A WINDOW COLOUR the user may pick over the theme's own: the accent and the
// background (owner, 2026-09-22). One shape for both: unset means "follow the
// theme", set is a six-digit hex, anything else in the store reads as unset.
// This app's own settings, like the edges: in Prism the window's colours
// belong to its app style, so none of this is the core's.

const HEX = /^#[0-9a-f]{6}$/i

export interface ColourPref {
  /** The chosen colour, lower case, or null to follow the theme. */
  get: () => string | null
  /** A hex colour to wear, or null to follow the theme again. */
  set: (hex: string | null) => void
  /** For App, which repaints the chrome: Settings writes the store and
   *  nothing else, the same deal the edges have. */
  onChange: (cb: () => void) => () => void
  use: () => string | null
}

export function colourPref(key: string): ColourPref {
  let listeners: Array<() => void> = []
  const get = (): string | null => {
    try {
      const raw = localStorage.getItem(key)
      return raw && HEX.test(raw) ? raw.toLowerCase() : null
    } catch {
      return null
    }
  }
  const set = (hex: string | null): void => {
    try {
      if (hex && HEX.test(hex)) localStorage.setItem(key, hex.toLowerCase())
      else localStorage.removeItem(key)
    } catch {
      /* a full or blocked store loses the choice, not the app */
    }
    listeners.forEach((l) => l())
  }
  const onChange = (cb: () => void): (() => void) => {
    listeners.push(cb)
    return () => {
      listeners = listeners.filter((l) => l !== cb)
    }
  }
  return { get, set, onChange, use: () => useSyncExternalStore(onChange, get) }
}
