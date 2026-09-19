// The terminal's own types come from the core; the rest here is this app's.
export type { AgentKind, DetectedAgent, ShellDef } from '@core/shared/types'
import type { AgentKind } from '@core/shared/types'

/** The two agents whose sessions can be resumed, each by its own flag:
 *  `claude --resume <id>` and `codex resume --last`. */

/** What the agent poll can find under a shell. 'other' (aider, gemini) still
 *  lights the tab, it just has nothing to come back to, so it is never saved. */

/** A tab as tabs.json holds it: the folder its shell was in, and the agent it
 *  hosted at the last report, when that agent is one that can be resumed. */
export interface SavedTab {
  cwd: string
  agent?: AgentKind
}

/** The renderer owns the tab list; main persists this snapshot of it. */
export interface SavedTabs {
  tabs: SavedTab[]
  active: number
}

/** A tab on its way back: the folder to spawn in, and what the shell's startup
 *  command should resume - a claude session id, or the codex marker. */
export interface RestoredTab {
  cwd: string
  resume?: string
}

export interface Restored {
  tabs: RestoredTab[]
  active: number
}

/** A newer release on GitHub (main/update.ts finds it). It lives here so the
 *  preload and the renderer can name it without importing from main. */
export type UpdateInfo = { version: string; url: string; mock?: boolean }
