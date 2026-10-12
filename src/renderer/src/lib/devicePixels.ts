import { useEffect, useState } from 'react'

/**
 * WHOLE SCREEN PIXELS (owner, 2026-10-12, under See-through: "the sidebar border
 * is still there"). At a scale that is not a whole number (125 %, 150 %) a CSS
 * length can end inside a screen pixel: a 235 px sidebar ends 3/4 of the way
 * through pixel 294 at 125 %. Two see-through surfaces meeting there each
 * half-cover that pixel and the desktop shows through as a line, so an edge
 * where two surfaces meet is put on a whole screen pixel.
 */
export function onDevicePixels(px: number, ratio: number): number {
  if (!(ratio > 0)) return px
  return Math.round(px * ratio) / ratio
}

/** The window's device pixel ratio, followed through zoom and a move to a
 *  screen of another scale. */
export function useDevicePixelRatio(): number {
  const [ratio, setRatio] = useState(() => window.devicePixelRatio || 1)
  useEffect(() => {
    const query = matchMedia(`(resolution: ${ratio}dppx)`)
    const changed = (): void => setRatio(window.devicePixelRatio || 1)
    query.addEventListener('change', changed)
    return () => query.removeEventListener('change', changed)
  }, [ratio])
  return ratio
}
