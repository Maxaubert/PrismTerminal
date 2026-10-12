import { colourPref } from './colourPref'

// THE WINDOW'S SECONDARY COLOUR, chosen (owner, 2026-10-12: "a new setting
// called secondary colour, or something like that, so the user can pick their
// own"). Unset, it is the theme's own (chromeTokens: the ground a step toward
// the text). Set, the vertical tabs' sidebar and their title bar wear it, and
// every ink is held to it too.

const secondary = colourPref('prism.window.secondary')

export const windowSecondary = secondary.get
export const setWindowSecondary = secondary.set
export const onWindowSecondaryChange = secondary.onChange
export const useWindowSecondary = secondary.use
