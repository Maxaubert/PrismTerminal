# Diagnostics log: design and plan (2026-10-07)

Owner, 2026-10-07: "implement some robust logging and debugging into the program especially to catch
stalls for example in explorer or in general. that would help me and you". Settled by question round
the same day:

- **Scope:** both apps. The logger is written once in `core/`, and the Explorer probes are Prism's own.
- **What it catches:**
  - UI freezes
  - slow work in main
  - errors and crashes
  - an action timeline (breadcrumbs)
- **Where it goes:** log files on disk, and a Settings > Diagnostics page.
- **Paths:** recorded in full, and the log stays local only.
- **When it runs:** on by default at a quiet level. A switch turns on verbose.
- **Thresholds:**
  - page blocked 200 ms
  - main event loop late 100 ms
  - IPC answer slower than 500 ms
  - more than 2 s also tries to capture what was running
- **E2E:** each scenario's stalls are reported at the end of the run. They do not fail the run.
- **Handoff:** the owner says "it stalled just now" and Claude reads the newest log files. A Mark
  button stamps the moment.

## What exists today (scouted 2026-10-07)

- **Prism:** `window-crashes.log` (`crashLog.ts`, 64 KB cap) records only the window's crash, hang and
  watchdog. `phone.log` covers the phone. There is no global error handler, no IPC timing and no
  renderer probe. About 100 IPC registrations sit in `src/main/index.ts`.
- **PT:** nothing. It has no log, no crash reporter and no error handlers.
- **Both:** every `ipcMain.handle/on` goes through Electron's one `ipcMain` object, and the core's
  register functions receive that same object. That object is the single choke point.
- **Explorer suspects, ranked (Prism, file:line in the scout report):**
  1. `realpathSync` guards over large path sets (`desktopAccess.ts:41-73`, from `folder:sizes-cached`
     and `search:files`).
  2. libuv threadpool starvation (4 threads): 26 drive-letter stats, 16 stats per listing, size
     scans. A dead network or optical drive holds up every async fs call.
  3. A full re-sort on every folder-size tick (`FolderBrowser.tsx:69-73`).
  4. Every scroll event goes to App state, then a whole App rerender plus a `tabsChanged` IPC.
  5. A full reread on every window focus.

The log is meant to confirm or rule these out with numbers. It fixes none of them; each fix is its
own PR once the log shows the culprit.

## Design

### The file
- **Location:** `<userData>\logs\diag.jsonl`. That is `%APPDATA%\PrismTerminal\logs` and
  `%APPDATA%\Prism\logs`, and the stable PT copy gets its own.
- **Rotation:** at 2 MB the file rotates to `.1` to `.4`, so at most 10 MB per app.
- **Format:** one JSON object per line: `{"t":"2026-10-07T09:12:03.412Z","up":12345,"src":"main|page","k":"<kind>",...fields}`.
  - `up` is ms since the app started, so lines order correctly across a clock change.
  - Fields are flat and short. Strings are capped at 300 characters and arrays are logged as their
    length.
- **Writes:** async, through a single queue, with appends batched at 250 ms. A write never throws. On
  `will-quit` the queue flushes synchronously, so the line just before a crash lands.
- **Session line at start:** app, version, Electron and Chromium versions, Windows build, pid,
  `verbose`, and the CPU and RAM size.

### Kinds (quiet level)

