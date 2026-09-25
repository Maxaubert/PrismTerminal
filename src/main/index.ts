import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, session, shell } from 'electron'
import pkg from '../../package.json'
import { existsSync } from 'fs'
import { stat } from 'fs/promises'
import { homedir } from 'os'
import { dirname, join } from 'path'
import type { Restored, SavedTabs, UpdateInfo } from '@shared/types'
import { claudeSessionsAsync } from '@core/main/agentResume'
import { registerTermIpc } from '@core/main/ipc'
import { registerDictationIpc } from '@core/main/dictationIpc'
import { planRestore } from './planRestore'
import { foldersFromArgv } from './argv'
import { acrylicOk, createMaterial } from './material'
import { stopDwmHelper, warmDwmHelper } from './dwmHelper'
import { createWindowEdge } from './windowEdge'
import { DEFAULT_WINDOW_EDGES, validWindowEdges, type WindowEdges } from '@shared/windowEdges'
import { detectShells } from '@core/main/shells'
import { createTabsStore } from './tabsStore'
import { killAll } from '@core/main/terminal'
import { installUpdate, updateCalls, watchForUpdates } from './update'
import { previewUpdate, runPreviewInstall, wantsPreview } from '@core/main/updatePreview'
import { createVerbSwitch } from './verbSwitch'
import { readWindowState, watchWindowState } from './windowState'

// Prism Terminal's main process: the window, its lifecycle and the
// IPC wiring. Everything with rules of its own lives in its own file (the pty,
// the agent poll, the resume lookup, the tab store, the verb, the update
// check), so what is left here is wiring.

/**
 * The e2e's window never takes the foreground (2026-08-28).
 *
 * Electron has no headless mode, so the suite parks a real window offscreen -
 * but every launch still ACTIVATED it, and a suite that launches thirty times
 * yanked the caret out of whatever the machine's owner was typing. Playwright
 * drives the page over CDP, which needs no OS focus at all, so in this mode
 * the window is created unfocusable and shown inactive.
 */
const E2E = process.argv.includes('--e2e')

/**
 * The folder the app was launched in, kept for the command line's relative
 * paths (#16), and then LEFT (code review 2026-09-24, #3): "Open terminal
 * here" starts the app with the clicked folder as its current directory, and
 * Windows searches the current directory before PATH for a bare program name.
 * Every tool is named by its full path now (core/main/sysTools); leaving the
 * folder is the second belt, and the user's own folder is always there.
 */
const LAUNCH_CWD = process.cwd()
try {
  process.chdir(homedir())
} catch {
  /* the launch folder stays: every tool is named by its full path anyway */
}

/**
 * A WEB LINK LEAVES THE APP HERE, AND NEVER UNDER --e2e (#64; owner,
 * 2026-09-24: "make sure that future runs don't do that in my real browser").
 * The e2e prints and clicks https://example.com links, and every run opened
 * them as tabs in the owner's own browser. Under --e2e the link is RECORDED on
 * `globalThis.__e2eOpenedLinks` for the e2e to read, and nothing outside the
 * app is started.
 */
const e2eOpenedLinks: string[] = []
if (E2E) Object.assign(globalThis, { __e2eOpenedLinks: e2eOpenedLinks })
function openLink(url: string): void {
  if (E2E) {
    e2eOpenedLinks.push(url)
    return
  }
  void shell.openExternal(url)
}

// userData is `%APPDATA%\PrismTerminal`, whatever the product name's spacing
// would have made it. The e2e (and anyone else) passing Chromium's own
// --user-data-dir keeps the profile they asked for: Electron has already
// pointed userData there. Set BEFORE the single-instance lock, which is taken
// per profile - that is what lets the suite run beside the installed app.
if (!app.commandLine.hasSwitch('user-data-dir'))
  app.setPath('userData', join(app.getPath('appData'), 'PrismTerminal'))

// THE E2E SPEAKS THROUGH A FAKE MICROPHONE (#13): Chromium plays a WAV into
// getUserMedia, so the dictation scenario runs the REAL capture, the REAL
// engine and the REAL paste with nobody in the room (MEASURED under Electron:
// the fake device delivers the file's audio, peak 0.78). Only under --e2e.
if (E2E && process.env.PT_E2E_MIC) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream')
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream')
  app.commandLine.appendSwitch('use-file-for-fake-audio-capture', process.env.PT_E2E_MIC)
}

