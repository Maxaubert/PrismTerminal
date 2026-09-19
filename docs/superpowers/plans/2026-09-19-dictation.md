# Dictation Implementation Plan

**Goal:** Hold Right Alt, speak, release: the words are pasted at the cursor of the shell in front,
transcribed locally by a bundled whisper.cpp, in both Prism Terminal and Prism.

**Architecture:** Everything lives in `core/`. The renderer captures the mic and owns the hotkey,
the pill and the settings page; main owns the `whisper-server` process, the model/GPU-pack store and
the media pause helper. Hosts inject Electron (`ipcMain`, paths, GPU info, the media permission).

**Tech stack:** whisper.cpp official Windows binaries (release `b5130`), Web Audio (AudioWorklet),
Node `http` + `child_process`, Windows PowerShell 5.1 for the media helper. NO new npm dependency.

**Spec:** `docs/superpowers/specs/2026-09-19-dictation-design.md`

## Global constraints

- Core lint wall: relative imports only, no `electron`, no `window.prism`, no host `src/`.
- Official binaries only, every download pinned by SHA-256; an unverified file is never run or loaded.
- Off by default: with dictation off there is no listener armed, no process, no download.
- The app NEVER sends Enter or a newline. Text arrives as one bracketed paste.
- Audio is never written to disk and never leaves `127.0.0.1`.
- Shared folder `%LOCALAPPDATA%\PrismDictation\{models,engines}`; setting values stay per app.
- No em-dashes. Every new `[data-pref]` row is in `options.ts` and covered by both apps' parity e2e.
- UI is looked at (screenshots) and measured, not only asserted to exist (#20).
- Branch `feat/13-dictation`, one PR, version 0.2.0. Never merge without the owner's word.

## File map

Core, new:
- `core/shared/dictationCatalog.ts`: engine + model + GPU pack entries: id, label, url, bytes, sha256, needsGpu.
- `core/shared/dictationTypes.ts`: `DictationState`, `ModelStatus`, `DownloadProgress`, IPC payloads.
- `core/shared/channels.ts`: add the `dictation:*` channels.
- `core/tools/fetch-whisper.mjs`: build-time fetch of the CPU engine into a given out dir.
- `core/main/dictationStore.ts`: list / download / verify / delete for models and the GPU pack.
- `core/main/dictationEngine.ts`: choose engine, spawn `whisper-server`, health, idle stand-down, fallback.
- `core/main/mediaPause.ts`: the PowerShell helper: `pausePlaying(): Promise<token>`, `resume(token)`.
- `core/main/dictationIpc.ts`: `registerDictationIpc(deps)`.
- `core/preload/api.ts`: extend `createTermApi` with the dictation calls.
- `core/renderer/lib/dictationKey.ts`: the pure hotkey state machine.
- `core/renderer/lib/dictationClean.ts`: pure cleanup.
- `core/renderer/lib/wav.ts`: PCM16 WAV encode, tail window.
- `core/renderer/lib/micCapture.ts` + `micWorklet.js`: 16 kHz mono capture with a level callback.
- `core/renderer/lib/dictationSounds.ts`: two synthesized cues (Web Audio, no asset files).
- `core/renderer/lib/dictationPrefs.ts`: the per-app stores (the `termLook` store shape).
- `core/renderer/lib/useDictation.ts`: the orchestrating hook.
- `core/renderer/components/DictationPill.tsx`
- `core/renderer/settings/Dictation.tsx`: `DictationSettings`.
- Tests beside each pure/main file.

Core, changed: `host.ts` (the `dictation` seam), `settings/options.ts` (+ `page` field), `package.json`
(exports `./tools/*`, files `tools`), `README.md`.

Prism Terminal: `package.json` (`fetch:bin`, run before build/package/e2e), `electron-builder.yml`
(`extraResources: vendor/whisper -> bin/whisper`), `.gitignore` (`vendor/`), `src/main/index.ts`
(register IPC, media permission for own window, e2e fake-mic switches), `src/renderer/src/termHost.ts`,
`App.tsx` (mount hook + pill), `TabStrip.tsx` (mic mark), `Settings.tsx` (Dictation tab), `index.css`
(pill keyframes if any), `tools/e2e/run.mjs` (`dictation` scenario, options parity for the page),
`CLAUDE.md`, `README.md`.

## Tasks

### Task 0: two spikes that can change the design (throwaway, scratchpad)
- [ ] Fake mic: launch the built app with `--use-fake-device-for-media-stream
      --use-file-for-fake-audio-capture=jfk.wav`, call `getUserMedia`, confirm non-silent samples arrive.
      If it does not work in Electron, the e2e injects PCM through a test-only seam in `micCapture` instead.
- [ ] Media helper: in Windows PowerShell 5.1, load `GlobalSystemMediaTransportControlsSessionManager`,
      list sessions with playback status, pause and resume one. If WinRT cannot be reached, the option
      ships as "not available on this PC" and the spec is corrected.
- [ ] Record both results in issue #13.

### Task 1: catalog, types, channels
- [ ] Test first: every catalog entry has https url, bytes > 0, 64-hex sha256; ids unique; exactly one
      CPU-recommended and one GPU-recommended model; GPU models flagged `needsGpu`.
- [ ] Fill SHA-256 and sizes from the sources themselves (GitHub asset digests; Hugging Face LFS
      pointers for `ggerganov/whisper.cpp` `ggml-{tiny,base,small,large-v3-turbo,large-v3}.bin`), and
      re-verify each by downloading once. Tiny is catalogued as `e2eOnly`.
- [ ] Commit.

### Task 2: build-time engine fetch
- [ ] `core/tools/fetch-whisper.mjs <outDir>`: pinned tag + SHA, stamp file so a second run is a no-op,
      extracts only `whisper-server.exe` and the DLLs it loads, plus the licence. Monthly-tag lesson
      from Prism's ffmpeg does not apply (whisper.cpp keeps its build tags) but the 404 message still
      says how to re-pin.
- [ ] Prism Terminal: `fetch:bin` script, wired before `build`-dependent scripts; `extraResources`;
      `.gitignore`. CI: confirm `ci.yml` does not need the binary (typecheck, lint, unit only).
- [ ] Verify: packaged app contains `resources/bin/whisper/whisper-server.exe`. Commit.

### Task 3: the store (main)
Interface: `createDictationStore({ root, fetchImpl })` -> `{ status(): Promise<ModelStatus[]>,
download(id, onProgress): Promise<Result>, cancel(id), remove(id), gpuPack: { status, download, remove } }`.
- [ ] Tests first against a local HTTP fixture: progress events, resume not attempted (restart), SHA
      mismatch deletes the file and returns `checksum`, cancel leaves nothing, disk error surfaces,
      `status` reflects files on disk, a `.part` file is never reported as installed.
- [ ] Implement with streams; the GPU pack unzips into `engines/cuda-<tag>` via PowerShell
      `Expand-Archive` (no new dependency), verified BEFORE unzip. Commit.

### Task 4: the engine (main)
Interface: `createDictationEngine({ cpuDir, store, gpuVendors, spawnImpl })` -> `{ transcribe(wav:
Buffer, opts: { model, language }): Promise<string>, stop(), state() }`.
- [ ] Tests first with a fake server binary (a node script): picks GPU only when pack installed AND an
      NVIDIA vendor id is present; falls back to CPU when the GPU server exits at start, once per
      session; restarts when the model or language changes; serialises passes (latest partial wins, a
      final is never dropped); stands down after the idle window; `stop()` kills the child.
- [ ] Implement: free port, `--host 127.0.0.1`, readiness poll, multipart POST to `/inference`,
      `response_format=json`. Commit.

### Task 5: media pause (main), per the spike
- [ ] `pausePlaying()` returns a token naming the sessions it paused; `resume(token)` plays only
      those. Helper failure resolves to a no-op token. Unit test the protocol with a fake helper.

### Task 6: IPC + preload + host seam
- [ ] `registerDictationIpc({ ipcMain, send, cpuEngineDir, gpuVendors, sharedRoot })`; channels for
      status, download/cancel/remove, progress events, transcribe(partial|final), mediaPause/resume, stop.
- [ ] `TermApi` grows the matching calls; `TermHostConfig.dictation = { canDictate(): boolean }`.
- [ ] `host.test.ts` models both hosts. Commit.

### Task 7: pure renderer logic
- [ ] `dictationKey.ts`: reducer over `{type:'down'|'up'|'blur'|'tick', code, ctrl, alt, ...}` ->
      `idle | arming | listening | stopping`, emitting `start | stop | cancel`. Tests: AltGr+2 on a
      Norwegian layout (ControlLeft then AltRight then Digit2) never starts; 200 ms solo hold starts;
      release stops; toggle tap/tap; Escape cancels; blur cancels; a rebound chord (Ctrl+Shift+D) works.
- [ ] `dictationClean.ts` with the cases in the spec. `wav.ts`: header bytes, 28 s tail. Commit.

### Task 8: capture, sounds, prefs, the hook
- [ ] `micCapture.start({ deviceId, onLevel })` -> `{ snapshot(): Float32Array, stop() }`; worklet
      downsamples to 16 kHz. A test-only `__setCaptureSource` seam only if Task 0 demands it.
- [ ] `useDictation(activeSessionId)` -> `{ phase, level, liveText, message, sessionId }`: arms the
      window listeners only while `dictation-enabled`; partial loop; final -> clean -> the core's paste
      path as bracketed text with newlines flattened; sounds; media pause; 5 min cap.
- [ ] xterm's key handler yields the hotkey (the `ownsKey` route), and swallows the Alt keyup.

### Task 9: the pill and the tab mark
- [ ] Design pass with the design skills (impeccable + the app's theme tokens; it must read on every
      terminal theme, light and dark, and over acrylic). Mount/unmount, no opacity-in-place.
- [ ] `DictationPill` over the panel's bottom centre; level meter driven by `onLevel`; live text
      ellipsised from the LEFT so the newest words stay visible. TabStrip mic mark via `sessionId`.
- [ ] Measure in the e2e: the pill does not move the terminal's rows.

### Task 10: the settings page
- [ ] `DictationSettings` with the nine rows; model manager rows with progress; the mic row's live
      meter runs only while the page is open. `options.ts` gains `page: 'terminal' | 'dictation'`;
      `options.test.ts` extended; Prism Terminal's Settings gets the Dictation tab.
- [ ] Screenshot both themes; measure row layout in the e2e.

### Task 11: Prism Terminal wiring + e2e
- [ ] main: register IPC, grant `media` to the app's own window only, add the fake-mic switches under
      `--e2e`. App: mount hook and pill. termHost: `canDictate`.
- [ ] e2e `dictation` scenario exactly as the spec's Testing section lists; Tiny model cached under
      `.e2e-cache/`. Run it RED first where possible (e.g. before the paste is wired).
- [ ] Full gate: typecheck, lint, unit, all e2e.

### Task 12: docs, version, install
- [ ] CLAUDE.md: the fourth written exception; "a product for other users" rule; the shared folder;
      how to re-pin. core/README: the new seam fields and the fetch script. README: the feature, the
      hotkey, privacy (local, nothing leaves the machine), the GPU pack.
- [ ] 0.2.0, package, install (poll the exe timestamp), hands-on list for the owner: how it sounds,
      AltGr on the real keyboard, pause-media with Spotify/YouTube, GPU pack on the 5090.
- [ ] PR, CI, "merge?".

### Task 13 (after merge, and only after asking): Prism
- [ ] Tag `core-v0.2.0`; Prism branch: pin, `fetch:bin` calls the core's script into `vendor/whisper`,
      `extraResources`, main wiring + permission, termHost `canDictate` (terminal panel showing), the
      Dictation rail page, TabStrip mark, e2e `dictation` + parity, `npm run e2e:terminal`, full e2e,
      0.54.0, install, PR.

## Risks

- Fake mic may not work under Electron: fallback seam in Task 0.
- WinRT from PowerShell may be unreachable on some PCs: the option degrades to unavailable.
- The 643 MB GPU pack is a big download: progress, cancel, and it is never required.
- A slow laptop CPU makes live text lag: passes are serialised and the pill shows the level meter
  regardless, so the mic is visibly alive even when text trails.
