import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { createTermApi, subscribe } from '@core/preload/api'
import { createDictationApi } from '@core/preload/dictationApi'
import { createDiagApi } from '@core/preload/diagApi'
import type { BadgeImage, EdgeNear, LedgerTabReport, Restored, SavedTabs, UpdateInfo } from '@shared/types'
import type { WindowEdges } from '@shared/windowEdges'
import { APP_CH, E2E_CH } from '@shared/channels'

// The renderer's whole view of the machine. SANDBOXED: nothing here touches
// node, and the only electron modules used are ones a sandboxed preload is
// given (contextBridge, ipcRenderer, webUtils).

/** Subscribe to a main-to-renderer event (the core's `subscribe`). */
const on = <A extends unknown[]>(channel: string, cb: (...args: A) => void): (() => void) =>
  subscribe(ipcRenderer, channel, cb)

const api = {
  /* ----- the terminal ----- */

  /** The shells main detected; the only things term:spawn will ever launch. */
  // THE TERMINAL'S BRIDGE IS THE CORE'S (core/preload/api): the member names,
  // their signatures and the channel names exist once, for this app and Prism.
  ...createTermApi(ipcRenderer),
  // ...and so is dictation's (#13).
  ...createDictationApi(ipcRenderer),
  // ...and the diagnostics log's (#140).
  ...createDiagApi(ipcRenderer),
  /** The real path of a File from a drop (the sandbox hides `File.path`). */
  getDroppedPath: (file: File): string => webUtils.getPathForFile(file),
  /** A dropped path as the folder a tab would open in: a folder is itself, a
   *  file is the folder holding it, anything that does not exist is null. */
  folderOf: (path: string): Promise<string | null> => ipcRenderer.invoke(APP_CH.pathFolderOf, path),

  /* ----- tabs ----- */

  /** Choose a folder; null when cancelled. `from` is where the dialog opens. */
  pickFolder: (from?: string): Promise<string | null> =>
    ipcRenderer.invoke(APP_CH.dialogPickFolder, from),
  /** The saved strip, with folders that have gone dropped and each agent tab's
   *  resume resolved. The first call of a launch also carries the folders the
   *  app was launched with. Call it on mount. */
  restoreTabs: (): Promise<Restored> => ipcRenderer.invoke(APP_CH.tabsRestore),
  /** The saved strip exactly as saved, at once (#106): what the first frame
   *  draws while restoreTabs settles each tab. Synchronous, and only a draw:
   *  nothing is spawned from it. */
  peekTabs: (): SavedTabs => ipcRenderer.sendSync(APP_CH.tabsPeek) as SavedTabs,
  /** Report the strip so main can persist it. Ignored until restoreTabs has
   *  answered. */
  tabsChanged: (s: SavedTabs): void => ipcRenderer.send(APP_CH.tabsChanged, s),
  /** A folder handed over (the Explorer verb, a second launch): open a NEW tab
   *  there, whatever else is open. Only ever arrives after a restore answered. */
  onOpenFolder: (cb: (cwd: string) => void): (() => void) => on(APP_CH.openFolder, cb),

  /* ----- the catch-up report's ledger (2026-10-16) ----- */

  /** The tabs as the report names them: label, folder, agent and its state. */
  ledgerTabs: (tabs: LedgerTabReport[]): void => ipcRenderer.send(APP_CH.ledgerTabs, tabs),
  /** The tab in front changed: sent at once, it decides what counts as seen. */
  ledgerFront: (id: string | null): void => ipcRenderer.send(APP_CH.ledgerFront, id),
  /** Tab `id` hosts Claude session `session` (its hook said so, or a restore
   *  resumed it: `hook` false). */
  ledgerLink: (id: string, session: string, hook: boolean): void =>
    ipcRenderer.send(APP_CH.ledgerLink, id, session, hook),
  /** The owner typed into tab `id`: reading it. */
  ledgerEngage: (id: string): void => ipcRenderer.send(APP_CH.ledgerEngage, id),

  /* ----- closing ----- */

  /** An agent is WORKING (and the close confirmation is switched on): main
   *  then holds every close of the window until confirmClose. */
  setAgentBusy: (busy: boolean): void => ipcRenderer.send(APP_CH.agentBusy, busy),
  /** Main held a close (or a quit) because of setAgentBusy: ask the user. */
  onCloseRequest: (cb: () => void): (() => void) => on(APP_CH.closeRequest, cb),
  /** The user said go ahead. Saying nothing is the cancel. */
  confirmClose: (): void => ipcRenderer.send(APP_CH.closeConfirmed),

  /* ----- the Explorer verb ----- */

  /** What the REGISTRY says: true when the verb exists and points at this exe. */
  shellVerbStatus: (): Promise<boolean> => ipcRenderer.invoke(APP_CH.shellVerbStatus),
  /** False when it could not be written - always, in dev and under --e2e. */
  setShellVerb: (on: boolean): Promise<boolean> => ipcRenderer.invoke(APP_CH.shellVerbSet, on),

  /* ----- the window ----- */

  /** False on Windows 10, where the material does not exist. */
  acrylicSupported: (): Promise<boolean> => ipcRenderer.invoke(APP_CH.acrylicSupported),
  /** Resolves false when unsupported. Not persisted: say it at every launch. */
  setAcrylic: (on: boolean): Promise<boolean> => ipcRenderer.invoke(APP_CH.acrylicSet, on),
  /** The theme's SOLID ground as #rrggbb: the window's own colour whenever the
   *  material is off. Not persisted: say it at launch and on a theme change. */
  setWindowBg: (hex: string): void => ipcRenderer.send(APP_CH.windowBg, hex),
  /** How strongly the window draws its edges (#27), so the DWM border round it
   *  follows the lines inside it. Not persisted in main: say it at launch and
   *  on a change. Main reads anything it does not know as the default. */
  setWindowEdges: (edges: WindowEdges): void => ipcRenderer.send(APP_CH.windowEdges, edges),
  /** The taskbar badge (2026-09-28): a PNG data url and what it says, or null
   *  for none. Main sets it as the window's overlay icon. */
  setTaskbarBadge: (png: string | null, description: string, scale = 1): void =>
    ipcRenderer.send(APP_CH.windowBadge, png, description, scale),
  /** Ask main to watch the pointer at the window's top and left edges (#162),
   *  which the page cannot see over the resize border or a drag region. */
  watchEdges: (on: boolean): void => ipcRenderer.send(APP_CH.windowEdgeWatch, on),
  /** Where the pointer is against those edges, when that changes. */
  onEdgeNear: (cb: (near: EdgeNear) => void): (() => void) =>
    on(APP_CH.windowEdgeNear, cb),
  windowMinimize: (): void => ipcRenderer.send(APP_CH.windowMinimize),
  /** The window was minimised (true) or restored from it (false). */
  onMinimized: (cb: (minimized: boolean) => void): (() => void) => on(APP_CH.windowMinimized, cb),
  windowToggleMaximize: (): void => ipcRenderer.send(APP_CH.windowToggleMaximize),
  /** Closes the window, which quits (after the agent question, if one is due). */
  windowClose: (): void => ipcRenderer.send(APP_CH.windowClose),
  windowToggleFullscreen: (): void => ipcRenderer.send(APP_CH.windowFullscreenToggle),
  onFullscreen: (cb: (on: boolean) => void): (() => void) => on(APP_CH.windowFullscreen, cb),
  /** Quit outright. */
  quitApp: (): void => ipcRenderer.send(APP_CH.appQuit),
  appVersion: (): Promise<string> => ipcRenderer.invoke(APP_CH.appVersion),
  /** The user's own folder: where a new tab opens when no folder is chosen. */
  homeDir: (): Promise<string> => ipcRenderer.invoke(APP_CH.appHome),

  /* ----- the update check ----- */

  // These three are the core's UpdateBridge (core/renderer/lib/useUpdateFlow),
  // spelled the same in Prism's preload: the chip and its window are shared.
  /** A newer release exists, with its notes (mock: true for a preview:
   *  `--preview-update`, or any unpackaged build). */
  onUpdate: (cb: (info: UpdateInfo) => void): (() => void) => {
    const off = on(APP_CH.updateAvailable, cb)
    // Ask main to replay an offer that arrived before this renderer loaded.
    ipcRenderer.send(APP_CH.updateAnnounce)
    return off
  },
  /** Download percentage while an update installs. */
  onUpdateProgress: (cb: (pct: number) => void): (() => void) => on(APP_CH.updateProgress, cb),
  /** Download the named installer and hand off to it; the app quits under it.
   *  False when nothing was installed, which is always the case for a preview. */
  installUpdate: (url: string): Promise<boolean> => ipcRenderer.invoke(APP_CH.updateInstall, url),
  /** Stop the download `installUpdate` is running; it then resolves false. */
  cancelUpdate: (): void => ipcRenderer.send(APP_CH.updateCancel),

  /** The e2e's verbGuard: registry writes attempted this session. Must be 0. */
  e2eRegWrites: (): Promise<number> => ipcRenderer.invoke(E2E_CH.regWrites),
  /** The e2e's: the edges setting as MAIN heard it (the DWM border it drives is
   *  off under --e2e, so what main was told is what can be asserted). */
  e2eWindowEdges: (): Promise<string> => ipcRenderer.invoke(E2E_CH.windowEdges),
  /** What main last put on the taskbar: the badge's description, '' for none. */
  e2eTaskbarBadge: (): Promise<string> => ipcRenderer.invoke(E2E_CH.taskbarBadge),
  /** The e2e's: the badge picture main last set, its scale and its width in
   *  physical pixels (#108). */
  e2eTaskbarBadgeImage: (): Promise<BadgeImage | null> =>
    ipcRenderer.invoke(E2E_CH.taskbarBadgeImage),
  /** The e2e's: release checks sent and installs attempted this session. A
   *  preview, fake install included, must leave both at 0. */
  e2eUpdateCalls: (): Promise<{ checks: number; installs: number }> =>
    ipcRenderer.invoke(E2E_CH.updateCalls),
  /** The e2e's diagLog (#140): answers after 600 ms, past the 500 ms ipc-slow line. */
  e2eSlowIpc: (): Promise<boolean> => ipcRenderer.invoke(E2E_CH.slowIpc)
}

export type PrismApi = typeof api

contextBridge.exposeInMainWorld('prism', api)
