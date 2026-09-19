// The types the terminal itself speaks. Owned by the core, so a host (Prism,
// Prism Terminal) imports them from here and the two can never disagree about
// what a shell or an agent is.

/** A shell main detected on this machine; the only things term:spawn launches. */
export interface ShellDef {
  id: string
  name: string
  exe: string
  args: string[]
}

/** The agents whose conversation can be resumed at the next launch. */
export type AgentKind = 'claude' | 'codex'

/** What the process poll can find in a shell. 'other' agents (aider, gemini)
 *  light the indicator but have nothing to come back to. */
export type DetectedAgent = AgentKind | 'other'
