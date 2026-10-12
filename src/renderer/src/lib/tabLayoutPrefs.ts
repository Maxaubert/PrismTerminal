import { enumPref } from '@core/renderer/lib/prefStore'

// WHERE THE TABS SIT (#162; owner, 2026-10-11: "we have a switch for horizontal
// and vertical"): `horizontal`, the strip under the title bar as it has always
// been and the DEFAULT, so nobody's window changes with the update; or
// `vertical`, a sidebar down the window's left side. This app's own setting
// (the window's chrome), so its key is not `prism.term.*`. Read defensively:
// anything unknown is horizontal.

export type TabLayout = 'horizontal' | 'vertical'

const pref = enumPref<TabLayout>('prism.window.tabLayout', ['horizontal', 'vertical'], 'horizontal')

export const validTabLayout = pref.valid
export const tabLayout = pref.get
export const setTabLayout = pref.set
export const onTabLayoutChange = pref.onChange
export const useTabLayout = pref.use
