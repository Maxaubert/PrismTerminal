import { useEffect, useState } from 'react'
import { hostOwnsWindowAcrylic, termHost } from '../../host'
import {
  saveCustomTermTheme,
  setTermThemeId,
  paintsAlpha,
  termExtraDefaults,
  termThemeId,
  useAgentColorChoice,
  useAgentDoneColorChoice,
  useAgentQuestionColorChoice,
  useCustomTermTheme,
  useTermAcrylic,
  useTermGroundAlpha,
  useTermThemeId,
  withGroundAlpha
} from '../../lib/termLook'
import { alphaOf } from '../../lib/colour'
import { resolveTermTheme } from '../../lib/termTheme'
import { paletteOf } from './palette'

/**
 * THE TERMINAL'S SETUP AND ITS SAVE, once (2026-10-05). The theme wall's Save
 * changes and, since the grouped cards redesign, a second one over the agent
 * colours (owner, Q3) both save the WHOLE setup as Custom and light together,
 * because both read this.
 *
 * "Save changes": the theme's whole look - palette of the selected theme,
 * agent colours, acrylic and how see-through the ground is - lands in the
 * Custom slot, reselectable after any theme switch. The font, its size and the
 * indicator's style belong to no theme and are not part of it (2026-09-28).
 * The see-through rides on the palette's own `bg` (#114).
 */
export interface TermSetup {
  /** The settings deviate from the selected theme's stock. */
  dirty: boolean
  /** Save the whole setup as Custom, and select it. */
  save: () => void
  /** What a save carries besides the palette (the editor's save adds it). */
  extras: { indicatorColor: string; doneColor: string; questionColor: string; acrylic: boolean }
}

export function useTermSetup(): TermSetup {
  const themeId = useTermThemeId()
  const acrylicOn = useTermAcrylic()
  // The window's see-through (#114): the alpha of the ground in force, the
  // picked Background's first. A byte, so the comparison below is exact.
  const groundByte = Math.round(useTermGroundAlpha() * 255)
  // The CHOICES ('' = follow the theme) are what is saved and compared.
  const agentCol = useAgentColorChoice()
  const doneCol = useAgentDoneColorChoice()
  const questionCol = useAgentQuestionColorChoice()
  const custom = useCustomTermTheme()
  const extras = {
    indicatorColor: agentCol,
    doneColor: doneCol,
    questionColor: questionCol,
    acrylic: acrylicOn
  }
  // Dirty = the SETTINGS deviate from the selected theme's stock: any theme
  // arrives with the defaults, a Custom arrives with what it saved. Comparing
  // whole palettes kept the button lit forever - the palette IS the selection.
  // Built field by field in the same order as `extras`, since the comparison
  // is by JSON and key order is part of that.
  const src = themeId === 'custom' && custom ? custom : null
  const baseline = {
    indicatorColor: src?.indicatorColor ?? termExtraDefaults().indicatorColor,
    doneColor: src?.doneColor ?? termExtraDefaults().doneColor,
    questionColor: src?.questionColor ?? termExtraDefaults().questionColor,
    acrylic: src?.acrylic ?? termExtraDefaults().acrylic
  }
  // THE UNSAVED-CHANGES QUESTION SURVIVES THE SLIDER (#114, #60). Opacity was
  // one of the extras, so a changed one lit Save changes and a theme pick
  // asked before forgetting it. Its place is taken by the ground's alpha in
  // force against what the theme's own setup paints: a see-through picked
  // Background lights Save changes in the same way. Only where that alpha is
  // the window's (Prism has no such alpha, and is not asked to resolve one).
  // The theme's own is computed by the rule the window paints by (#156,
  // `paintsAlpha`): an older Custom saved with acrylic on and an opaque `bg`
  // paints the default see-through, so it is not dirty on pick. A preset's own
  // setup has the host's default acrylic (off in Prism Terminal).
  const ownByte = (): number =>
    Math.round(paintsAlpha(src ? alphaOf(src.bg) : 1, src?.bg ?? resolveTermTheme(themeId).background, baseline.acrylic) * 255)
  const dirty =
    JSON.stringify(extras) !== JSON.stringify(baseline) || (hostOwnsWindowAcrylic() && groundByte !== ownByte())
  const save = (): void => {
    saveCustomTermTheme({ ...withGroundAlpha(paletteOf(termThemeId())), ...extras })
    setTermThemeId('custom')
  }
  return { dirty, save, extras }
}

/**
 * Whether the acrylic material is missing on this PC, where the terminal owns
 * the window's (Prism Terminal). The material is Windows 11's; null while main
 * has not answered reads as supported, so a row does not flash disabled on
 * every open.
 */
export function useNoAcrylic(): boolean {
  const acrylic = termHost().acrylic
  const [ok, setOk] = useState<boolean | null>(null)
  useEffect(() => {
    if (acrylic.kind !== 'window') return
    let live = true
    void acrylic.supported().then((v) => {
      if (live) setOk(v)
    })
    return () => {
      live = false
    }
  }, [acrylic])
  return hostOwnsWindowAcrylic() && ok === false
}
