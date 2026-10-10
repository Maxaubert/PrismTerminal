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
npm run diag -- --agent               the agent indicator's timeline (hooks, titles, marks, why)
npm run diag -- --agent --tab <id>    one tab's
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
| `session-end` | main | Windows is shutting down or logging off (no `quit` follows) | |
| `main-lag` | main | main's 50 ms tick came 100 ms or more late (never for a sleep: `powerMonitor`) | `ms`, `inflight` (`ch`, `ms`, `done`) |
| `fs-slow` | main | a `stat` of userData (every 5 s) took 500 ms or more | `ms` |
| `ipc-slow` | main | a `handle` settled after 500 ms, or a sync `on` body ran 100 ms; never a call that waits on the user or a download (the folder picker, an update install, a dictation download: `LONG_WAIT` plus the host's `longWaitChannels`), which is also left out of `inflight` | `ch`, `ms`, `args`, `ok`, `sync` |
| `ipc-error` | main | a handler threw or rejected (rethrown unchanged) | `ch`, `ms`, `err`, `stack` |
| `page-stall` | page | a long animation frame of 200 ms or more | `ms`, `blocking`, `scripts` (`src`, `fn`, `invoker`, `ms`), `crumbs` (`a`, `ago`) |
| `page-stack` | main | the page missed its heartbeat for 2 s, and a `page-stall` covering that moment arrived (or the window said unresponsive) | `stack`, `ms`, `unresponsive` |
| `page-error` / `page-rejection` | page | `error`, `unhandledrejection` | `msg`, `stack`, `loc` (script:line:col), `repeats` |
| `main-error` / `main-rejection` | main | `uncaughtExceptionMonitor`, `unhandledRejection` (observed only) | `msg`, `stack`, `origin`, `repeats` |
| `gone` | main | a renderer or child process (GPU, utility) ended | `type`, `reason`, `exitCode`, `name` |
| `unresponsive` / `responsive` | main | the window's own hang events | `ms` (on `responsive`) |
| `crumb` | page, main | an action (below) | `a`, its own fields |
| `mark` | page | Settings > Diagnostics > Mark a problem | `note` |
| `verbose` | main | Detailed logging switched | `on` |
| `logger-error` | main | the log could not write, or could not rotate (once a session; a failed rotation keeps writing to the live file and tries again 30 s later) | `msg` |
| `logger-dropped` | main | the writer's queue was full (2000 lines): the NEWEST were dropped | `n` |
| `<name>-slow` | page | an app's own timing through `time()` (Prism: `sort-slow`, `guard-slow`) | `ms`, its own fields |
| `agent-hook` | page (core) | a Claude Code hook signal (OSC 777 `prism-agent`) reached a tab. The first of a run of the same state on a tab is written at once; the rest are counted and written as ONE line with `repeats` when the tab's state changes, the tab closes, or 5 s pass with no signal from it (`t` is the last repeat's) | `id`, `state`, `kind` (a failure's), `repeats` |
| `agent-title` | page (core) | the MEANING of a tab's agent title changed: `idle`, `working`, `starting`, `question`, or `none` (no agent's title now). Never each spinner frame, never the title's text | `id`, `state`, `agent` |
| `agent-mark` | page (core) | the mark a tab's indicator holds moved (below) | `id`, `from`, `to`, `held`, `why`, `agent`, `restored` |
| `agent-restore` | page (core) | a tab restored over an agent conversation (its resume rides the spawn) | `id`, `cwd`, `resume` |

Detailed logging adds `ipc` (every call: `ch`, `ms`), `page-task` (long tasks from 50 ms: `ms`) and
the high-rate crumbs (`often`).

**Errors are gated** (`core/shared/diagGate.ts`): the same error (kind, message, place) is written
once per 10 s, and the next line for it carries `repeats`, how many copies were not written in
between; at most 10 error lines per kind per 10 s whatever they say. An error thrown on every frame
would otherwise roll the whole 10 MB over in about 75 s and take the first error with it. The
page's own queue drops its newest lines past 200 the same way and says so with a `diag-dropped`
crumb (`n`).

## The agent indicator (#152)

Written by `core/renderer/lib/agentDiag.ts`, called from `useAgentIndicator.ts` without changing a
rule, so a wrong mark (#151: restored tabs showed Finished after a restart) is read, not guessed.
`npm run diag -- --agent` is the timeline (these lines with the tab and shell crumbs, sessions and
marks); `--tab <id>` keeps one tab's. They are not problems, so the default view leaves them out,
but an `agent-mark` or `agent-restore` shows among the crumbs before a problem.

`agent-mark`:
- `from` / `to`: `none`, `working`, `question`, `failed`, `done`, the strip's order (working first).
  The indicator's mark, before the host's Finished / Question / Failed switches and indicator style.
- `held`: every attention mark the tab holds (a Finished can sit under a question).
- `why`: the rules noted in the second before the move, joined with ` + `: `hook <state>` (with
  `, box on screen` when the question box decided it, `, tab in front` when it was looked at),
  `spinner after <phase>`, `idle title after work (an Esc)`, `title <state>` (a session without
  hooks), `poll found agent` / `poll lost agent`, `screen read: question box` / `no question box`,
  `answer key, box gone`, `output scored working` / `output went quiet` (the output fallback),
  `stopped working while away`, `tab looked at`, `working again`, `agent gone`, `closed`.
  `unknown` means no rule was noted (a bug in the record, or a path it does not cover yet).
- `restored`: ms since this tab's `agent-restore`, within a minute of it.

Never typed text, screen text, a title's text or anything of the conversation: states, rule
names, tab ids and the folder. The `agentDiag` e2e puts a marker on the screen and in the title
and checks it never reaches the file.

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
  appInfo, openFolder, longWaitChannels, powerMonitor })`, then `watchWindow(win)` once the window
  exists and `stop()` on the quit that goes ahead. No `diagLogDir`: nothing is logged and the
  bridge still answers. `powerMonitor` is a getter (`() => powerMonitor`), hooked in `watchWindow`
  since it cannot be used before ready. At a Windows shutdown no quit comes: call
  `diag.log.flushSync()` in the window's `session-end`.
- `session.webRequest.onHeadersReceived`: `withStackPolicy` on `mainFrame` responses, or the page
  stack never comes (MEASURED: "Website owner has not opted in").
- Preload: `...createDiagApi(ipcRenderer)`. Page: `startDiag(bridge)` before the first render.
- Settings: `<DiagnosticsPage api={bridge} />` and `coreSettingsIndex({ diagnostics: true })`.
