import { colourPref } from './colourPref'

// THE WINDOW'S BACKGROUND, chosen (owner, 2026-09-22: "let background colour be
// a setting in the terminal UI in Prism Terminal"). Unset, it is the theme's.
// Set, it replaces the theme's background for the whole window, terminal
// included: this app's panel paints the terminal's ground from the window's
// own colour (`paintsGround`), so one colour covers both and they can never
// disagree. Every ink is measured against it again (chromeTokens), so the
// text, dim text and accent stay readable on whatever is picked.

const background = colourPref('prism.window.background')

export const windowBackground = background.get
export const setWindowBackground = background.set
export const onWindowBackgroundChange = background.onChange
export const useWindowBackground = background.use
