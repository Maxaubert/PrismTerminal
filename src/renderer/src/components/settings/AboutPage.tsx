import { useEffect, useState, type JSX } from 'react'
import { SettingBlock } from '@core/renderer/settings/layout/SettingBlock'
import { SettingRow } from '@core/renderer/settings/layout/SettingRow'
import { SettingsSection } from '@core/renderer/settings/layout/SettingsSection'
import appIcon from '../../assets/app-icon.png'
import { appOpt } from './appOptions'

/** ABOUT: the app's own icon and one line, then the version it runs. The old
 *  "Prism Terminal" word under the rail went: this page says it. */
export function AboutPage(): JSX.Element {
  const [version, setVersion] = useState('')
  useEffect(() => {
    let live = true
    void window.prism.appVersion().then((v) => {
      if (live) setVersion(v)
    })
    return () => {
      live = false
    }
  }, [])
  const o = appOpt('app-version')
  return (
    <SettingsSection id="about">
      <SettingBlock>
        <div className="flex items-center gap-[18px] px-[18px] py-5">
          <img src={appIcon} alt="" width={56} height={56} className="block h-14 w-14 shrink-0" />
          <div>
            <h4
              className="m-0 text-[18px] font-bold tracking-[-0.01em] text-[var(--p-text)]"
              style={{ fontFamily: '"Segoe UI Variable Display", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif' }}
            >
              Prism Terminal
            </h4>
            <p className="mb-0 mt-1 text-[12.5px] leading-normal text-[var(--p-dim)]">A tabbed terminal for AI command line tools.</p>
          </div>
        </div>
      </SettingBlock>
      <SettingRow id="app-version" icon={o.icon} label={o.label} sub={o.sub}>
        <span
          id="app-version"
          data-app-version
          className="whitespace-nowrap rounded-full border border-[color:var(--p-line)] px-2 py-0.5 font-mono text-[11px] tabular-nums text-[var(--p-text-soft)]"
        >
          {version}
        </span>
      </SettingRow>
    </SettingsSection>
  )
}
