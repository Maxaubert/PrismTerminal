import { useMemo, useSyncExternalStore } from 'react'
import { termHost } from '../host'
import {
  useAgentColorChoice,
  useAgentDoneColorChoice,
  useCustomTermTheme,
  useTermThemeId
} from './termLook'

/**
 * The agent indicator's colours IN FORCE: the user's pick where there is one,
 * else what the HOST says its theme gives (owner, 2026-09-18 and -19: the
 * indicator wears the accent, in both apps). `termLook` only remembers whether
 * the user has an opinion ('' = follow); the host names the accent
 * (`themedAgentColors`), because the tab strip is the host's chrome.
 */
/** Bumped whenever the host says its window colours changed (`onChromeChange`),
 *  so an indicator that follows a PICKED accent recolours with it. */
let chromeRev = 0
const subscribeChrome = (cb: () => void): (() => void) =>
  termHost().onChromeChange?.(() => {
    chromeRev += 1
    cb()
  }) ?? (() => {})
const chromeSnapshot = (): number => chromeRev

export function useAgentColors(): { working: string; finished: string } {
  const rev = useSyncExternalStore(subscribeChrome, chromeSnapshot)
  const themeId = useTermThemeId()
  // A custom theme edited in place keeps its id; its palette is the dependency.
  const custom = useCustomTermTheme()
  const working = useAgentColorChoice()
  const finished = useAgentDoneColorChoice()
  return useMemo(() => {
    const themed = termHost().themedAgentColors(themeId)
    return { working: working || themed.working, finished: finished || themed.finished }
    // `custom` is read by the host's resolver, not named in the body.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeId, custom, working, finished, rev])
}
