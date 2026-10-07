import { useEffect, useMemo, useState, type JSX } from 'react'
import { dictationHost } from '@core/renderer/host'
import { SettingsFrame } from '@core/renderer/settings/layout/SettingsFrame'
import { DiagnosticsPage } from '@core/renderer/settings/sections/DiagnosticsPage'
import { DictationPage } from '@core/renderer/settings/sections/DictationPage'
import { AboutPage } from './AboutPage'
import { AgentsPage } from './AgentsPage'
import { AppearancePage } from './AppearancePage'
import type { AppPageId } from './appOptions'
import { SETTINGS_PAGES, settingsIndex } from './settingsIndex'
import { TerminalPage } from './TerminalPage'

// THE SETTINGS PAGE IS THIS APP'S; THE TERMINAL'S SETTINGS ARE THE CORE'S (#15).
// Every terminal option, its name, type and behaviour, is the same code here and
// in Prism (`core/renderer/settings`); only the personal values differ, and
// each app keeps its own. Since the grouped cards redesign (2026-10-05) the
// frame, the sections and the rows are the core's too; what is this app's is
// which pages exist, which section goes on which page, and its own rows
// (`appOptions.ts`).

export type SettingsPage = AppPageId

/**
 * The Settings page. It rides the tab strip as a tab of its own, so it FILLS
 * whatever App mounts it in rather than fixing itself over the window. There
 * is nothing to close (the tab's X does that) and every setting is a store it
 * writes. The page it shows is App's (#123): this component unmounts whenever
 * another tab is in front, and coming back must find the page that was left.
 */
export default function Settings({
  page,
  onPage
}: {
  page: SettingsPage
  onPage: (page: SettingsPage) => void
}): JSX.Element {
  // The GPU row is drawn only where an NVIDIA card is found, so it is in the
  // index only there too.
  const [nvidia, setNvidia] = useState(false)
  useEffect(() => {
    let live = true
    void dictationHost()
      ?.api.dictationInfo()
      .then((info) => {
        if (live) setNvidia(!!info?.nvidia)
      })
    return () => {
      live = false
    }
  }, [])
  const index = useMemo(() => settingsIndex(nvidia), [nvidia])
  return (
    <SettingsFrame
      pages={SETTINGS_PAGES}
      page={page}
      onPage={(id) => onPage(id as SettingsPage)}
      index={index}
    >
      {page === 'appearance' ? (
        <AppearancePage />
      ) : page === 'terminal' ? (
        <TerminalPage />
      ) : page === 'agents' ? (
        <AgentsPage />
      ) : page === 'dictation' ? (
        <DictationPage />
      ) : page === 'diagnostics' ? (
        <DiagnosticsPage api={window.prism} />
      ) : (
        <AboutPage />
      )}
    </SettingsFrame>
  )
}