| kind | from | when | fields |
| --- | --- | --- | --- |
| `session` | main | start | see above |
| `main-lag` | main | event loop late 100 ms+ (`monitorEventLoopDelay` plus a 50 ms drift timer) | `ms`, `inflight` (IPC calls running at that moment, with how long each had run) |
| `fs-slow` | main | the fs canary (one `fs.promises.stat` of userData every 5 s) took 500 ms+ | `ms`. This is the threadpool-starvation signal |
| `ipc-slow` | main | an `ipcMain.handle` settled after 500 ms+, or a sync `on` body ran 100 ms+ | `ch`, `ms`, `args` (summarised), `ok` |
| `ipc-error` | main | a handler threw or rejected | `ch`, `err`, `stack` |
| `page-stall` | page | long-animation-frame 200 ms+ (Chromium's LoAF, which names the script, function and what started it) | `ms`, `blocking`, `scripts[]` (`src`, `fn`, `invoker`, `ms`), `crumbs` (the last 5) |
| `page-stack` | main | the page sent no heartbeat for 2 s. Main asks the frame for its JavaScript stack (`collectJavaScriptCallStack`) and writes it ONLY when a `page-stall` overlapping that time then arrives, so a throttled background timer is never a false stall | `stack`, `ms` |
| `page-error` / `page-rejection` | page | `window.onerror`, `unhandledrejection` | `msg`, `stack`, `src` |
| `main-error` / `main-rejection` | main | `uncaughtExceptionMonitor` (observe only, so behaviour is unchanged), `unhandledRejection` | `msg`, `stack` |
| `gone` | main | `render-process-gone`, `child-process-gone` (GPU, utility) | `type`, `reason`, `exitCode` |
| `unresponsive` / `responsive` | main | the window's own events | `ms` |
| `crumb` | page or main | an action (below) | `a` (action), plus its own fields |
| `mark` | page | the Mark button | `note` (optional) |
| `verbose` | main | the switch changed | `on` |

**Verbose adds:**
- `ipc` for every call, with its time.
- `crumb` for high-rate actions: scroll settles, hover previews.
- `page-task` for long tasks from 50 ms.

### Breadcrumbs (`crumb`)
- **Low-rate actions,** logged at quiet level:
  - **Both apps:** tab opened, closed and switched; Settings page opened; update window opened and
    install started; dictation started and stopped.
  - **PT:** a shell was spawned and its pid exited.
  - **Prism Explorer:**
    - `open-folder`, with path, reason (navigate, back, refresh, focus, dir-changed), ms, entry
      count and cached
    - sort or filter changed
    - preview opened
    - search started, finished or cancelled, with ms and hits
    - folder-size scan finished, with path and ms
    - the watcher set up, with ms
    - the sort-and-filter pass, logged when it took 50 ms+, with the entry count
  - **Prism, elsewhere:** project opened, player file opened, archive job started and ended.
- **The ring buffer:** the page also keeps the last 50 crumbs in memory and attaches the last 5 to
  any `page-stall`.

### Probes specific to Prism's Explorer
- **Path guard:** `desktopAccess` reports `guard-slow` when one guard call took 50 ms+, with the path
  count and ms. This tests suspect 1 directly.
- **Re-sorts:** the `browseEntries` memo times itself and logs `sort-slow` at 50 ms+, with the entry
  count and what triggered it (sizes, query or sort).
- **Starvation:** the fs canary covers suspect 2. The listing's own `ms` field next to it says whether
  the pool was starved or the folder was slow.

### Core pieces (`core/`, in PT)
- `core/main/diagLog.ts`: the writer: queue, rotation, flush at quit, verbose state (persisted in
  `<userData>\diag.json`).
- `core/main/diagSummary.ts`: pure. Summarises IPC arguments and caps strings.
- `core/main/ipcTiming.ts`: `timeIpcMain(ipcMain, log)` patches `handle`, `on` and `removeListener`.
  - A map from each original listener to its wrapper keeps `removeListener` working; Prism's
    `open:listen` depends on it.
  - It also keeps a table of the calls in flight.
- `core/main/stallWatch.ts`: event-loop lag, the fs canary, the heartbeat watcher and the
  pending-stack logic.
- `core/main/crashHooks.ts`: `process` and `app` handlers, plus the window events.
- `core/main/diagIpc.ts`: the channels `diag:batch` (the page's batched lines), `diag:beat`,
  `diag:info`, `diag:set-verbose`, `diag:open-folder` and `diag:mark`. They go in
  `core/shared/channels.ts`, `core/preload/diagApi.ts` and the bridge.
- `core/renderer/lib/diag.ts`:
  - the page side: the LoAF and long-task observers, error handlers, heartbeat, crumb ring and batch
    sender
  - `diag.crumb(action, fields)` and `diag.time(label, fn)` for the apps to call
- `core/renderer/settings/Diagnostics.tsx` and `diagnosticsOptions.ts`. The rows are:
  - **Detailed logging:** the verbose switch
  - **Log files:** Open folder, plus the folder path as text
  - **Mark a problem:** a button that writes `mark` and says Marked for 1.2 s
  - The wording passes `settingsCopy`.
- `core/README.md`: the contract adds `diagLogDir` to the main deps. A host without it logs nothing,
  so Prism is unchanged until it wires it.

### Each app's part
- **PT:**
  - `src/main/index.ts` calls `timeIpcMain` before `wireIpc()` and starts the watchers.
  - The renderer calls `diag.start()` in `main.tsx`.
  - Crumbs go at the tab, settings, update and dictation sites.
  - Settings gets a fourth rail tab, Diagnostics.
- **Prism:**
  - The same wiring, before the whenReady block.
  - `logWindow` also writes `window-crashes.log`, kept because the error box and the
    `neverWindowless` e2e name it.
  - Diagnostics is a rail tab in the last group, next to About.
  - The Explorer crumbs and probes listed above.
- **Prism's preload** keeps its direct `ipcRenderer` calls; timing is main-side only.
- **Privacy:** PT's `PRIVACY.md` and Prism's README privacy line say a local diagnostics log is kept,
  is never sent, and can be opened from Settings.

### Reading the logs (for Claude)
- `docs/diagnostics.md` in PT gives the schema, the file locations and how to read them.
- `tools/diag.mjs`, run as `npm run diag -- [--app prism|pt|stable] [--since 10m] [--kinds stall]`,
  prints the newest problems: stalls, errors and slow calls, each with its crumbs before it.
- Each repo's CLAUDE.md gets a short rule and a pointer.
- The memory notes where the logs live.

### E2E
- **PT `diagLog` scenario:**
  - It triggers each problem through e2e-only hooks:
    - a 2.5 s page busy loop
    - `e2e:slow-ipc`, which sleeps 600 ms
    - a thrown page error
    - a rejected promise
  - It then reads `diag.jsonl` and asserts:
    - `session`
    - `page-stall` with a script attribution
    - `page-stack`, if `collectJavaScriptCallStack` works for our page (MEASURED first; if it needs a
      Document-Policy header we cannot set for `file://`, the kind is dropped and the LoAF
      attribution carries it)
    - `ipc-slow` with `ch`
    - `page-error`
    - crumbs before the stall
    - the Mark button's line
    - the verbose switch persisting across a relaunch
  - Also checked: rotation at the cap (a unit test fills the file), and that quiet mode writes
    nothing during an idle 3 s.
- **PT `options`:** gets the Diagnostics tab, and `diagnosticsOptions.ts` joins `wanted`, the way
  `helpOptions` does.
- **Prism `diagLog`:** runner-safe and in `e2e:terminal`, so the core bump's gate holds it. A plus
  `explorerDiag` opens a folder and reads its `open-folder` crumb, with `ms` and `entries`.
- **Both runners:** before a profile is removed (PT), or per scenario by clearing then reading the
  shared profile's log (Prism), the runner collects stall and error lines over 1 s. It prints them in
  a closing "Stalls" table. That table is a report only; the exit code is unchanged.

### Cost and safety
- **Quiet level when nothing is wrong:** one session line, the crumbs (a handful a minute), the 5 s
  stat and a 50 ms timer.
- **IPC wrapper:** two `performance.now()` calls per call.
- **Failures stay silent:** a logger that fails is silent and never takes the app down. The writer
  swallows its own errors after one `logger-error` line.

## Plan

**PR A, PT** (issue first, branch `feat/<n>-diagnostics-log`): core 0.26.x to 0.27.0, app minor bump.
- Tasks, in order, each test-first:
  1. `diagSummary` + `diagLog` (rotation, queue, flush, verbose persistence)
  2. `ipcTiming` (timing, errors rethrown unchanged, `removeListener`, in-flight)
  3. `stallWatch` with fake timers (lag, canary, heartbeat, pending stack only on an overlapping
     stall)
  4. `crashHooks`
  5. the `diagIpc` + channels + preload `diagApi`
  6. renderer `diag.ts` (LoAF parsing, ring, batching)
  7. the `Diagnostics` settings component + options + copy test
  8. PT wiring + crumbs + Settings tab
  9. `tools/diag.mjs` + `docs/diagnostics.md` + CLAUDE.md + `PRIVACY.md`
  10. the e2e `diagLog`, `options` update, and the runner's Stalls table
  11. measure `collectJavaScriptCallStack` on our page and keep or drop `page-stack`
- **Gates:** typecheck, lint, the full unit suite, full PT e2e. Then install PT (not stable) for
  hands-on.
- **Release candidate:** a `core-v0.27.0-rc.1` cut from the PR branch, so Prism's PR can be built
  against it.

**PR B, Prism** (its own issue and branch), against the rc pin, re-pinned to `core-v0.27.0` once A
merges. It also folds in the auto bump.
1. Main wiring, plus `logWindow` writing to both logs.
2. Settings Diagnostics tab.
3. Explorer crumbs and probes (`useFolderBrowsing`, `FolderBrowser`, `desktopAccess`, search, sizes,
   watch).
4. Other crumbs (tabs, project, player, archive).
5. README privacy line, CLAUDE.md.
6. The e2e `diagLog` (in `e2e:terminal`) and `explorerDiag`, and the runner's Stalls table.
7. **Gates:** typecheck, unit, full Prism e2e, one run at a time. Then package and install.

**Order:**
- The owner merges PT A first. Its core bump PR to Prism auto-merges when green.
- The owner then merges Prism B, rebased on that bump.
- A and B ride after the PRs already open (PT #139, which takes core 0.26.0, then this is 0.27.0).

## Measured during PR A (2026-10-07)

- **`page-stack` is KEPT (task 11).** Electron 43.7.3, a page spinning in a 3 s busy loop:
  `mainFrame.collectJavaScriptCallStack()` answered in 0 to 1 ms, but with the sentence "Website
  owner has not opted in for JS call stacks in crash reports." until the document was served with
  `Document-Policy: include-js-call-stacks-in-crash-reports`. Set through
  `session.webRequest.onHeadersReceived` (or a `protocol.handle('file')` wrapper), the stack came
  back (`at spinHard ... at outerBusy ...`) for a `file://` page AND a dev server's `http://` page.
  In the BUILT Prism Terminal under `--e2e` the whole chain landed: `page-stall` (3000 ms, invoker
  `TimerHandler:setTimeout`), then `page-stack` with the busy function's name, 2012 ms after the
  last beat. The core exports `withStackPolicy`; each host adds it for `mainFrame` responses.
- **The first run found a cause already:** the first `term:spawn` of a launch blocked main for
  about 1.4 to 1.6 s (`main-lag` beside `ipc-slow term:spawn`, `shell-spawn` `ms` 1446 to 1647):
  node-pty's import and the ConPTY start on the restore's spawn. Its own issue, not this PR.
- **It also found two bugs, fixed before the commit:** a page error's script location, named
  `src`, overwrote the line's `src` (now `loc`, and the writer's four keys can never be
  overwritten); and `main-lag` listed nothing in flight because the blocking call had settled a
  millisecond before the late tick ran (now it names the calls that ended inside the lag, `done`).
- **Electron's main runs Node in warn mode** for unhandled rejections (MEASURED: a warning, the app
  runs on, with or without a listener), so listening to `unhandledRejection` changes nothing but
  the console warning.

Deviations from the design above, each small:
- Strings cap at 300, but a `stack` at 2000: 300 characters is about two frames.
- `main-lag` uses the 50 ms drift timer alone: `monitorEventLoopDelay` is a sampled histogram and
  says how bad, never when, and a timeline line needs the when.
- `page-stack` is also written when the window reports `unresponsive` (a real hang, no throttle),
  not only on an overlapping `page-stall`.
- The page error's location field is `loc`, not `src` (above). `quit` is a kind of its own, the
  last line of a session.
- The settings component is `core/renderer/settings/sections/DiagnosticsPage.tsx` (beside
  `DictationPage`, so the grouped cards' copy rules hold it), and it takes the bridge as a prop
  rather than through a new `TermHostConfig` field. In PT it is the rail's fifth page, directly
  above About: the redesign (#134) had already given the rail four pages before About.
- `startDiagnostics` (`core/main/diagnostics.ts`) composes the pieces, so a host wires it in one
  call; `pageLine` in `diagIpc.ts` holds the page to its own kinds.

**After merge:** install both. The owner uses them, and the first "it stalled" is read with
`npm run diag`.
