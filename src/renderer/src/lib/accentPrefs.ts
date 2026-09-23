import { colourPref } from './colourPref'

// THE WINDOW'S ACCENT, chosen (owner, 2026-09-22: "add an accent colour option
// which would pick the accents you see, like the blue highlight effect and tab
// effect"). Unset, the accent is the theme's own, exactly as before: the
// preset's opinion if it has one, else its blue. Set, it is this colour, and
// every token derived from the accent - the selection fill, the ink on it, the
// active tab's rule, the brighter variant - follows it.

const accent = colourPref('prism.window.accent')

export const windowAccent = accent.get
export const setWindowAccent = accent.set
export const onWindowAccentChange = accent.onChange
export const useWindowAccent = accent.use
