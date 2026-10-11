import { useSyncExternalStore } from 'react'

// THE WINDOW COLOURS CUSTOM KEEPS (owner, 2026-10-12: Save changes "never grey
// when there are changes to save"). Background, Accent and Secondary are this
// app's own picks over a theme, and a theme pick forgets them. Save changes
// keeps the ones in force with the Custom theme, so picking Custom brings them
// back, and while they differ from what the theme in front keeps, they are
// changes to save. Read defensively: anything unreadable is none kept.

export interface WindowColours {
  background: string | null
  accent: string | null
  secondary: string | null
}

export const NO_COLOURS: WindowColours = { background: null, accent: null, secondary: null }

const KEY = 'prism.window.customColours'
const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i

let listeners: Array<() => void> = []
let cache: { raw: string | null; value: WindowColours } = { raw: null, value: NO_COLOURS }

const one = (v: unknown): string | null => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : null)

export function validColours(v: unknown): WindowColours {
  if (!v || typeof v !== 'object') return NO_COLOURS
  const o = v as Record<string, unknown>
  return { background: one(o.background), accent: one(o.accent), secondary: one(o.secondary) }
}

/** What Custom keeps. One object per stored string, so a hook can compare it. */
export function customWindowColours(): WindowColours {
  const raw = localStorage.getItem(KEY)
  if (raw !== cache.raw) {
    let parsed: unknown
    try {
      parsed = raw ? JSON.parse(raw) : null
    } catch {
      parsed = null
    }
    cache = { raw, value: validColours(parsed) }
  }
  return cache.value
}

export function setCustomWindowColours(c: WindowColours | null): void {
  if (c) localStorage.setItem(KEY, JSON.stringify(validColours(c)))
  else localStorage.removeItem(KEY)
  listeners.forEach((l) => l())
}

export function onCustomWindowColours(cb: () => void): () => void {
  listeners.push(cb)
  return () => {
    listeners = listeners.filter((l) => l !== cb)
  }
}

export const useCustomWindowColours = (): WindowColours =>
  useSyncExternalStore(onCustomWindowColours, customWindowColours)

/** Whether the picks in force differ from what the theme in front keeps. */
export function coloursDiffer(now: WindowColours, kept: WindowColours): boolean {
  const n = validColours(now)
  return n.background !== kept.background || n.accent !== kept.accent || n.secondary !== kept.secondary
}
