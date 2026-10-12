import { enumPref } from '@core/renderer/lib/prefStore'

// THE TAB STYLE (#143; owner, 2026-10-10): Classic, the flat strip as it has
// always been and the DEFAULT, so nobody's window changes with the update; or
// Powerline (stored as 'prompt', so saved choices survive), chevron segments whose arrow edge is the agent mark. THIS APP'S OWN
// setting: the strip is the app's shell, not the terminal's, so its key is not
// `prism.term.*`. Read defensively: anything unknown is Classic. The owner
// called the first one "Current"; a choice cannot be named Current once there
// are two, so it is Classic, one word to change if he prefers another.

export type TabStyle = 'classic' | 'prompt'

const pref = enumPref<TabStyle>('prism.window.tabStyle', ['classic', 'prompt'], 'classic')

export const validTabStyle = pref.valid
export const tabStyle = pref.get
export const setTabStyle = pref.set
export const onTabStyleChange = pref.onChange
export const useTabStyle = pref.use
