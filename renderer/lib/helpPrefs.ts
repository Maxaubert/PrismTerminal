import { useSyncExternalStore } from 'react'
import type { HelpShellChoice } from '../../shared/help/shells'

/**
 * The help panel's settings (#12). VALUES ARE PER APP, like every other
 * setting in the core: each app has its own localStorage.
 *
 * ON BY DEFAULT, unlike dictation, and every reader treats a missing key as
 * on. The owner asked only that it be OPTIONAL ("optional in settings whether
 * a user wants to see them"); it is a discoverability feature for people who
 * do not yet know the shell, who are exactly the people who would never find
 * a switch to turn it on. It costs nothing while shut: no process, no
 * network, no listener beyond the one key. Off means off all the same: the
 * button goes, and the key goes back to the shell.
 */
const K = {
  enabled: 'prism.help.enabled',
  shell: 'prism.help.shell'
} as const

export const HELP_KEYS = K

const listeners = new Set<() => void>()
const notify = (): void => listeners.forEach((l) => l())
const sub = (l: () => void): (() => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
const write = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* a full or blocked store loses the setting, not the app */
  }
  notify()
}

/** On unless switched off. */
export const helpEnabled = (): boolean => read(K.enabled) !== '0'
export const setHelpEnabled = (on: boolean): void => write(K.enabled, on ? '1' : '0')

/**
 * The shell chip somebody last PICKED BY HAND, or null when they never have.
 * The panel opens on the shell of the tab in front; this is only what it falls
 * back to where there is no such tab (the start screen, Settings).
 */
export const helpShell = (): HelpShellChoice | null => {
  const v = read(K.shell)
  return v === 'powershell' || v === 'cmd' || v === 'bash' ? v : null
}
export const setHelpShell = (shell: HelpShellChoice): void => write(K.shell, shell)

export const useHelpEnabled = (): boolean => useSyncExternalStore(sub, helpEnabled)
export const onHelpPrefs = sub
