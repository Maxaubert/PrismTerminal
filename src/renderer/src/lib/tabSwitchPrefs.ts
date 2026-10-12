import { enumPref } from '@core/renderer/lib/prefStore'

// WHERE CTRL+TAB GOES (#158; owner, 2026-10-10: "add a new tab switching mode
// called most recent. so you can either switch chronologically or by most
// recently used"). `order` is the strip, left to right, as it always was, and
// the DEFAULT, so nobody's keys change with the update; `recent` walks the
// most-recently-used list (lib/tabMru). THIS APP'S OWN setting: the strip is
// the app's shell, so its key is not `prism.term.*`. Read defensively:
// anything unknown is In order.

export type TabSwitch = 'order' | 'recent'

const pref = enumPref<TabSwitch>('prism.window.tabSwitch', ['order', 'recent'], 'order')

export const validTabSwitch = pref.valid
export const tabSwitch = pref.get
export const setTabSwitch = pref.set
export const onTabSwitchChange = pref.onChange
export const useTabSwitch = pref.use
