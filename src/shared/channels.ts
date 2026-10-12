/**
 * THIS APP'S OWN IPC CHANNEL NAMES, ONCE (audit 2026-10-12): the terminal's
 * are the core's `CH` table, so a channel cannot be renamed on one side of the
 * bridge and not the other; the app's own ~35 were bare strings in main and
 * preload, where a rename on one side fails silently at runtime (a call hangs,
 * a message is dropped). Main and preload both read this table.
 */
export const APP_CH = {
  acrylicSet: 'acrylic:set',
  acrylicSupported: 'acrylic:supported',
  agentBusy: 'agent:busy',
  appHome: 'app:home',
  appQuit: 'app:quit',
  appVersion: 'app:version',
  closeConfirmed: 'close:confirmed',
  closeRequest: 'close:request',
  dialogPickFolder: 'dialog:pick-folder',
  pathFolderOf: 'path:folder-of',
  shellVerbSet: 'shell:verb-set',
  shellVerbStatus: 'shell:verb-status',
  tabsChanged: 'tabs:changed',
  tabsPeek: 'tabs:peek',
  tabsRestore: 'tabs:restore',
  updateAnnounce: 'update:announce',
  updateAvailable: 'update:available',
  updateCancel: 'update:cancel',
  updateInstall: 'update:install',
  updateProgress: 'update:progress',
  windowBadge: 'window:badge',
  windowBg: 'window:bg',
  windowClose: 'window:close',
  windowEdgeNear: 'window:edge-near',
  windowEdgeWatch: 'window:edge-watch',
  windowEdges: 'window:edges',
  windowFullscreenToggle: 'window:fullscreen-toggle',
  windowFullscreen: 'window:fullscreen',
  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize'
} as const

/** The channels only an e2e run registers (main, under --e2e). */
export const E2E_CH = {
  regWrites: 'e2e:reg-writes',
  slowIpc: 'e2e:slow-ipc',
  taskbarBadgeImage: 'e2e:taskbar-badge-image',
  taskbarBadge: 'e2e:taskbar-badge',
  updateCalls: 'e2e:update-calls',
  windowEdges: 'e2e:window-edges'
} as const
