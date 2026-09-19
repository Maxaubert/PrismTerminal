import type { DetectedAgent, ShellDef } from '../shared/types'

/**
 * THE HOST SEAM (2026-09-19, #15).
 *
 * This core is the terminal of TWO apps: Prism Terminal, where it is the whole
 * product, and Prism, where it is a panel inside a media viewer. The owner's
 * rule is that the two terminals are the same ("all should be synced, unless
 * it conflicts with one app, then you need to ask me"). So everything that IS
 * the terminal lives in this core, once, and every place the two apps
 * legitimately differ is DECLARED here as a setting the host supplies. A
 * difference that is not on this page is a fork, and a fork is what this
 * exists to end.
 *
 * Nothing in the core reads `window.prism`, imports from a host's `src/`, or
 * uses a path alias (`@shared`, `@renderer`): a consumer's bundler resolves an
 * alias against ITS OWN tree, MEASURED, silently, so the core would run the
 * host's copy of a file with no error anywhere. Relative imports only, and
 * the bridge to main is handed in, never reached for.
 */

/** What the clipboard holds right now, for the paste rule. */
export interface ClipboardRead {
  image: boolean
  text: string
  files: string[]
}

/** The bridge to the main process that the terminal needs. A host's preload
 *  builds it with `createTermApi` (core/preload/api), so the channel names and
 *  signatures exist in one place. */
export interface TermApi {
  termShells(): Promise<ShellDef[]>
  termSpawn(id: string, cwd: string, shellId?: string, resume?: string): Promise<boolean>
  termInput(id: string, data: string): void
  termResize(id: string, cols: number, rows: number): void
  termKill(id: string): void
  termPrewarm(cwd: string, shellId?: string): void
  onTermData(cb: (id: string, data: string) => void): () => void
  onTermAgent(cb: (id: string, has: boolean, kind: DetectedAgent | null) => void): () => void
  onTermExit(cb: (id: string) => void): () => void
  readClipboard(): ClipboardRead
  openExternal(url: string): void
}

export type AgentIndicator = 'off' | 'minimal' | 'full'

export interface TermHostConfig {
  api: TermApi

  /**
   * What a setting reads as when the user has never touched it. Per host on
   * purpose: an update must not silently change what an existing user sees,
   * and the two apps shipped different answers. Where the owner picks ONE
   * value for both, both hosts pass it and the difference is gone.
   */
  defaults: {
    /** A preset id, or 'style' where the host has styles to follow. */
    theme: string
    acrylic: boolean
    indicator: AgentIndicator
    /** A hex, or '' for "follow the theme" (see `accent`). */
    agentColor: string
    agentDoneColor: string
  }

  /**
   * Does the terminal wear the HOST's style? Prism has app styles and publishes
   * them as `--p-bg` / `--p-text` / `--p-accent-hi` on :root, so its terminal
   * can follow them (theme id 'style') and restyle when they change. Prism
   * Terminal has no styles of its own: there the terminal theme drives the
   * window, the other way round, so 'style' does not exist.
   */
  followsHostStyle: boolean

  /**
   * Does the panel paint the ground? True: the panel box paints `--p-bg` and
   * xterm's canvas is clear, so the strip under the last row (xterm sizes
   * itself in whole rows) is the theme's and every pixel gets one coat. False:
   * the host paints behind the panel itself (Prism's dock does), and the
   * canvas carries the ground as it always did there.
   */
  paintsGround: boolean

  /**
   * What an agent-indicator colour is when the user has NOT picked one: the
   * host's own accent for "working", and a green that reads on its ground for
   * "finished". The tab strip is the host's chrome, so the accent is the
   * host's to name: Prism Terminal derives its chrome from the terminal theme,
   * Prism takes it from the app style.
   */
  themedAgentColors(themeId: string): { working: string; finished: string }

  /**
   * What "Acrylic" means as a TERMINAL setting. 'window': the terminal setting
   * switches the window's own material on, for any theme, with an opacity
   * slider (Prism Terminal, where nothing else owns the window). 'style': the
   * window material belongs to the host's STYLE, and the row only decides
   * whether the terminal lets it show through; no slider, since two alphas
   * over one sheet of glass would fight (Prism; owner, 2026-09-19).
   */
  acrylic: { kind: 'window'; supported(): Promise<boolean> } | { kind: 'style' }

  /**
   * A chord the HOST owns even while a shell has the keyboard. xterm must not
   * also feed it to the pty: left to xterm, Ctrl+` became a NUL byte, which
   * counted as the user typing. Everything the host does not claim is the
   * shell's, so claim little: plain Ctrl+W is delete-word in every readline.
   */
  ownsKey(e: KeyboardEvent): boolean
}

let host: TermHostConfig | null = null

/** Called once by the host, before anything in the core renders. */
export function configureTermCore(config: TermHostConfig): void {
  host = config
}

export function termHost(): TermHostConfig {
  if (!host) throw new Error('prism-term-core: configureTermCore() has not been called by the host')
  return host
}

/** The bridge to main. */
export const termApi = (): TermApi => termHost().api

/** What an unset setting reads as when NO host has spoken: a unit test, or a
 *  store read at import time. Prism Terminal's own answers. */
const NEUTRAL: TermHostConfig['defaults'] = {
  theme: 'prism',
  acrylic: false,
  indicator: 'minimal',
  agentColor: '',
  agentDoneColor: ''
}

export const hostDefaults = (): TermHostConfig['defaults'] => host?.defaults ?? NEUTRAL
export const followsHostStyle = (): boolean => host?.followsHostStyle ?? false
export const paintsGround = (): boolean => host?.paintsGround ?? true

/** For tests, and for a host that tears down. */
export function resetTermCore(): void {
  host = null
}
