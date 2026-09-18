import { app, screen, type BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

/**
 * Where the window was last time.
 *
 * Every launch opened at 1180x780 wherever Windows felt like putting it, so
 * anyone who wanted it bigger resized it again on every single launch.
 * The state is one small file in userData: size, position, and whether it was
 * maximised.
 *
 * It is checked against the displays actually attached before it is used. A
 * window remembered on a second monitor that is no longer there would otherwise
 * open somewhere nobody can reach it.
 */
export interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  maximised?: boolean
}

export interface Area {
  x: number
  y: number
  width: number
  height: number
}

const WINDOW_STATE = (): string => join(app.getPath('userData'), 'window.json')

/**
 * The saved state, made safe to open a window with. Pure over its inputs, so
 * the rules are testable: the raw file text and the work areas of the displays
 * that are attached NOW.
 */
export function parseWindowState(raw: string, areas: Area[]): WindowState {
  const fallback: WindowState = { width: 1180, height: 780 }
  try {
    const saved = JSON.parse(raw) as WindowState
    if (!Number.isFinite(saved.width) || !Number.isFinite(saved.height)) return fallback
    const size = {
      width: Math.max(560, Math.round(saved.width)),
      height: Math.max(400, Math.round(saved.height)),
      maximised: saved.maximised === true
    }
    if (!Number.isFinite(saved.x) || !Number.isFinite(saved.y)) return size
    // Only keep the position if some display still contains it: a window
    // remembered on a monitor that has since been unplugged opens off-screen.
    const visible = areas.some(
      (a) =>
        saved.x! + size.width > a.x &&
        saved.x! < a.x + a.width &&
        saved.y! + size.height > a.y &&
        saved.y! < a.y + a.height
    )
    return visible ? { ...size, x: Math.round(saved.x!), y: Math.round(saved.y!) } : size
  } catch {
    return fallback // no file yet, or one written by something else
  }
}

/** Call after `app` is ready: `screen` does not exist before that. */
export function readWindowState(): WindowState {
  let raw = ''
  try {
    raw = readFileSync(WINDOW_STATE(), 'utf8')
  } catch {
    /* no file yet: the empty string parses to the fallback */
  }
  return parseWindowState(
    raw,
    screen.getAllDisplays().map((d) => d.workArea)
  )
}

/** Save on a delay: a drag fires this continuously, and the disk does not need
 *  to hear about every pixel of it. */
export function watchWindowState(win: BrowserWindow): void {
  let timer: NodeJS.Timeout | null = null
  const write = (): void => {
    if (win.isDestroyed() || win.isMinimized()) return
    // getNormalBounds is the un-maximised size, which is what should come back
    // when the window is restored.
    const b = win.getNormalBounds()
    const state: WindowState = { ...b, maximised: win.isMaximized() }
    try {
      writeFileSync(WINDOW_STATE(), JSON.stringify(state))
    } catch {
      /* a terminal that cannot write its window size is still a terminal */
    }
  }
  const save = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(write, 400)
  }
  // Listed one by one: BrowserWindow's overloads are per event name, so a loop
  // over a union of them has no single signature to match.
  win.on('resize', save)
  win.on('move', save)
  win.on('maximize', save)
  win.on('unmaximize', save)
  // Closing quits, so there is no 400ms later: written NOW, while the window
  // still exists to be measured. (A close the agent question vetoes writes a
  // size that is still true.)
  win.on('close', () => {
    if (timer) clearTimeout(timer)
    write()
  })
}
