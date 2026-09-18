import { useSyncExternalStore } from 'react'

// The terminal's persisted look: which theme it wears and its base font size.
// Same tiny-store shape as tabPrefs. Per-SESSION font zoom (Ctrl+scroll) is
// deliberately NOT here: that lives and dies with the session.

const THEME_KEY = 'prism.term.theme'
const FONT_KEY = 'prism.term.fontPct'

export const TERM_BASE_FONT_PX = 13
export const FONT_PCTS = [80, 90, 100, 110, 125, 150, 175, 200] as const

let listeners: Array<() => void> = []
const notify = (): void => listeners.forEach((l) => l())

/** Names a preset (or 'custom'). 'prism' is the default. Inside Prism the
 *  default was 'style', follow the app style; there is no app style here, so a
 *  stored 'style' reads as 'prism' rather than as a theme nothing can resolve. */
export function termThemeId(): string {
  const v = localStorage.getItem(THEME_KEY)
  return !v || v === 'style' ? 'prism' : v
}

export function setTermThemeId(id: string): void {
  localStorage.setItem(THEME_KEY, id)
  notify()
}

const FONT_FAMILY_KEY = 'prism.term.font'

/** Monospace faces worth offering on Windows; each falls back to the stack's
 *  next face when not installed, so picking a missing one degrades quietly. */
export const TERM_FONTS = [
  { id: 'cascadia', name: 'Cascadia Mono', stack: '"Cascadia Mono", "JetBrainsMono NF", Consolas, monospace' },
  { id: 'cascadia-code', name: 'Cascadia Code', stack: '"Cascadia Code", "Cascadia Mono", Consolas, monospace' },
  { id: 'consolas', name: 'Consolas', stack: 'Consolas, "Cascadia Mono", monospace' },
  { id: 'jetbrains', name: 'JetBrains Mono', stack: '"JetBrains Mono", "JetBrainsMono NF", "Cascadia Mono", Consolas, monospace' },
  { id: 'jetbrains-nf', name: 'JetBrainsMono Nerd Font', stack: '"JetBrainsMono NF", "JetBrains Mono", "Cascadia Mono", Consolas, monospace' },
  { id: 'fira', name: 'Fira Code', stack: '"Fira Code", "Cascadia Mono", Consolas, monospace' },
  { id: 'source', name: 'Source Code Pro', stack: '"Source Code Pro", "Cascadia Mono", Consolas, monospace' },
  { id: 'lucida', name: 'Lucida Console', stack: '"Lucida Console", Consolas, monospace' },
  { id: 'courier', name: 'Courier New', stack: '"Courier New", Courier, monospace' },
  { id: 'ibm-plex', name: 'IBM Plex Mono', stack: '"IBM Plex Mono", "Cascadia Mono", Consolas, monospace' },
  { id: 'roboto-mono', name: 'Roboto Mono', stack: '"Roboto Mono", "Cascadia Mono", Consolas, monospace' },
  { id: 'ubuntu-mono', name: 'Ubuntu Mono', stack: '"Ubuntu Mono", "Cascadia Mono", Consolas, monospace' },
  { id: 'hack', name: 'Hack', stack: 'Hack, "Cascadia Mono", Consolas, monospace' },
  { id: 'iosevka', name: 'Iosevka', stack: 'Iosevka, "Iosevka Term", "Cascadia Mono", Consolas, monospace' },
  { id: 'dejavu', name: 'DejaVu Sans Mono', stack: '"DejaVu Sans Mono", "Cascadia Mono", Consolas, monospace' }
] as const

export function termFontId(): string {
  const v = localStorage.getItem(FONT_FAMILY_KEY)
  return TERM_FONTS.some((f) => f.id === v) ? (v as string) : 'cascadia'
}

export function setTermFontId(id: string): void {
  localStorage.setItem(FONT_FAMILY_KEY, id)
  notify()
}

export function termFontStack(): string {
  return TERM_FONTS.find((f) => f.id === termFontId())?.stack ?? TERM_FONTS[0].stack
}

export function termFontPct(): number {
  const v = Number(localStorage.getItem(FONT_KEY))
  return FONT_PCTS.includes(v as (typeof FONT_PCTS)[number]) ? v : 100
}

