/**
 * "COPIED" FOR A PROGRAM'S OWN SELECTION (owner, 2026-10-16: "the copied chip
 * dont always show"). A full-screen program that asked for the mouse (Claude
 * Code's fullscreen view) draws its own selection and copies it itself on the
 * mouse's release, through the system clipboard and not through the terminal
 * (no OSC 52), so the app never heard of it and said nothing. Now a press that
 * selects (a drag, or a double or triple click) is followed by a look at the
 * clipboard's text: changed since the press, it was that copy, and the badge
 * shows. The text is compared and dropped, never kept or logged.
 *
 * Pure apart from the clock and the reads it is handed, so a test holds it.
 */

/** When the clipboard is looked at after the release: the program copies
 *  through a helper process, which takes a moment. */
export const COPY_LOOKS_MS = [150, 500, 1000] as const
/** A press that moved this far is a drag. */
export const DRAG_PX = 4

export interface AppCopyDeps {
  /** The clipboard's text now; null when it cannot be read. */
  read(): Promise<string | null>
  /** The program in front has the mouse (it draws its own selection). */
  programHasMouse(): boolean
  announce(): void
  wait?: (ms: number) => Promise<void>
}

export interface AppCopyWatch {
  down(x: number, y: number, clicks: number): void
  up(x: number, y: number): void
}

export function watchAppCopies(deps: AppCopyDeps): AppCopyWatch {
  const wait = deps.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  let press: { x: number; y: number; clicks: number; before: Promise<string | null> } | null = null
  /** Bumped by each press: a look from an older press stops. */
  let gen = 0
  return {
    down: (x, y, clicks) => {
      gen += 1
      press = deps.programHasMouse() ? { x, y, clicks, before: deps.read() } : null
    },
    up: (x, y) => {
      const p = press
      press = null
      if (!p) return
      const dragged = Math.hypot(x - p.x, y - p.y) >= DRAG_PX
      if (!dragged && p.clicks < 2) return
      const mine = gen
      void (async () => {
        const before = await p.before
        let waited = 0
        for (const at of COPY_LOOKS_MS) {
          await wait(at - waited)
          waited = at
          if (mine !== gen) return
          const now = await deps.read()
          if (now && now !== before) {
            deps.announce()
            return
          }
        }
      })()
    }
  }
}
