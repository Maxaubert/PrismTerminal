import { followsHostStyle, hostOwnsWindowAcrylic } from '../../host'
import { DIAGNOSTICS_OPTIONS, type DiagnosticsOption } from '../diagnosticsOptions'
import { DICTATION_OPTIONS, type DictationOption } from '../dictationOptions'
import { HELP_OPTIONS, type HelpOption } from '../helpOptions'
import { MARK_OPTIONS, type MarkOption } from '../markOptions'
import { TERMINAL_OPTIONS, type TerminalOption } from '../options'
import { SETTINGS_SECTIONS, type SettingsSectionId } from '../sectionIds'

// The lists, by id, for the sections that draw them: a row's label, icon and
// resting subtext are read from its list entry, so the page and Find a setting
// can never word a row two ways.

type AnyOption = TerminalOption | DictationOption | HelpOption | DiagnosticsOption | MarkOption

const byId = new Map<string, AnyOption>(
  [...TERMINAL_OPTIONS, ...MARK_OPTIONS, ...DICTATION_OPTIONS, ...HELP_OPTIONS, ...DIAGNOSTICS_OPTIONS].map((o) => [o.id, o])
)

/** A core option by id. Throws on a typo, which the unit suite then finds. */
export function opt(id: string): AnyOption {
  const o = byId.get(id)
  if (!o) throw new Error(`no settings option ${id}`)
  return o
}

/** The heading a core section wears. */
export const sectionTitle = (id: SettingsSectionId): string => SETTINGS_SECTIONS[id]

/** The theme row's subtext: where the host has styles of its own the window
 *  wears THOSE, and only a host with none (Prism Terminal) dresses its window
 *  in the terminal theme. */
export const themeSub = (): string =>
  followsHostStyle() ? 'Colours of the terminal text and ground.' : opt('term-theme').sub

/** The acrylic row's subtext, by what acrylic means in this host: the
 *  window's own material, or the app style's let through the terminal. */
export const acrylicSub = (): string =>
  hostOwnsWindowAcrylic() ? opt('term-acrylic').sub : 'The desktop shows through the terminal.'
