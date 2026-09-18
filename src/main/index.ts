import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, shell } from 'electron'
import { stat } from 'fs/promises'
import { homedir } from 'os'
import { dirname, join } from 'path'
import type { Restored, SavedTabs, UpdateInfo } from '@shared/types'
import { startAgentPoll, pollAgentsSoon } from './agentPoll'
import { claudeSessions, planRestore, validResume } from './agentResume'
import { foldersFromArgv } from './argv'
import { acrylicOk, createMaterial } from './material'
import { detectShells } from './shells'
import { createTabsStore } from './tabsStore'
import { killAll, killTerm, prewarmShell, resizeTerm, spawnTerm, writeTerm } from './terminal'
import { installUpdate, watchForUpdates } from './update'
import { createVerbSwitch } from './verbSwitch'
import { readWindowState, watchWindowState } from './windowState'

// Prism Terminal's main process: the window, the resident lifecycle and the
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

// userData is `%APPDATA%\PrismTerminal`, whatever the product name's spacing
// would have made it. The e2e (and anyone else) passing Chromium's own
// --user-data-dir keeps the profile they asked for: Electron has already
// pointed userData there. Set BEFORE the single-instance lock, which is taken
// per profile - that is what lets the suite run beside the installed app.
if (!app.commandLine.hasSwitch('user-data-dir'))
  app.setPath('userData', join(app.getPath('appData'), 'PrismTerminal'))

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
 * The resident lifecycle.
 *
 * Closing the window HIDES it and kills every shell; the process stays, so the
 * next launch (a second instance, handed over by the lock) is a window that is
 * simply there. Only `app:quit`, the updater and the installer end the process.
 * ------------------------------------------------------------------ */
let quitting = false // app.quit() is under way: a close now really closes
let quitWanted = false // a quit the close question interrupted; confirm resumes it
let agentBusy = false // mirrored from the renderer: an agent is WORKING
let closeAgreed = false // the renderer's "go ahead" for the close in flight
let hiddenResident = false // the window is hidden and its tab list dropped
/**
 * The renderer has no tab list worth saving: it has not restored yet (launch,
 * a reload) or it dropped its list when the window hid. Two things follow.
 * Its `tabs:changed` reports are IGNORED - an emptied list would otherwise
 * overwrite tabs.json with nothing, which is every tab lost at the next launch.
 * And folders handed over are QUEUED, to go out after the restore has
 * answered: sent before it, the restored list would land on top of them.
 */
let awaitingRestore = true
let firstRestore = true
let pendingFolders: string[] = []

