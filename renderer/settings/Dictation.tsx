import type { JSX, ReactNode } from 'react'
import ModelDownloadAsk from '../components/ModelDownloadAsk'
import { LANGUAGES, LIMITED_LANGUAGES_TEXT, visibleModels } from '../../shared/dictationCatalog'
import type { CatalogEntry, DownloadFailure, ItemStatus } from '../../shared/dictationTypes'
import {
  setDictationEnabled,
  setDictationLanguage,
  setDictationMode,
  setDictationModel,
  setDictationPauseMedia,
  setDictationSounds
} from '../lib/dictationPrefs'
import { Pref, ROWS, Segmented, Select, Switch } from './fields'
import { VendorMark } from './VendorMark'
import { button, HotkeyField, LimitedMark, MicField, primary, Uninstall } from './dictation/parts'
import { FAILURES, GPU_ID, size } from './dictation/items'
import { useDictationState } from './dictation/useDictationState'

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
 *
 * LEGACY (2026-10-05): the grouped cards redesign draws this page from
 * `sections/DictationPage.tsx`. This layout stays, unchanged, until Prism has
 * moved off it; the state and the controls are the shared `dictation/` pieces.
 */

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
      <VendorMark vendor={entry.kind === 'gpu-pack' || entry.engine === 'parakeet' ? 'nvidia' : 'openai'} />
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
  const {
    host,
    api,
    enabled,
    mode,
    hotkey,
    mic,
    language,
    pauseMedia,
    sounds,
    model,
    info,
    progress,
    failures,
    asking,
    setAsking,
    stateOf,
    installed,
    gpuOn,
    download,
    remove,
    fetchModel,
    ownLanguage,
    recommended: rec,
    noModel,
    gpu
  } = useDictationState()

  if (!host || !api) return null

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
          <div className="flex items-center gap-2">
            {ownLanguage && <LimitedMark />}
            <Select
              id="dictation-language"
              value={ownLanguage ? 'auto' : language}
              onChange={setDictationLanguage}
              options={LANGUAGES.map((l) => ({ id: l.code, name: l.name }))}
              disabled={ownLanguage}
            />
          </div>
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
                onDownload={() => fetchModel(m.id)}
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
      {asking && (
        <ModelDownloadAsk
          text={LIMITED_LANGUAGES_TEXT}
          onCancel={() => setAsking(null)}
          onDownload={() => {
            const id = asking
            setAsking(null)
            download(id)
          }}
        />
      )}
    </div>
  )
}
