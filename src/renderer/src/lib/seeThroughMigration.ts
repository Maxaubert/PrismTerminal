import {
  CUSTOM_KEY,
  customTermTheme,
  LEGACY_ACRYLIC_KEY,
  paintsAlpha,
  SEE_THROUGH_STORE_KEY,
  SEE_THROUGH_TOP,
  termThemeId
} from '@core/renderer/lib/termLook'
import { resolveTermTheme } from '@core/renderer/lib/termTheme'
import { alphaOf, opaque, parseColour } from '@core/renderer/lib/colour'
import { setWindowBackground, windowBackground } from './backgroundPrefs'
import { customWindowColours, setCustomWindowColours } from './customWindowColours'

// THE SWITCH AND THE BACKGROUND'S ALPHA BECOME THE SEE-THROUGH SLIDER, AND
// NOBODY'S WINDOW CHANGES ON UPDATE (owner, 2026-10-13: "make it a slider only
// with it being at 0 by default"; spec docs/superpowers/specs/
// 2026-10-13-see-through-slider-design.md). Runs ONCE, after migrateOpacity
// (which still reads the old switch) and before the first paint: a stored
// level is the sign it has run, and it writes one.
//
// What the window painted by the old rule (`paintsAlpha`: the switch on, the
// picked Background's alpha, else the theme's own, an opaque one painting the
// default see-through) becomes the level 1 - alpha, in percent. The same for
// the saved Custom, so picking it brings back the glass it was saved with.
// Every ground is then stored OPAQUE: the pickers carry no alpha any more.

/** The level an old alpha painted at: never 0, which would turn it off. */
const levelOf = (alpha: number): number =>
  Math.min(SEE_THROUGH_TOP, Math.max(1, Math.round((1 - alpha) * 100)))

export function migrateSeeThrough(): void {
  try {
    if (localStorage.getItem(SEE_THROUGH_STORE_KEY) !== null) return
    // Never set read as off here (the host's default, Prism Terminal's).
    const wasOn = localStorage.getItem(LEGACY_ACRYLIC_KEY) === '1'
    const picked = windowBackground()
    const custom = termThemeId() === 'custom' ? customTermTheme() : null
    const ownBg = custom?.bg ?? null
    let level = 0
    if (wasOn) {
      const raw = picked ? alphaOf(picked) : ownBg ? alphaOf(ownBg) : 1
      const ground = opaque(picked ?? ownBg ?? resolveTermTheme(termThemeId()).background)
      level = levelOf(paintsAlpha(raw, ground, true))
    }
    foldSavedCustom()
    if (picked && alphaOf(picked) < 1) setWindowBackground(opaque(picked))
    localStorage.setItem(SEE_THROUGH_STORE_KEY, String(level))
    localStorage.removeItem(LEGACY_ACRYLIC_KEY)
  } catch {
    /* a blocked store migrates nothing, and the slider reads 0, the window solid */
  }
}

/** The saved Custom: its switch and its ground's alpha (or the Background it
 *  keeps, which the window wore over it) become its `seeThrough`, its ground
 *  opaque. A save that never said acrylic read as the host's default, off. */
function foldSavedCustom(): void {
  const kept = customWindowColours()
  if (kept.background && alphaOf(kept.background) < 1)
    setCustomWindowColours({ ...kept, background: opaque(kept.background) })
  const raw = localStorage.getItem(CUSTOM_KEY)
  if (!raw) return
  let c: Record<string, unknown>
  try {
    c = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return // Corrupt: its own reader reads it as no Custom; not ours to fix.
  }
  if (!c || typeof c !== 'object' || typeof c.bg !== 'string' || !parseColour(c.bg)) return
  const { acrylic, ...rest } = c
  const alpha = kept.background ? alphaOf(kept.background) : alphaOf(c.bg)
  const ground = opaque(kept.background ?? c.bg)
  rest.seeThrough = acrylic === true ? levelOf(paintsAlpha(alpha, ground, true)) : 0
  rest.bg = opaque(c.bg)
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(rest))
}
