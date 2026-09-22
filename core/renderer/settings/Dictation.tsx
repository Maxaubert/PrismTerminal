import { useCallback, useEffect, useRef, useState, type JSX, type ReactNode } from 'react'
import { dictationHost } from '../host'
import { catalogEntry, LANGUAGES, recommendedModel, visibleModels } from '../../shared/dictationCatalog'
import type { CatalogEntry, DownloadFailure, EngineInfo, ItemStatus } from '../../shared/dictationTypes'
import { DEFAULT_HOTKEY, formatHotkey, parseHotkeyFromEvent, type Hotkey } from '../lib/dictationKey'
import {
  setDictationEnabled,
  setDictationHotkey,
  setDictationLanguage,
  setDictationMic,
  setDictationMode,
  setDictationModel,
  setDictationPauseMedia,
  setDictationSounds,
  useDictationEnabled,
  useDictationHotkey,
  useDictationLanguage,
  useDictationMic,
  useDictationMode,
  useDictationModel,
  useDictationPauseMedia,
  useDictationSounds
} from '../lib/dictationPrefs'
import { listMics, startCapture, type Capture } from '../lib/micCapture'
import { Pref, Segmented, Select, Switch } from './fields'
import { VendorMark } from './VendorMark'

/**
 * DICTATION'S SETTINGS PAGE, for both hosts (#13). Prism Terminal shows it as
 * its own tab, Prism as its own page under Behaviour (owner, 2026-09-19); the
 * page itself is this, once. Values are per app; the model files it manages
 * are shared by both apps, which is why a model downloaded in one shows as
 * installed in the other.
 *
 * NOTHING HERE STARTS ANYTHING BY ITSELF. Opening the page does not open the
 * microphone (the meter is behind a Test button: a mic that lights up because
 * you looked at a settings page is a privacy bug), and nothing downloads
 * without a click.
 */
const ROWS = 'border-t border-[color:var(--p-line)]'
const GPU_ID = 'gpu-pack'

const FAILURES: Record<DownloadFailure, string> = {
  network: 'The download failed.',
  checksum: 'The file did not match its checksum and was deleted.',
  disk: 'It could not be written to disk.',
  cancelled: '',
  unpack: 'It could not be unpacked.'
}

/** A copy of a record without one key. */
function without<T>(rec: Record<string, T>, key: string): Record<string, T> {
  const next = { ...rec }
  delete next[key]
  return next
}

