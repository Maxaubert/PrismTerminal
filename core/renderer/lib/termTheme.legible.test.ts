import { describe, expect, it } from 'vitest'
import { TERM_PRESETS, resolveTermTheme } from './termTheme'
import { ANSI_CONTRAST_FLOOR, contrastRatio, legiblePalette, type Ansi16 } from './termAnsi'

const KEYS: Array<keyof Ansi16> = [
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'
]

describe('every terminal theme reads (#99 follow-up, 2026-09-04)', () => {
  it('all sixteen colours of every preset clear the floor against its background', () => {
    for (const p of TERM_PRESETS) {
      const t = resolveTermTheme(p.id)
      for (const k of KEYS) {
        const r = contrastRatio(t[k] as string, p.bg)
        expect(r, `${p.id}.${k} ${t[k]} on ${p.bg}`).toBeGreaterThanOrEqual(ANSI_CONTRAST_FLOOR - 0.01)
      }
    }
  })

  // NO INVISIBLE TEXT, ANYWHERE (owner, 2026-09-24: "verify all themes look
  // good, no invisible text"). The sixteen are held above; these are the rest
  // of what a theme draws: its text (4.5:1, reading text), its cursor and the
  // chrome accent it asks for (3:1, the floor for a mark that is not text).
  it("every preset's text reads on its ground", () => {
    for (const p of TERM_PRESETS) {
      const r = contrastRatio(p.fg, p.bg)
      expect(r, `${p.id} text ${p.fg} on ${p.bg}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it("every preset's cursor and accent can be seen on its ground", () => {
    for (const p of TERM_PRESETS) {
      expect(contrastRatio(p.cursor, p.bg), `${p.id} cursor ${p.cursor}`).toBeGreaterThanOrEqual(3)
      if (p.accent) expect(contrastRatio(p.accent, p.bg), `${p.id} accent ${p.accent}`).toBeGreaterThanOrEqual(3)
    }
  })

  it('legiblePalette leaves a colour that already reads exactly as it was', () => {
    const p = TERM_PRESETS.find((x) => x.id === 'dracula')!
    const out = legiblePalette(p.ansi!, p.bg)
    expect(out.brightBlue).toBe(p.ansi!.brightBlue) // 6.8:1, untouched
    expect(out.brightBlack).not.toBe(p.ansi!.brightBlack) // 2.2:1, nudged
    expect(contrastRatio(out.brightBlack, p.bg)).toBeGreaterThanOrEqual(ANSI_CONTRAST_FLOOR - 0.01)
  })
})

describe("the app icon's two themes (owner, 2026-09-21)", () => {
  // "two themes that match the app icon colour scheme, one with orange and
  // black, and one with orange and dark grey". The icon is orange #ec9448 over
  // a charcoal and dark-grey swirl; these pin the two presets that carry it.
  const ICON_ORANGE = '#ec9448'
  const find = (id: string) => {
    const p = TERM_PRESETS.find((t) => t.id === id)
    if (!p) throw new Error(`no preset ${id}`)
    return p
  }

  it('Pitch is orange on black, cursor and chrome alike', () => {
    const p = find('pitch')
    expect(p.bg).toBe('#000000')
    expect(p.cursor).toBe(ICON_ORANGE)
    expect(p.accent).toBe(ICON_ORANGE)
  })

  it("Cinder is orange on the icon's own dark grey", () => {
    const p = find('cinder')
    expect(p.bg).toBe('#383c44')
    expect(p.cursor).toBe(ICON_ORANGE)
    expect(p.accent).toBe(ICON_ORANGE)
  })
})
