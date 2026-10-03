import { useSyncExternalStore } from 'react'
import { parseColour, toStored } from '@core/renderer/lib/colour'

// A WINDOW COLOUR the user may pick over the theme's own: the accent and the
// background (owner, 2026-09-22). One shape for both: unset means "follow the
// theme", set is a six-digit hex, anything else in the store reads as unset.
// This app's own settings, like the edges: in Prism the window's colours
// belong to its app style, so none of this is the core's.

const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i

/** The stored form of a 6 or 8 digit hex, or null. */
const canonical = (v: string | null | undefined): string | null =>
  v && HEX.test(v) ? toStored(parseColour(v)!) : null

export interface ColourPref {
  /** The chosen colour in its stored form, or null to follow the theme. */
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
      return canonical(raw)
    } catch {
      return null
    }
  }
  const set = (hex: string | null): void => {
    try {
      const v = canonical(hex)
      if (v) localStorage.setItem(key, v)
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
