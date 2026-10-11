import { coreSettingsIndex } from '@core/renderer/settings/coreIndex'
import type { SettingsIndexEntry, SettingsPageDef } from '@core/renderer/settings/layout/SettingsFrame'
import type { SettingsSectionId } from '@core/renderer/settings/sectionIds'
import { APP_OPTIONS, APP_SECTIONS, type AppPageId } from './appOptions'

// This app's pages, where the core's sections sit on them, and the index Find
// a setting reads (2026-10-05, the grouped cards redesign).

/** The pages, in the rail's order; About sits at the bottom. */
export const SETTINGS_PAGES: Array<SettingsPageDef & { id: AppPageId }> = [
  { id: 'appearance', label: 'Appearance', icon: 'appearance' },
  { id: 'terminal', label: 'Terminal', icon: 'terminal' },
  { id: 'agents', label: 'Agents', icon: 'agents' },
  { id: 'dictation', label: 'Dictation', icon: 'dictation' },
  // The log (#140): the last page above About, with the app's own matters.
  { id: 'diagnostics', label: 'Diagnostics', icon: 'diagnostics' },
  { id: 'about', label: 'About', icon: 'about', end: true }
]

/** Which page holds each of the core's sections HERE. In this app the
 *  terminal theme dresses the window, so it is on Appearance (Q2). */
const PAGE_OF: Record<SettingsSectionId, AppPageId> = {
  shell: 'terminal',
  text: 'terminal',
  help: 'terminal',
  theme: 'appearance',
  marks: 'agents',
  claude: 'agents',
  colours: 'agents',
  dictation: 'dictation',
  listening: 'dictation',
  while: 'dictation',
  models: 'dictation',
  gpu: 'dictation',
  diagnostics: 'diagnostics'
}

/** Every row in the order the pages draw them, which is the order Find a
 *  setting lists matches in. A test holds this to the lists. */
export const ROW_ORDER = [
  'tab-width', 'tab-style', 'tab-switch', 'title-bar', 'window-edges', 'term-theme', 'term-acrylic', 'window-background', 'window-accent',
  'term-shell', 'newtab-mode', 'explorer-verb', 'term-font-family', 'term-font', 'help-enabled',
  'agent-indicator', 'agent-done-on', 'agent-rainbow', 'agent-question-on', 'agent-failed-on', 'taskbar-badge', 'agent-hooks',
  'agent-color', 'agent-done-color', 'agent-question-color',
  'dictation-enabled', 'dictation-mode', 'dictation-hotkey', 'dictation-mic', 'dictation-language',
  'dictation-pause-media', 'dictation-sounds', 'dictation-model', 'dictation-gpu',
  'diag-verbose', 'diag-folder', 'diag-mark',
  'app-version'
] as const

/** The index Find a setting reads: the core's rows drawn here, and this
 *  app's own, in page order. */
export function settingsIndex(nvidia: boolean): SettingsIndexEntry[] {
  const core = coreSettingsIndex({ pageOf: (s) => PAGE_OF[s], nvidia, diagnostics: true, marks: true })
  const own: SettingsIndexEntry[] = APP_OPTIONS.map((o) => ({
    id: o.id,
    page: o.page,
    section: o.section in APP_SECTIONS ? APP_SECTIONS[o.section as keyof typeof APP_SECTIONS] : core.find((c) => c.sectionId === o.section)?.section ?? '',
    sectionId: o.section,
    label: o.label,
    sub: o.sub,
    icon: o.icon,
    keywords: o.keywords
  }))
  const all = new Map([...core, ...own].map((e) => [e.id, e]))
  return ROW_ORDER.flatMap((id) => {
    const e = all.get(id)
    return e ? [e] : []
  })
}
