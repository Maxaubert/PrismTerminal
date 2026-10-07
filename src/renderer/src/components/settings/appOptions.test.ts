import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DIAGNOSTICS_OPTIONS } from '@core/renderer/settings/diagnosticsOptions'
import { DICTATION_OPTIONS } from '@core/renderer/settings/dictationOptions'
import { HELP_OPTIONS } from '@core/renderer/settings/helpOptions'
import { isSettingIcon } from '@core/renderer/settings/layout/icons'
import { TERMINAL_OPTIONS } from '@core/renderer/settings/options'
import { APP_OPTIONS, APP_SECTIONS } from './appOptions'
import { ROW_ORDER, SETTINGS_PAGES, settingsIndex } from './settingsIndex'

const CORE = [...TERMINAL_OPTIONS, ...DICTATION_OPTIONS, ...HELP_OPTIONS, ...DIAGNOSTICS_OPTIONS]

describe("this app's own settings rows", () => {
  it('have unique ids, none of them a core row', () => {
    const ids = APP_OPTIONS.map((o) => o.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(CORE.some((c) => c.id === id), id).toBe(false)
  })

  it('name a known icon, page and section', () => {
    const pages = SETTINGS_PAGES.map((p) => p.id)
    for (const o of APP_OPTIONS) {
      expect(isSettingIcon(o.icon), o.icon).toBe(true)
      expect(pages, o.id).toContain(o.page)
      expect(['theme', 'marks', ...Object.keys(APP_SECTIONS)], o.id).toContain(o.section)
    }
  })

  // NO STORAGE KEY CHANGES (2026-10-05, spec 1.1): a key is a saved setting.
  it('keep every storage key they have always had', () => {
    expect(APP_OPTIONS.map((o) => `${o.id}=${Array.isArray(o.store) ? o.store.join('+') : String(o.store)}`)).toMatchInlineSnapshot(`
      [
        "tab-width=prism.window.tabWidth",
        "title-bar=prism.window.titleBar",
        "window-edges=prism.window.edges",
        "window-background=prism.window.background",
        "window-accent=prism.window.accent",
        "newtab-mode=prism.newtab.mode+prism.newtab.folder",
        "explorer-verb=registry",
        "taskbar-badge=prism.window.taskbarBadge",
        "app-version=null",
      ]
    `)
  })

  it('are each drawn by one page, with a literal row id', () => {
    const pages = readdirSync(__dirname)
      .filter((f) => f.endsWith('Page.tsx'))
      .map((f) => readFileSync(join(__dirname, f), 'utf8'))
      .join('\n')
    const drawn = [...pages.matchAll(/<SettingRow\s+id="([a-z-]+)"|<WindowColour\s+id="([a-z-]+)"/g)].map((m) => m[1] ?? m[2])
    expect([...drawn].sort()).toEqual(APP_OPTIONS.map((o) => o.id).sort())
  })
})

describe('Find a setting', () => {
  it('orders every row once, core and own', () => {
    expect([...ROW_ORDER].sort()).toEqual([...CORE, ...APP_OPTIONS].map((o) => o.id).sort())
  })

  it('indexes what is drawn on this PC: the GPU row only with an NVIDIA card', () => {
    expect(settingsIndex(true).map((e) => e.id)).toEqual([...ROW_ORDER])
    expect(settingsIndex(false).map((e) => e.id)).toEqual(ROW_ORDER.filter((id) => id !== 'dictation-gpu'))
  })

  it('says where each row lives', () => {
    const at = Object.fromEntries(settingsIndex(true).map((e) => [e.id, `${e.page}/${e.section}`]))
    expect(at['term-theme']).toBe('appearance/Theme')
    expect(at['window-accent']).toBe('appearance/Theme')
    expect(at['term-shell']).toBe('terminal/Shell')
    expect(at['taskbar-badge']).toBe('agents/Tab marks')
    expect(at['agent-hooks']).toBe('agents/Claude Code')
    expect(at['dictation-enabled']).toBe('dictation/')
    expect(at['app-version']).toBe('about/')
    expect(at['diag-verbose']).toBe('diagnostics/')
  })
})
