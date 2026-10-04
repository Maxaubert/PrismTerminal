# Dictation models: Phonon 2 and the leaderboards (2026-10-04)

Asked by the owner, 2026-10-04: "Take a look at phonon 2 and if that's something that should be in the dictation models list. And look up the best models on the leaderboards right now and give me a verdict". Researched the same day; leaderboard data from the Open ASR Leaderboard result files updated 2026-10-01. Nothing in the catalog was changed by this research.

**Verdict: leave Phonon 2 out and keep every current model. Quantized Whisper files are worth testing now; Parakeet v3 is worth revisiting once whisper.cpp ships a server for it.**

I checked this against the real catalog in `C:\Users\Admin\Documents\Claude\Github\PrismTerminal\core\shared\dictationCatalog.ts`: engine `b5130`, models pinned at commit `5359861c`, and the entries base, small, large-v3-turbo, large-v3, the e2e-only tiny, and gpu-pack. Nothing was changed.

## Phonon 2: no
FermionResearch/Phonon-2 is a 164 MB, 2.1-bit compressed copy of NVIDIA Parakeet TDT 0.6B v3. It scores 5.17% English WER on the Open ASR Leaderboard, against 5.78 for our Large v3 and 6.36 for our Turbo. It breaks four rules:
- **English only.** The catalog takes multilingual models only, because Auto-detect is the default and a 28-language picker would do nothing.
- **Not whisper.cpp.** It runs only in Fermion's Python package or in Docker. Its weights are a custom `.bps.tar.zst` file with no ggml or GGUF version, so there is no route through our engine.
- **Won't run on a fresh Windows PC.** It needs Python or Docker, and there is no prebuilt binary.
- **Worse than the model it was made from.** Parakeet v3 scores 4.86. Phonon's only gain is a smaller download. It also comes from a young lab and its numbers are its own.

## Fits today with whisper.cpp (same engine, same pin, only the catalog changes)
These all come from `ggerganov/whisper.cpp` at the commit we already pin. Our server and the GPU pack can load these quantized files. The SHA-256 of each must be read from the Hugging Face API and HEAD-checked like the others.

| Change | File | Size (now → new) | Gain | Risk |
|---|---|---|---|---|
| ADD, then possibly REPLACE Large v3 | `ggml-large-v3-q5_0.bin` | 3,095 MB → 1,081 MB | A third of the download and less GPU memory. Most accurate model's quality at a smaller size than today's Turbo. | Accuracy loss not measured here. q5 usually costs little, but German, Norwegian and Dutch need checking. |
| ADD, then possibly REPLACE Turbo | `ggml-large-v3-turbo-q8_0.bin` (safe) or `-q5_0.bin` (574 MB) | 1,625 MB → 874 MB or 574 MB | About half or a third of the download. Same speed or slightly faster on GPU. Faster on CPU, but probably still not live-text speed. | q8_0 loses almost nothing; q5_0 needs measuring. A first run must also be checked against the CUDA kernel-cache warm-up. |
| OPTIONAL | `ggml-small-q5_1.bin` | 488 MB → 190 MB | A lighter Small on CPU machines. | Small is already close to its accuracy limit, so q5_1 could fall to Base's level. Measure it before adding. |

How to do it: one PR, bump the core version, and run the real `dictation` e2e on each new file. Then do a hands-on Norwegian and English pass on the 5090 and on CPU, recording WER and time per pass. Swap only when the numbers hold. Don't list f16 and quantized versions side by side for good; a duplicate row confuses users.

Also reword Turbo's note "Close to Large v3 at about half the download". It is true for English but not for everyday speech in other languages. On Common Voice, German is 8.58 vs 4.79 and Dutch is 7.12 vs 4.10. A better note: "Faster, slightly less accurate outside English."

## KEEP (scrap nothing)
- **Large v3:** it is still the most accurate multilingual model whisper.cpp runs, with a clear lead over Turbo outside English.
- **Large v3 Turbo:** it stays the right GPU default.
- **Base and Small:** these are the only workable choices on CPU, AMD and Intel. Base gives live text at about 0.9 s a pass on CPU (measured).
- **Tiny:** the e2e needs it.
- **GPU pack:** unchanged.

## Needs a new engine (your decision; none recommended now)
- **Parakeet TDT 0.6B v3** (4.86 WER, roughly 8 to 13 times faster than Large).
  - It is the closest to fitting: our pinned b5130 zip already contains `parakeet-cli.exe` and `parakeet.dll`, which our engine file list leaves out. The official GGUFs are at `ggml-org/parakeet-GGUF` (commit `35156454`; q4_k is 416 MB, q8_0 is 669 MB).
  - Blockers:
    - **No server yet.** The Parakeet server is still a draft (whisper.cpp PR #3904), so there's no warm engine, no warm-up and no live text in the pill.
    - **No Norwegian.** It covers 25 European languages only.
    - **No language setting.** It detects the language itself, so our picker would do nothing.
  - When #3904 is in an official release: bump the engine and GPU pack together, add the Parakeet files to the engine list, and offer it as an extra "European languages, fastest" choice. Never as the default.
- **Qwen3-ASR 1.7B (4.31), Canary-Qwen 2.5B, Cohere Transcribe, Canary 1B v2, Voxtral:** none has an official Windows build, and each needs Python, NeMo, a GPU runtime or unofficial ports. Reject.
- **sherpa-onnx** (official Windows builds, runs Parakeet and Canary as ONNX): technically possible as a second runtime, but it breaks "official whisper.cpp binaries only" and doubles what we pin and test. Not worth it while the whisper.cpp route is coming.
- **distil-large-v3.5** (5.40) and **Parakeet v2** (4.70): English only. Reject.
- **TheStageAI's tuned Turbo** (4.54): encrypted engine files tied to one GPU. Reject.

## Ranked recommendation
1. Don't add Phonon 2.
2. Scrap nothing.
3. Measure `large-v3-turbo-q8_0` and `large-v3-q5_0`. If accuracy holds in English and Norwegian, swap them in for the full-size Turbo and Large v3 in one core PR.
4. Reword Turbo's note to stop claiming it matches Large v3 outside English.
5. Optionally measure `small-q5_1` as a lighter CPU option.
6. Watch whisper.cpp PR #3904. When the Parakeet server ships in an official release, bring Parakeet v3 back to you as an optional European-languages choice.
7. Don't adopt a second runtime (Phonon, Qwen3-ASR, Canary, sherpa-onnx) now.

## Key sources
- https://huggingface.co/FermionResearch/Phonon-2 and https://github.com/fermionresearch/phonon
- Open ASR Leaderboard: https://huggingface.co/spaces/hf-audio/open_asr_leaderboard, with the result files at https://huggingface.co/datasets/hf-audio/open-asr-leaderboard-results and https://huggingface.co/datasets/hf-audio/multilingual_evals (updated 2026-10-01)
- https://artificialanalysis.ai/speech-to-text
- https://github.com/ggml-org/whisper.cpp/releases (b5130, v1.9.0 added Parakeet) and https://github.com/ggml-org/whisper.cpp/pull/3904
- https://huggingface.co/ggml-org/parakeet-GGUF and https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3
- https://huggingface.co/ggerganov/whisper.cpp (where the quantized files are)
- https://github.com/k2-fsa/sherpa-onnx/releases
