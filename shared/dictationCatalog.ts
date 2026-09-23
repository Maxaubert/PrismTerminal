/**
 * Everything dictation downloads, and the one thing it bundles (#13). Pure
 * data plus lookups, shared by main (which verifies against it) and the
 * renderer (which draws the model manager from it).
 *
 * THE RULE THIS FILE EXISTS FOR: nothing is run or loaded unless its bytes
 * match a SHA-256 written down here. So every url below must name bytes that
 * CANNOT change under its checksum: a GitHub release asset by tag, and a
 * Hugging Face file by COMMIT, never `resolve/main`. A url that follows a
 * branch is a download that starts failing its checksum the day upstream
 * re-uploads, on every user's machine at once, with nothing we can ship fast
 * enough to help.
 *
 * Sizes and checksums were read from the upstream APIs on 2026-09-19 (the
 * GitHub release API's `size` and `digest`; Hugging Face's `lfs.size` and
 * `lfs.oid`), and two of them were CROSS-CHECKED against files already on the
 * owner's disk with sha256sum: ggml-base.bin and ggml-large-v3.bin both matched
 * byte for byte. The commit-pinned urls were each asked for with a HEAD request
 * and answered 200 with the same size and the same hash in `X-Linked-ETag`.
 */
import type { CatalogEntry } from './dictationTypes'

/** The whisper.cpp release both the bundled CPU engine and the GPU pack come from. */
const TAG = 'b5130'
const RELEASE = `https://github.com/ggml-org/whisper.cpp/releases/download/${TAG}`

/**
 * The newest commit of huggingface.co/ggerganov/whisper.cpp on 2026-09-19
 * (the repo has not moved since 2024-10-29). Every model url is resolved
 * against it, so a later re-upload to `main` changes nothing here.
 */
const MODELS_COMMIT = '5359861c739e955e79d9a303bcbc70fb988958b1'
const model = (file: string): string =>
  `https://huggingface.co/ggerganov/whisper.cpp/resolve/${MODELS_COMMIT}/${file}`

/**
 * The CPU engine each app BUNDLES, fetched at build time by
 * `core/tools/fetch-whisper.mjs`. That script runs before anything is compiled,
 * so it cannot import this file and carries its own copy of the pin; the
 * catalog test reads the script as text and fails if the two ever disagree.
 *
 * `files` is the MINIMAL set whisper-server.exe needs, MEASURED rather than
 * guessed: those thirteen were copied alone into an empty folder and the server
 * started, loaded Base and transcribed a clip (answering on its port 190 ms
 * after spawn). They are the zip's `Release/` folder minus 27 files of other
 * programs (the CLI, the benchmarks, the tests, Parakeet, llama.dll, SDL2):
 * 10.8 MB kept of 21.8 MB.
 *
 * ALL NINE `ggml-cpu-*.dll` STAY, and that is not caution. ggml picks its CPU
 * backend at run time by what the processor supports (this machine loaded
 * `ggml-cpu-cascadelake.dll`; an older one falls to haswell, sandybridge, sse42
 * or plain x64), so which one is "needed" is a fact about the USER's PC, not
 * about ours. Dropping the ones this machine did not load would ship an engine
 * that works here and nowhere else.
 *
 * The names are FLATTENED (what the engine folder holds), not where the zip
 * kept them. The official zip carries NO licence file, so none is listed.
 */
export const ENGINE = {
  tag: TAG,
  asset: 'whisper-bin-x64.zip',
  url: `${RELEASE}/whisper-bin-x64.zip`,
  bytes: 8573270,
  sha256: 'f9ec6c52a2e949b62ab51fa21d0d497958f9e41c3010c157c4e42932d5316f3c',
  files: [
    'whisper-server.exe',
    'whisper.dll',
    'ggml.dll',
    'ggml-base.dll',
    'ggml-cpu-alderlake.dll',
    'ggml-cpu-cannonlake.dll',
    'ggml-cpu-cascadelake.dll',
    'ggml-cpu-haswell.dll',
    'ggml-cpu-icelake.dll',
    'ggml-cpu-sandybridge.dll',
    'ggml-cpu-skylakex.dll',
    'ggml-cpu-sse42.dll',
    'ggml-cpu-x64.dll'
  ]
} as const satisfies {
  tag: string
  asset: string
  url: string
  bytes: number
  sha256: string
  files: readonly string[]
}

/**
 * Multilingual models only (owner decision: auto-detect is the default, so an
 * English-only variant would be a model that silently ignores the language
 * picker). In the order the model manager shows them, smallest first, with
 * the e2e's model and the GPU pack after the ones a user picks from.
 *
 * The notes say who a model is FOR and leave "Recommended" and "needs the GPU
 * pack" to the badges the manager draws from `recommended` and `needsGpu`: a
 * note repeating a badge is the same thing said twice on one row.
 */
