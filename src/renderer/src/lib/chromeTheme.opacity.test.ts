import { describe, expect, it } from 'vitest'
import { chromeTokens } from './chromeTheme'
import { TERM_PRESETS, presetAccent, resolveTermTheme } from '@core/renderer/lib/termTheme'

// THE OPACITY SLIDER IS GONE AND NOBODY'S WINDOW CHANGED (#114). The window's
// see-through used to be `opacityPct`, a whole percentage 30-100; it is now the
// ALPHA of the ground in force, handed over as its byte's fraction. The
// migration stores a saved N as the byte round(N / 100 * 255), so for every N
// the tokens must be what they were. The snapshot was taken from the old
// `chromeTokens(theme, N)` before the change, and is the proof.
const THEMES = ['pt-default', 'prism', 'github', 'dracula', 'paper']
const toAlpha = (n: number): number => Math.round((n / 100) * 255) / 255
/** The tokens as the old code published them: `--p-accent-solid` is new in
 *  #114, and for an opaque accent it is `--p-accent` itself (asserted here);
 *  the switch knob (2026-10-10) is a new token, not a change to any old one. */
const before = (vars: Record<string, string>): Record<string, string> => {
  const { ['--p-accent-solid']: solid, ['--p-switch-knob']: knob, ...rest } = vars
  expect(solid).toBe(vars['--p-accent'])
  expect(knob).toBeTruthy()
  return rest
}

describe('a saved opacity, as a ground alpha', () => {
  it.each(THEMES)('%s: every N from 30 to 100 paints what Opacity N painted', (id) => {
    const out: Record<number, Record<string, string>> = {}
    for (let n = 30; n <= 100; n += 1) out[n] = before(chromeTokens(resolveTermTheme(id), toAlpha(n)).vars)
    expect(out).toMatchSnapshot()
  })
})

// AN OPAQUE ACCENT CHANGES NOTHING (#114): the see-through accent is a new
// path, and an accent picked before it, on glass or not, keeps every token.
// Snapshotted from the old code, like the above.
describe('an opaque accent, before and after alpha', () => {
  it.each(TERM_PRESETS.map((p) => p.id))('%s', (id) => {
    const t = resolveTermTheme(id)
    expect({
      theme: before(chromeTokens(t, 1, presetAccent(id)).vars),
      glass: before(chromeTokens(t, toAlpha(60), presetAccent(id)).vars),
      picked: before(chromeTokens(t, 1, presetAccent(id), 'hairline', '#e07a2f').vars),
      pickedGlass: before(chromeTokens(t, toAlpha(60), presetAccent(id), 'hairline', '#e07a2f').vars)
    }).toMatchSnapshot()
  })
})
