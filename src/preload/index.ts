import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { DetectedAgent, Restored, SavedTabs, ShellDef, UpdateInfo } from '@shared/types'

// The renderer's whole view of the machine. SANDBOXED: nothing here touches
// node, and the only electron modules used are ones a sandboxed preload is
// given (contextBridge, ipcRenderer, webUtils).

/** Subscribe to a main-to-renderer event; the function returned unsubscribes. */
function on<A extends unknown[]>(channel: string, cb: (...args: A) => void): () => void {
  const listener = (_: unknown, ...args: unknown[]): void => cb(...(args as A))
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  /* ----- the terminal ----- */

  /** The shells main detected; the only things term:spawn will ever launch. */
  termShells: (): Promise<ShellDef[]> => ipcRenderer.invoke('term:shells'),
  /** `cwd` that is not an existing folder spawns in the user's own folder.
   *  `resume` is what restoreTabs handed back for this tab, untouched. */
  termSpawn: (id: string, cwd: string, shellId?: string, resume?: string): Promise<boolean> =>
    ipcRenderer.invoke('term:spawn', id, cwd, shellId, resume),
  termInput: (id: string, data: string): void => ipcRenderer.send('term:input', id, data),
  termResize: (id: string, cols: number, rows: number): void =>
    ipcRenderer.send('term:resize', id, cols, rows),
  termKill: (id: string): void => ipcRenderer.send('term:kill', id),
  /** Start a shell in `cwd` ahead of the click. Best-effort. */
  termPrewarm: (cwd: string, shellId?: string): void =>
    ipcRenderer.send('term:prewarm', cwd, shellId),
  onTermData: (cb: (id: string, data: string) => void): (() => void) => on('term:data', cb),
  /** An AI CLI (Claude Code, codex...) appeared or left a session's shell. */
  onTermAgent: (cb: (id: string, has: boolean, kind: DetectedAgent | null) => void): (() => void) =>
    on('term:agent', cb),
  /** The shell ended by itself (`exit`); a shell main was told to kill says nothing. */
  onTermExit: (cb: (id: string) => void): (() => void) => on('term:exit', cb),
  /**
   * What the clipboard holds RIGHT NOW, for the terminal's paste rule. An
   * image forwards the ^V key (a clipboard-aware TUI like Claude Code reads
   * the image itself); text becomes a bracketed paste; copied files paste as
   * quoted paths. The decision itself is pure and lives in lib/termPaste.
   * Synchronous, as the key handler that calls it has to be; main does the
   * reading, since a sandboxed preload has no clipboard module.
   */
  readClipboard: (): { image: boolean; text: string; files: string[] } =>
    ipcRenderer.sendSync('clipboard:read') as { image: boolean; text: string; files: string[] },
  /** The web-links addon's click-through: external URLs go to the OS browser. */
  openExternal: (url: string): void => {
    if (/^https?:/i.test(url)) ipcRenderer.send('shell:open-external', url)
  },
  /** The real path of a File from a drop (the sandbox hides `File.path`). */
  getDroppedPath: (file: File): string => webUtils.getPathForFile(file),
  /** A dropped path as the folder a tab would open in: a folder is itself, a
   *  file is the folder holding it, anything that does not exist is null. */
  folderOf: (path: string): Promise<string | null> => ipcRenderer.invoke('path:folder-of', path),
  /** Open a folder in File Explorer. Main ignores anything that is not one. */
  showInExplorer: (path: string): void => ipcRenderer.send('shell:show-folder', path),

  /* ----- tabs ----- */

  /** Choose a folder; null when cancelled. `from` is where the dialog opens. */
  pickFolder: (from?: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:pick-folder', from),
  /** The saved strip, with folders that have gone dropped and each agent tab's
   *  resume resolved. The first call of a launch also carries the folders the
   *  app was launched with. Call it on mount. */
  restoreTabs: (): Promise<Restored> => ipcRenderer.invoke('tabs:restore'),
  /** Report the strip so main can persist it. Ignored until restoreTabs has
   *  answered. */
  tabsChanged: (s: SavedTabs): void => ipcRenderer.send('tabs:changed', s),
  /** A folder handed over (the Explorer verb, a second launch): open a NEW tab
   *  there, whatever else is open. Only ever arrives after a restore answered. */
  onOpenFolder: (cb: (cwd: string) => void): (() => void) => on('open:folder', cb),

  /* ----- closing ----- */

  /** An agent is WORKING (and the close confirmation is switched on): main
   *  then holds every close of the window until confirmClose. */
  setAgentBusy: (busy: boolean): void => ipcRenderer.send('agent:busy', busy),
  /** Main held a close (or a quit) because of setAgentBusy: ask the user. */
  onCloseRequest: (cb: () => void): (() => void) => on('close:request', cb),
  /** The user said go ahead. Saying nothing is the cancel. */
  confirmClose: (): void => ipcRenderer.send('close:confirmed'),

  /* ----- the Explorer verb ----- */

  /** What the REGISTRY says: true when the verb exists and points at this exe. */
  shellVerbStatus: (): Promise<boolean> => ipcRenderer.invoke('shell:verb-status'),
  /** False when it could not be written - always, in dev and under --e2e. */
  setShellVerb: (on: boolean): Promise<boolean> => ipcRenderer.invoke('shell:verb-set', on),

  /* ----- the window ----- */

  /** False on Windows 10, where the material does not exist. */
  acrylicSupported: (): Promise<boolean> => ipcRenderer.invoke('acrylic:supported'),
  /** Resolves false when unsupported. Not persisted: say it at every launch. */
  setAcrylic: (on: boolean): Promise<boolean> => ipcRenderer.invoke('acrylic:set', on),
  /** The theme's SOLID ground as #rrggbb: the window's own colour whenever the
   *  material is off. Not persisted: say it at launch and on a theme change. */
  setWindowBg: (hex: string): void => ipcRenderer.send('window:bg', hex),
  windowMinimize: (): void => ipcRenderer.send('window:minimize'),
  windowToggleMaximize: (): void => ipcRenderer.send('window:toggle-maximize'),
  /** Closes the window, which quits (after the agent question, if one is due). */
  windowClose: (): void => ipcRenderer.send('window:close'),
  windowToggleFullscreen: (): void => ipcRenderer.send('window:fullscreen-toggle'),
  onFullscreen: (cb: (on: boolean) => void): (() => void) => on('window:fullscreen', cb),
  /** Quit outright. */
  quitApp: (): void => ipcRenderer.send('app:quit'),
  appVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),

  /* ----- the update check ----- */

  /** A newer release exists (mock: true in unpackaged builds, as a preview). */
  onUpdate: (cb: (info: UpdateInfo) => void): (() => void) => {
    const off = on('update:available', cb)
    // Ask main to replay an offer that arrived before this renderer loaded.
    ipcRenderer.send('update:announce')
    return off
  },
  /** Download percentage while an update installs. */
  onUpdateProgress: (cb: (pct: number) => void): (() => void) => on('update:progress', cb),
  /** Download the named installer and hand off to it; the app quits under it. */
  installUpdate: (url: string): Promise<boolean> => ipcRenderer.invoke('update:install', url),

  /** The e2e's verbGuard: registry writes attempted this session. Must be 0. */
  e2eRegWrites: (): Promise<number> => ipcRenderer.invoke('e2e:reg-writes')
}

export type PrismApi = typeof api

contextBridge.exposeInMainWorld('prism', api)