const tabs = createTabsStore(join(app.getPath('userData'), 'tabs.json'))

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
  })
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
      // an ordinary window whose next close hides like any other.
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
    if (quitting) return
    // Resident: the window goes, the process stays, so the next launch is
    // instant. The renderer drops its tab list; the restore refills it.
    e.preventDefault()
    hiddenResident = true
    awaitingRestore = true
    win.hide()
    send('window:hidden')
  })
  // Windows is shutting down or logging off: no before-quit is coming.
  win.on('session-end', () => tabs.flush())

  win.on('enter-full-screen', () => {
    send('window:fullscreen', true)
    material.settled()
  })
  win.on('leave-full-screen', () => {
    send('window:fullscreen', false)
    material.settled()
  })

  /**
   * A window the page tried to open. Denied, and handed to the OS only when
   * it is a web address (2026-08-31). A terminal prints whatever a program
   * writes into it, so "the page asked for it" is not a reason to trust it.
   * Same test as the `shell:open-external` handler, and for the same reason.
   */
  win.webContents.setWindowOpenHandler((d) => {
    if (/^https?:\/\//i.test(d.url)) void shell.openExternal(d.url)
    return { action: 'deny' }
  })
  // A page cannot navigate the window away from the app either: the renderer
  // is the app's own UI and nothing in it is a browser.
  win.webContents.on('will-navigate', (e, url) => {
    const dev = process.env['ELECTRON_RENDERER_URL']
    if (dev && url.startsWith(dev)) return
    if (url.startsWith('file://')) return
    e.preventDefault()
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
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
    const plan = planRestore(saved, (p) => present.has(p), claudeSessions)
    if (firstRestore) {
      firstRestore = false
      const launched = foldersFromArgv(process.argv)
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
  ipcMain.handle('term:shells', () => detectShells())
  ipcMain.handle(
    'term:spawn',
    async (_e, id: string, cwd: string, shellId?: string, resume?: string) => {
      if (typeof id !== 'string' || !id) return false
      const dir = (await isDir(cwd)) ? cwd : homedir()
      const ok = await spawnTerm(
        id,
        dir,
        typeof shellId === 'string' ? shellId : undefined,
        send,
        validResume(typeof resume === 'string' ? resume : undefined)
      )
      // Warm the agent-poll pipeline now: the first CIM query is the slow one.
      if (ok) pollAgentsSoon()
      return ok
    }
  )
  ipcMain.on('term:input', (_e, id: string, d: string) => {
    if (typeof id === 'string' && typeof d === 'string') writeTerm(id, d)
  })
  ipcMain.on('term:resize', (_e, id: string, c: number, r: number) => resizeTerm(id, c, r))
  ipcMain.on('term:kill', (_e, id: string) => killTerm(id))
  // The renderer says which folder the next tab will open in (the fixed-folder
  // new-tab mode); main starts its shell ahead of the click. Best-effort.
  ipcMain.on('term:prewarm', (_e, cwd: string, shellId?: string) => {
    void isDir(cwd).then((ok) => {
      if (ok && !awaitingRestore)
        void prewarmShell(cwd, typeof shellId === 'string' ? shellId : undefined)
    })
  })
  startAgentPoll((id, has, kind) => send('term:agent', id, has, kind))

  /**
   * What the clipboard holds RIGHT NOW, for the terminal's paste rule. An
   * image forwards the ^V key (a clipboard-aware TUI like Claude Code reads
   * the image itself); text becomes a bracketed paste; copied files paste as
   * quoted paths. SYNCHRONOUS on purpose: the rule runs inside a key handler
   * that has to answer xterm before the event is gone, and the read is a few
   * microseconds. It lives in main because a sandboxed preload has no clipboard.
   */
  ipcMain.on('clipboard:read', (e) => {
    try {
      const formats = clipboard.availableFormats()
      const files = formats.includes('FileNameW')
        ? clipboard
            .readBuffer('FileNameW')
            .toString('ucs2')
            .replace(/\0+$/, '')
            .split('\0')
            .filter(Boolean)
        : []
      e.returnValue = {
        image: formats.some((f) => f.startsWith('image/')),
        text: clipboard.readText(),
        files
      }
    } catch {
      e.returnValue = { image: false, text: '', files: [] }
    }
  })
  // The terminal's clickable links. http(s) only, checked on both sides.
  ipcMain.on('shell:open-external', (_e, url: string) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) void shell.openExternal(url)
  })
  // A tab's "Show in File Explorer": a folder that exists, and nothing else.
  ipcMain.on('shell:show-folder', (_e, p: string) => {
    void isDir(p).then((ok) => {
      if (ok) void shell.openPath(p)
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

  // Watch GitHub Releases, and remember the newest offer so a renderer that
  // loads after the tick still hears about it. Not under --e2e: an unpackaged
  // build reports a MOCK update, and the suite measures a title bar without one.
  let pendingUpdate: UpdateInfo | null = null
  if (!E2E)
    watchForUpdates((info) => {
      pendingUpdate = info
      send('update:available', info)
    })
  ipcMain.on('update:announce', (e) => {
    if (pendingUpdate) e.sender.send('update:available', pendingUpdate)
  })
  // Installing quits the app so NSIS can replace it, and a working agent
  // VETOES a quit (the close flow above) - the installer would then run over a
  // live exe while a dialog waited. The renderer settles that question before
  // it asks for the install, so the quit is pre-answered here.
  ipcMain.handle('update:install', async (_e, url: string) => {
    if (typeof url !== 'string') return false
    closeAgreed = true
    const ok = await installUpdate(url, (pct) => send('update:progress', pct))
    // A download that FAILED must not leave the close question pre-answered
    // for the rest of the session.
    if (!ok) closeAgreed = false
    return ok
  })
  ipcMain.handle('app:version', () => app.getVersion())

  /* ----- the window ----- */

  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:toggle-maximize', () =>
    mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize()
  )
  // The X, and the renderer closing its LAST tab: the same path as Alt+F4.
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
  // "Quit Prism Terminal": the one way out of the resident process from inside.
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
  ipcMain.handle('acrylic:set', (_e, on: boolean): boolean => material.setAcrylic(on))
  // The theme's solid ground: the window's colour when the material is off,
  // and what shows for the frame before the page paints after a resize.
  ipcMain.on('window:bg', (_e, hex: string) => material.setBg(hex))
}

// Single instance: a second launch (the verb, a shortcut, a command line)
// forwards its folders to the running process and ends, instead of starting a
// rival. With the window hidden that IS how the app is opened again.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    const folders = foldersFromArgv(argv)
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
    // The handoff is the case the foreground lock bites hardest: the app has
    // been sitting in the background for an hour, and the folder it is handed
    // must arrive in a window that is actually in front of you.
    reveal(mainWindow)
    if (hiddenResident) {
      hiddenResident = false
      send('restore:again') // the renderer calls restoreTabs(); the folders follow it
    }
    handFolders(folders)
  })

  app.on('before-quit', () => {
    quitting = true
  })
  // Resident: a process with no visible window is the normal state, not the end.
  app.on('window-all-closed', () => {})
  // Every shell dies with the app; a pty with no window is an orphan.
  app.on('will-quit', () => {
    killAll()
    tabs.flush()
  })

  app.whenReady().then(() => {
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