export function setTermFontPct(pct: number): void {
  localStorage.setItem(FONT_KEY, String(pct))
  notify()
}

/** The base font in pixels the current percentage means. */
export function termBaseFontPx(): number {
  return Math.round((TERM_BASE_FONT_PX * termFontPct()) / 100)
}

const ACRYLIC_KEY = 'prism.term.acrylic'
const OPACITY_KEY = 'prism.term.opacity'

/** Whether the window is acrylic: the theme's background is painted at
 *  termOpacity() and the desktop shows through. Inside Prism this belonged to
 *  the follow-style terminal alone and was on by default; here it works with
 *  any theme and is OFF until asked for. */
export function termAcrylic(): boolean {
  return localStorage.getItem(ACRYLIC_KEY) === '1'
}
export function setTermAcrylic(on: boolean): void {
  localStorage.setItem(ACRYLIC_KEY, on ? '1' : '0')
  notify()
}
/** 30-100. Read defensively: Number(null) and Number('') are 0, which would
 *  read "never set" as fully transparent. */
export function termOpacity(): number {
  const raw = localStorage.getItem(OPACITY_KEY)
  const n = raw === null || raw === '' ? NaN : Number(raw)
  return Number.isFinite(n) ? Math.min(100, Math.max(30, Math.round(n))) : 100
}
export function setTermOpacity(pct: number): void {
  localStorage.setItem(OPACITY_KEY, String(Math.min(100, Math.max(30, Math.round(pct)))))
  notify()
}

const AGENT_IND_KEY = 'prism.term.agentIndicator'

export type AgentIndicator = 'off' | 'minimal' | 'full'

/** How a working agent shows on its tab: not at all, a line under the tab,
 *  or the whole tab turning. MINIMAL is the default (owner, 2026-09-18; it was
 *  full in Prism and in the first build): the line says it, and a filled tab
 *  is the loud version you opt into. Idle always looks default; only WORKING
 *  paints. */
export function agentIndicator(): AgentIndicator {
  const v = localStorage.getItem(AGENT_IND_KEY)
  return v === 'full' || v === 'off' ? v : 'minimal'
}

export function setAgentIndicator(v: AgentIndicator): void {
  localStorage.setItem(AGENT_IND_KEY, v)
  notify()
}

const AGENT_COLOR_KEY = 'prism.term.agentColor'
const AGENT_DONE_KEY = 'prism.term.agentDoneColor'
const HEX = /^#[0-9a-f]{6}$/i

/**
 * The two agent colours, as CHOICES. '' means "follow the theme" and is the
 * default (owner, 2026-09-18: the indicator should wear the theme's accent):
 * a fixed orange belonged to one theme and clashed with thirty-eight others.
 * What the theme gives when nothing is chosen is lib/agentColors' business;
 * this file only remembers whether the user has an opinion.
 */
export function agentColorChoice(): string {
  const v = localStorage.getItem(AGENT_COLOR_KEY)
  return v && HEX.test(v) ? v : ''
}

/** A hex picks a colour; '' gives the choice back to the theme. */
export function setAgentColor(hex: string): void {
  if (HEX.test(hex)) localStorage.setItem(AGENT_COLOR_KEY, hex)
  else localStorage.removeItem(AGENT_COLOR_KEY)
  notify()
}

/** The finished-while-away colour's choice: an agent that stopped working on
 *  a BACKGROUND tab wears it until the tab is visited. */
export function agentDoneColorChoice(): string {
  const v = localStorage.getItem(AGENT_DONE_KEY)
  return v && HEX.test(v) ? v : ''
}

export function setAgentDoneColor(hex: string): void {
  if (HEX.test(hex)) localStorage.setItem(AGENT_DONE_KEY, hex)
  else localStorage.removeItem(AGENT_DONE_KEY)
  notify()
}

const CUSTOM_KEY = 'prism.term.custom'

export interface CustomTermTheme {
  bg: string
  fg: string
  cursor: string
  ansi: Record<string, string>
  /** The rest of the terminal setup, captured by "Save changes": the look is
   *  more than the palette. All optional - older saves carry colours only. */
  font?: string
  fontPct?: number
  indicator?: AgentIndicator
  indicatorColor?: string
  doneColor?: string
  acrylic?: boolean
  opacity?: number
}

