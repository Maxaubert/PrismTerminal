import { boolPref } from '@core/renderer/lib/prefStore'

// KEEP AGENT SESSIONS OPEN (owner, 2026-10-16: "when i click ctrl c with
// nothing marked in claude it clears the input text and says click ctrl c
// again to close claude. add settings that are by default on dont close
// sessions with keyboard shortcuts, this stops ctrl c and ctrl d from doing
// anything like that, one setting"). Claude Code hardcodes both keys (its
// keybindings refuse to rebind them), so the app takes them first: in the tab
// in front, while an agent runs there, Ctrl+D never reaches it, and Ctrl+C
// only while it works, where it is the way to stop it. A selection's Ctrl+C
// still copies (that rule comes first, core termKeys). THIS APP'S OWN
// setting; read defensively: anything but '0' is on.

const pref = boolPref('prism.window.agentGuard', true)

export const agentGuard = pref.get
export const setAgentGuard = pref.set
export const useAgentGuard = pref.use

/** The agent in the tab in front, as App last saw it: whether one runs, and
 *  whether it is working. The key rule reads it at the key press. */
let front = { here: false, working: false }

export function setGuardedFront(here: boolean, working: boolean): void {
  front = { here, working }
}

export function guardedFront(): { here: boolean; working: boolean } {
  return front
}

/** What the keep-agents-open rule needs at a key press (lib/keymap). */
export const guardContext = (): { agentGuard: boolean; agentHere: boolean; agentWorking: boolean } => ({
  agentGuard: agentGuard(),
  agentHere: front.here,
  agentWorking: front.working
})
