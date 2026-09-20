import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WINDOW_EDGES,
  EDGE_ALPHA,
  EDGE_BORDER_STEP,
  WINDOW_EDGES,
  validWindowEdges
} from './windowEdges'

// The Edges control is a SCALE, and it is drawn in the order of WINDOW_EDGES
// (Settings builds its options from this list). Prism's own Edges row runs
// None, Faint, Hairline, Strong, and the owner asked for the option "like we
// have in the main app" (#27), so the order is pinned by what the numbers say
// rather than by spelling the four words out a second time.
describe('the four edges', () => {
  it('are offered weakest to strongest, by every number they carry', () => {
    expect(WINDOW_EDGES).toHaveLength(4)
    for (let i = 1; i < WINDOW_EDGES.length; i += 1) {
      const [a, b] = [WINDOW_EDGES[i - 1], WINDOW_EDGES[i]]
      for (const token of ['divider', 'line'] as const) {
        for (const shade of ['dark', 'light'] as const) {
          expect(EDGE_ALPHA[a][token][shade], `${a} < ${b} ${token} ${shade}`).toBeLessThan(
            EDGE_ALPHA[b][token][shade]
          )
        }
      }
      for (const shade of ['dark', 'light'] as const) {
        expect(EDGE_BORDER_STEP[a]?.[shade] ?? 0, `${a} < ${b} border ${shade}`).toBeLessThan(
          EDGE_BORDER_STEP[b]?.[shade] ?? 0
        )
      }
    }
  })

  it('start at none, and only none has no border round the window', () => {
    expect(WINDOW_EDGES[0]).toBe('none')
    for (const e of WINDOW_EDGES) expect(EDGE_BORDER_STEP[e] === null).toBe(e === 'none')
  })

  it('default to the hairline, and read anything else as it', () => {
    expect(DEFAULT_WINDOW_EDGES).toBe('hairline')
    for (const v of ['strong', '', null, undefined, 3, {}]) {
      expect(validWindowEdges(v)).toBe('hairline')
    }
    for (const e of WINDOW_EDGES) expect(validWindowEdges(e)).toBe(e)
  })
})
