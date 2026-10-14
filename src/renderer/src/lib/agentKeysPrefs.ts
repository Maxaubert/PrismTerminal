import { boolPref } from '@core/renderer/lib/prefStore'

// AGENT HOTKEYS (#198; owner, 2026-10-13: "a toggle for better key bindings
// ... most people who use this terminal will just use it for agents", "make
// it a setting thats by default on"). On, a few keys a shell or an agent
// rarely needs are the app's (lib/keymap, each chord's `agent`). THIS APP'S
// OWN setting, so its key is not `prism.term.*`. Read defensively: anything
// but '0' is on.

const pref = boolPref('prism.window.agentKeys', true)

export const agentKeys = pref.get
export const setAgentKeys = pref.set
export const onAgentKeysChange = pref.onChange
export const useAgentKeys = pref.use
