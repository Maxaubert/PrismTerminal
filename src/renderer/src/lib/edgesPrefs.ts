import { useSyncExternalStore } from 'react'
import { validWindowEdges, type WindowEdges } from '@shared/windowEdges'

// How strongly the window draws its edges: hairline, faint, solid or none
// (owner, 2026-09-19, #27; the words and the numbers are in
// `@shared/windowEdges`). THIS APP'S OWN setting, not the terminal's: it is
// about the window's chrome, which in Prism belongs to the app style, so it is
// not one of the core's options and its key is not `prism.term.*`.
//
// Read defensively, like every stored choice here: a key that was never set,
// or holds a word this build does not know, is the default, and the default is
// the look the window had before the setting existed.

const KEY = 'prism.window.edges'

let listeners: Array<() => void> = []

export function windowEdges(): WindowEdges {
  return validWindowEdges(localStorage.getItem(KEY))
}

export function setWindowEdges(edges: WindowEdges): void {
  localStorage.setItem(KEY, validWindowEdges(edges))
  listeners.forEach((l) => l())
}

/** For App, which repaints the chrome and tells main: Settings writes the
 *  store and nothing else, the same deal the terminal's look has. */
export function onWindowEdgesChange(cb: () => void): () => void {
  listeners.push(cb)
  return () => {
    listeners = listeners.filter((l) => l !== cb)
  }
}

export const useWindowEdges = (): WindowEdges =>
  useSyncExternalStore(onWindowEdgesChange, windowEdges)