export const CATALOG: readonly CatalogEntry[] = [
  {
    id: 'base',
    label: 'Whisper Base',
    note: 'Fast live text on any PC.',
    url: model('ggml-base.bin'),
    bytes: 147951465,
    sha256: '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe',
    kind: 'model',
    // MEASURED: about 0.9 s a pass on a CPU whatever the clip's length, which
    // is what lets the pill's text refresh once a second with no GPU at all.
    recommended: 'cpu'
  },
  {
    id: 'small',
    label: 'Whisper Small',
    note: 'More accurate without a GPU, and about three times slower than Base.',
    url: model('ggml-small.bin'),
    bytes: 487601967,
    sha256: '1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b',
    kind: 'model'
  },
  {
    id: 'large-v3-turbo',
    label: 'Whisper Large v3 Turbo',
    note: 'Close to Large v3 at about half the download.',
    url: model('ggml-large-v3-turbo.bin'),
    bytes: 1624555275,
    sha256: '1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69',
    kind: 'model',
    needsGpu: true,
    recommended: 'gpu'
  },
  {
    id: 'large-v3',
    label: 'Whisper Large v3',
    note: 'The most accurate.',
    url: model('ggml-large-v3.bin'),
    bytes: 3095033483,
    sha256: '64d182b440b98d5203c4f9bd541544d84c605196c4f7b845dfa11fb23594d1e2',
    kind: 'model',
    // MEASURED: 20 s for an 11 s clip on a fast CPU, 0.36 to 0.50 s through
    // the GPU pack. Listed without the pack, but never usable without it.
    needsGpu: true
  },
  {
    id: 'tiny',
    label: 'Whisper Tiny',
    note: 'For the automated tests, small enough to fetch once and run anywhere.',
    url: model('ggml-tiny.bin'),
    bytes: 77691713,
    sha256: 'be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21',
    kind: 'model',
    e2eOnly: true
  },
  {
    id: 'gpu-pack',
    label: 'NVIDIA GPU acceleration',
    note: 'The official CUDA 12.4 build, which runs the large models in under a second.',
    // ONE pack for every NVIDIA card (measured: it runs on an RTX 5090, a card
    // newer than CUDA 12.4, after a one-time 9.1 s kernel compile), which is
    // why the 273 MB CUDA 11.8 pack of the same release is not catalogued.
    url: `${RELEASE}/whisper-cublas-12.4.0-bin-x64.zip`,
    bytes: 674539285,
    sha256: 'af520ddd034d985b55dfeea3e465ed93653ba2aee1a55e865033edc548c272a7',
    kind: 'gpu-pack'
  }
]

/** The entry of that exact id (ids are lowercase), or undefined. */
export function catalogEntry(id: string): CatalogEntry | undefined {
  return CATALOG.find((e) => e.id === id)
}

/** What the model manager lists: models a user picks from, in catalog order. */
export function visibleModels(): CatalogEntry[] {
  return CATALOG.filter((e) => e.kind === 'model' && !e.e2eOnly)
}

/**
 * The model to offer when dictation is switched on with none downloaded, and
 * the one wearing the Recommended badge. `hasGpuPack` means the pack is
 * INSTALLED, not merely that an NVIDIA card is present: until it is, the GPU
 * pick would be a 1.5 GB download that then transcribes at CPU speed.
 */
export function recommendedModel(hasGpuPack: boolean): CatalogEntry {
  const want = hasGpuPack ? 'gpu' : 'cpu'
  // The test holds the catalog to exactly one of each, so the fallback is for
  // the type checker and for a catalog edited wrongly, never for a user.
  return visibleModels().find((e) => e.recommended === want) ?? visibleModels()[0]
}

/**
 * The language picker. 'auto' is Whisper's own detection and the default; the
 * rest are ISO 639-1 codes exactly as whisper.cpp's `-l` takes them (so
 * Norwegian is `no`, Hebrew is `he`, Indonesian is `id`). Whisper knows 99
 * languages; this is the short list of the ones it does WELL, the Nordic ones
 * first after English because that is where both apps' first users are, then
 * alphabetical. A language missing here still works through Auto-detect.
 */
export const LANGUAGES: readonly { code: string; name: string }[] = [
  { code: 'auto', name: 'Auto-detect' },
  { code: 'en', name: 'English' },
  { code: 'no', name: 'Norwegian' },
  { code: 'sv', name: 'Swedish' },
  { code: 'da', name: 'Danish' },
  { code: 'fi', name: 'Finnish' },
  { code: 'ar', name: 'Arabic' },
  { code: 'zh', name: 'Chinese' },
  { code: 'cs', name: 'Czech' },
  { code: 'nl', name: 'Dutch' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'el', name: 'Greek' },
  { code: 'he', name: 'Hebrew' },
  { code: 'hi', name: 'Hindi' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'id', name: 'Indonesian' },
  { code: 'it', name: 'Italian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'pl', name: 'Polish' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ro', name: 'Romanian' },
  { code: 'ru', name: 'Russian' },
  { code: 'es', name: 'Spanish' },
  { code: 'tr', name: 'Turkish' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'vi', name: 'Vietnamese' }
]
