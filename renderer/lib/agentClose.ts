import type { DetectedAgent } from '../../shared/types'

/**
 * THE CLOSE QUESTION, one rule for both apps and NOT a setting (owner,
 * 2026-09-19: "remove the setting but just have it on smart mode by default,
 * so it won't ask if you're in a normal shell but if you're working with an
 * agent it will ask").
 *
 * It replaced two different settings: Prism's three modes (always / agent /
 * never) and Prism Terminal's on/off switch. A plain shell has nothing to
 * lose, so closing it never asks. A tab whose shell HOSTS an agent asks,
 * working or idle: an agent waiting at its own prompt is still a conversation
 * the close ends. Closing the WINDOW is held only while an agent is mid-answer,
 * because both apps bring idle agents back at the next launch.
 *
 * A host's OTHER reasons to ask (Prism's unsaved text) are its own and are
 * untouched by this.
 */

/** Closing this tab: ask first? */
export function asksBeforeClosingTab(agentPresent: boolean): boolean {
  return agentPresent
}

/** Closing the window: hold it and ask? */
export function holdsWindowClose(agentsWorking: number): boolean {
  return agentsWorking > 0
}

export const AGENT_NAMES: Record<DetectedAgent, string> = {
  claude: 'Claude',
  codex: 'Codex',
  other: 'The agent'
}

/** What the question says. `forMs` is how long the agent has been mid-answer,
 *  null when it is only present, waiting at its own prompt. */
export function closeQuestionTitle(target: 'tab' | 'window', forMs: number | null): string {
  if (target === 'window') return 'Stop the agent and close the window?'
  return forMs === null ? 'Close the tab and end the agent?' : 'Stop the agent and close?'
}
