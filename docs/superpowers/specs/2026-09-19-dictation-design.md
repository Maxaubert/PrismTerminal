# Dictation: design

Issue #13. Owner decisions are in that issue (four rounds, 2026-09-19); this spec is what they add up
to. Built ONCE, in `core/`, so it lands in Prism Terminal and in Prism.

## What it is

Hold Right Alt, speak, let go: the words appear at the cursor of the shell in front, as if pasted.
Nothing is sent. It runs entirely on the user's machine, in any tab and any shell, and it is off until
the user turns it on.

It is a product feature for strangers' PCs, not for the owner's: everything it needs is bundled with
the installer or fetched by the app itself, and it works on a fresh Windows install with no GPU.

## Decided (owner)

| | |
|---|---|
| Engine | Local whisper.cpp. Official pinned binaries only; nothing we compile. |
| GPU | CPU engine bundled. An "Enable GPU" button downloads the official NVIDIA pack. AMD/Intel stay on CPU in v1. |
| Models | A short list in a model manager, one marked Recommended, one Active. The app downloads them. |
| Model files | One folder shared by both apps: `%LOCALAPPDATA%\PrismDictation`. Setting VALUES stay per app. |
| Language | Auto-detect by default, with a picker to pin one. Multilingual models only. |
| Trigger | Right Alt. Hold-to-talk by default; press-to-start / press-to-stop as the other mode. Rebindable. |
| Output | Bracketed paste into the shell in front. NEVER presses Enter. |
| Scope | Any tab, any shell. |
| Feedback | A pill over the terminal ("Listening..." with a live level meter and the live text, then "Transcribing..."), a mic mark on the tab, a sound on start and stop. |
| Cleanup | Deterministic only. No second model. |
| Media | Sub-option: pause what is playing while dictating, and resume exactly that. |
| Default | Off. Nothing listens, nothing downloads, no server runs until it is switched on. |
| Settings | Prism Terminal: its own Dictation tab. Prism: its own Dictation page under Behaviour. Same shared page. |

## Measured (2026-09-19, owner's PC)

- CPU engine zip `whisper-bin-x64.zip` of release `b5130`: 8 MB. Contains `whisper-server.exe`.
- CPU, resident server, Base model, a GROWING clip re-sent: about 0.9 s per pass whatever the length
  (2 s to 11 s). So live text can refresh about once a second with no GPU. Large on CPU: 20 s. CPU
  means Base or Small.
- NVIDIA pack `whisper-cublas-12.4.0-bin-x64.zip`: 643 MB, sha256 `af520ddd...c272a7`. It RUNS ON AN
  RTX 5090 (a card newer than CUDA 12.4): first run 9.1 s (one-time kernel compile), then Large-v3
  through a resident server is 0.36 to 0.50 s per pass on an 11 s clip. So one pack covers old and
  new NVIDIA cards, and the 260 MB CUDA 11.8 pack is not needed.
- Partials are provisional (a phrase heard wrong at 6 s was corrected by 8 s). So live text is shown
  in the pill and only the FINAL text is pasted: text typed into a prompt cannot be taken back.

## Architecture

```
renderer (core)                         main (core, host injects electron bits)
  useDictation  ── hotkey, state ─┐       dictationEngine  spawn/stop whisper-server, idle stand-down
  micCapture    ── 16 kHz PCM ────┼─IPC─▶ dictationIpc     transcribe(wav) -> text
  DictationPill ── level, text    │       dictationStore   models + GPU pack: list, download, verify, delete
  dictationSounds                 │       mediaPause       ask Windows what is playing; pause; resume those
  dictationClean (pure)           │
  settings/Dictation.tsx ─────────┘
```

- **Audio never leaves the machine and is never written to disk.** The renderer captures the mic
  (`getUserMedia`), downsamples to 16 kHz mono in an AudioWorklet, and hands main a WAV buffer over
  IPC. Main posts it to `whisper-server` on `127.0.0.1` at a random free port and returns the text.
