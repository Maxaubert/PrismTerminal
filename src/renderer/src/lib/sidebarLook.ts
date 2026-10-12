import { useEffect, useState } from 'react'
import { luminance } from '@core/renderer/lib/termAnsi'
import { BLACK_GROUND } from './sidebarGround'

/**
 * THE SIDEBAR'S EDGE (#162; owner, 2026-10-12: "only show border on the sidebar
 * if bg and secondary colour is black, since then shadows dont work, otherwise
 * shadow works as a border"): a hairline where the terminal's ground and the
 * sidebar's are both black, a shadow everywhere else, lighter on a light theme.
 */
export type SidebarEdge = 'line' | 'shadow' | 'shadow-light'

const black = (c: string): boolean => {
  const hex = c.trim().slice(0, 7)
  return /^#[0-9a-f]{6}$/i.test(hex) && luminance(hex) < BLACK_GROUND
}

export function sidebarEdge(bg: string, secondary: string, mode: string | undefined): SidebarEdge {
  if (black(bg) && black(secondary)) return 'line'
  return mode === 'light' ? 'shadow-light' : 'shadow'
}

function read(): SidebarEdge {
  const root = document.documentElement
  const css = getComputedStyle(root)
  return sidebarEdge(
    css.getPropertyValue('--p-bg-solid'),
    css.getPropertyValue('--p-secondary'),
    root.dataset.mode
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
