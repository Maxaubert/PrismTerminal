import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// ONE SET OF TAB PARTS AND ONE CARRY FOR BOTH LAYOUTS (audit 2026-10-12): the
// strip and the sidebar draw their close, loading ring and Powerline edge from
// tabParts, and reorder through useTabReorder, so a fix to one is a fix to both.
const layouts = ['TabStrip.tsx', 'TabSidebar.tsx'].map((f) => ({
  f,
  src: readFileSync(join(__dirname, f), 'utf8')
}))

describe('the tab layouts', () => {
  it('draw no tab part of their own', () => {
    for (const { f, src } of layouts)
      for (const own of ['data-tab-close', 'data-tab-loading', 'data-mark="edge"', 'motionClass('])
        expect(src.includes(own), `${f}: ${own}`).toBe(false)
  })
  it('carry a tab through the one reorder hook', () => {
    for (const { f, src } of layouts) {
      expect(src, f).toMatch(/useTabReorder\(\{ axis: '[xy]'/)
      expect(src.includes('setPointerCapture'), f).toBe(false)
      expect(src.includes('DRAG_SLOP'), f).toBe(false)
    }
  })
  it('every Powerline edge says when it is a rainbow', () => {
    const parts = readFileSync(join(__dirname, 'tabParts.tsx'), 'utf8')
    expect(parts).toMatch(/data-rainbow=\{mark\.colour === 'rainbow'/)
  })
})