/**
 * Two things Windows needs told before the first window exists (2026-08-30).
 *
 * The AppUserModelID is how Windows decides that a running process and a
 * pinned shortcut are the SAME application. Told nothing, Electron invents one
 * from the executable path, the installed shortcut carries the one
 * electron-builder wrote from `appId`, and launching from the pin gave two
 * taskbar buttons for one app. It has to match the shortcut's, and it has to
 * be set before any window is created.
 *
 * The stock application menu is Electron's, not ours: an invisible menu bar
 * whose accelerators (Ctrl+R reload, Ctrl+W close, Ctrl+0 and Ctrl+plus/minus
 * zoom) were live over a window that draws no menu and hands those keys to
 * the shell. Removing it costs nothing the app uses; an unpackaged build gets
 * F12 for devtools instead (see createWindow).
 */
app.setAppUserModelId('com.prism.terminal')
Menu.setApplicationMenu(null)

let mainWindow: BrowserWindow | null = null
// Acrylic and the window's solid ground; the rules are material.ts's.
const material = createMaterial(() => mainWindow)
// How strongly the user wants edges drawn (#27). The choice lives in the page's
// localStorage, so main is TOLD it (`window:edges`, at launch and on a change)
// and holds the default, the border as it always was, until it has been.
let windowEdges: WindowEdges = DEFAULT_WINDOW_EDGES
// The line round a floating window, a hairline unless the setting above says
// otherwise; the rules are windowEdge.ts's.
// Not under --e2e: a parked window has no edge anyone sees, and the helper is a
// PowerShell that compiles a P/Invoke, once per launch, thirty launches a run.
const edge = E2E
  ? { apply: (): void => {} }
  : createWindowEdge(
      () => mainWindow,
      () => material.bg(),
      () => windowEdges
    )

/** Every event to the renderer goes through here: a pty can outlive the
 *  webContents it reports to by a moment, and sending into a destroyed one
 *  throws. */
function send(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, ...args)
}

const isDir = (p: unknown): Promise<boolean> =>
  typeof p === 'string' && p !== ''
    ? stat(p).then(
        (s) => s.isDirectory(),
        () => false
      )
    : Promise.resolve(false)

/* ------------------------------------------------------------------ *
 * The lifecycle.
 *
 * CLOSING THE WINDOW QUITS (owner, 2026-09-18, after using the first build,
 * which hid the window and stayed resident: "the app should actually close
 * when you close it"). Nothing is lost by it: the tab list is flushed on the
 * way out, and an agent tab resumes from tabs.json plus the agent's own
 * session files at the next launch, which needs no process kept alive.
 * Closing the LAST TAB does not close the window; it lands on the start
 * screen. While the app runs it is still single-instance: a second launch
 * hands its folder over and ends.
 * ------------------------------------------------------------------ */
let quitting = false // app.quit() is under way
/** Kills dictation's children (the speech server, the media helper). Set by wireIpc. */
let stopDictation: () => void = () => {}
let quitWanted = false // a quit the close question interrupted; confirm resumes it
let agentBusy = false // mirrored from the renderer: an agent is WORKING
let closeAgreed = false // the renderer's "go ahead" for the close in flight
/**
 * The renderer has no tab list worth saving: it has not restored yet (launch,
 * a reload). Two things follow.
 * Its `tabs:changed` reports are IGNORED - an emptied list would otherwise
 * overwrite tabs.json with nothing, which is every tab lost at the next launch.
 * And folders handed over are QUEUED, to go out after the restore has
 * answered: sent before it, the restored list would land on top of them.
 */
let awaitingRestore = true
let firstRestore = true
let pendingFolders: string[] = []

const tabs = createTabsStore(join(app.getPath('userData'), 'tabs.json'))

/** The newest update offer, remembered so a page that loads after it was made
 *  still hears about it (`update:announce`), and so `update:install` can tell a
 *  preview from a release by what main ITSELF offered. */
let pendingUpdate: UpdateInfo | null = null
/** The install that is running, if one is: what `update:cancel` aborts. */
let updateRun: AbortController | null = null
function offerUpdate(info: UpdateInfo): void {
  pendingUpdate = info
  send('update:available', info)
}

/** A folder handed over by the verb, argv or a second launch: ALWAYS a new tab,
 *  even if another tab already sits in that folder. */
