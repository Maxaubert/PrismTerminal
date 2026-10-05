import type { JSX } from 'react'
import { Switch } from '@core/renderer/settings/fields'
import { SettingRow } from '@core/renderer/settings/layout/SettingRow'
import { AgentMarksSection } from '@core/renderer/settings/sections/AgentMarksSection'
import { ClaudeCodeSection } from '@core/renderer/settings/sections/ClaudeCodeSection'
import { MarkColoursSection } from '@core/renderer/settings/sections/MarkColoursSection'
import { setTaskbarBadgeOn, useTaskbarBadgeOn } from '../../lib/taskbarBadge'
import { appOpt } from './appOptions'

/** AGENTS: how a tab marks its agent, Claude Code's own word, and the marks'
 *  colours. This app adds the taskbar count, beside the marks it counts. */
export function AgentsPage(): JSX.Element {
  const badgeOn = useTaskbarBadgeOn()
  const badge = appOpt('taskbar-badge')
  return (
    <>
      <AgentMarksSection
        after={
          <SettingRow id="taskbar-badge" icon={badge.icon} label={badge.label} sub={badge.sub} tap>
            <Switch on={badgeOn} onChange={setTaskbarBadgeOn} label={badge.label} />
          </SettingRow>
        }
      />
      <ClaudeCodeSection />
      <MarkColoursSection />
    </>
  )
}
