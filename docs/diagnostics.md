# The diagnostics log

Both apps keep a local log of stalls, slow work, errors and what the user had just done (#140; owner,
2026-10-07: "implement some robust logging and debugging into the program especially to catch
stalls"). It is written by the core (`core/main/diag*.ts`, `core/main/ipcTiming.ts`,
`core/main/stallWatch.ts`, `core/main/crashHooks.ts`, `core/renderer/lib/diag.ts`). Design and
plan: `docs/superpowers/specs/2026-10-07-diagnostics-log-design.md`. It never leaves the PC
(`PRIVACY.md`).

## Where it is

| App | Folder |
| --- | --- |
| Prism Terminal | `%APPDATA%\PrismTerminal\logs` |
| Prism Terminal (Stable copy) | `%APPDATA%\PrismTerminalStable\logs` |
| Prism | `%APPDATA%\Prism\logs` (once Prism wires `diagLogDir`) |
| An e2e scenario | `<its profile>\logs` (removed with the profile) |

`diag.jsonl` is the live file. At 2 MB it rotates to `diag.jsonl.1` (newest) through
`diag.jsonl.4`, so an app holds at most 10 MB. Detailed logging is remembered in
`<userData>\diag.json` (`{"verbose":true}`). Settings > Diagnostics opens the folder and shows its
path.

## Reading it

```
npm run diag                          newest 20 problems in Prism Terminal's log, crumbs before each
npm run diag -- --app stable          the stable copy (the owner works in this one)
npm run diag -- --app prism           Prism
npm run diag -- --since 10m           only the last ten minutes (ms, s, m, h, d)
npm run diag -- --all                 every line, not only problems
npm run diag -- --kinds page-stall,main-lag
npm run diag -- --dir <folder>        any folder holding a diag.jsonl
```

When the owner says "it stalled just now", run `npm run diag -- --app stable --since 10m` (or the
app they named) and read from the bottom: a `mark` line is the moment they pressed Mark a problem.
Lines are sorted by `t`; a page's lines are written up to a few seconds after they happened (they
arrive in batches), so the file itself is not in time order, `t` is.

How to read a stall:
- **`page-stall`** says how long the page's frame ran and WHICH scripts: `fn` in `src`, started by
  `invoker` (`BUTTON.onclick`, `TimerHandler:setTimeout`, `MessagePort.onmessage`...). Its `crumbs`
  are what the user did just before, with `ago` in ms.
- **`page-stack`** (2 s or more) is the page's JavaScript stack taken WHILE it was stuck: the top
  frame is the code that was running.
- **`main-lag`** lists `inflight`: the IPC calls running during the lag, or that ended inside it
  (`done`). A long `ipc-slow` beside it usually names the cause.
- **`fs-slow`** next to slow listings means libuv's four fs threads were starved (a dead network or
  optical drive, a size scan), not that one folder is slow.

## The line

One JSON object per line:

```json
{"t":"2026-10-07T09:12:03.412Z","up":12345,"src":"main","k":"main-lag","ms":140,"inflight":[...]}
```

- `t`: when it happened (ISO, UTC). `up`: ms since the app started, on main's clock, so order
  survives a clock change. `src`: `main` or `page`. `k`: the kind. These four are always the
  writer's own; a field cannot overwrite them.
- Strings are capped at 300 characters (a `stack` at 2000) and end in `...(+n)` when cut. IPC
  arguments are summarised: an array is `[n]`, bytes `bytes:n`, objects one level deep. Typed text
  (`term:input`), the clipboard and recorded audio are logged by size only (`string:7`).
- Paths are written in full.

## Kinds

Quiet level, always on:

| kind | src | when | fields |
| --- | --- | --- | --- |
| `session` | main | start | `app`, `version`, `electron`, `chrome`, `windows`, `pid`, `verbose`, `cpus`, `cpu`, `ramGb`, `e2e` |
| `quit` | main | the quit, last line | |
| `main-lag` | main | main's 50 ms tick came 100 ms or more late | `ms`, `inflight` (`ch`, `ms`, `done`) |
| `fs-slow` | main | a `stat` of userData (every 5 s) took 500 ms or more | `ms` |
| `ipc-slow` | main | a `handle` settled after 500 ms, or a sync `on` body ran 100 ms | `ch`, `ms`, `args`, `ok`, `sync` |
| `ipc-error` | main | a handler threw or rejected (rethrown unchanged) | `ch`, `ms`, `err`, `stack` |
| `page-stall` | page | a long animation frame of 200 ms or more | `ms`, `blocking`, `scripts` (`src`, `fn`, `invoker`, `ms`), `crumbs` (`a`, `ago`) |
| `page-stack` | main | the page missed its heartbeat for 2 s, and a `page-stall` covering that moment arrived (or the window said unresponsive) | `stack`, `ms`, `unresponsive` |
| `page-error` / `page-rejection` | page | `error`, `unhandledrejection` | `msg`, `stack`, `loc` (script:line:col) |
| `main-error` / `main-rejection` | main | `uncaughtExceptionMonitor`, `unhandledRejection` (observed only) | `msg`, `stack`, `origin` |
| `gone` | main | a renderer or child process (GPU, utility) ended | `type`, `reason`, `exitCode`, `name` |
| `unresponsive` / `responsive` | main | the window's own hang events | `ms` (on `responsive`) |
| `crumb` | page, main | an action (below) | `a`, its own fields |
| `mark` | page | Settings > Diagnostics > Mark a problem | `note` |
| `verbose` | main | Detailed logging switched | `on` |
| `logger-error` | main | the log could not write (once a session) | `msg` |
| `<name>-slow` | page | an app's own timing through `time()` (Prism: `sort-slow`, `guard-slow`) | `ms`, its own fields |

Detailed logging adds `ipc` (every call: `ch`, `ms`), `page-task` (long tasks from 50 ms: `ms`) and
the high-rate crumbs (`often`).

## Crumbs

Prism Terminal and the core say these today:

| `a` | from | fields |
| --- | --- | --- |
| `tab-open` | page | `id`, `cwd`, `resume` |
| `tab-close` | page | `id`, `kind` |
| `tab-switch` | page | `id` |
| `settings-page` | page | `page` |
| `update-open` / `update-install` | page (core) | `version`, `preview` |
| `dictation` | page (core) | `phase`: `listening`, `transcribing`, `idle` |
| `shell-spawn` | main (core) | `id`, `pid`, `shell`, `cwd`, `resume`, `ms`, `warm` |
| `shell-exit` | main (core) | `id`, `pid`, `exitCode` |
| `shell-spawn-failed` | main (core) | `id`, `shell`, `cwd`, `err` |

Adding one: `crumb('name', { fields })` from `core/renderer/lib/diag` in a page, or
`diagMain().write('main', 'crumb', { a: 'name', ... })` in main. A crumb that can fire many times a
second passes `{ often: true }`.

## Wiring (a host)

- Main, before any IPC is registered: `startDiagnostics({ diagLogDir, ipcMain, process, app,
  appInfo, openFolder })`, then `watchWindow(win)` once the window exists and `stop()` on the quit
  that goes ahead. No `diagLogDir`: nothing is logged and the bridge still answers.
- `session.webRequest.onHeadersReceived`: `withStackPolicy` on `mainFrame` responses, or the page
  stack never comes (MEASURED: "Website owner has not opted in").
- Preload: `...createDiagApi(ipcRenderer)`. Page: `startDiag(bridge)` before the first render.
- Settings: `<DiagnosticsPage api={bridge} />` and `coreSettingsIndex({ diagnostics: true })`.
