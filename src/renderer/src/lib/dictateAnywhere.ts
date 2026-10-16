import { useEffect } from 'react'
import { boolPref } from '@core/renderer/lib/prefStore'
import { dictationOutside, dictationView, onDictationLevel, onDictationView, OUTSIDE, setDictationRoute } from '@core/renderer/lib/dictation'
import { useDictationEnabled, useDictationHotkey, useDictationMode } from '@core/renderer/lib/dictationPrefs'

/**
 * DICTATE FROM ANY APP (owner, 2026-10-16; spec:
 * docs/superpowers/specs/2026-10-16-dictate-anywhere.md). THIS APP'S OWN
 * setting, on by default (whenever dictation is on): main runs the key from
 * any app (globalDictKey); the page records (core dictation, `OUTSIDE`) and
 * hands what it heard to main, which routes it (the orchestrator, or a pick).
 */
const pref = boolPref('prism.dictation.anywhere', true)
export const dictateAnywhere = pref.get
export const setDictateAnywhere = pref.set
export const useDictateAnywhere = pref.use

/** The theme's inks as the page wears them, for the widget (rule 15). */
function look(): { ground: string; text: string; dim: string; accent: string; edge: string } {
  const cs = getComputedStyle(document.documentElement)
  const v = (name: string, fallback: string): string => cs.getPropertyValue(name).trim() || fallback
  return {
    ground: v('--p-tabs', '#16161a'),
    text: v('--p-text', '#f2f2f4'),
    dim: v('--p-dim', '#b4b4bd'),
    accent: v('--p-accent-hi', '#e8925c'),
    edge: v('--p-divider', '#3a3a44')
  }
}

const LEVEL_EVERY_MS = 66

export function useDictateAnywhereBridge(): void {
  const enabled = useDictationEnabled()
  const anywhere = useDictateAnywhere()
  const hotkey = useDictationHotkey()
  const mode = useDictationMode()
  // Main runs the key only while both are on.
  useEffect(() => {
    window.prism.dictAnywhere({ on: enabled && anywhere, hotkey, mode })
  }, [enabled, anywhere, hotkey, mode])

  useEffect(() => {
    // What the outside recording heard goes to main, never into a tab here.
    setDictationRoute((r) => window.prism.dictRouted(r))
    let level = 0
    let lastSent = 0
    const live = (): void => {
      const v = dictationView()
      if (v.sessionId !== OUTSIDE) return
      window.prism.dictLive({
        phase: v.phase === 'idle' ? 'idle' : v.phase,
        text: v.liveText,
        level,
        starting: v.starting
      })
    }
    const offView = onDictationView(live)
    const offLevel = onDictationLevel((l) => {
      level = l
      const now = performance.now()
      if (now - lastSent < LEVEL_EVERY_MS) return
      lastSent = now
      if (dictationView().sessionId === OUTSIDE) live()
    })
    const offKey = window.prism.onDictOutside((action) => {
      if (action === 'start') window.prism.dictLook(look())
      dictationOutside(action)
    })
    return () => {
      setDictationRoute(null)
      offView()
      offLevel()
      offKey()
    }
  }, [])
}
