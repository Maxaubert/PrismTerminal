import { useSyncExternalStore } from 'react'
import { DEFAULT_HOTKEY, type DictMode, type Hotkey } from './dictationKey'

/**
 * Dictation's settings (#13). VALUES ARE PER APP: each app has its own
 * localStorage, so switching it on in Prism Terminal switches nothing on in
 * Prism. Only the big files (models, the GPU pack) are shared, by main.
 *
 * OFF BY DEFAULT, and every reader treats a missing key as off: nothing
 * listens, nothing downloads and no server runs until the user says so.
 */
const K = {
  enabled: 'prism.dictation.enabled',
  mode: 'prism.dictation.mode',
  hotkey: 'prism.dictation.hotkey',
  mic: 'prism.dictation.mic',
  language: 'prism.dictation.language',
  pauseMedia: 'prism.dictation.pauseMedia',
  sounds: 'prism.dictation.sounds',
  model: 'prism.dictation.model',
  gpu: 'prism.dictation.gpu'
} as const

export const DICTATION_KEYS = K

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

export const dictationEnabled = (): boolean => read(K.enabled) === '1'
export const setDictationEnabled = (on: boolean): void => write(K.enabled, on ? '1' : '0')

/** Hold-to-talk is the default (owner, 2026-09-19). */
export const dictationMode = (): DictMode => (read(K.mode) === 'toggle' ? 'toggle' : 'hold')
export const setDictationMode = (m: DictMode): void => write(K.mode, m)

// Parsed once per stored string: useSyncExternalStore needs a STABLE snapshot,
// and a fresh object per read would re-render for ever.
let hotkeyRaw: string | null = null
let hotkeyParsed: Hotkey = DEFAULT_HOTKEY
export function dictationHotkey(): Hotkey {
  const raw = read(K.hotkey)
  if (raw === hotkeyRaw) return hotkeyParsed
  hotkeyRaw = raw
  hotkeyParsed = DEFAULT_HOTKEY
  if (raw) {
    try {
      const v = JSON.parse(raw) as Partial<Hotkey>
      if (typeof v.code === 'string' && v.code)
        hotkeyParsed = { code: v.code, ctrl: !!v.ctrl, alt: !!v.alt, shift: !!v.shift, meta: !!v.meta }
    } catch {
      /* a damaged value reads as the default */
    }
  }
  return hotkeyParsed
}
export const setDictationHotkey = (h: Hotkey): void => write(K.hotkey, JSON.stringify(h))

/** '' is the system default input. */
export const dictationMic = (): string => read(K.mic) ?? ''
export const setDictationMic = (id: string): void => write(K.mic, id)

/** 'auto', or a language code Whisper knows. */
export const dictationLanguage = (): string => {
  const v = read(K.language)
  return v && /^[a-z]{2,4}$/.test(v) ? v : 'auto'
}
export const setDictationLanguage = (code: string): void => write(K.language, code)

export const dictationPauseMedia = (): boolean => read(K.pauseMedia) === '1'
export const setDictationPauseMedia = (on: boolean): void => write(K.pauseMedia, on ? '1' : '0')

/** On unless switched off: the cue is how you know the mic opened without looking. */
export const dictationSounds = (): boolean => read(K.sounds) !== '0'
export const setDictationSounds = (on: boolean): void => write(K.sounds, on ? '1' : '0')

/** The ACTIVE model's catalog id, '' when none was ever chosen. */
export const dictationModel = (): string => read(K.model) ?? ''
export const setDictationModel = (id: string): void => write(K.model, id)

/** GPU acceleration is ON unless switched off: installing the pack is the
 *  user saying they want it. Disabling keeps the files (675 MB is not something
 *  to download twice on a whim, and the other app may be using them). */
export const dictationGpu = (): boolean => read(K.gpu) !== '0'
export const setDictationGpu = (on: boolean): void => write(K.gpu, on ? '1' : '0')

export const useDictationEnabled = (): boolean => useSyncExternalStore(sub, dictationEnabled)
export const useDictationMode = (): DictMode => useSyncExternalStore(sub, dictationMode)
export const useDictationHotkey = (): Hotkey => useSyncExternalStore(sub, dictationHotkey)
export const useDictationMic = (): string => useSyncExternalStore(sub, dictationMic)
export const useDictationLanguage = (): string => useSyncExternalStore(sub, dictationLanguage)
export const useDictationPauseMedia = (): boolean => useSyncExternalStore(sub, dictationPauseMedia)
export const useDictationSounds = (): boolean => useSyncExternalStore(sub, dictationSounds)
export const useDictationModel = (): string => useSyncExternalStore(sub, dictationModel)
export const useDictationGpu = (): boolean => useSyncExternalStore(sub, dictationGpu)
export const onDictationPrefs = sub
