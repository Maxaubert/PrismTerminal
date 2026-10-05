import type { JSX, ReactNode } from 'react'
import {
  setAgentDoneOn,
  setAgentFailedOn,
  setAgentIndicator,
  setAgentQuestionOn,
  useAgentDoneOn,
  useAgentFailedOn,
  useAgentIndicator,
  useAgentQuestionOn,
  type AgentIndicator
} from '../../lib/termLook'
import { Segmented, Switch } from '../fields'
import { SettingRow } from '../layout/SettingRow'
import { SettingsSection } from '../layout/SettingsSection'
import { opt, sectionTitle } from './opts'

const INDICATOR_SUB: Record<AgentIndicator, string> = {
  off: 'No mark while an agent works.',
  minimal: 'A line under the tab while it works.',
  full: 'The whole tab fills while it works.'
}

/**
 * HOW A TAB MARKS ITS AGENT (2026-10-05, the grouped cards redesign): off, a
 * line under the tab, or the whole tab filled while it works, and the three
 * marks a tab keeps while you are not looking (2026-09-28; #131 for Failed).
 * The indicator's style belongs to no theme: a theme pick never resets it.
 * `after`: the host's own rows about the same marks (Prism Terminal: the
 * taskbar count).
 */
export function AgentMarksSection({ after }: { after?: ReactNode } = {}): JSX.Element {
  const volume = useAgentIndicator()
  const doneOn = useAgentDoneOn()
  const questionOn = useAgentQuestionOn()
  const failedOn = useAgentFailedOn()
  const ind = opt('agent-indicator')
  const done = opt('agent-done-on')
  const question = opt('agent-question-on')
  const failed = opt('agent-failed-on')
  return (
    <SettingsSection id="marks" title={sectionTitle('marks')}>
      <SettingRow id="agent-indicator" icon={ind.icon} label={ind.label} sub={INDICATOR_SUB[volume]}>
        <Segmented
          value={volume}
          onChange={(v) => setAgentIndicator(v as AgentIndicator)}
          options={[
            { id: 'off', name: 'Off' },
            { id: 'minimal', name: 'Minimal' },
            { id: 'full', name: 'Full' }
          ]}
        />
      </SettingRow>
      <SettingRow id="agent-done-on" icon={done.icon} label={done.label} sub={done.sub} tap>
        <Switch on={doneOn} onChange={setAgentDoneOn} label={done.label} />
      </SettingRow>
      <SettingRow id="agent-question-on" icon={question.icon} label={question.label} sub={question.sub} tap>
        <Switch on={questionOn} onChange={setAgentQuestionOn} label={question.label} />
      </SettingRow>
      <SettingRow id="agent-failed-on" icon={failed.icon} label={failed.label} sub={failed.sub} tap>
        <Switch on={failedOn} onChange={setAgentFailedOn} label={failed.label} />
      </SettingRow>
      {after}
    </SettingsSection>
  )
}
