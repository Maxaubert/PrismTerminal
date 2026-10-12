import { describe, expect, it } from 'vitest'
import { contrastRatio } from '@core/renderer/lib/termAnsi'
import { resolveTermTheme } from '@core/renderer/lib/termTheme'
import { liftToFloor } from './oklab'
import { chromeTokens } from './chromeTheme'

const rgb = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))

// Owner, 2026-10-12: with #140707 picked, Save "doesnt follow the accent
// color": the lift had mixed it with white to a pink grey.
describe('an accent too dark to see', () => {
  it('is lifted to a red that reads, not a grey', () => {
    const c = liftToFloor('#140707', ['#121212'], 3) as string
    const [r, g, b] = rgb(c)
    expect(contrastRatio(c, '#121212')).toBeGreaterThanOrEqual(3)
    expect(r - g).toBeGreaterThan(50)
    expect(r - b).toBeGreaterThan(50)
  })

  it('is what the window paints its saves in', () => {
    const { vars } = chromeTokens(
      resolveTermTheme('pt-default'),
      1,
      undefined,
      'hairline',
      '#140707'
    )
    const [r, g, b] = rgb(vars['--p-accent'])
    expect(r - g).toBeGreaterThan(50)
    expect(r - b).toBeGreaterThan(50)
    expect(contrastRatio(vars['--p-on-accent'], vars['--p-accent'])).toBeGreaterThanOrEqual(4.5)
  })

  it('leaves a pick that already reads alone, and darkens one on a light ground', () => {
    expect(liftToFloor('#ff0000', ['#121212'], 3)).toBe('#ff0000')
    const c = liftToFloor('#ffd0d0', ['#f6f4ee'], 3) as string
    expect(contrastRatio(c, '#f6f4ee')).toBeGreaterThanOrEqual(3)
    expect(rgb(c)[0] - rgb(c)[1]).toBeGreaterThan(20)
  })
})

describe('the ink on the accent', () => {
  it('is white on a strong red or blue, dark on a pale orange or yellow', () => {
    const ink = (accent: string): string =>
      chromeTokens(resolveTermTheme('pt-default'), 1, undefined, 'hairline', accent).vars[
        '--p-on-accent'
      ]
    expect(ink('#ff0000')).toBe('#ffffff')
    expect(ink('#3b78ff')).toBe('#ffffff')
    expect(ink('#fe8f34')).not.toBe('#ffffff')
    expect(ink('#f5d90a')).not.toBe('#ffffff')
  })
})
