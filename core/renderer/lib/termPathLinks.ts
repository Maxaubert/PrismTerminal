import { termApi } from '../host'
import { findLinks } from './termLinks'
import { findPaths, type PathCandidate } from './termPaths'

/**
 * WHICH PATHS ON SCREEN EXIST (#99). The painter and the click both ask
 * `known`; a path nobody has asked about yet is queued and asked about in one
 * batch, and when any turns out to exist, `onPathsFound` listeners paint
 * again. So a path lights up a moment after it is printed, and only if it is
 * real: nothing is painted that a click could not open.
 *
 * Per folder, since `docs/a.pdf` is a different file in every shell. A "no" is
 * forgotten after a while, so a file written after its name was printed
 * lights up the next time the screen is looked at; a "yes" stays.
 */
export interface PathHit {
  kind: 'file' | 'dir'
  abs: string
}

const NO_TTL_MS = 15_000
const MAX_ENTRIES = 5000
const BATCH_MS = 40

const cache = new Map<string, { hit: PathHit | null; at: number }>()
const queued = new Map<string, Set<string>>()
const inFlight = new Set<string>()
let timer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

const key = (cwd: string, path: string): string => `${cwd}\n${path}`

/** A hit, null when it is known to name nothing, undefined when unknown. */
export function knownPath(cwd: string, path: string): PathHit | null | undefined {
  const e = cache.get(key(cwd, path))
  if (!e) return undefined
  if (!e.hit && Date.now() - e.at > NO_TTL_MS) return undefined
  return e.hit
}

export function onPathsFound(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function flush(): void {
  timer = undefined
  const ask = termApi().termPathKinds
  const batches = [...queued]
  queued.clear()
  if (!ask) return
  for (const [cwd, set] of batches) {
    const list = [...set]
    list.forEach((p) => inFlight.add(key(cwd, p)))
    void ask(cwd, list)
      .then((hits) => {
        if (cache.size > MAX_ENTRIES) cache.clear()
        let found = false
        const at = Date.now()
        list.forEach((p, i) => {
          const hit = hits?.[i] ?? null
          cache.set(key(cwd, p), { hit, at })
          if (hit) found = true
        })
        if (found) listeners.forEach((fn) => fn())
      })
      .catch(() => {})
      .finally(() => list.forEach((p) => inFlight.delete(key(cwd, p))))
  }
}

function request(cwd: string, paths: string[]): void {
  let set = queued.get(cwd)
  for (const p of paths) {
    if (inFlight.has(key(cwd, p))) continue
    if (!set) queued.set(cwd, (set = new Set()))
    set.add(p)
  }
  if (set && set.size && timer === undefined) timer = setTimeout(flush, BATCH_MS)
}

/**
 * The path candidates in `text` that are not inside a web link, and not a
 * PROMPT: PowerShell's `PS C:\work>` and cmd's `C:\work>` name the folder the
 * shell is in, it always exists, and a link on every prompt line is noise
 * (MEASURED in the first screenshot of this). A path that runs straight into
 * `>` is left alone.
 */
export function pathCandidates(text: string, links = findLinks(text)): PathCandidate[] {
  return findPaths(text).filter(
    (c) => text[c.end] !== '>' && !links.some((l) => c.start < l.end && l.start < c.end)
  )
}

/**
 * Everything in `text` that wears the link colour: the web links, and the
 * paths known to exist from `cwd`. Unknown paths are asked about on the way.
 */
export function linkRanges(text: string, cwd: string | null): Array<{ start: number; end: number }> {
  const links = findLinks(text)
  if (!cwd || !termApi().termPathKinds || !/[\\/.]/.test(text)) return links
  const out: Array<{ start: number; end: number }> = [...links]
  const ask: string[] = []
  for (const c of pathCandidates(text, links)) {
    const k = knownPath(cwd, c.path)
    if (k) out.push(c)
    else if (k === undefined) ask.push(c.path)
  }
  if (ask.length) request(cwd, ask)
  return out.sort((a, b) => a.start - b.start)
}

/** For tests: forget everything. */
export function resetPathCache(): void {
  cache.clear()
  queued.clear()
  inFlight.clear()
  if (timer !== undefined) clearTimeout(timer)
  timer = undefined
}
