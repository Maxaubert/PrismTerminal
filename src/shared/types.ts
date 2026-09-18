/** A shell main detected on this machine; the only things term:spawn launches. */
export interface ShellDef {
  id: string
  name: string
  exe: string
  args: string[]
}

/** The two agents whose sessions can be resumed, each by its own flag:
 *  `claude --resume <id>` and `codex resume --last`. */
export type AgentKind = 'claude' | 'codex'

/** What the agent poll can find under a shell. 'other' (aider, gemini) still
 *  lights the tab, it just has nothing to come back to, so it is never saved. */
export type DetectedAgent = AgentKind | 'other'

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
