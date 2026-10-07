import { performance } from 'perf_hooks'
import type { DiagLog } from './diagLog'
import { errorFields } from './diagSummary'

/**
 * ERRORS AND CRASHES, OBSERVED (#140).
 *
 * Observe only: nothing here changes what the app does when something goes
 * wrong. An uncaught exception is heard on `uncaughtExceptionMonitor`, which
 * Node calls BEFORE its own handling and which does not count as handling it.
 * `unhandledRejection` does count, but Electron's main runs Node in warn
 * mode: MEASURED on Electron 43, an unhandled rejection only printed a
 * warning and the app ran on, with or without a listener, so the listener
 * costs the console warning and nothing else.
 *
 * Every line here is written to disk AT ONCE (`flushSync`): the process may
 * be about to end, and the 250 ms batch would lose exactly the line that
 * explains why.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface EmitterLike {
  on(event: string, listener: (...args: any[]) => void): unknown
  removeListener(event: string, listener: (...args: any[]) => void): unknown
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface CrashHookDeps {
  log: DiagLog
  /** Node's `process`. */
  process: EmitterLike
  /** Electron's `app`. */
  app: EmitterLike
}

/** Hooks the process and the app; returns the function that unhooks them. */
export function hookCrashes({ log, process: proc, app }: CrashHookDeps): () => void {
  const land = (k: string, fields: Record<string, unknown>): void => {
    try {
      log.write('main', k, fields)
      log.flushSync()
    } catch {
      /* the log never adds a second failure to the first */
    }
  }
  const onError = (err: unknown, origin: unknown): void =>
    land('main-error', { ...errorFields(err), origin: typeof origin === 'string' ? origin : null })
  const onRejection = (reason: unknown): void => land('main-rejection', errorFields(reason))
  const onRenderGone = (_e: unknown, _wc: unknown, d: { reason?: string; exitCode?: number } = {}): void =>
    land('gone', { type: 'renderer', reason: d.reason ?? null, exitCode: d.exitCode ?? null })
  const onChildGone = (_e: unknown, d: { type?: string; reason?: string; exitCode?: number; name?: string } = {}): void =>
    land('gone', { type: d.type ?? null, reason: d.reason ?? null, exitCode: d.exitCode ?? null, name: d.name ?? null })

  proc.on('uncaughtExceptionMonitor', onError)
  proc.on('unhandledRejection', onRejection)
  app.on('render-process-gone', onRenderGone)
  app.on('child-process-gone', onChildGone)
  return () => {
    proc.removeListener('uncaughtExceptionMonitor', onError)
    proc.removeListener('unhandledRejection', onRejection)
    app.removeListener('render-process-gone', onRenderGone)
    app.removeListener('child-process-gone', onChildGone)
  }
}

/**
 * A window's own hang events: `unresponsive` (Chromium's hang monitor gave
 * up waiting on the page), then `responsive` with how long it lasted. The
 * hang is handed to the stall watch, which writes the page's stack for it.
 */
export function watchWindowHealth(
  win: EmitterLike,
  log: DiagLog,
  watch?: { unresponsive(): void },
  now: () => number = () => performance.now()
): void {
  let since: number | null = null
  win.on('unresponsive', () => {
    since = now()
    log.write('main', 'unresponsive', {})
    watch?.unresponsive()
  })
  win.on('responsive', () => {
    log.write('main', 'responsive', since === null ? {} : { ms: Math.round(now() - since) })
    since = null
  })
}