/** What every non-colour terminal setting is out of the box. Picking any
 *  theme returns to these; deviating from them is what "Save changes" saves. */
export const TERM_EXTRA_DEFAULTS = {
  font: 'cascadia',
  fontPct: 100,
  indicator: 'minimal' as AgentIndicator,
  // '' = the theme's own (see agentColorChoice).
  indicatorColor: '',
  doneColor: '',
  acrylic: false,
  opacity: 100
}

/** Selecting a theme overwrites the terminal settings with their defaults:
 *  the theme is the whole setup, not just the palette. */
export function resetTermExtras(): void {
  localStorage.removeItem(FONT_FAMILY_KEY)
  localStorage.removeItem(FONT_KEY)
  localStorage.removeItem(AGENT_IND_KEY)
  localStorage.removeItem(AGENT_COLOR_KEY)
  localStorage.removeItem(AGENT_DONE_KEY)
  localStorage.removeItem(ACRYLIC_KEY)
  localStorage.removeItem(OPACITY_KEY)
  notify()
}

/** Re-apply the non-colour half of a saved Custom setup, when it has one. */
export function applyCustomExtras(t: CustomTermTheme | null): void {
  if (!t) return
  if (t.font) setTermFontId(t.font)
  if (t.fontPct) localStorage.setItem(FONT_KEY, String(t.fontPct))
  if (t.indicator) localStorage.setItem(AGENT_IND_KEY, t.indicator)
  // A saved setup that followed the theme goes back to following it.
  if (t.indicatorColor) localStorage.setItem(AGENT_COLOR_KEY, t.indicatorColor)
  else localStorage.removeItem(AGENT_COLOR_KEY)
  if (t.doneColor) localStorage.setItem(AGENT_DONE_KEY, t.doneColor)
  else localStorage.removeItem(AGENT_DONE_KEY)
  if (t.acrylic !== undefined) localStorage.setItem(ACRYLIC_KEY, t.acrylic ? '1' : '0')
  if (t.opacity !== undefined) localStorage.setItem(OPACITY_KEY, String(t.opacity))
  notify()
}

/** The user's ONE custom theme, or null before any save. Saving overwrites:
 *  like Tabby, there is a single Custom slot, edited and re-saved. */
export function customTermTheme(): CustomTermTheme | null {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as CustomTermTheme
    return typeof v.bg === 'string' && typeof v.fg === 'string' ? v : null
  } catch {
    return null
  }
}

export function saveCustomTermTheme(theme: CustomTermTheme): void {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(theme))
  notify()
}

export function onTermLookChange(cb: () => void): () => void {
  listeners.push(cb)
  return () => {
    listeners = listeners.filter((l) => l !== cb)
  }
}

const sub = onTermLookChange

export function useTermThemeId(): string {
  return useSyncExternalStore(sub, termThemeId)
}
export function useTermFontPct(): number {
  return useSyncExternalStore(sub, termFontPct)
}
export function useTermFontId(): string {
  return useSyncExternalStore(sub, termFontId)
}
export function useTermAcrylic(): boolean {
  return useSyncExternalStore(sub, termAcrylic)
}
export function useTermOpacity(): number {
  return useSyncExternalStore(sub, termOpacity)
}
export function useAgentIndicator(): AgentIndicator {
  return useSyncExternalStore(sub, agentIndicator)
}
export function useAgentColorChoice(): string {
  return useSyncExternalStore(sub, agentColorChoice)
}
export function useAgentDoneColorChoice(): string {
  return useSyncExternalStore(sub, agentDoneColorChoice)
}
export function useCustomTermTheme(): CustomTermTheme | null {
  // Cache per notify tick: useSyncExternalStore needs a stable snapshot.
  return useSyncExternalStore(sub, customSnapshot)
}
let customCache: { raw: string | null; value: CustomTermTheme | null } = { raw: null, value: null }
function customSnapshot(): CustomTermTheme | null {
  const raw = localStorage.getItem(CUSTOM_KEY)
  if (raw !== customCache.raw) customCache = { raw, value: customTermTheme() }
  return customCache.value
}
