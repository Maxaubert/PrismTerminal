import type { TermPathAt } from '@core/renderer/components/TerminalPanel'
import type { MenuItem } from './ContextMenu'
import { MenuIcon } from './MenuIcon'
import { keyLabel } from '../lib/keymap'

/** Where the terminal's menu was opened, and what lay under the pointer. */
export interface TermMenuAt {
  /** The session it was opened on (code review 2026-09-24, #32): the menu
   *  shows only over that one, so a Ctrl+Tab never turns its Paste on the
   *  next shell while its Copy still holds the last one's selection. */
  id: string
  x: number
  y: number
  /** What was selected when the menu opened, and the link under the point. */
  selection: string
  link: string | null
  /** A file or folder under the point that exists (#99). */
  path: TermPathAt | null
}

/** What the menu's rows do: App's, handed in. */
export interface TermMenuActions {
  openPath: (path: TermPathAt, how: 'open' | 'reveal') => void
  copy: (text: string) => void
  openLink: (url: string) => void
  paste: () => void
  find: () => void
  /** Command help, while its setting is on; left out, the row is not offered. */
  help?: () => void
}

/**
 * THE TERMINAL'S RIGHT-CLICK MENU, as rows (moved out of App, audit
 * 2026-10-12, so the rows are a pure function a test can read).
 *
 * THE MENU FITS WHAT WAS CLICKED (owner, 2026-09-23: "if i click it on a link
 * it shows copy link, if i click it with text marked it says copy"). Both copy
 * exactly through the core's `copyText`, like the command help, which also
 * raises the "Copied" badge once the clipboard has it. Close tab left this
 * menu the same day ("remove close tab from the right click menu"); the tab's
 * own menu still has it.
 */
export function termMenuItems(m: TermMenuAt, act: TermMenuActions): MenuItem[] {
  const path = m.path
  const link = m.link
  return [
    // A PATH (#99; owner, 2026-09-29): open it as a click would, show it in
    // Explorer, or copy it whole and absolute.
    ...(path
      ? [
          {
            label: path.kind === 'dir' ? 'Open folder' : 'Open',
            icon: <MenuIcon name={path.kind === 'dir' ? 'folder' : 'open'} />,
            onPick: () => act.openPath(path, 'open')
          },
          { label: 'Show in Explorer', icon: <MenuIcon name="folder" />, onPick: () => act.openPath(path, 'reveal') },
          { label: 'Copy path', icon: <MenuIcon name="copy" />, onPick: () => act.copy(path.abs) }
        ]
      : []),
    ...(link
      ? [
          { label: 'Copy link', icon: <MenuIcon name="link" />, onPick: () => act.copy(link) },
          // A right-click never opens it (2026-09-28), so the menu does.
          { label: 'Open link', icon: <MenuIcon name="open" />, onPick: () => act.openLink(link) }
        ]
      : []),
    ...(m.selection
      ? [{ label: 'Copy', icon: <MenuIcon name="copy" />, hint: 'Ctrl+C', onPick: () => act.copy(m.selection) }]
      : []),
    // Paste through the terminal's own rule (an image forwards the keystroke
    // to the agent, files become quoted paths, text is a bracketed paste).
    { label: 'Paste', icon: <MenuIcon name="paste" />, hint: 'Ctrl+V', onPick: act.paste },
    { label: 'Find in scrollback', icon: <MenuIcon name="find" />, hint: keyLabel('find'), onPick: act.find },
    // Only while the setting is on: off means the app offers it nowhere.
    ...(act.help
      ? [{ label: 'Command help', icon: <MenuIcon name="help" />, hint: keyLabel('help'), onPick: act.help }]
      : [])
  ]
}
