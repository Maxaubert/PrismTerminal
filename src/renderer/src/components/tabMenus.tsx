import { useState, type JSX, type MouseEvent } from 'react'
import { keyLabel } from '../lib/keymap'
import type { Tab } from '../lib/tabs'
import {
  pinnedRoots,
  plusMenuList,
  recentLabels,
  recentRoots,
  togglePin
} from '@core/renderer/lib/recentRoots'
import { ContextMenu } from './ContextMenu'
import { MenuIcon } from './MenuIcon'
import { FolderGlyph, PinGlyph } from './menuGlyphs'

/** What the + menu lists right now: pins first, then the newest recents. */
export const plusMenuRows = (): Array<{ path: string; pinned: boolean }> =>
  plusMenuList(pinnedRoots(), recentRoots())

/**
 * A TAB'S OWN MENU AND THE +'s MENU of places, the same for the strip and the
 * sidebar (#162): lifted out of TabStrip as they were.
 */
export function useTabMenus({
  onClose,
  onOpenRecent
}: {
  onClose: (id: string) => void
  onOpenRecent: (path: string) => void
}): {
  openTabMenu: (e: MouseEvent, t: Tab) => void
  openPlusMenu: (e: MouseEvent) => void
  open: boolean
  menus: JSX.Element
} {
  const [plusMenu, setPlusMenu] = useState<{
    x: number
    y: number
    rows: Array<{ path: string; pinned: boolean }>
  } | null>(null)
  /** A tab's own menu. Deliberately WITHOUT 'close others': each close can
   *  raise the agent-is-working question, and firing several would overwrite
   *  it and stop the work it exists to protect. That wants App-side
   *  batching, which is a decision rather than a gap to fill here. */
  const [tabMenu, setTabMenu] = useState<{ x: number; y: number; id: string; cwd: string } | null>(
    null
  )
  const openTabMenu = (e: MouseEvent, t: Tab): void => {
    e.preventDefault()
    setTabMenu({ x: e.clientX, y: e.clientY, id: t.id, cwd: t.kind === 'settings' ? '' : t.cwd })
  }
  const openPlusMenu = (e: MouseEvent): void => {
    e.preventDefault()
    // Read when it opens: the list is history, and history moves.
    setPlusMenu({ x: e.clientX, y: e.clientY, rows: plusMenuRows() })
  }
  const menus = (
    <>
      {tabMenu && (
        <ContextMenu
          x={tabMenu.x}
          y={tabMenu.y}
          onClose={() => setTabMenu(null)}
          items={[
            // Every row acts on the tab you clicked. "New tab" was here and
            // went (2026-08-31): the + is one pixel away and its tooltip
            // already teaches its key.
            {
              label: 'Close tab',
              icon: <MenuIcon name="close" />,
              hint: keyLabel('close-tab'),
              onPick: () => onClose(tabMenu.id)
            },
            // Settings is a tab with no folder. Offering this there wrote an
            // EMPTY STRING over the clipboard, which is worse than doing
            // nothing.
            ...(tabMenu.cwd
              ? [
                  {
                    label: 'Copy folder path',
                    icon: <MenuIcon name="folder" />,
                    onPick: () => void navigator.clipboard.writeText(tabMenu.cwd)
                  }
                ]
              : [])
          ]}
        />
      )}
      {plusMenu && (
        <ContextMenu
          x={plusMenu.x}
          y={plusMenu.y}
          onClose={() => setPlusMenu(null)}
          items={
            plusMenu.rows.length
              ? recentLabels(plusMenu.rows.map((r) => r.path)).map((r, i) => {
                  const pinned = plusMenu.rows[i].pinned
                  return {
                    label: r.label,
                    // A folder in front of each, in the accent: the menu should say
                    // "places" at a glance, not read as a list of commands.
                    icon: <FolderGlyph />,
                    onPick: () => onOpenRecent(r.path),
                    // The pin (#99): toggles in place and the list re-reads,
                    // so the row you pinned climbs to the top while the menu
                    // stands. Pinned rows stay for good, above the recents.
                    trailing: {
                      icon: <PinGlyph filled={pinned} />,
                      title: pinned ? 'Unpin' : 'Pin to this menu',
                      onClick: () => {
                        togglePin(r.path)
                        setPlusMenu((m) => (m ? { ...m, rows: plusMenuRows() } : m))
                      }
                    }
                  }
                })
              : [{ label: 'No recent folders', disabled: true }]
          }
        />
      )}
    </>
  )
  return { openTabMenu, openPlusMenu, open: !!tabMenu || !!plusMenu, menus }
}
