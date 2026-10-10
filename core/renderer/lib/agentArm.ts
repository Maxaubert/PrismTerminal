import type { DetectedAgent } from '../../shared/types'
import { titleArmsAgent } from './agentTitle'

/**
 * WHETHER AN AGENT RUNS IN A SHELL, AND WHICH, for the keys that change with
 * it: Shift+Enter's newline and an image's paste key (`termPaste`). Three
 * voices, pure so the rules are tested:
 *
 * - The TITLE arms it before the poll (#175): the poll's first verdict comes
 *   2.5 s at the earliest, and until then Shift+Enter SUBMITTED a half-written
 *   message. Only what `titleArmsAgent` takes as proof arms it, and a stale
 *   title does not re-arm, since it does not change again.
 * - The POLL says when an agent arrives or leaves (#73); a wrapper ('other')
 *   does not undo the title's claude or codex.
 * - The shell's PROMPT report (OSC 9;9) takes back what only a title armed
 *   (review 2026-10-11): in a WSL tab the poll sees wsl.exe and never says
 *   "left", so a tab that ran claude in WSL kept the agent's keys at the plain
 *   prompt for the rest of its life. An agent the poll saw stays the poll's:
 *   the poll reports a change only, so a codex restarted inside one interval
 *   would never be armed again, Codex's title arming only while it asks.
 */
export interface AgentArm {
  here: boolean
  kind: DetectedAgent | null
  /** The poll's last word: an agent it saw is its to take back. */
  polled: boolean
}

export const armAtStart = (resumed: DetectedAgent | null): AgentArm => ({
  here: resumed !== null,
  kind: resumed,
  polled: false
})

export function armOnTitle(s: AgentArm, title: string): AgentArm {
  const named = titleArmsAgent(title)
  return named ? { ...s, here: true, kind: named } : s
}

export function armOnPoll(s: AgentArm, present: boolean, kind: DetectedAgent | null): AgentArm {
  if (!present) return { here: false, kind: null, polled: false }
  return { here: true, kind: kind === 'other' && s.kind ? s.kind : kind, polled: true }
}

export function armOnPrompt(s: AgentArm): AgentArm {
  return s.polled ? s : { here: false, kind: null, polled: false }
}