function size(bytes: number): string {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`
}

const button =
  'rounded-md border border-[color:var(--p-divider)] bg-[var(--p-control)] px-3 py-1 text-[11.5px] font-semibold text-[var(--p-text)] transition hover:bg-[var(--p-hover)] disabled:opacity-50'
const primary =
  'rounded-md bg-[var(--p-accent)] px-3 py-1 text-[11.5px] font-semibold text-[var(--p-on-accent)] transition hover:brightness-110 disabled:opacity-50'

/** Click, then press the key or chord. A bare modifier (Right Alt, the default)
 *  is taken on its RELEASE, so that Ctrl+Shift+D is not captured as "Ctrl". */
function HotkeyField({ value, disabled }: { value: Hotkey; disabled: boolean }): JSX.Element {
  const [listening, setListening] = useState(false)
  useEffect(() => {
    if (!listening) return
    let bare: Hotkey | null = null
    const isModifier = (code: string): boolean => /^(Alt|Control|Shift|Meta)(Left|Right)$/.test(code)
    const down = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (e.repeat) return
      if (e.code === 'Escape') return setListening(false)
      const hk = parseHotkeyFromEvent(e)
      if (!hk) return
      if (isModifier(e.code)) bare = hk
      else {
        setDictationHotkey(hk)
        setListening(false)
      }
    }
    const up = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (bare && bare.code === e.code) {
        setDictationHotkey(bare)
        setListening(false)
      }
    }
    const stop = (): void => setListening(false)
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    window.addEventListener('blur', stop)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
      window.removeEventListener('blur', stop)
    }
  }, [listening])
  const isDefault = JSON.stringify(value) === JSON.stringify(DEFAULT_HOTKEY)
  return (
    <div className="flex items-center gap-2">
      {!isDefault && !listening && (
        <button className={button} disabled={disabled} onClick={() => setDictationHotkey(DEFAULT_HOTKEY)}>
          Reset
        </button>
      )}
      <button
        id="dictation-hotkey"
        data-hotkey-capture={listening ? 'on' : 'off'}
        disabled={disabled}
        onClick={() => setListening((v) => !v)}
        className={`min-w-[112px] rounded-md border px-3 py-1 text-center font-mono text-[11.5px] font-semibold transition disabled:opacity-50 ${
          listening
            ? 'border-[color:var(--p-accent-hi)] text-[var(--p-accent-hi)]'
            : 'border-[color:var(--p-divider)] bg-[var(--p-control)] text-[var(--p-text)] hover:bg-[var(--p-hover)]'
        }`}
      >
        {listening ? 'Press a key…' : formatHotkey(value)}
      </button>
    </div>
  )
}

/** The mic picker, and a meter behind a button: a dead or muted microphone is
 *  found here, in ten seconds, instead of after a lost dictation. */
function MicField({ value, disabled }: { value: string; disabled: boolean }): JSX.Element {
  const [mics, setMics] = useState<Array<{ id: string; label: string }>>([])
  const [testing, setTesting] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const bar = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    void listMics().then(setMics)
  }, [testing])
  useEffect(() => {
    if (!testing) return
    let cap: Capture | null = null
    let dead = false
    let shown = 0
    void startCapture({
      deviceId: value || undefined,
      onLevel: (l) => {
        shown = l > shown ? l : shown * 0.85 + l * 0.15
        if (bar.current) bar.current.style.transform = `scaleX(${Math.min(1, shown)})`
      }
    })
      .then((c) => {
        if (dead) c.stop()
        else cap = c
      })
      .catch((err) => {
        setProblem(err === 'denied' ? 'Microphone access was refused.' : 'No working microphone was found.')
        setTesting(false)
      })
    const timer = window.setTimeout(() => setTesting(false), 10000)
    return () => {
      dead = true
      clearTimeout(timer)
      cap?.stop()
    }
  }, [testing, value])
  return (
    <div className="flex items-center gap-2">
      {testing ? (
        <span
          data-mic-meter
          className="block h-1.5 w-24 overflow-hidden rounded-full bg-[var(--p-track)]"
          title="Speak: the bar should move"
        >
          <span
            ref={bar}
            className="block h-full w-full origin-left rounded-full bg-[var(--p-accent-hi)]"
            style={{ transform: 'scaleX(0)', transition: 'transform 80ms linear' }}
          />
        </span>
      ) : (
        problem && <span className="text-[11.5px] text-[var(--p-dim)]">{problem}</span>
      )}
      <button
        className={button}
        disabled={disabled}
        onClick={() => {
          setProblem(null)
          setTesting((v) => !v)
        }}
      >
        {testing ? 'Stop' : 'Test'}
      </button>
      <Select
        id="dictation-mic"
        value={mics.some((m) => m.id === value) ? value : ''}
        onChange={setDictationMic}
        options={[{ id: '', name: 'System default' }, ...mics.map((m) => ({ id: m.id, name: m.label }))]}
      />
    </div>
  )
}

/** "X Uninstall" (owner, 2026-09-19): it frees the disk, and says so by name.
 *  A BUTTON, the same one Download is: a first cut drew it as bare text to keep
 *  the destructive control quiet, and it read as a label rather than something
 *  to press (owner, the same evening). */
function Uninstall({ onClick, what }: { onClick: () => void; what: string }): JSX.Element {
  return (
    <button
      data-uninstall
      onClick={onClick}
      title={`Delete ${what} from this PC. Prism and Prism Terminal share it.`}
      className={`flex items-center gap-1.5 ${button}`}
    >
      <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
      Uninstall
    </button>
  )
}

/**
 * One downloadable thing: a model, or the GPU engine. The vendor's mark leads
 * the row (owner, 2026-09-19), then the FULL name ("Whisper Base", not "Base":
 * a bare size word says nothing to someone who has never met Whisper), its
 * size and what it is for. What is in use is marked on the row itself, by a
 * badge and a faint fill, so the list reads as a state and not as a menu.
 */
function ItemRow({
  entry,
  status,
  progress,
  failure,
  badge,
  recommended,
  warn,
  getLabel,
  getPrimary,
  onDownload,
  onCancel,
  installed
}: {
  entry: CatalogEntry
  status: ItemStatus | undefined
  progress: number | undefined
  failure: DownloadFailure | undefined
  /** "Active" on the model in use, "Enabled" on a GPU engine that is on. */
  badge: string | null
  recommended: boolean
  warn: string | null
  /** The button that fetches it: "Download", or "Enable" for the GPU engine. */
  getLabel: string
  getPrimary: boolean
  onDownload: () => void
  onCancel: () => void
  /** The controls once it is on disk. */
  installed: ReactNode
}): JSX.Element {
  const state = status?.state ?? 'absent'
  const received = progress ?? status?.received ?? 0
  const pct = Math.min(100, Math.round((received / entry.bytes) * 100))
  return (
    <div
      data-dictation-item={entry.id}
      data-state={state}
      data-active={badge ? '' : undefined}
      className={`flex items-center gap-3.5 border-b border-[color:var(--p-line)] px-3.5 py-3 last:border-b-0 ${
        // A WHISPER of a fill (owner, 2026-09-19: the hover grey was "too much",
        // it should sit "closer to the terminal's main bg"). 3.5% of the TEXT
        // colour over the ground, so it darkens a light theme and lightens a
        // dark one by the same small step, whatever the theme is. The badge
        // says which row is in use; this only lets the eye find it.
        badge ? 'bg-[color-mix(in_srgb,var(--p-text)_3.5%,transparent)]' : ''
      }`}
    >
      <VendorMark vendor={entry.kind === 'gpu-pack' ? 'nvidia' : 'openai'} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span data-item-name className="truncate text-[12.5px] font-semibold text-[var(--p-text)]">
            {entry.label}
          </span>
          <span className="shrink-0 font-mono text-[11px] text-[var(--p-dim)]">{size(entry.bytes)}</span>
          {recommended && (
            <span className="shrink-0 rounded-full border border-[color:var(--p-accent-hi)] px-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--p-accent-hi)]">
              Recommended
            </span>
          )}
          {badge && (
            <span
              data-item-badge
              className="shrink-0 rounded-full bg-[var(--p-accent)] px-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--p-on-accent)]"
            >
              {badge}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-[11.5px] text-[var(--p-dim)]">
          {failure && FAILURES[failure] ? FAILURES[failure] : (warn ?? entry.note)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {state === 'downloading' ? (
          <>
            <span className="block h-1.5 w-28 overflow-hidden rounded-full bg-[var(--p-track)]">
              <span className="block h-full origin-left rounded-full bg-[var(--p-accent-hi)]" style={{ width: `${pct}%` }} />
            </span>
            <span className="w-9 text-right font-mono text-[11px] text-[var(--p-dim)]">{pct}%</span>
            <button className={button} onClick={onCancel}>
              Cancel
            </button>
          </>
        ) : state === 'installed' ? (
          installed
        ) : (
          <button className={getPrimary ? primary : button} onClick={onDownload}>
            {failure && failure !== 'cancelled' ? 'Retry' : getLabel}
          </button>
        )}
      </div>
    </div>
  )
}

export function DictationSettings(): JSX.Element | null {
  const host = dictationHost()
  const enabled = useDictationEnabled()
  const mode = useDictationMode()
  const hotkey = useDictationHotkey()
  const mic = useDictationMic()
  const language = useDictationLanguage()
  const pauseMedia = useDictationPauseMedia()
  const sounds = useDictationSounds()
  const model = useDictationModel()

  const [status, setStatus] = useState<ItemStatus[]>([])
  const [info, setInfo] = useState<EngineInfo | null>(null)
  const [progress, setProgress] = useState<Record<string, number>>({})
  const [failures, setFailures] = useState<Record<string, DownloadFailure>>({})

  const api = host?.api
  const refresh = useCallback(() => {
    if (!api) return
    void api.dictationStatus().then(setStatus)
    void api.dictationInfo().then(setInfo)
  }, [api])
  useEffect(() => {
    if (!api) return
    refresh()
    return api.onDictationProgress((p) => setProgress((prev) => ({ ...prev, [p.id]: p.received })))
  }, [api, refresh])

  if (!host || !api) return null

  const stateOf = (id: string): ItemStatus | undefined => status.find((s) => s.id === id)
  const installed = (id: string): boolean => stateOf(id)?.state === 'installed'
  /** GPU acceleration is ON exactly when its engine is on disk. */
  const gpuOn = installed(GPU_ID)

  const download = (id: string): void => {
    setFailures((prev) => without(prev, id))
    setStatus((prev) => [...prev.filter((s) => s.id !== id), { id, state: 'downloading', received: 0 }])
    void api.dictationDownload(id).then((res) => {
      setProgress((prev) => without(prev, id))
      if (!res.ok) setFailures((prev) => ({ ...prev, [id]: res.reason }))
      // The first model anyone downloads is the one they meant to use.
      else if (catalogEntry(id)?.kind === 'model' && !installed(model)) setDictationModel(id)
      refresh()
    })
  }
  const remove = (id: string): void => {
    void api.dictationRemove(id).then(() => {
      if (id === model) setDictationModel('')
      refresh()
    })
  }

  const rec = recommendedModel(gpuOn)
  const noModel = !installed(model)
  const gpu = catalogEntry(GPU_ID)

  return (
    <div data-dictation-settings>
      <div className={ROWS}>
        <Pref
          id="dictation-enabled"
          label="Dictation"
          hint={
            enabled && noModel
              ? 'Needs a speech model before it can be used.'
              : 'Turns speech into text on this PC. Your voice is never sent anywhere.'
          }
        >
          <Switch on={enabled} onChange={setDictationEnabled} label="Dictation" />
        </Pref>
        <Pref
          id="dictation-mode"
          label="Trigger"
          off={!enabled}
          hint={
            mode === 'hold'
              ? 'Dictation runs while the key is held down.'
              : 'One press starts dictation and the next press stops it.'
          }
        >
          <Segmented
            value={mode}
            onChange={setDictationMode}
            options={[
              { id: 'hold', name: 'Hold' },
              { id: 'toggle', name: 'Toggle' }
            ]}
          />
        </Pref>
        <Pref
          id="dictation-hotkey"
          label="Key"
          off={!enabled}
          hint="The key that starts dictation. The text is pasted at the cursor and is not sent."
        >
          <HotkeyField value={hotkey} disabled={!enabled} />
        </Pref>
        <Pref id="dictation-mic" label="Microphone" off={!enabled} hint="The microphone used for dictation.">
          <MicField value={mic} disabled={!enabled} />
        </Pref>
        <Pref
          id="dictation-language"
          label="Language"
          off={!enabled}
          hint="The language dictation listens for."
        >
          <Select
            id="dictation-language"
            value={language}
            onChange={setDictationLanguage}
            options={LANGUAGES.map((l) => ({ id: l.code, name: l.name }))}
          />
        </Pref>
        <Pref
          id="dictation-pause-media"
          label="Pause media while dictating"
          off={!enabled}
          hint="Pauses playing audio and video while you dictate, then resumes them."
        >
          <Switch on={pauseMedia} onChange={setDictationPauseMedia} label="Pause media while dictating" disabled={!enabled} />
        </Pref>
        <Pref id="dictation-sounds" label="Sounds" off={!enabled} hint="Plays a short sound when the microphone opens and closes.">
          <Switch on={sounds} onChange={setDictationSounds} label="Sounds" disabled={!enabled} />
        </Pref>
      </div>

      <div data-pref="dictation-model" className="mt-7">
        <h3 className="text-[12.5px] font-semibold text-[var(--p-text)]">Models</h3>
        <p className="mt-0.5 text-[11.5px] text-[var(--p-dim)]">
          Larger models are more accurate and need a faster PC. A downloaded model is shared by both apps.
        </p>
        <div className="mt-3 overflow-hidden rounded-xl border border-[color:var(--p-divider)]">
          {visibleModels().map((m) => {
            const active = m.id === model && installed(m.id)
            return (
              <ItemRow
                key={m.id}
                entry={m}
                status={stateOf(m.id)}
                progress={progress[m.id]}
                failure={failures[m.id]}
                badge={active ? 'Active' : null}
                recommended={m.id === rec?.id}
                warn={m.needsGpu && !gpuOn ? 'Slow without GPU acceleration, taking seconds per sentence.' : null}
                getLabel="Download"
                // The same quiet button on every row (owner, 2026-09-19: "the
                // recommended shouldn't have a different download button"). The
                // badge is what recommends; a second signal on the button made
                // one row shout.
                getPrimary={false}
                onDownload={() => download(m.id)}
                onCancel={() => api.dictationCancel(m.id)}
                installed={
                  <>
                    {!active && (
                      <button className={primary} onClick={() => setDictationModel(m.id)}>
                        Use
                      </button>
                    )}
                    <Uninstall what={m.label} onClick={() => remove(m.id)} />
                  </>
                }
              />
            )
          })}
        </div>
      </div>

      {/* Offered only where it can work: the official GPU engine is NVIDIA's.
          Everyone else runs the bundled CPU engine, which needs no setup. */}
      {gpu && info?.nvidia && (
        <div data-pref="dictation-gpu" className="mt-7">
          <h3 className="text-[12.5px] font-semibold text-[var(--p-text)]">GPU acceleration</h3>
          <p className="mt-0.5 text-[11.5px] text-[var(--p-dim)]">
            {info.gpuFellBack
              ? 'The GPU engine could not start on this PC, so the CPU is used instead.'
              : 'An NVIDIA card was found. The GPU engine makes the large models answer in under a second.'}
          </p>
          <div className="mt-3 overflow-hidden rounded-xl border border-[color:var(--p-divider)]">
            {/* ENABLE and DISABLE, and nothing else (owner, 2026-09-19: "enable
                downloads it, disable uninstalls it"). One control with one
                meaning: the engine is either on this PC and in use, or it is
                neither. A separate on/off beside an Uninstall was built first
                and was two ideas where the owner wanted one. */}
            <ItemRow
              entry={gpu}
              status={stateOf(GPU_ID)}
              progress={progress[GPU_ID]}
              failure={failures[GPU_ID]}
              badge={gpuOn ? 'Enabled' : null}
              recommended={false}
              warn={null}
              getLabel="Enable"
              getPrimary
              onDownload={() => download(GPU_ID)}
              onCancel={() => api.dictationCancel(GPU_ID)}
              installed={
                <button
                  data-gpu-toggle
                  className={button}
                  title="Turns GPU acceleration off and frees 675 MB of disk space."
                  onClick={() => remove(GPU_ID)}
                >
                  Disable
                </button>
              }
            />
          </div>
        </div>
      )}
    </div>
  )
}
