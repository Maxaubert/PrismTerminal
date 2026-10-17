/**
 * THE DICTATION WIDGET'S STATES (owner, 2026-10-16: "when you start the
 * dictation outside the app you should still see like a sort of widget ... in
 * whatever window you're in"). Main sends one of these to the widget's page;
 * the page draws it and says back only a pick or a dismissal.
 */
/** `copy`: which copy of the app the tab is in ("Stable"), when more than one is open. */
export type OverlayRow = { id: string; n: number; label: string; folder: string; state: string | null; disabled: string | null; lead: boolean; copy: string | null }

export type OverlayState =
  | { phase: 'listening'; text: string; level: number; starting: boolean }
  | { phase: 'transcribing' }
  | { phase: 'pick'; text: string; rows: OverlayRow[] }
  | { phase: 'sending'; to: string }
  | { phase: 'sent'; to: string }
  | { phase: 'note'; message: string; tone: 'quiet' | 'warn' }

/** The app's look, so the widget wears the theme (rule 15's inks). */
export interface OverlayLook {
  ground: string
  text: string
  dim: string
  accent: string
  edge: string
}

export const OVERLAY_CH = {
  state: 'overlay:state',
  look: 'overlay:look',
  pick: 'overlay:pick',
  dismiss: 'overlay:dismiss'
} as const
