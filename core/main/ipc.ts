import { CH } from '../shared/channels'
import { validResume } from './agentResume'
import { pollAgentsSoon, startAgentPoll } from './agentPoll'
import { detectShells } from './shells'
import { cdTerm, killTerm, prewarmShell, resizeTerm, spawnTerm, writeTerm } from './terminal'

/**
 * The main half of the terminal's bridge, for both hosts.
 *
 * Everything that is the same in Prism and Prism Terminal is registered here:
 * the channels, the argument checks, the resume shape check, the agent poll.
 * What differs is WHERE A SHELL MAY START, and that is the host's to say:
 * Prism has a wall (a shell starts inside a folder a tab has open, or not at
 * all), Prism Terminal has none (a folder that has gone falls back to the
 * user's own). So the host hands in three small answers and keeps its policy.
 *
 * Like the rest of core/main this imports nothing from `electron`: the host
 * passes `ipcMain`, its clipboard and its opener, so the core never decides
 * how a host loads Electron and stays testable without it.
 */

/* The slice of Electron's `ipcMain` this needs. Its listener types are
 * written against Electron's own event classes, which the core does not
 * import, so the arguments are typed at each handler instead. */
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface IpcMainLike {
  handle(channel: string, listener: (event: any, ...args: any[]) => unknown): unknown
  on(channel: string, listener: (event: any, ...args: any[]) => void): unknown
}
/* eslint-enable @typescript-eslint/no-explicit-any */

interface ClipboardLike {
  availableFormats(): string[]
  readBuffer(format: string): Buffer
  readText(): string
  writeText(text: string): void
}

/** The most text the page may put on the clipboard in one write. */
export const CLIPBOARD_WRITE_MAX = 4000

export interface TermIpcDeps {
  ipcMain: IpcMainLike
  /** To the window that holds the terminals; a no-op while there is none. */
  send(channel: string, ...args: unknown[]): void
  clipboard: ClipboardLike
  /** Already restricted to http(s) by the caller of this function's contract:
   *  this module checks the scheme again before calling it. */
  openExternal(url: string): void
  /**
   * The folder a shell asked to start in, as the host allows it: the folder
   * itself, another folder to use instead, or null to refuse the spawn.
   */
  spawnDir(cwd: string): Promise<string | null>
  /** May a shell be warmed in this folder ahead of the click? */
  mayPrewarm(cwd: string): Promise<boolean>
  /** May a running shell be moved to this folder (Prism's reroot)? A host with
   *  no such feature answers false, and the channel does nothing. */
  mayCd(path: string): boolean
}

/** Registers every terminal channel and starts the agent poll. Returns the
 *  poll's stop function. */
export function registerTermIpc(deps: TermIpcDeps): () => void {
  const { ipcMain, send } = deps
  const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

  ipcMain.handle(CH.shells, () => detectShells())

  ipcMain.handle(CH.spawn, async (_e: unknown, id: unknown, cwd: unknown, shellId: unknown, resume: unknown) => {
    if (typeof id !== 'string' || !id || typeof cwd !== 'string') return false
    const dir = await deps.spawnDir(cwd)
    if (!dir) return false
    // The resume id came from main's own scan of the agent's session files,
    // but it crossed the renderer on the way back: shape-check it again before
    // it goes anywhere near a command line.
    const ok = await spawnTerm(id, dir, str(shellId), send, validResume(str(resume)))
    // Warm the agent-poll pipeline now: the first process query is the slow
    // one, and running it while the user is still typing their first command
    // means the mark can appear on the poll that actually matters.
    if (ok) pollAgentsSoon()
    return ok
  })

  ipcMain.on(CH.input, (_e: unknown, id: unknown, data: unknown) => {
    if (typeof id === 'string' && typeof data === 'string') writeTerm(id, data)
  })

  ipcMain.on(CH.resize, (_e: unknown, id: unknown, cols: unknown, rows: unknown) => {
    if (typeof id === 'string' && typeof cols === 'number' && typeof rows === 'number')
      resizeTerm(id, cols, rows)
  })

  ipcMain.on(CH.kill, (_e: unknown, id: unknown) => {
    if (typeof id === 'string') killTerm(id)
  })

  ipcMain.on(CH.prewarm, (_e: unknown, cwd: unknown, shellId: unknown) => {
    if (typeof cwd !== 'string') return
    void deps.mayPrewarm(cwd).then((ok) => {
      if (ok) void prewarmShell(cwd, str(shellId))
    })
  })

  // The host rerooted and its shell should follow. Main composes the line;
  // the renderer decided whether now was a safe moment to write it.
  ipcMain.on(CH.cd, (_e: unknown, id: unknown, path: unknown) => {
    if (typeof id === 'string' && typeof path === 'string' && deps.mayCd(path)) cdTerm(id, path)
  })

  // Synchronous, because the key handler that asks has to be. Copied FILES
  // arrive as a FileNameW buffer: a NUL-separated UTF-16 list.
  ipcMain.on(CH.clipboardRead, (e: { returnValue: unknown }) => {
    try {
      const formats = deps.clipboard.availableFormats()
      const files = formats.includes('FileNameW')
        ? deps.clipboard
            .readBuffer('FileNameW')
            .toString('ucs2')
            .replace(/\0+$/, '')
            .split('\0')
            .filter(Boolean)
        : []
      e.returnValue = {
        image: formats.some((f) => f.startsWith('image/')),
        text: deps.clipboard.readText(),
        files
      }
    } catch {
      e.returnValue = { image: false, text: '', files: [] }
    }
  })

  // The help panel's copy buttons (#12). Text only, and bounded: the longest
  // command in the catalogue is a few hundred characters, so anything near the
  // cap is not a command, and it is REFUSED rather than trimmed, since a
  // trimmed command is a different command.
  ipcMain.handle(CH.clipboardWrite, (_e: unknown, text: unknown) => {
    if (typeof text !== 'string' || text.length === 0 || text.length > CLIPBOARD_WRITE_MAX) return false
    try {
      deps.clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  })

  // A link clicked in the terminal. The page is never trusted with a scheme.
  ipcMain.on(CH.openExternal, (_e: unknown, url: unknown) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) deps.openExternal(url)
  })

  return startAgentPoll((id, has, kind) => send(CH.agent, id, has, kind))
}
