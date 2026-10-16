import { contextBridge, ipcRenderer } from 'electron'
import { OVERLAY_CH, type OverlayLook, type OverlayState } from '@shared/dictOverlay'

// The dictation widget's whole view of the app (2026-10-16): states in, a pick
// or a dismissal out. Sandboxed like the main window (rule 4).
contextBridge.exposeInMainWorld('overlay', {
  onState: (cb: (s: OverlayState) => void): void => {
    ipcRenderer.on(OVERLAY_CH.state, (_e, s: OverlayState) => cb(s))
  },
  onLook: (cb: (l: OverlayLook) => void): void => {
    ipcRenderer.on(OVERLAY_CH.look, (_e, l: OverlayLook) => cb(l))
  },
  pick: (id: string): void => ipcRenderer.send(OVERLAY_CH.pick, id),
  dismiss: (): void => ipcRenderer.send(OVERLAY_CH.dismiss)
})
