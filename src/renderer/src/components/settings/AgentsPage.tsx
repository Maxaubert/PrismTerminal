import type { JSX } from 'react'
import { Switch } from '@core/renderer/settings/fields'
import { SettingRow } from '@core/renderer/settings/layout/SettingRow'
import { AgentMarksSection } from '@core/renderer/settings/sections/AgentMarksSection'
import { ClaudeCodeSection } from '@core/renderer/settings/sections/ClaudeCodeSection'
import { MarkColoursSection } from '@core/renderer/settings/sections/MarkColoursSection'
import { SettingsSection } from '@core/renderer/settings/layout/SettingsSection'
import { setOrchestratorOn, useOrchestratorOn } from '@core/renderer/lib/termLook'
import { setTaskbarBadgeOn, useTaskbarBadgeOn } from '../../lib/taskbarBadge'
import { APP_SECTIONS, appOpt } from './appOptions'

/** AGENTS: how a tab marks its agent, Claude Code's own word, and the marks'
 *  colours. This app adds the taskbar count, beside the marks it counts. */
export function AgentsPage(): JSX.Element {
  const badgeOn = useTaskbarBadgeOn()
  const badge = appOpt('taskbar-badge')
  const orch = appOpt('orchestrator')
  const orchOn = useOrchestratorOn()
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
      {/* THE ORCHESTRATOR (beta, owner 2026-10-16: "others that download this
          terminal ... if they don't want it, it's like already in there"): off
          by default. On, new tabs get its Claude plugin (the catch-up report,
          the orchestrator skill) and a tab's menu offers Make orchestrator. */}
      <SettingsSection id="orchestrator" title={APP_SECTIONS.orchestrator}>
        <span
          title="Ask any Claude tab to catch you up on the others, and promote one tab to lead them. Applies to tabs opened after a change, and uses Exact status from Claude Code."
          className="contents"
        >
          <SettingRow id="orchestrator" icon={orch.icon} label={orch.label} sub={orch.sub} tap>
            <Switch on={orchOn} onChange={setOrchestratorOn} label={orch.label} />
          </SettingRow>
        </span>
      </SettingsSection>
      <MarkColoursSection />
    </>
  )
}
