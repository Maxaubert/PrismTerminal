import { DICTATION_KEYS } from '../lib/dictationPrefs'

/**
 * EVERY DICTATION OPTION, BY ID (#13): the same deal as `options.ts` makes for
 * the terminal's. The Dictation page renders these rows as `data-pref="<id>"`
 * and each app's e2e asserts that its page shows this list, so an option can
 * never exist in one app and not the other.
 *
 * A list of its own rather than more rows in `TERMINAL_OPTIONS`: each app's
 * terminal parity check reads that file as TEXT, and dictation lives on a page
 * of its own in both apps.
 */
export interface DictationOption {
  id: string
  label: string
  type: 'switch' | 'choice' | 'key' | 'manager'
  /** The localStorage key behind it; null where the row manages only FILES,
   *  which both apps share: GPU acceleration is on when its engine is on disk. */
  key: string | null
  /** Absent = every PC. */
  onlyWhere?: 'an NVIDIA adapter is present'
}

export const DICTATION_OPTIONS: readonly DictationOption[] = [
  { id: 'dictation-enabled', label: 'Dictation', type: 'switch', key: DICTATION_KEYS.enabled },
  { id: 'dictation-mode', label: 'Trigger', type: 'choice', key: DICTATION_KEYS.mode },
  { id: 'dictation-hotkey', label: 'Key', type: 'key', key: DICTATION_KEYS.hotkey },
  { id: 'dictation-mic', label: 'Microphone', type: 'choice', key: DICTATION_KEYS.mic },
  { id: 'dictation-language', label: 'Language', type: 'choice', key: DICTATION_KEYS.language },
  { id: 'dictation-pause-media', label: 'Pause media while dictating', type: 'switch', key: DICTATION_KEYS.pauseMedia },
  { id: 'dictation-sounds', label: 'Sounds', type: 'switch', key: DICTATION_KEYS.sounds },
  { id: 'dictation-model', label: 'Models', type: 'manager', key: DICTATION_KEYS.model },
  // The official GPU engine is NVIDIA's: the row is offered only where it can work.
  { id: 'dictation-gpu', label: 'GPU acceleration', type: 'manager', key: null, onlyWhere: 'an NVIDIA adapter is present' }
]

/** The option ids a PC should be showing. */
export function dictationOptionIds(pc: { nvidia: boolean }): string[] {
  return DICTATION_OPTIONS.filter((o) => !o.onlyWhere || pc.nvidia).map((o) => o.id)
}
