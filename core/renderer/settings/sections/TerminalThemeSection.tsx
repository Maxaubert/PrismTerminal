import type { JSX, ReactNode } from 'react'
import { setTermAcrylic, useTermAcrylic } from '../../lib/termLook'
import { SaveButton, Switch } from '../fields'
import { SettingBlock } from '../layout/SettingBlock'
import { SettingRow } from '../layout/SettingRow'
import { SettingsSection } from '../layout/SettingsSection'
import { ThemeWall } from '../theme/ThemeWall'
import { useNoAcrylic, useTermSetup } from '../theme/useTermSetup'
import { acrylicSub, opt, sectionTitle, themeSub } from './opts'

/** What the Save changes button says it does, in both places it is drawn. */
export const SAVE_SETUP_TITLE = 'Saves the theme, agent colours and acrylic as Custom'

/**
 * THE THEME, as one section (2026-10-05): the theme row with Save changes, the
 * wall of cards, the host's own rows that a theme sets (Prism Terminal:
 * Background and Accent), and acrylic. Under the wall only what a theme DOES
 * set (2026-09-28); the font and the indicator live in their own sections.
 */
export function TerminalThemeSection({
  afterTheme,
  onThemePicked
}: {
  /** The host's own rows that a theme sets, right under the wall. */
  afterTheme?: ReactNode
  /** A card was picked (Custom included), after the pick landed. */
  onThemePicked?: () => void
} = {}): JSX.Element {
  const acrylicOn = useTermAcrylic()
  const { dirty, save } = useTermSetup()
  const noAcrylic = useNoAcrylic()
  const theme = opt('term-theme')
  const acrylic = opt('term-acrylic')
  return (
    <SettingsSection id="theme" title={sectionTitle('theme')}>
      <SettingRow id="term-theme" icon={theme.icon} label={theme.label} sub={themeSub()}>
        <SaveButton dirty={dirty} onClick={save} title={SAVE_SETUP_TITLE} />
      </SettingRow>
      <SettingBlock pad data-term-wall="">
        <ThemeWall onThemePicked={onThemePicked} />
      </SettingBlock>
      {afterTheme}
      {/* The material does not exist before Windows 11, so there the row says
          why instead of offering a switch that would do nothing. */}
      <SettingRow
        id="term-acrylic"
        icon={acrylic.icon}
        label={acrylic.label}
        sub={noAcrylic ? 'Needs Windows 11.' : acrylicSub()}
        off={noAcrylic}
        tap
      >
        <Switch on={acrylicOn && !noAcrylic} onChange={setTermAcrylic} label={acrylic.label} disabled={noAcrylic} />
      </SettingRow>
    </SettingsSection>
  )
}
