import { useEffect, useState, type JSX } from 'react'
import { ROW_BUTTON, Segmented, Switch } from '@core/renderer/settings/fields'
import { SettingRow } from '@core/renderer/settings/layout/SettingRow'
import { SettingsSection } from '@core/renderer/settings/layout/SettingsSection'
import { HelpSection } from '@core/renderer/settings/sections/HelpSection'
import { ShellSection } from '@core/renderer/settings/sections/ShellSection'
import { TerminalTextSection } from '@core/renderer/settings/sections/TerminalTextSection'
import { setNewTabMode, useNewTabFolder, useNewTabMode } from '../../lib/newTabPrefs'
import { APP_SECTIONS, appOpt } from './appOptions'

/**
 * Where a new tab opens and the Explorer menu: this app's own rows about how
 * terminals are opened. With no folder chosen, "a folder" is the user's own
 * (owner, 2026-09-18: the + should simply open, and asking is the option, not
 * the default).
 */
function OpeningSection(): JSX.Element {
  // Explorer's context-menu verb lives in the registry, not in a settings
  // file: the switch reports what Windows actually has.
  const [verb, setVerbState] = useState(false)
  const [verbBusy, setVerbBusy] = useState(true)
  useEffect(() => {
    let live = true
    void window.prism.shellVerbStatus().then((on) => {
      if (live) {
        setVerbState(on)
        setVerbBusy(false)
      }
    })
    return () => {
      live = false
    }
  }, [])
  const setVerb = (on: boolean): void => {
    setVerbBusy(true)
    void window.prism.setShellVerb(on).then(async () => {
      // Read it back rather than trusting the write: this is the registry.
      setVerbState(await window.prism.shellVerbStatus())
      setVerbBusy(false)
    })
  }
  const tabMode = useNewTabMode()
  const tabFolder = useNewTabFolder()
  const chooseFolder = (): void => {
    void window.prism.pickFolder().then((dir) => {
      if (dir) setNewTabMode('folder', dir)
    })
  }
  const [home, setHome] = useState('')
  useEffect(() => {
    void window.prism.homeDir().then(setHome)
  }, [])
  const newTab = appOpt('newtab-mode')
  const menu = appOpt('explorer-verb')
  return (
    <SettingsSection id="opening" title={APP_SECTIONS.opening}>
      <SettingRow
        id="newtab-mode"
        icon={newTab.icon}
        label={newTab.label}
        sub={tabMode === 'ask' ? 'Asks for a folder each time.' : tabFolder ? 'Opens in the folder you chose.' : newTab.sub}
      >
        {/* The folder itself is a path, which a subtext does not hold (plain
            words only), so it rides on the controls' tooltip. */}
        <div className="flex items-center gap-2.5" title={tabMode === 'folder' ? tabFolder || home || undefined : undefined}>
          <Segmented
            value={tabMode}
            onChange={(v: 'ask' | 'folder') => setNewTabMode(v)}
            options={[
              { id: 'folder', name: 'Open in a folder' },
              { id: 'ask', name: 'Ask where each time' }
            ]}
          />
          {tabMode === 'folder' && tabFolder && (
            <button data-use-home onClick={() => setNewTabMode('folder', '')} className={ROW_BUTTON}>
              Use my user folder
            </button>
          )}
          {tabMode === 'folder' && (
            <button data-choose-folder onClick={chooseFolder} className={ROW_BUTTON}>
              Choose folder…
            </button>
          )}
        </div>
      </SettingRow>
      {/* Explorer's own menu. The subtext QUOTES the entry (#27): it no longer
          names the app, so the row has to say which line of Explorer's menu it
          is talking about. */}
      <SettingRow id="explorer-verb" icon={menu.icon} label={menu.label} sub={verbBusy ? 'Checking with Windows.' : menu.sub} tap>
        <Switch on={verb} onChange={setVerb} label={menu.label} disabled={verbBusy} />
      </SettingRow>
    </SettingsSection>
  )
}

/** TERMINAL: the shell, how terminals open, their text, and command help. */
export function TerminalPage(): JSX.Element {
  return (
    <>
      <ShellSection />
      <OpeningSection />
      <TerminalTextSection />
      <HelpSection />
    </>
  )
}
