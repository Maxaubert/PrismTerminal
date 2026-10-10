import { describe, expect, it } from 'vitest'
import {
  THEME_REPORTS_OFF,
  colourQueryReplies,
  decrqmReply,
  dsrThemeReply,
  groundMode,
  modeParams,
  noteThemeMode,
  oscColour,
  themePush,
  themeReports
} from './termReplies'
import { resolveTermTheme } from './termTheme'

const COLOURS = { fg: '#3d2a1f', bg: '#e6d8c0' }

describe('oscColour', () => {
  it("doubles each byte, xterm's own form", () => {
    // The value MEASURED from xterm itself on an opaque light ground.
    expect(oscColour('#f5f5f0')).toBe('rgb:f5f5/f5f5/f0f0')
  })
  it('drops the alpha: the program is told the colour it sees', () => {
    expect(oscColour('#f5f5f0cc')).toBe('rgb:f5f5/f5f5/f0f0')
  })
})

describe('colourQueryReplies', () => {
  it('answers one query with its own number', () => {
    expect(colourQueryReplies(11, '?', COLOURS)).toEqual(['\x1b]11;rgb:e6e6/d8d8/c0c0\x1b\\'])
    expect(colourQueryReplies(10, '?', COLOURS)).toEqual(['\x1b]10;rgb:3d3d/2a2a/1f1f\x1b\\'])
  })
  it('answers a list in order: 10;?;? asks for 10 then 11', () => {
    expect(colourQueryReplies(10, '?;?', COLOURS)).toEqual([
      '\x1b]10;rgb:3d3d/2a2a/1f1f\x1b\\',
      '\x1b]11;rgb:e6e6/d8d8/c0c0\x1b\\'
    ])
  })
  it('leaves a SET, and anything past 11, to xterm', () => {
    expect(colourQueryReplies(11, 'rgb:00/00/00', COLOURS)).toBeNull()
    expect(colourQueryReplies(10, '?;#000000', COLOURS)).toBeNull()
    expect(colourQueryReplies(11, '?;?', COLOURS)).toBeNull()
    expect(colourQueryReplies(11, '', COLOURS)).toBeNull()
  })
  it('never holds CR, LF or BEL: a reply, not a command', () => {
    for (const r of colourQueryReplies(10, '?;?', COLOURS) ?? [])
      for (const c of ['\r', '\n', '\x07']) expect(r.includes(c)).toBe(false)
  })
})

describe('groundMode', () => {
  it.each(['fawn', 'paper'])('%s is light', (id) => {
    expect(groundMode(resolveTermTheme(id).background)).toBe('light')
  })
  it.each(['pt-default', 'prism'])('%s is dark', (id) => {
    expect(groundMode(resolveTermTheme(id).background)).toBe('dark')
  })
  it('measures the colour, never its alpha', () => {
    expect(groundMode('#e6d8c040')).toBe('light')
  })
})

describe('the mode reports (#172)', () => {
  it('DSR 996 is answered 997;1 dark, 997;2 light', () => {
    expect(dsrThemeReply('dark')).toBe('\x1b[?997;1n')
    expect(dsrThemeReply('light')).toBe('\x1b[?997;2n')
  })
  it('DECRQM 2031 says set or reset', () => {
    expect(decrqmReply(2031, true)).toBe('\x1b[?2031;1$y')
    expect(decrqmReply(2031, false)).toBe('\x1b[?2031;2$y')
  })
  it("flattens xterm's params", () => {
    expect(modeParams([1004, [2031, 1], 25])).toEqual([1004, 2031, 1, 25])
  })
})

describe('themePush', () => {
  it('sends nothing while the program has not asked for reports', () => {
    expect(themePush(THEME_REPORTS_OFF, 'light').send).toBeNull()
  })
  it('sends a change once, and nothing for the same mode again', () => {
    // ?2031h while the ground is dark: the mode the program can already know.
    let s = themeReports(THEME_REPORTS_OFF, true, 'dark')
    expect(themePush(s, 'dark').send).toBeNull() // a font change: no news
    const r = themePush(s, 'light')
    expect(r.send).toBe('\x1b[?997;2n')
    s = r.state
    expect(themePush(s, 'light').send).toBeNull()
    expect(themePush(s, 'dark').send).toBe('\x1b[?997;1n')
  })
  it('stops after ?2031l, and turning it on again keeps what was told', () => {
    let s = themeReports(THEME_REPORTS_OFF, true, 'dark')
    s = themeReports(s, false, 'dark')
    expect(themePush(s, 'light').send).toBeNull()
    s = themeReports(s, true, 'light')
    // Told dark last; the ground is light now, so the next look change says so.
    expect(themePush(s, 'light').send).toBe('\x1b[?997;2n')
  })
  it('an answered query counts as told', () => {
    let s = themeReports(THEME_REPORTS_OFF, true, 'dark')
    s = noteThemeMode(s, 'light')
    expect(themePush(s, 'light').send).toBeNull()
  })
})
