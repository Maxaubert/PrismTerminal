import { spawn, type ChildProcess } from 'child_process'
import { SYS } from '@core/main/sysTools'

/**
 * THE APP'S ONE HELPER PROCESS (2026-10-17, owner: merge the helpers, "it's
 * mainly startup performance"). `hook/appHelper.ps1`, one Windows PowerShell
 * started with the app: the window's DWM attributes (dwmHelper) and the
 * dictation key's hook (globalDictKey) share it, where each used to start its
 * own PowerShell (about 65 MB each, MEASURED). Lines in, lines out; whoever
 * listens filters for its own. If it dies it is started again on the next
 * line sent, and the ones listening hear that it went.
 *
 * -File, not -EncodedCommand (#180): Defender holds an encoded command inside
 * CreateProcess on main's thread; a script file is the hook's MEASURED launch.
 */

let script: string | null = null
let cache: string | null = null
let proc: ChildProcess | null = null
const lineListeners = new Set<(line: string) => void>()
const exitListeners = new Set<() => void>()

/** Where the script is, and where it may cache its compiled code. */
export function configureAppHelper(path: string, cacheDir: string | null): void {
  script = path
  cache = cacheDir
}

/** Its command line: one per kind (#180), a script FILE, never -EncodedCommand. */
export function appHelperArgs(path: string, cacheDir: string | null): string[] {
  return ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path, ...(cacheDir ? [cacheDir] : [])]
}

function ensure(): ChildProcess | null {
  if (proc && proc.exitCode === null && !proc.killed) return proc
  if (!script) return null
  try {
    const p = spawn(SYS.powershell, appHelperArgs(script, cache), { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true })
    proc = p
    let buf = ''
    p.stdout?.setEncoding('utf8')
    p.stdout?.on('data', (d: string) => {
      buf += d
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim()
        buf = buf.slice(i + 1)
        if (line) for (const l of lineListeners) l(line)
      }
    })
    const gone = (): void => {
      if (proc !== p) return
      proc = null
      for (const l of exitListeners) l()
    }
    p.on('exit', gone)
    p.on('error', gone)
    // A write to a helper that has just died fails LATER, as an 'error' on
    // stdin that no try round write() catches; unheard, it is an uncaught
    // exception in main (code review 2026-09-24, #13).
    p.stdin?.on('error', gone)
    return p
  } catch {
    proc = null
    return null
  }
}

/** One line to the helper, starting it first if need be. */
export function appHelperSend(line: string): void {
  const p = ensure()
  try {
    p?.stdin?.write(line + '\n')
  } catch {
    proc = null
  }
}

export function onAppHelperLine(fn: (line: string) => void): () => void {
  lineListeners.add(fn)
  return () => lineListeners.delete(fn)
}

export function onAppHelperExit(fn: () => void): () => void {
  exitListeners.add(fn)
  return () => exitListeners.delete(fn)
}

/** Start it now, so the first call is not the start. */
export function warmAppHelper(): void {
  ensure()
}

export function stopAppHelper(): void {
  const p = proc
  proc = null
  try {
    p?.stdin?.end('quit\n')
  } catch {
    /* gone */
  }
  setTimeout(() => {
    try {
      p?.kill()
    } catch {
      /* gone */
    }
  }, 1000).unref()
}
