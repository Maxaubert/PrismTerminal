/**
 * THE APP'S KEYS, ONE TABLE (audit 2026-10-12). App's key handler and the
 * terminal's `ownsKey` (termHost) each tested the same chords by hand, and
 * their comments said they must agree with nothing to make them; the labels
 * the UI teaches were typed in nine places. A chord missing from `ownsKey`
 * reaches the shell too, so xterm types it into a program while the app acts
 * on it. Both read `chordOf` now, and every label comes from `keyLabel`.
 *
 * Pure: what the chords depend on (command help switched on, the tabs
 * vertical, a full-screen program in front) is handed in.
 */

export type ChordId =
  | 'help'
  | 'fullscreen'
  | 'next-tab'
  | 'jump-tab'
  | 'settings'
  | 'find-tab'
  | 'sidebar'
  | 'new-tab'
  | 'close-tab'
  | 'find'

export interface KeyEventLike {
  key: string
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  metaKey: boolean
}

export interface KeyContext {
  /** Command help is switched on (Settings). */
  help: boolean
  /** The tabs are a sidebar. */
  vertical: boolean
  /** The terminal in front runs a full-screen program (vim, less). */
  fullScreen: boolean
}

interface Chord {
  /** What the UI shows. */
  label: string
  match: (e: KeyEventLike, c: KeyContext) => boolean
  /** The shell still hears it (the app acts AND the key goes on). */
  shellToo?: boolean
  /** Under a question or the update window: 'swallow' does nothing and keeps
   *  it from the shell behind; 'act' acts as ever (code review 2026-09-24, #10:
   *  Ctrl+Tab or Ctrl+T moved the keyboard into a shell behind the question,
   *  and the Enter meant for it went there). */
  underModal: 'swallow' | 'act'
}

const bare = (e: KeyEventLike): boolean => !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey
const ctrl = (e: KeyEventLike): boolean => e.ctrlKey && !e.altKey && !e.metaKey
const k = (e: KeyEventLike): string => e.key.toLowerCase()

export const CHORDS: Record<ChordId, Chord> = {
  // COMMAND HELP IS F1 (#12), the key every Windows program answers help
  // with. Bare, and only while the setting is on: switched off, F1 is the
  // shell's again. Known cost, accepted: PSReadLine's own F1 (the help page
  // for the command under the cursor) and F1 in a full-screen program under
  // WSL (vim, htop, mc) do not arrive while it is on. Shift+F1 and Ctrl+F1
  // are left to the shell.
  help: { label: 'F1', match: (e, c) => e.key === 'F1' && bare(e) && c.help, underModal: 'act' },
  // F11 toggles full screen, and the shell hears it as it always did.
  fullscreen: { label: 'F11', match: (e) => e.key === 'F11', shellToo: true, underModal: 'act' },
  // Next / previous tab (with Shift), jump to a tab, Settings.
  'next-tab': { label: 'Ctrl+Tab', match: (e) => ctrl(e) && e.key === 'Tab', underModal: 'swallow' },
  'jump-tab': { label: 'Ctrl+1..9', match: (e) => ctrl(e) && !e.shiftKey && /^[1-9]$/.test(e.key), underModal: 'swallow' },
  settings: { label: 'Ctrl+,', match: (e) => ctrl(e) && !e.shiftKey && e.key === ',', underModal: 'swallow' },
  // FIND A TAB, Ctrl+Shift+K (the mockup said Ctrl+K; that is the shell's
  // kill-to-end-of-line, in readline and PSReadLine alike), while vertical.
  'find-tab': {
    label: 'Ctrl+Shift+K',
    match: (e, c) => ctrl(e) && e.shiftKey && k(e) === 'k' && c.vertical,
    underModal: 'swallow'
  },
  // THE SIDEBAR, Ctrl+Shift+B (owner, 2026-10-12: "bind the sidebar to a
  // hotkey like ctrl b or ctrl s"): open, or collapsed to the left edge. Not
  // Ctrl+B, Claude Code's (background a running task) and the shell's
  // cursor-left; not Ctrl+S, PowerShell's forward history search and the
  // terminal's pause. VS Code's sidebar key with Shift. While vertical only.
  sidebar: {
    label: 'Ctrl+Shift+B',
    match: (e, c) => ctrl(e) && e.shiftKey && k(e) === 'b' && c.vertical,
    underModal: 'swallow'
  },
  // New tab is Ctrl+T and close tab is Ctrl+W (owner, 2026-09-18 and -19),
  // with or without shift, as in Prism and in every browser. That takes both
  // chords from whatever runs in the shell (Claude Code's task list;
  // readline's delete-word, for which Ctrl+Backspace remains): the owner's
  // trade, made knowingly. Ctrl+Shift+T is the habit Windows Terminal leaves.
  'new-tab': { label: 'Ctrl+T', match: (e) => ctrl(e) && k(e) === 't', underModal: 'swallow' },
  // Close keeps its own rule under a question: it is how the question is reached.
  'close-tab': { label: 'Ctrl+Shift+W', match: (e) => ctrl(e) && k(e) === 'w', underModal: 'act' },
  // FIND IS CTRL+F (owner, 2026-09-23), except in a full-screen program, where
  // Ctrl+F is page down (vim, less) and stays the program's; Ctrl+Shift+F
  // finds everywhere. Known cost, accepted: bash and readline lose Ctrl+F as
  // cursor-right at a prompt.
  find: {
    label: 'Ctrl+F',
    match: (e, c) => ctrl(e) && k(e) === 'f' && (e.shiftKey || !c.fullScreen),
    underModal: 'swallow'
  }
}

const ORDER = Object.keys(CHORDS) as ChordId[]

/** The app's chord for this key, or null when it is the shell's. */
export function chordOf(e: KeyEventLike, c: KeyContext): ChordId | null {
  return ORDER.find((id) => CHORDS[id].match(e, c)) ?? null
}

/** Does the app take this key from the shell? xterm yields exactly these. */
export function appOwnsKey(e: KeyEventLike, c: KeyContext): boolean {
  const id = chordOf(e, c)
  return id !== null && !CHORDS[id].shellToo
}

/** What the UI calls a chord. */
export function keyLabel(id: ChordId): string {
  return CHORDS[id].label
}