function handFolders(folders: string[]): void {
  if (awaitingRestore) pendingFolders.push(...folders)
  else for (const f of folders) send('open:folder', f)
}

/**
 * Bring the window genuinely forward (2026-08-28).
 *
 * `show()` and `focus()` ask, and Windows' foreground lock is allowed to
 * refuse: a process that did not have the foreground gets its window drawn
 * but not activated, and then the user's FIRST CLICK is spent activating it
 * instead of pressing what it landed on. That is what "I clicked the tab and
 * nothing happened, then a second later it worked" is.
 *
 * The brief always-on-top is the documented way past the lock, and it is
 * dropped in the same breath, so the window does not stay above others.
 */
function raise(win: BrowserWindow): void {
  if (win.isMinimized()) win.restore()
  win.show()
  const wasOnTop = win.isAlwaysOnTop()
  win.setAlwaysOnTop(true)
  win.focus()
  win.setAlwaysOnTop(wasOnTop)
}

/** Put the window on screen. Under --e2e it is shown INACTIVE and never
 *  raised, whichever route asked: the suite must not take the foreground. */
function reveal(win: BrowserWindow): void {
  if (E2E) win.showInactive()
  else raise(win)
}

function createWindow(): void {
  const remembered = readWindowState()
  const win = new BrowserWindow({
    width: remembered.width,
    height: remembered.height,
    x: remembered.x,
    y: remembered.y,
    minWidth: 560,
    minHeight: 400,
    show: false,
    ...(E2E ? { focusable: false, skipTaskbar: true } : {}),
    // Not `frame: false`: DWM refuses to composite acrylic behind a frameless
    // window, which is why a translucent style came out as a hole in the
    // screen. 'hidden' drops the caption but keeps the frame DWM needs, and
    // the custom title bar still draws over it.
    titleBarStyle: 'hidden',
    // Explicit, rather than inherited from the executable: Windows caches the
    // exe's icon per path, so a new build can keep showing the old one in the
    // taskbar. A window icon set here is not cached by anything.
    icon: app.isPackaged
      ? join(process.resourcesPath, 'icon.ico')
      : join(__dirname, '../../build/icon.ico'),
    backgroundColor: material.bg(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // The preload needs nothing a sandbox withholds: the clipboard read
      // goes through main, and webUtils is one of the modules a sandboxed
      // preload is allowed.
      sandbox: true,
      // Never throttled. Chromium takes a window nobody can see down to about
      // a timer tick a second, and the agent indicator's clocks (the silence
      // that ends a run, the working time the close question names) run in
      // the page: a minimised terminal is exactly when they are relied on.
      backgroundThrottling: false
    }
  })
  mainWindow = win
  win.on('ready-to-show', () => {
    // Maximised is restored after the window exists rather than at construction:
    // a window created maximised has no sensible un-maximised size to go back to.
    if (remembered.maximised) win.maximize()
    reveal(win)
    material.settled() // a window made after the prefs were said still wears them
    // The helper compiles its one P/Invoke now, so the first edge change is a
    // pipe write and not a two-second wait.
    if (!E2E) warmDwmHelper()
    edge.apply()
  })
  win.on('maximize', () => edge.apply())
  win.on('unmaximize', () => edge.apply())
  watchWindowState(win)
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  // Every route out of the window ends here: the title bar's X, Alt+F4, the
  // taskbar, the last tab closing, a quit. An agent that is WORKING stops all
  // of them until the user answers; the renderer asks (it knows which agent
  // and for how long) and answers `close:confirmed`, or says nothing.
  win.on('close', (e) => {
    if (agentBusy && !closeAgreed) {
      e.preventDefault()
      // The veto cancels an app.quit() too. Remember that this was one, so the
      // go-ahead finishes the quit, and drop the flag, so that "Cancel" leaves
      // an ordinary window behind.
      quitWanted = quitting
      quitting = false
      // A minimised or background window can't show its own dialog usefully.
      if (!E2E) raise(win)
      send('close:request')
      return
    }
    closeAgreed = false
    tabs.flush()
    killAll()
    agentBusy = false
    // Not prevented: the window closes, and window-all-closed ends the app.
  })
  // Windows is shutting down or logging off: no before-quit is coming.
  win.on('session-end', () => tabs.flush())

  win.on('enter-full-screen', () => {
    send('window:fullscreen', true)
    material.settled()
    edge.apply()
  })
  win.on('leave-full-screen', () => {
    send('window:fullscreen', false)
    material.settled()
    edge.apply()
  })

  /**
   * A window the page tried to open. Denied, and handed to the OS only when
   * it is a web address (2026-08-31). A terminal prints whatever a program
   * writes into it, so "the page asked for it" is not a reason to trust it.
   * Same test as the `shell:open-external` handler, and for the same reason.
   */
  win.webContents.setWindowOpenHandler((d) => {
    if (/^https?:\/\//i.test(d.url)) openLink(d.url)
    return { action: 'deny' }
  })
  // A page cannot navigate the window away from the app either: the renderer
  // is the app's own UI and nothing in it is a browser.
  win.webContents.on('will-navigate', (e, url) => {
    const dev = process.env['ELECTRON_RENDERER_URL']
    if (dev && url.startsWith(dev)) return
    if (url.startsWith('file://')) return
    e.preventDefault()
    if (/^https?:\/\//i.test(url)) openLink(url)
  })
  // A RELOAD (dev, or a renderer that crashed and came back) is a page with no
  // tab list over shells it has never heard of: they are orphans, and the page
  // is about to restore from tabs.json like any other launch.
  let loaded = false
  win.webContents.on('did-navigate', () => {
    if (loaded) {
      awaitingRestore = true
      killAll()
    }
    loaded = true
  })
  // With the application menu gone there is no accelerator for devtools.
  if (!app.isPackaged)
    win.webContents.on('before-input-event', (_e, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools()
    })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) void win.loadURL(devUrl)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

/* ------------------------------------------------------------------ *
 * IPC. Registered once, at ready; every handler reads `mainWindow` live.
 * ------------------------------------------------------------------ */
function wireIpc(): void {
  /* ----- tabs ----- */

  // What the strip comes back as. The FIRST answer of the process also carries
  // the folders this launch was handed (the verb, argv), as plain tabs with the
  // last one in front; later ones (the window shown again, a reload) are the
  // saved tabs alone, and folders that arrived meanwhile follow as events.
  ipcMain.handle('tabs:restore', async (): Promise<Restored> => {
    const saved = tabs.load()
    // Looked up off main's thread, and only then handed to the pure planner: a
    // saved folder on a drive that has gone can take seconds to say no.
    const present = new Set<string>()
    await Promise.all(
      saved.tabs.map(async (t) => {
        if (await isDir(t.cwd)) present.add(t.cwd)
      })
    )
    // Each claude tab's sessions, looked up OFF main's thread first (a folder
    // can hold thousands), then handed to the pure planner as a lookup.
    const sessions = new Map<string, string[]>()
    await Promise.all(
      [...new Set(saved.tabs.filter((t) => t.agent === 'claude' && present.has(t.cwd)).map((t) => t.cwd))].map(
        async (cwd) => sessions.set(cwd, await claudeSessionsAsync(cwd))
      )
    )
    const plan = planRestore(saved, (p) => present.has(p), (cwd) => sessions.get(cwd) ?? [])
    if (firstRestore) {
      firstRestore = false
      const launched = foldersFromArgv(process.argv, undefined, LAUNCH_CWD)
      for (const cwd of launched) plan.tabs.push({ cwd })
      if (launched.length) plan.active = plan.tabs.length - 1
    }
    awaitingRestore = false
    const queued = pendingFolders
    pendingFolders = []
    // AFTER the answer: the reply resolves the renderer's promise first, so
    // these land on the restored list rather than under it.
    if (queued.length) setTimeout(() => queued.forEach((f) => send('open:folder', f)), 0)
    return plan
  })
  // The renderer owns the tab list; main persists the last report.
  ipcMain.on('tabs:changed', (_e, state: SavedTabs) => {
    if (awaitingRestore || !state || !Array.isArray(state.tabs)) return
    tabs.save(state)
  })

  /* ----- the terminal ----- */

  // Sessions are keyed by renderer-assigned ids, like tabs. The checks on
  // spawn: the shell is one main detected (spawnTerm's own), the folder exists
  // (else the user's own folder, not a refusal: a shell somewhere beats none),
  // and the resume is a session id's shape.
  // THE TERMINAL'S BRIDGE IS THE CORE'S (core/main/ipc): the channels, the
  // argument checks, the resume shape check, the clipboard read, the link
  // opener and the agent poll are registered there, once, for this app and
  // for Prism. What is this app's own is where a shell may start.
  registerTermIpc({
    ipcMain,
    send,
    clipboard,
    openExternal: openLink,
    // No wall here: a folder that has gone falls back to the user's own.
    spawnDir: async (cwd) => ((await isDir(cwd)) ? cwd : homedir()),
    // Not while the strip is still being rebuilt from tabs.json.
    mayPrewarm: async (cwd) => !awaitingRestore && (await isDir(cwd)),
    // Prism's reroot. This app never moves a shell it did not start there.
    mayCd: () => false
  })
  // DICTATION (#13) is the core's too. What is this app's own: where ITS
  // installer put the CPU engine, the folder it shares with Prism, and the GPU
  // question, answered by Electron's own adapter list (no process spawned).
  stopDictation = registerDictationIpc({
    ipcMain,
    send,
    cpuEngineDir: () => {
      const dir =
        process.env.PT_WHISPER_DIR ??
        (app.isPackaged ? join(process.resourcesPath, 'bin', 'whisper') : join(app.getAppPath(), 'vendor', 'whisper'))
      return existsSync(join(dir, 'whisper-server.exe')) ? dir : null
    },
    sharedRoot:
      process.env.PT_DICTATION_ROOT ??
      join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'PrismDictation'),
    hasNvidia: async () => {
      if (process.env.PT_E2E_NVIDIA) return process.env.PT_E2E_NVIDIA === '1'
      const info = (await app.getGPUInfo('basic')) as { gpuDevice?: Array<{ vendorId?: number }> }
      return (info.gpuDevice ?? []).some((d) => d.vendorId === 0x10de)
    }
  })
  // A tab's "Show in File Explorer": a folder that exists, and nothing else.
  ipcMain.on('shell:show-folder', (_e, p: string) => {
    void isDir(p).then((ok) => {
      // Never under --e2e (#64): a test run opens no Explorer window.
      if (ok && !E2E) void shell.openPath(p)
    })
  })
  // Something dropped on the window: a folder is itself, a file means the
  // folder it is in, anything else is nothing. The renderer cannot stat.
  ipcMain.handle('path:folder-of', async (_e, p: string): Promise<string | null> => {
    if (typeof p !== 'string' || !p) return null
    if (await isDir(p)) return p
    const parent = dirname(p)
    return (await stat(p).catch(() => null)) && (await isDir(parent)) ? parent : null
  })

  // Choose a folder: the new-tab question and the Settings picker. Parented to
  // the window - unparented, Windows makes the dialog modeless and a fullscreen
  // window never shows it at all. The e2e answers it from the environment, a
  // native dialog being the one thing CDP cannot drive.
  ipcMain.handle('dialog:pick-folder', async (_e, from?: string): Promise<string | null> => {
    if (E2E) return process.env['PT_E2E_PICK'] || null
    const opts: Electron.OpenDialogOptions = {
      properties: ['openDirectory'],
      ...((await isDir(from)) ? { defaultPath: from } : {})
    }
    const r = mainWindow
      ? await dialog.showOpenDialog(mainWindow, opts)
      : await dialog.showOpenDialog(opts)
    return r.canceled || !r.filePaths.length ? null : r.filePaths[0]
  })

  /* ----- the Explorer verb ----- */

  const verb = createVerbSwitch({
    allowed: app.isPackaged && !E2E,
    exe: () => app.getPath('exe'),
    offMarker: () => join(app.getPath('userData'), 'shell-verb-off')
  })
  ipcMain.handle('shell:verb-status', () => verb.status())
  ipcMain.handle('shell:verb-set', (_e, on: boolean) => verb.set(on))
  // The e2e's verbGuard reads this after pressing the switch: it must stay 0.
  ipcMain.handle('e2e:reg-writes', () => verb.writes())
  void verb.reconcile()

  /* ----- the update check ----- */

  // The offer itself (`offerUpdate`, `pendingUpdate`) is up beside the
  // lifecycle, because a SECOND launch can ask for the preview too.
  //
  // A PREVIEW (#28; owner, 2026-09-19: "I would want to see how the Update
  // banner looks... make like a fake update"): `--preview-update`, in the
  // installed app as well, announces the core's fake offer at once and the real
  // watcher is never started, so the network is never touched. An unpackaged
  // build previews without being asked, which is what the inert mock chip used
  // to be for. Under --e2e NEITHER happens unless the flag is there: the suite
  // measures a title bar with no chip in it, and must never ask GitHub.
  if (wantsPreview(process.argv) || (!app.isPackaged && !E2E)) offerUpdate(previewUpdate(pkg.version))
  else if (!E2E) watchForUpdates(offerUpdate)
  // The e2e's updateGuard and updateNotes: a REAL-shaped offer (not a mock, so
  // Install goes through the agent question) whose url `installUpdate` refuses
  // before it sends anything, because it is not one of this repo's release
  // assets. That is what lets the question and the failure line be driven with
  // no network. The notes are the scenario's to choose: one hands over a
  // hostile body, to prove in the real page that none of it is rendered.
  else if (process.env.PT_E2E_UPDATE_OFFER)
    offerUpdate({
      version: '99.0.0',
      url: process.env.PT_E2E_UPDATE_OFFER,
      notes: process.env.PT_E2E_UPDATE_NOTES ?? ''
    })
  ipcMain.on('update:announce', (e) => {
    if (pendingUpdate) e.sender.send('update:available', pendingUpdate)
  })
  // Installing quits the app so NSIS can replace it, and a working agent
  // VETOES a quit (the close flow above) - the installer would then run over a
  // live exe while a dialog waited. The renderer settles that question before
  // it asks for the install (App's install guard), so the quit is pre-answered
  // here.
  ipcMain.handle('update:install', async (_e, url: string) => {
    // WHAT IS ON OFFER decides, never what the page sent: while the offer is a
    // preview there is nothing this handler will download, whatever url it is
    // handed. The fake runs the chip's progress and answers false, "nothing
    // was installed", which is true. No fetch, no file, no installer, no quit,
    // and the close question is NOT pre-answered.
    // ONE AT A TIME, and the controller is this run's own: `update:cancel`
    // aborts whatever is current, and a second Install cannot orphan the first
    // one's controller (the page refuses a second anyway; this does not rely
    // on it).
    if (updateRun) return false
    const run = new AbortController()
    updateRun = run
    try {
      if (pendingUpdate?.mock)
        return await runPreviewInstall((pct) => send('update:progress', pct), {
          cancelled: () => run.signal.aborted
        })
      // WHAT MAIN OFFERED is installed, never a url the page sent (code review
      // 2026-09-24, #15): a page that could name any past release asset could
      // downgrade the app silently. No offer, nothing to install. The page's
      // argument is only checked to be the same offer it was shown.
      const offer = pendingUpdate
      if (!offer || typeof url !== 'string' || url !== offer.url) return false
      // The close question is pre-answered at the QUIT, not now (#14): a
      // download takes minutes, and an agent that starts working meanwhile
      // must still be asked about before a close ends it.
      return await installUpdate(offer.url, (pct) => send('update:progress', pct), run.signal, () => {
        closeAgreed = true
      })
    } finally {
      updateRun = null
    }
  })
  // The update window's Cancel (#32). It names nothing: there is one download
  // at most, and the page has no say in which.
  ipcMain.on('update:cancel', () => updateRun?.abort())
  // The e2e's updateWindow reads this after a whole preview, fake install
  // included: release checks sent and installs attempted. Both must be 0.
  if (E2E) ipcMain.handle('e2e:update-calls', () => updateCalls())
  // package.json's, not app.getVersion(): unpackaged, that one answers with
  // ELECTRON's version, and Settings then shows 43.x as the app's own.
  ipcMain.handle('app:version', () => pkg.version)
  // Where a new tab opens when Settings names no folder: the user's own.
  ipcMain.handle('app:home', () => homedir())

  /* ----- the window ----- */

  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:toggle-maximize', () =>
    mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize()
  )
  // The X: the same path as Alt+F4.
  ipcMain.on('window:close', () => mainWindow?.close())
  ipcMain.on('agent:busy', (_e, busy: boolean) => {
    agentBusy = busy === true
  })
  ipcMain.on('close:confirmed', () => {
    closeAgreed = true
    if (quitWanted) {
      quitWanted = false
      app.quit()
    } else mainWindow?.close()
  })
  // A quit asked for from the page (the e2e ends its runs with it).
  ipcMain.on('app:quit', () => {
    quitting = true
    app.quit()
  })
  // The OS's own fullscreen: a terminal has no film to flash around, so none of
  // the borderless machinery a viewer needs. Opaque first, then the OS is asked.
  ipcMain.on('window:fullscreen-toggle', () => {
    const win = mainWindow
    if (!win) return
    const on = !win.isFullScreen()
    if (on) material.beforeFullscreen()
    win.setFullScreen(on)
  })

  ipcMain.handle('acrylic:supported', () => acrylicOk())
  // False = the material does not exist here (Windows 10).
  ipcMain.handle('acrylic:set', (_e, on: boolean): boolean => {
    const ok = material.setAcrylic(on)
    edge.apply() // Chromium rewrites the DWM attributes when the backdrop changes
    return ok
  })
  // The theme's solid ground: the window's colour when the material is off,
  // and what shows for the frame before the page paints after a resize.
  ipcMain.on('window:bg', (_e, hex: string) => {
    material.setBg(hex)
    edge.apply() // the edge is a step off the ground, so it follows the theme
  })
  // The edges setting (#27). Validated, never trusted: anything that is not one
  // of the four words is the default. Not persisted here: the page says it at
  // every launch, as it says the ground.
  ipcMain.on('window:edges', (_e, edges: unknown) => {
    windowEdges = validWindowEdges(edges)
    edge.apply()
  })
  // The DWM border itself is off under --e2e, so the suite asks what main HEARD.
  if (E2E) ipcMain.handle('e2e:window-edges', () => windowEdges)
}

