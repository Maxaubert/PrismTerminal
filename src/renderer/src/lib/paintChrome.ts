import { useEffect } from 'react'
import { onTermLookChange, termAcrylic, termGroundAlpha, termThemeId } from '@core/renderer/lib/termLook'
import { presetAccent, resolveTermTheme } from '@core/renderer/lib/termTheme'
import { applyChrome, chromeTokens } from './chromeTheme'
import { onWindowEdgesChange, windowEdges } from './edgesPrefs'
import { windowAccent } from './accentPrefs'
import { windowBackground } from './backgroundPrefs'
import { windowSecondary } from './secondaryPrefs'
import { onAnyWindowColourChange } from './customWindowColours'

/** The window wears the terminal's theme; main hears about the material. The
 *  edges setting (#27) rides the same paint: it changes two of the tokens, and
 *  main is told so the DWM border round the window follows the lines in it.
 *  Moved out of App (audit 2026-10-12). */
export function paintChrome(): void {
  const acrylic = termAcrylic()
  const id = termThemeId()
  const edges = windowEdges()
  // A picked background replaces the theme's for the whole window; the panel
  // paints the terminal's ground from the same token, so it follows too.
  const theme = resolveTermTheme(id)
  const background = windowBackground()
  // THE WINDOW'S SEE-THROUGH IS THE GROUND'S ALPHA (#114, in place of the
  // Opacity slider): the picked Background's, else the theme's own (a Custom
  // may carry one), the same order the core reads. Passed as the byte's
  // fraction, unrounded, so the field and the window name the same alpha.
  // An opaque ground under the switch paints the default see-through (#156).
  const tokens = chromeTokens(
    background ? { ...theme, background } : theme,
    acrylic ? termGroundAlpha() : 1,
    presetAccent(id),
    edges,
    windowAccent(),
    windowSecondary()
  )
  applyChrome(tokens)
  window.prism.setWindowBg(tokens.vars['--p-bg-solid'])
  window.prism.setWindowEdges(edges)
  void window.prism.setAcrylic(acrylic)
}

/** Paint now, and again whenever the theme, the edges or a window colour changes. */
export function usePaintedChrome(): void {
  useEffect(() => {
    paintChrome()
    const offs = [onTermLookChange(paintChrome), onWindowEdgesChange(paintChrome), onAnyWindowColourChange(paintChrome)]
    return () => offs.forEach((off) => off())
  }, [])
}