- **Live text:** while recording, whenever no pass is in flight, the clip so far (its last 28 s,
  Whisper's window) is sent; the answer goes to the pill. On stop, one final pass over the whole clip;
  that text is cleaned and pasted.
- **The server is resident only while dictation is ON**, started on the first press, and stands down
  after 5 minutes idle (the model reloads in about a second on the next press). It is killed with the
  app. Off means no process at all.
- **The engine** is bundled per app in `resources/bin/whisper` by a fetch script that lives in the
  core (`core/tools/fetch-whisper.mjs`: pinned tag, pinned SHA-256, like Prism's ffmpeg), so both
  apps fetch the same bytes. The NVIDIA pack and the models are downloaded at RUNTIME into the shared
  folder, each against a SHA-256 pinned in `core/shared/dictationCatalog.ts`. A download that does not
  match is deleted and reported; nothing unverified is ever run or loaded.
- **Engine choice** is automatic: the GPU pack when it is installed and an NVIDIA adapter is present,
  else the bundled CPU engine. If the GPU engine fails to start, it falls back to CPU for the session
  and says so once in Settings. There is no "use GPU" switch to get wrong.
- **Host seam** (new declared fields, `TermHostConfig.dictation`): `engineDir()` (where the bundled
  CPU engine is), `gpuVendors()` (from Electron's `app.getGPUInfo`, no process spawned), and whether
  the terminal is in front (`canDictate()`: always true in Prism Terminal with a tab open; in Prism
  only while the terminal panel is showing). Main side: `registerDictationIpc({ ipcMain, send, ... })`
  beside `registerTermIpc`. The host grants the `media` permission to its own window only.

## The hotkey

Right Alt is AltGr on Norwegian and most European layouts, where it types `@ { } [ ] \ | ~`; Windows
reports it as LeftCtrl+RightAlt. So the key is read as a SOLO HOLD:

- Hold mode: recording starts once Right Alt has been down 200 ms with no other key. Any other key
  during the hold cancels silently (that was AltGr typing). Release stops and transcribes.
- Toggle mode: a solo TAP (down and up with no other key) starts; the next solo tap stops.
- Its keyup is swallowed so Alt does not open the window's system menu. xterm never sees the chord.
- Escape while listening cancels: nothing is pasted.
- Rebindable to any single key or chord in Settings; the solo-hold rule applies to bare modifiers.
- Window-level only, never a global hotkey: the text goes into this window's shell, so it listens
  only while this window has the focus. A recording is capped at 5 minutes.

## Models (v1 list)

| Model | Download | For |
|---|---|---|
| Base | 142 MB | Recommended on CPU. Fast live text on any PC. |
| Small | 466 MB | CPU, more accurate, slower (a pass is about 3x Base). |
| Large v3 Turbo | 1.5 GB | Recommended once the GPU pack is installed. |
| Large v3 | 2.9 GB | GPU. The most accurate. |

Turbo and Large are listed without the GPU pack but marked "needs the GPU pack", not hidden. The
"Enable GPU" row appears only when an NVIDIA adapter is found. Turning dictation on with no model
downloaded offers the Recommended one; nothing downloads without a click. NVIDIA Parakeet is OUT of
v1: the owner has had trouble with it and it has not been measured here.

## Cleanup (`dictationClean`, pure, tested)

Whisper's own punctuation and capitalisation are kept. Removed: engine artifacts (`[BLANK_AUDIO]`,
`(music)`, `[ Silence ]` and kin), immediately doubled words, the fillers "um", "uh", "erm" as whole
words, leading and trailing whitespace, runs of spaces; newlines between segments become single
spaces. A final text that is empty after cleaning pastes nothing and the pill says "Heard nothing".

## Pause media

Not the play/pause media key: it toggles, so it would START music that was not playing. A small
resident Windows PowerShell helper (the `dwmHelper` pattern) asks
`GlobalSystemMediaTransportControlsSessionManager` which sessions are Playing, pauses those, and
resumes exactly those when dictation ends. If the helper cannot start, dictation works and the
option does nothing.

## Settings (`core/renderer/settings/Dictation.tsx`, ids in `options.ts` under page `dictation`)

`dictation-enabled` (switch, off), `dictation-mode` (Hold / Toggle), `dictation-hotkey` (rebind),
`dictation-mic` (input device, default "System default", with a live level meter so a dead mic is
visible BEFORE recording), `dictation-language` (Auto + list), `dictation-pause-media` (switch, off),
`dictation-sounds` (switch, on), `dictation-model` (the model manager: size, Download with progress,
Delete, Recommended badge, Active marker), `dictation-gpu` (Enable GPU: size, progress, Remove).
Each app's parity e2e covers the page as it does the terminal's.

## The written exception

CLAUDE.md's rule is that the app never types into the user's shell. Dictation is the fourth written
exception, with the agent resume, Prism's `Set-Location`, and drop-to-type-path: the user spoke the
text on purpose, it arrives as a bracketed paste, and it never carries a newline or an Enter.

## Errors the user can meet, and what they see

No microphone / permission refused: the pill says so, nothing records. Model missing or deleted:
the pill says "Choose a model in Settings". Engine will not start: CPU fallback, then a plain message.
Download fails or fails its checksum: the row says so and offers Retry; the partial file is removed.
Disk full: same row. The shared folder is created on first use and is never removed by an uninstall.

## Testing

- Unit (core): the hotkey state machine (AltGr cancels, tap vs hold, Escape), `dictationClean`, WAV
  encoding and the 28 s window, the catalog (every entry has a size and a 64-hex SHA), the store
  (verify, reject, delete, progress) against a local HTTP fixture, engine choice and fallback, the
  server lifecycle with a fake binary, options parity.
- E2E (both apps), REAL end to end: under `--e2e` Chromium is given a fake microphone fed from a WAV
  (`--use-fake-device-for-media-stream`, `--use-file-for-fake-audio-capture`), the real bundled
  `whisper-server` runs the Tiny model (75 MB, fetched once into the e2e cache against a pinned SHA),
  and the scenario asserts that "ask not what your country can do for you" arrives on the prompt line,
  that no Enter was sent (the line is still being edited), that the pill showed Listening then
  Transcribing, that the tab wore the mic mark, that Escape pastes nothing, and that with dictation
  OFF the key does nothing and no server process exists. Layout of the Dictation page is measured and
  screenshotted, as #20 taught.
- Not testable by machine: how it sounds, and AltGr on a physical Norwegian keyboard. Both go on the
  owner's hands-on list.

## Out of v1

AMD/Intel GPU acceleration (needs a Vulkan engine we would have to build), Parakeet, voice commands
("new line", "send"), a global hotkey, custom vocabulary, English-only model variants, auto-stop on
silence.

## Delivery

1. Prism Terminal PR (this repo): the core feature, this app's wiring, docs, version 0.2.0. Installed
   locally for hands-on testing before "merge?".
2. Tag `core-v0.2.0`. ASK the owner before pulling it into Prism (standing rule).
3. Prism PR: pin bump, host wiring, the Dictation page, `npm run e2e:terminal` plus the dictation
   scenario, full e2e, install.
