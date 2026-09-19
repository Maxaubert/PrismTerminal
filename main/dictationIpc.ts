import { DCH } from '../shared/channels'
import { CATALOG, catalogEntry } from '../shared/dictationCatalog'
import type {
  DictationEngine,
  DictationStore,
  EngineInfo,
  MediaPause,
  TranscribeRequest,
  TranscribeResult
} from '../shared/dictationTypes'
import { createDictationEngine } from './dictationEngine'
import { createDictationStore } from './dictationStore'
import { createMediaPause } from './mediaPause'
import type { IpcMainLike } from './ipc'

/**
 * The main half of DICTATION's bridge (#13), for both hosts.
 *
 * Nothing here starts until it is asked to: registering costs a few closures.
 * The server process exists only between the first transcribe and the idle
 * stand-down (or `stop`), the media helper only after the first pause, and a
 * download only after a click. "Off means off" is kept by the renderer never
 * calling, and by `stop` when the switch goes off.
 *
 * The host hands in what only it knows: where ITS installer put the CPU
 * engine, the folder both apps share, and whether there is an NVIDIA adapter
 * (Electron's own GPU info: no process spawned to find out).
 */
export interface DictationIpcDeps {
  ipcMain: IpcMainLike
  /** Send to the window, if there is one. */
  send(channel: string, ...args: unknown[]): void
  /** The folder holding the bundled whisper-server.exe, or null if it is missing. */
  cpuEngineDir(): string | null
  /** `%LOCALAPPDATA%\PrismDictation`: models and the GPU pack, shared by both apps. */
  sharedRoot: string
  hasNvidia(): Promise<boolean>
  /** Test seams. */
  store?: DictationStore
  engine?: DictationEngine
  media?: MediaPause
}

/** The largest WAV worth accepting: 5 minutes of 16 kHz PCM16 mono, and a margin. */
const MAX_WAV_BYTES = 5 * 60 * 16000 * 2 + 1024 * 1024

export function registerDictationIpc(deps: DictationIpcDeps): () => void {
  const { ipcMain } = deps
  const store = deps.store ?? createDictationStore({ root: deps.sharedRoot, catalog: CATALOG })
  const engine =
    deps.engine ??
    createDictationEngine({ cpuDir: deps.cpuEngineDir, store, hasNvidia: deps.hasNvidia })
  const media = deps.media ?? createMediaPause()

  ipcMain.handle(DCH.info, async (): Promise<EngineInfo> => {
    const [nvidia, status] = await Promise.all([deps.hasNvidia().catch(() => false), store.status()])
    return {
      nvidia,
      gpuPack: status.find((s) => catalogEntry(s.id)?.kind === 'gpu-pack')?.state ?? 'absent',
      gpuFellBack: engine.info().gpuFellBack
    }
  })

  ipcMain.handle(DCH.status, () => store.status())

  ipcMain.handle(DCH.download, async (_e: unknown, id: unknown) => {
    // Only what the catalog names, by id: the renderer never supplies a URL.
    if (typeof id !== 'string' || !catalogEntry(id)) return { ok: false, reason: 'network', detail: 'unknown item' }
    const result = await store.download(id, (p) => deps.send(DCH.progress, p))
    // A new GPU pack or model is a different server: the next pass starts it.
    if (result.ok) engine.stop()
    return result
  })

  ipcMain.on(DCH.cancel, (_e: unknown, id: unknown) => {
    if (typeof id === 'string') store.cancel(id)
  })

  ipcMain.handle(DCH.remove, async (_e: unknown, id: unknown) => {
    if (typeof id !== 'string' || !catalogEntry(id)) return
    // The running server may hold the file open (and IS the pack being removed).
    engine.stop()
    await store.remove(id)
  })

  ipcMain.handle(DCH.transcribe, async (_e: unknown, req: unknown): Promise<TranscribeResult> => {
    const r = req as Partial<TranscribeRequest> | null
    if (
      !r ||
      !(r.wav instanceof Uint8Array) ||
      r.wav.byteLength < 44 ||
      r.wav.byteLength > MAX_WAV_BYTES ||
      typeof r.modelId !== 'string' ||
      typeof r.language !== 'string' ||
      !/^[a-z]{2,4}$/.test(r.language)
    )
      return { ok: false, reason: 'engine-failed', detail: 'bad request' }
    return engine.transcribe({ wav: r.wav, modelId: r.modelId, language: r.language, final: r.final === true })
  })

  ipcMain.on(DCH.stop, () => engine.stop())

  ipcMain.handle(DCH.mediaPause, () => media.pausePlaying())
  ipcMain.on(DCH.mediaResume, (_e: unknown, token: unknown) => {
    if (typeof token === 'string') void media.resume(token)
  })

  /** For the host's quit path: no child may outlive the app. */
  return () => {
    engine.stop()
    media.dispose()
  }
}
