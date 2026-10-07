import { appendFileSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'fs'
import { appendFile, mkdir } from 'fs/promises'
import { dirname, join } from 'path'
import { performance } from 'perf_hooks'
import { cleanFields, errorFields } from './diagSummary'

/**
 * THE DIAGNOSTICS LOG'S WRITER (#140; owner, 2026-10-07: "implement some
 * robust logging and debugging into the program especially to catch stalls").
 * For both hosts; spec `docs/superpowers/specs/2026-10-07-diagnostics-log-design.md`,
 * schema `docs/diagnostics.md`.
 *
 * `<userData>\logs\diag.jsonl`, one JSON object per line. Appends are batched
 * every 250 ms through one queue, so a burst of lines is one write and the
 * order is the order they were said in. At 2 MB the file rotates to `.1`
 * through `.4`, so an app holds at most 10 MB. At quit the queue is written
 * SYNCHRONOUSLY (`flushSync`), so the line just before a crash lands.
 *
 * A LOGGER THAT FAILS IS SILENT. A write never throws into its caller: the
 * first failure queues one `logger-error` line (which lands if the next write
 * works, as after a moment's file lock) and the rest are dropped quietly.
 * Nothing here may take the app down to report that the app is slow.
 */

export type DiagSource = 'main' | 'page'

export interface DiagLog {
  /** The folder the files are in (Settings' Open folder). */
  readonly dir: string
  /** The live file, `diag.jsonl`. */
  readonly file: string
  write(src: DiagSource, k: string, fields?: Record<string, unknown>): void
  /** A page line whose own clock said when: `at` is its epoch ms. */
  writeAt(src: DiagSource, k: string, at: number, fields?: Record<string, unknown>): void
  /** Detailed logging (Settings > Diagnostics), remembered in `<userData>\diag.json`. */
  verbose(): boolean
  setVerbose(on: boolean): void
  /** Write what is queued now; resolves when it is on disk (or dropped). */
  flush(): Promise<void>
  /** The quit path's write: synchronous, so it lands before the process ends. */
  flushSync(): void
  /** Did any write fail this session? */
  failed(): boolean
  /** Stop the timer and write what is left. */
  close(): void
}

export interface DiagLogOptions {
  /** `<userData>\logs`. */
  dir: string
  /** Where the verbose switch is kept: `<userData>\diag.json` by default. */
  stateFile?: string
  /** Epoch ms, for `t`. */
  now?: () => number
  /** Ms since the app started, for `up`: a clock change cannot reorder it. */
  uptime?: () => number
  maxBytes?: number
  flushMs?: number
}

export const DIAG_FILE = 'diag.jsonl'
export const DIAG_MAX_BYTES = 2 * 1024 * 1024
/** Rotated files kept beside the live one: `.1` (newest) to `.4`. */
export const DIAG_KEEP = 4

export function createDiagLog(opts: DiagLogOptions): DiagLog {
  const dir = opts.dir
  const file = join(dir, DIAG_FILE)
  const stateFile = opts.stateFile ?? join(dirname(dir), 'diag.json')
  const now = opts.now ?? Date.now
  const uptime = opts.uptime ?? ((): number => Math.round(performance.now()))
  const maxBytes = opts.maxBytes ?? DIAG_MAX_BYTES
  const flushMs = opts.flushMs ?? 250

  let verbose = readVerbose(stateFile)
  let size = fileSize(file)
  let queue: string[] = []
  let timer: ReturnType<typeof setTimeout> | null = null
  let chain: Promise<void> = Promise.resolve()
  let anyFailed = false
  let reported = false
  let closed = false

  const line = (src: DiagSource, k: string, at: number, up: number, fields?: Record<string, unknown>): string => {
    let t: string
    try {
      t = new Date(at).toISOString()
    } catch {
      t = new Date(now()).toISOString()
    }
    return JSON.stringify({ t, up, src, k, ...cleanFields(fields ?? {}) }) + '\n'
  }

  const schedule = (): void => {
    if (timer || closed) return
    timer = setTimeout(() => {
      timer = null
      void flush()
    }, flushMs)
    timer.unref?.()
  }

  const fail = (err: unknown): void => {
    anyFailed = true
    if (reported) return
    reported = true
    // Lands only if a later write works (a lock that passed); never retried.
    try {
      queue.unshift(line('main', 'logger-error', now(), uptime(), errorFields(err)))
    } catch {
      /* silent */
    }
  }

  /** Rotation, synchronous: it happens once per 2 MB, and renames are fast. */
  const rotateIfFull = (incoming: number): void => {
    if (size === 0 || size + incoming <= maxBytes) return
    rmSync(`${file}.${DIAG_KEEP}`, { force: true })
    for (let n = DIAG_KEEP - 1; n >= 1; n -= 1) {
      try {
        renameSync(`${file}.${n}`, `${file}.${n + 1}`)
      } catch {
        /* that one did not exist yet */
      }
    }
    renameSync(file, `${file}.1`)
    size = 0
  }

  const take = (): string | null => {
    if (queue.length === 0) return null
    const text = queue.join('')
    queue = []
    return text
  }

  const flush = (): Promise<void> => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    chain = chain.then(async () => {
      const text = take()
      if (text === null) return
      try {
        await mkdir(dir, { recursive: true })
        const bytes = Buffer.byteLength(text)
        rotateIfFull(bytes)
        await appendFile(file, text)
        size += bytes
      } catch (err) {
        fail(err)
      }
    })
    return chain
  }

  const flushSync = (): void => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    const text = take()
    if (text === null) return
    try {
      mkdirSync(dir, { recursive: true })
      const bytes = Buffer.byteLength(text)
      rotateIfFull(bytes)
      appendFileSync(file, text)
      size += bytes
    } catch (err) {
      fail(err)
    }
  }

  const writeAt = (src: DiagSource, k: string, at: number, fields?: Record<string, unknown>): void => {
    if (closed) return
    try {
      // `up` for a line said earlier (a page batch) is moved back by its age.
      const age = Math.max(0, now() - at)
      queue.push(line(src, k, at, Math.max(0, uptime() - age), fields))
      if (queue.length > 2000) queue.splice(0, queue.length - 2000)
      schedule()
    } catch (err) {
      fail(err)
    }
  }

  return {
    dir,
    file,
    write: (src, k, fields) => writeAt(src, k, now(), fields),
    writeAt,
    verbose: () => verbose,
    setVerbose: (on) => {
      if (on === verbose) return
      verbose = on
      try {
        mkdirSync(dirname(stateFile), { recursive: true })
        writeFileSync(stateFile, JSON.stringify({ verbose }))
      } catch (err) {
        fail(err)
      }
      writeAt('main', 'verbose', now(), { on })
    },
    flush,
    flushSync,
    failed: () => anyFailed,
    close: () => {
      if (closed) return
      flushSync()
      closed = true
    }
  }
}

function readVerbose(stateFile: string): boolean {
  try {
    const v = JSON.parse(readFileSync(stateFile, 'utf8')) as { verbose?: unknown }
    return v?.verbose === true
  } catch {
    return false
  }
}

function fileSize(file: string): number {
  try {
    return statSync(file).size
  } catch {
    return 0
  }
}

/** The log of a host that gave no folder (`diagLogDir`): it writes nothing,
 *  so Prism is unchanged until it wires one. */
export const NULL_DIAG_LOG: DiagLog = {
  dir: '',
  file: '',
  write: () => {},
  writeAt: () => {},
  verbose: () => false,
  setVerbose: () => {},
  flush: () => Promise.resolve(),
  flushSync: () => {},
  failed: () => false,
  close: () => {}
}

let current: DiagLog = NULL_DIAG_LOG

/** The running app's log, for code deep in main (a shell spawned, a shell
 *  gone) that should not need one handed through every call. The null log
 *  until the host starts diagnostics. */
export const diagMain = (): DiagLog => current

/** Set by `startDiagnostics`; null puts the null log back. */
export function setDiagMain(log: DiagLog | null): void {
  current = log ?? NULL_DIAG_LOG
}
