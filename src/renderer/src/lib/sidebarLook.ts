import { useEffect, useState } from 'react'
import { luminance } from '@core/renderer/lib/termAnsi'
import { BLACK_GROUND } from './sidebarGround'

/**
 * THE SIDEBAR'S EDGE (#162; owner, 2026-10-12: "only show border on the sidebar
 * if bg and secondary colour is black, since then shadows dont work, otherwise
 * shadow works as a border"): a hairline where the terminal's ground and the
 * sidebar's are both black, a shadow everywhere else, lighter on a light theme.
 * SEE-THROUGH, NEITHER (owner, 2026-10-12, of a see-through window: "there's
 * also a border, which I thought we only did on a black theme"): over glass a
 * shadow is a dark band down the terminal's edge, so the two tints alone say
 * where the sidebar ends.
 */
export type SidebarEdge = 'line' | 'shadow' | 'shadow-light' | 'none'

const black = (c: string): boolean => {
  const hex = c.trim().slice(0, 7)
  return /^#[0-9a-f]{6}$/i.test(hex) && luminance(hex) < BLACK_GROUND
}

/** Whether a ground is see-through: a #rrggbbaa with an alpha under ff. */
const glass = (c: string): boolean => {
  const v = c.trim()
  return /^#[0-9a-f]{8}$/i.test(v) && v.slice(7).toLowerCase() !== 'ff'
}

export function sidebarEdge(
  bg: string,
  secondary: string,
  mode: string | undefined,
  ground = ''
): SidebarEdge {
  if (glass(ground)) return 'none'
  if (black(bg) && black(secondary)) return 'line'
  return mode === 'light' ? 'shadow-light' : 'shadow'
}

function read(): SidebarEdge {
  const root = document.documentElement
  const css = getComputedStyle(root)
  return sidebarEdge(
    css.getPropertyValue('--p-bg-solid'),
    css.getPropertyValue('--p-secondary'),
    root.dataset.mode,
    css.getPropertyValue('--p-bg')
  )
}

/** The edge for the colours the window paints now, following a theme change
 *  (chromeTheme writes the tokens on the root's style). */
export function useSidebarEdge(): SidebarEdge {
  const [edge, setEdge] = useState(read)
  useEffect(() => {
    const watch = new MutationObserver(() => setEdge(read()))
    watch.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'data-mode']
    })
    return () => watch.disconnect()
  }, [])
  return edge
}
