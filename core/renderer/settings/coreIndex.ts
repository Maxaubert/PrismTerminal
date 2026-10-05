import { dictationOptionIds } from './dictationOptions'
import { HELP_OPTIONS } from './helpOptions'
import { terminalOptionIds } from './options'
import type { SettingsIndexEntry } from './layout/search'
import { SETTINGS_SECTIONS, type SettingsSectionId } from './sectionIds'
import { acrylicSub, opt, themeSub } from './sections/opts'

/**
 * THE CORE'S ROWS FOR FIND A SETTING (2026-10-05): one entry per terminal,
 * dictation and command help row the host DRAWS on this PC, read from the
 * same lists the sections read, so the index cannot word a row differently
 * from the page. Which page holds a section is the host's (`pageOf`); a row
 * that is not drawn here (the GPU row without an NVIDIA card, command help in
 * a host that has not wired it) is not in the index.
 */
export function coreSettingsIndex({
  pageOf,
  nvidia,
  help = true
}: {
  pageOf: (section: SettingsSectionId) => string
  nvidia: boolean
  help?: boolean
}): SettingsIndexEntry[] {
  const ids = [
    ...terminalOptionIds({ windowAcrylic: false }),
    ...dictationOptionIds({ nvidia }),
    ...(help ? HELP_OPTIONS.map((o) => o.id) : [])
  ]
  return ids.map((id) => {
    const o = opt(id)
    const section = o.section
    const sub = id === 'term-theme' ? themeSub() : id === 'term-acrylic' ? acrylicSub() : o.sub
    return {
      id,
      page: pageOf(section),
      section: SETTINGS_SECTIONS[section] || '',
      sectionId: section,
      label: o.label,
      sub,
      icon: o.icon,
      keywords: o.keywords
    }
  })
}
