import type { UpdateInfo } from '@shared/types'

/**
 * WHAT `update:install` MAY DO (regression rule 3: main installs only what main
 * offered). Moved out of index.ts (audit 2026-10-12) so the rule has tests.
 *
 * - WHAT IS ON OFFER decides, never what the page sent: while the offer is a
 *   preview nothing is downloaded, whatever url the page hands in; the fake
 *   runs the progress and answers false, "nothing was installed". No fetch,
 *   no file, no installer, no quit, and the close question is NOT pre-answered.
 * - WHAT MAIN OFFERED is installed, never a url the page sent (code review
 *   2026-09-24, #15): a page that could name any past release asset could
 *   downgrade the app silently. No offer, nothing to install. The page's url
 *   is only checked to be the same offer it was shown.
 * - ONE AT A TIME, and the controller is this run's own: `cancel` aborts
 *   whatever is current, and a second Install cannot orphan the first one's
 *   controller (the page refuses a second anyway; this does not rely on it).
 * - The close question is pre-answered at the QUIT, not before (#14): a
 *   download takes minutes, and an agent that starts working meanwhile must
 *   still be asked about before a close ends it. `agree` is handed to the
 *   installer, which calls it at the moment it quits.
 */
export interface UpdateGateDeps {
  offer: () => UpdateInfo | null
  preview: (cancelled: () => boolean) => Promise<boolean>
  install: (url: string, signal: AbortSignal, agree: () => void) => Promise<boolean>
  agree: () => void
}

export function createUpdateGate(d: UpdateGateDeps): {
  install: (url: unknown) => Promise<boolean>
  cancel: () => void
} {
  let run: AbortController | null = null
  return {
    install: async (url) => {
      if (run) return false
      const mine = new AbortController()
      run = mine
      try {
        const offer = d.offer()
        if (offer?.mock) return await d.preview(() => mine.signal.aborted)
        if (!offer || typeof url !== 'string' || url !== offer.url) return false
        return await d.install(offer.url, mine.signal, d.agree)
      } finally {
        run = null
      }
    },
    cancel: () => run?.abort()
  }
}
