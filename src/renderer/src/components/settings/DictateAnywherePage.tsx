import type { JSX } from 'react'
import { Switch } from '@core/renderer/settings/fields'
import { SettingRow } from '@core/renderer/settings/layout/SettingRow'
import { SettingsSection } from '@core/renderer/settings/layout/SettingsSection'
import { useDictationEnabled } from '@core/renderer/lib/dictationPrefs'
import { setDictateAnywhere, useDictateAnywhere } from '../../lib/dictateAnywhere'
import { APP_SECTIONS, appOpt } from './appOptions'

/**
 * DICTATE FROM ANY APP (owner, 2026-10-16), this app's own row at the foot of
 * the Dictation page: the key with another app in front, the widget, and the
 * words sent to the orchestrator or to the session picked from the widget.
 */
export function DictateAnywhereRow(): JSX.Element {
  const o = appOpt('dictation-anywhere')
  const on = useDictateAnywhere()
  const enabled = useDictationEnabled()
  return (
    <SettingsSection id="anywhere" title={APP_SECTIONS.anywhere}>
      <span
        title="Press the dictation key with any app in front. A widget shows what you say, then sends it to the orchestrator tab, or lets you pick a Claude session with a click or its number. Not in windows run as administrator."
        className="contents"
      >
        <SettingRow id="dictation-anywhere" icon={o.icon} label={o.label} sub={o.sub} tap>
          <Switch on={on} onChange={setDictateAnywhere} label={o.label} disabled={!enabled} />
        </SettingRow>
      </span>
    </SettingsSection>
  )
}