// Single instance: a second launch (the verb, a shortcut, a command line)
// forwards its folders to the running process and ends, instead of starting a
// rival.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv, workingDirectory) => {
    // Resolved against the folder the second launch was typed in (#16).
    const folders = foldersFromArgv(argv, undefined, workingDirectory)
    // Before ready there is no window to show yet: the first restore takes them.
    if (!app.isReady()) {
      pendingFolders.push(...folders)
      return
    }
    if (!mainWindow) {
      // Nothing should destroy the window short of a quit, but a process with
      // no window and no way to get one would be a launch that does nothing.
      awaitingRestore = true
      pendingFolders.push(...folders)
      createWindow()
      return
    }
    // `PrismTerminal.exe --preview-update` while the app is already running is
    // the likely way the flag gets used, and that launch ends here. Only when
    // nothing is on offer: a preview never replaces a real update.
    if (wantsPreview(argv) && !pendingUpdate) offerUpdate(previewUpdate(pkg.version))
    // The handoff is the case the foreground lock bites hardest: the app has
    // been sitting in the background for an hour, and the folder it is handed
    // must arrive in a window that is actually in front of you.
    reveal(mainWindow)
    handFolders(folders)
  })

  app.on('before-quit', () => {
    quitting = true
  })
  app.on('window-all-closed', () => app.quit())
  // Every shell dies with the app; a pty with no window is an orphan.
  app.on('will-quit', () => {
    stopDwmHelper()
    stopDictation()
    killAll()
    tabs.flush()
  })

  app.whenReady().then(() => {
    // WHAT THE PAGE MAY ASK CHROMIUM FOR, as a closed list. Electron's default
    // is to grant everything; with dictation (#13) the page now asks for the
    // MICROPHONE, so the answer is written down: audio capture for this app's
    // own window, the clipboard the terminal already used, and nothing else.
    // Never the camera, never another origin.
    const own = (wc: Electron.WebContents | null): boolean => !!wc && wc === mainWindow?.webContents
    const granted = new Set(['media', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen'])
    session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
      if (!own(wc) || !granted.has(permission)) return callback(false)
      if (permission === 'media') {
        const types = (details as { mediaTypes?: string[] }).mediaTypes ?? []
        return callback(types.length > 0 && types.every((t) => t === 'audio'))
      }
      callback(true)
    })
    session.defaultSession.setPermissionCheckHandler((wc, permission, _origin, details) => {
      if (!own(wc) || !granted.has(permission)) return false
      return permission !== 'media' || (details as { mediaType?: string }).mediaType !== 'video'
    })
    wireIpc()
    createWindow()
    // Warm the terminal's fixed costs shortly after launch: the native module
    // import and the shell probe both belong off every later click path.
    setTimeout(() => {
      void import('node-pty')
      void detectShells()
    }, 2500)
  })
}
