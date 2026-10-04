import type { AgentSignal } from './agentHookSignal'

/**
 * THE INDICATOR'S RULES FOR A SESSION THAT SPEAKS THROUGH HOOKS (#131). Pure:
 * the hook (`useAgentIndicator`) keeps one phase per session and asks this what
 * a signal, or an idle title, does to it.
 *
 * A hook is the agent's own word, above its title: the title cannot tell a
 * permission prompt from a finished answer (both show the idle star, MEASURED)
 * and a failed turn looks finished. Two things are still the title's:
 * - AN ESC. No hook fires on an interrupt (MEASURED: no Stop, no StopFailure;
 *   the idle title came 72 ms after the Esc). So an idle title while the hooks
 *   last said `working` is an interrupt: the tab stops working and shows no
 *   Finished line, since an Esc is not a finish. A Stop that arrives after the
 *   idle title (the two race) still raises Finished.
 * - Whether an agent is there at all stays the process poll's.
 *
 * Marks are RAISED only on a tab nobody is looking at; the hook decides that.
 * Question outranks Failed, which outranks Finished (the strip draws one).
 */

export type HookPhase = 'working' | 'question' | 'done' | 'failed' | 'stopped'
export type AttentionMark = 'finished' | 'question' | 'failed'

export interface HookSession {
  phase: HookPhase
  /** The failure's kind, while the phase is `failed`. */
  kind?: string
}

export interface HookOutcome extends HookSession {
  working: boolean
  /** Marks this step puts on a tab nobody is looking at. */
  raise: AttentionMark[]
  /** Marks this step takes down, looking or not. */
  clear: AttentionMark[]
}

export type HookEvent = AgentSignal | { state: 'idle-title' }

/** What one event does, or null when it changes nothing. */
export function hookStep(prev: HookSession | undefined, ev: HookEvent): HookOutcome | null {
  switch (ev.state) {
    case 'idle-title':
      // Only an interrupt is the title's to say; after a question, a finish or
      // a failure the idle title is just the agent at rest.
      if (prev?.phase !== 'working') return null
      return { phase: 'stopped', working: false, raise: [], clear: [] }
    case 'working':
      // A new prompt, a tool call, a subagent: whatever was waiting is over.
      return { phase: 'working', working: true, raise: [], clear: ['question', 'failed', 'finished'] }
    case 'question':
      return { phase: 'question', working: false, raise: ['question'], clear: ['failed'] }
    case 'done':
      return { phase: 'done', working: false, raise: ['finished'], clear: ['question', 'failed'] }
    case 'failed': {
      // Two hooks answer one failure (the kind's own and the catch-all), in
      // either order: a kind once said is kept.
      const kind = ev.kind ?? (prev?.phase === 'failed' ? prev.kind : undefined)
      // Finished too, so with the Failed line switched off the tab says what it
      // said before hooks: the turn ended.
      return { phase: 'failed', kind, working: false, raise: ['failed', 'finished'], clear: ['question'] }
    }
  }
}
