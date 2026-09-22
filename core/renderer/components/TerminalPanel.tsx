import { useEffect, useRef, type JSX } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import { decidePaste } from '../lib/termPaste'
import { registerPaste, reportCwd, reportTitle, setTextPaster } from '../lib/termBus'
import { parseOsc9 } from '../../shared/termCwd'
import { resolveTermTheme, watchTermTheme } from '../lib/termTheme'
import { followsHostStyle, paintsGround, termApi, termHost } from '../host'
import { normalizeColor } from '../lib/termAnsi'
import { findLinks, linkColor } from '../lib/termLinks'
import { arrowKeys, caretClickAllowed, caretDelta, type ClickGate } from '../lib/termClickCaret'
import { attachLinkPaint, type LinkPainter } from '../lib/termLinkPaint'
import {
  onTermLookChange,
  termBaseFontPx,
  termAcrylic,
  termFontStack,
  termThemeId
} from '../lib/termLook'
import {
  forgetSession,
  looksTyped,
  markPrompt,
  markTouched,
  suppressActivity,
  takeResume
} from '../lib/termActivity'
import '@xterm/xterm/css/xterm.css'

// The terminal surface. This module is a lazy chunk (xterm is ~350KB the
// launch path never needs) and it owns the SESSION STORE: one live xterm
// instance per shell, each with its own DOM element, living in module scope
// because their lifetime is the shell's, not any component's. Switching tabs
// reattaches an element instead of repainting, which is what keeps scrollback,
// selection and the alternate screen (vim, htop) intact for free.

interface Session {
  term: Terminal
  fit: FitAddon
  search: SearchAddon
  /** Paints the links in the buffer; told when the colours change. */
  links: LinkPainter
  el: HTMLDivElement
  unsub: Array<() => void>
  /** Ctrl+scroll zoom, this session only: never persisted, dies with it. */
  fontOverride?: number
}

const sessions = new Map<string, Session>()

/** What a link wears on the theme in force: blue, moved as far as this
 *  ground (a preset's, or one the user picked) needs for it to read. */
function currentLinkColor(): string {
  const theme = resolveTermTheme(termThemeId())
  return linkColor(theme.background, theme.foreground)
}

/**
 * The theme as painted. Where the PANEL paints the ground (`paintsGround`,
 * the host's word), it is the theme's colours on a TRANSPARENT canvas:
 *
 * THE PANEL PAINTS THE GROUND, NOT XTERM (2026-09-19, owner screenshot: a grey
 * bar along the bottom of a black terminal). xterm sizes itself in whole rows,
 * MEASURED at 604px in a 611px box, so a few pixels under the last row are
 * never xterm's to paint. While the canvas carried the ground and the box
 * around it was transparent, that strip showed the native window background
 * instead of the theme. So the ground is `--p-bg` on the panel (the chrome's
 * own colour, at the window's alpha when it is acrylic, see lib/chromeTheme)
 * and the canvas over it is clear: every pixel of the panel, rows, frame and
 * leftover strip alike, gets exactly ONE coat. One and not two is the other
 * half of it: two translucent coats are a visibly darker panel than the rest
 * of an acrylic window.
 *
 * The block cursor draws the character under it in `cursorAccent`, which
 * defaults to the background; on a clear background that would be a hole, so
 * it is named.
 */
function currentTermTheme(): ReturnType<typeof resolveTermTheme> & { cursorAccent?: string } {
  const theme = resolveTermTheme(termThemeId())
  if (!paintsGround()) {
    // The HOST paints behind the panel (Prism's dock does), so the canvas
    // carries the ground as it always did there: clear only when the terminal
    // is following an acrylic style, so the window's material shows through.
    return termThemeId() === 'style' && termAcrylic() ? { ...theme, background: '#00000000' } : theme
  }
  // Flattened first: a custom theme may hold #rgb or an rgba().
  const solid = normalizeColor(theme.background, '#0b0b0f')
  return { ...theme, background: '#00000000', cursorAccent: solid }
}

/**
 * Resize xterm to its box, carrying the CURSOR LINE across (2026-09-04).
 *
 * ConPTY - node-pty's bundled dll, which Prism must use because the inbox
 * conhost fast-fails the app when a pty dies mid-read - sends NOTHING on a
 * resize. MEASURED: 0 bytes narrower and 0 bytes wider, where the inbox
 * conhost repaints the whole screen (339 bytes). It reflows its own buffer
 * and expects the terminal to do the same; xterm does, for every line
 * EXCEPT the one holding the cursor, on the Unix assumption that the shell
 * redraws its own line on SIGWINCH. Nobody redraws it here, so the prompt
 * was cut at the narrower width and stayed cut once widened again, and a
 * keystroke then landed at ConPTY's idea of the column: "PS C:\" and the
 * tail of the path with blank columns between (owner screenshot; Ctrl+L put
 * it right). So the logical line under the cursor - its wrapped rows joined
 * - is read BEFORE the resize and written back AFTER it through xterm's own
 * parser, which wraps it exactly as ConPTY's buffer does, and the cursor is
 * put back at the same character. Only when that line is the LAST thing in
 * the buffer, which is a prompt; lines below it would be moved by ConPTY
 * too and cannot be followed from here. The alternate screen is left alone:
 * a TUI owns every cell and repaints itself.
 */
function fitKeepingCursorLine(term: Terminal, fit: FitAddon): void {
  const b = term.buffer.active
  if (b.type !== 'normal') {
    fit.fit()
    return
  }
  const oldCols = term.cols
  const y = b.baseY + b.cursorY
  // The logical line: walk back over wrapped rows to its first row.
  let first = y
  while (first > 0 && b.getLine(first)?.isWrapped) first -= 1
  let last = y
  while (last + 1 < b.length && b.getLine(last + 1)?.isWrapped) last += 1
  let text = ''
  for (let i = first; i <= last; i += 1) text += b.getLine(i)?.translateToString(i === last) ?? ''
  const offset = (y - first) * oldCols + b.cursorX
  let tail = false
  for (let i = last + 1; i < b.length && !tail; i += 1)
    if ((b.getLine(i)?.translateToString(true) ?? '').length) tail = true
  fit.fit()
  if (term.cols === oldCols || tail || !text.length) return
  const row = first - b.baseY
  if (row < 0 || row >= term.rows) return
  // Home to the line's first row, erase it and everything below, write the
  // line back (xterm wraps it at the new width), then put the cursor on the
  // same character - read after the write lands, since a long line can
  // scroll the buffer while it is being laid out.
  term.write(`\x1b[${row + 1};1H\x1b[J${text}`, () => {
    const nb = term.buffer.active
    const end = nb.baseY + nb.cursorY
    const back = text.length - Math.min(offset, text.length)
    const endCol = nb.cursorX
    // Walk the cursor back `back` cells over the wrapped rows just written.
    let r = end
    let c = endCol - back
    while (c < 0 && r > 0) {
      c += term.cols
      r -= 1
    }
    term.write(`\x1b[${Math.max(0, r - nb.baseY) + 1};${Math.max(0, c) + 1}H`)
  })
}

/**
 * CLICK TO PUT THE CARET THERE (owner, 2026-09-22). A plain click on the line
 * being edited sends the Left or Right presses that walk the shell's cursor to
 * the cell clicked; every other click (a drag, a double click, a link, a
 * program that owns the mouse, old output, a full-screen program) is left
 * exactly as it was. The rules are `termClickCaret`'s, pure and tested; this
 * only reads the event and the buffer into them. Returns the disposer.
 */
function attachClickCaret(term: Terminal, el: HTMLElement, id: string): () => void {
  // DECTCEM, followed from the stream: xterm keeps whether the cursor is
  // hidden to itself. Returning false lets xterm apply it as always.
  let cursorHidden = false
  const cursorMode = (hidden: boolean) => (params: (number | number[])[]): boolean => {
    if (params.some((p) => p === 25)) cursorHidden = hidden
    return false
  }
  const show = term.parser.registerCsiHandler({ prefix: '?', final: 'h' }, cursorMode(false))
  const hide = term.parser.registerCsiHandler({ prefix: '?', final: 'l' }, cursorMode(true))
  let down: { x: number; y: number } | null = null
  const onDown = (e: MouseEvent): void => {
    down = { x: e.clientX, y: e.clientY }
  }
  const onUp = (e: MouseEvent): void => {
    const from = down
    down = null
    if (!from) return
    const screen = term.element?.querySelector<HTMLElement>('.xterm-screen')
    if (!screen) return
    const r = screen.getBoundingClientRect()
    const cellW = r.width / term.cols
    const cellH = r.height / term.rows
    // Read after xterm has finished with the same mouseup: a drag's selection
    // is only final once its own handler has run.
    setTimeout(() => {
      const b = term.buffer.active
      const col = Math.max(0, Math.min(term.cols, Math.round((e.clientX - r.left) / cellW)))
      const row = Math.floor((e.clientY - r.top) / cellH)
      const y = b.baseY + b.cursorY
      let first = y
      while (first > 0 && b.getLine(first)?.isWrapped) first -= 1
      let last = y
      while (last + 1 < b.length && b.getLine(last + 1)?.isWrapped) last += 1
      const clicked = b.viewportY + row
      let textBelow = false
      for (let i = last + 1; i < b.length && !textBelow; i += 1)
        if ((b.getLine(i)?.translateToString(true) ?? '').length) textBelow = true
      const widths: number[] = []
      let textEnd = 0
      let text = ''
      for (let i = first; i <= last; i += 1) {
        const line = b.getLine(i)
        text += line?.translateToString(false) ?? ''
        for (let x = 0; x < term.cols; x += 1) {
          const cell = line?.getCell(x)
          widths.push(cell?.getWidth() ?? 1)
          if (cell && cell.getChars() !== '') textEnd = widths.length - 1 + Math.max(1, cell.getWidth())
        }
      }
      const target = (clicked - first) * term.cols + col
      const charAt = widths.slice(0, target).filter((w) => w !== 0).length
      const gate: ClickGate = {
        button: e.button,
        detail: e.detail,
        modifiers: e.shiftKey || e.altKey || e.ctrlKey || e.metaKey,
        dragged: Math.hypot(e.clientX - from.x, e.clientY - from.y) > cellW / 2 || term.hasSelection(),
        mouseTracking: term.modes.mouseTrackingMode,
        alternate: b.type !== 'normal',
        scrolledBack: b.viewportY !== b.baseY,
        cursorHidden,
        textBelow,
        offLine: clicked < first || clicked > last,
        onLink: findLinks(text).some((l) => charAt >= l.start && charAt < l.end)
      }
      if (!caretClickAllowed(gate)) return
      const keys = arrowKeys(
        caretDelta(widths, (y - first) * term.cols + b.cursorX, target, textEnd),
        term.modes.applicationCursorKeysMode
      )
      if (!keys) return
      markTouched(id)
      termApi().termInput(id, keys)
    }, 0)
  }
  el.addEventListener('mousedown', onDown, true)
  el.addEventListener('mouseup', onUp, true)
  return () => {
    show.dispose()
    hide.dispose()
    el.removeEventListener('mousedown', onDown, true)
    el.removeEventListener('mouseup', onUp, true)
  }
}

/** Refit a session and tell the pty its new geometry. */
function refitSession(id: string, s: Session): void {
  if (!s.el.clientWidth || !s.el.clientHeight) return
  suppressActivity(id)
  fitKeepingCursorLine(s.term, s.fit)
  termApi().termResize(id, s.term.cols, s.term.rows)
}

// One restyler for every running shell, driven by the Terminal settings
// changing (theme, acrylic and its opacity, base font size). A session the
// user Ctrl+scrolled keeps its own font; everything else follows the base.
function applyLook(): void {
  const theme = currentTermTheme()
  const base = termBaseFontPx()
  const family = termFontStack()
  for (const [id, s] of sessions) {
    s.term.options.theme = theme
    s.links.repaint() // the link colour is measured against the theme's ground
    const want = s.fontOverride ?? base
    const sizeChanged = s.term.options.fontSize !== want
    const familyChanged = s.term.options.fontFamily !== family
    if (sizeChanged) s.term.options.fontSize = want
    if (familyChanged) s.term.options.fontFamily = family
    if (sizeChanged || familyChanged) refitSession(id, s)
  }
}
onTermLookChange(applyLook)
// A host with styles of its own repaints :root when the style changes, and a
// terminal following it has to follow that too. Armed lazily: the host has
// not been configured yet when this module is first evaluated.
let styleWatch: (() => void) | null = null
function watchHostStyle(): void {
  if (!styleWatch && followsHostStyle()) styleWatch = watchTermTheme(() => applyLook())
}

/** Ctrl+scroll: zoom THIS session's text, unpersisted. */
function zoomSession(id: string, delta: number): void {
  const s = sessions.get(id)
  if (!s) return
  // Up to ~500% of the stock 13px: the Settings base caps at 200%, the wheel
  // deliberately goes further - a session zoom is a moment, not a layout.
  const next = Math.max(7, Math.min(64, (s.fontOverride ?? termBaseFontPx()) + delta))
  s.fontOverride = next
  s.term.options.fontSize = next
  refitSession(id, s)
}

/** Wipe a session's screen and scrollback, back to a bare prompt. The shell
 *  itself is untouched: same process, same cwd, same history. */
export function clearTermSession(id: string): void {
  sessions.get(id)?.term.clear()
}

/** Spawn a session WITHOUT waiting for its panel: a restored background tab's
 *  Claude session must resume now, not when the tab is first visited. The
 *  xterm lives against its detached element (the same way hidden tabs keep
 *  theirs) and the panel simply attaches it later, scrollback intact. */
export function ensureTermSession(id: string, root: string, shellId: string | undefined): void {
  if (!sessions.has(id)) createSession(id, root, shellId)
}

/** Give a live session the keyboard back. Used after a tab interaction (a
 *  click, a reorder drag) stole focus from a shell the user never left: the
 *  next keystroke would otherwise go to the strip instead of Claude Code. */
export function focusTermSession(id: string): void {
  sessions.get(id)?.term.focus()
}

/**
 * Paste TEXT THE USER SPOKE into a session (#13), exactly as a Ctrl+V of text
 * would arrive: xterm wraps it in the bracketed-paste escape when the shell
 * asked for that, so an agent's prompt takes it as one paste. NEVER A NEWLINE:
 * `paste` turns one into a carriage return, which is Enter, and dictation must
 * never send a command. The caller cleans the text; this strips what is left
 * anyway, because the rule is worth two locks.
 */
function pasteSpokenText(id: string, text: string): boolean {
  const s = sessions.get(id)
  const flat = text.replace(/[\r\n\u2028\u2029]+/g, ' ')
  if (!s || !flat) return false
  markTouched(id)
  s.term.paste(flat)
  return true
}
setTextPaster(pasteSpokenText)

/** Kill a session's renderer half: the xterm instance and its element. Main's
 *  pty half is killed separately (term:kill) or already exited. */
export function disposeTermSession(id: string): void {
  const s = sessions.get(id)
  if (!s) return
  sessions.delete(id)
  forgetSession(id)
  s.unsub.forEach((u) => u())
  s.links.dispose()
  s.search.dispose()
  s.term.dispose()
  s.el.remove()
}

/**
 * Find in the scrollback (2026-08-31).
 *
 * The session store is keyed by shell id and outlives every component, so
 * the find bar reaches its terminal the same way `focusTermSession` does
 * rather than threading a ref through the app. The decorations are painted
 * in the LIVE accent - the window chrome is derived from the terminal's theme
 * (lib/chromeTheme), and a highlight in some other colour would be the one
 * part of the panel that ignores it.
 *
 * `matchOverviewRuler` and `activeMatchColorOverviewRuler` are required
 * members of xterm's ISearchDecorationOptions, not optional extras: leave
 * them out and the whole decorations object is a type error.
 */
function findOptions(incremental: boolean): Parameters<SearchAddon['findNext']>[1] {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--p-accent-hi').trim()
  // xterm's decorations want #RRGGBB and nothing else: an rgba() or an
  // eight-digit hex paints as transparent-black, which is a match you cannot
  // see. chromeTheme publishes hex today, and this is the guard for the day
  // one of them is not.
  const accent = /^#[0-9a-f]{6}$/i.test(raw) ? raw : '#5b5bd6'
  return {
    incremental,
    decorations: {
      matchBackground: '#4a5160',
      matchBorder: '#6b7482',
      matchOverviewRuler: '#8a93a3',
      activeMatchBackground: accent,
      activeMatchBorder: accent,
      activeMatchColorOverviewRuler: accent
    }
  }
}

/**
 * Step to the next (or previous) match. False when there is no session.
 *
 * `incremental` is for TYPING: it keeps the selection where it is while the
 * query still matches, so the view does not leap down the scrollback one
 * character at a time. Enter and the arrows pass false, which is what makes
 * them step.
 */
export function findInTerm(id: string, query: string, dir: 1 | -1, incremental = false): boolean {
  const s = sessions.get(id)
  if (!s) return false
  if (!query) {
    s.search.clearDecorations()
    return true
  }
  if (dir === 1) s.search.findNext(query, findOptions(incremental))
  else s.search.findPrevious(query, findOptions(false))
  return true
}

/** Drop the highlights: the bar closed, or the query emptied. */
export function clearTermFind(id: string): void {
  sessions.get(id)?.search.clearDecorations()
}

/** Hear the running count. `resultIndex` is -1 past xterm's match threshold,
 *  which the bar reports as "many" rather than as "none". */
export function onTermFindResults(
  id: string,
  cb: (r: { index: number; count: number }) => void
): () => void {
  const s = sessions.get(id)
  if (!s) return () => {}
  const d = s.search.onDidChangeResults((e) => cb({ index: e.resultIndex, count: e.resultCount }))
  return () => d.dispose()
}

function createSession(id: string, root: string, shellId: string | undefined): Session {
  watchHostStyle()
  const term = new Terminal({
    cursorBlink: true,
    scrollback: 10000,
    allowProposedApi: true, // unicode11 needs it
    allowTransparency: true, // an acrylic window paints a see-through canvas
    fontFamily: termFontStack(),
    // The Settings base size; Ctrl+scroll can zoom this one session later.
    fontSize: termBaseFontPx(),
    // The chosen theme. Live switches are handled by applyLook above.
    theme: currentTermTheme(),
    // The pty is ConPTY (2026-09-04): without saying so, xterm reflowed
    // wrapped lines on a resize while ConPTY repainted them from its own
    // buffer, and where the two disagreed the prompt came back with holes -
    // "PS C:\" then blank columns then the tail of the path (owner
    // screenshot), Ctrl+L putting it right. Declared, xterm leaves the
    // reflow to ConPTY and grows the scrollback the way ConPTY expects.
    // The bundled dll is newer than any inbox conhost; to xterm only
    // "21376 or later" matters, which keeps its reflow ON and grows the
    // scrollback the way ConPTY expects when rows are added.
    windowsPty: { backend: 'conpty', buildNumber: 22621 }
  })
  const fit = new FitAddon()
  term.loadAddon(fit)
  const search = new SearchAddon()
  term.loadAddon(search)
  // Ink UIs (Claude Code) draw boxes and spinners whose width math assumes
  // Unicode 11 - without this addon the emoji misalign, which is the tell of
  // a terminal that didn't bother.
  term.loadAddon(new Unicode11Addon())
  term.unicode.activeVersion = '11'
  term.loadAddon(new WebLinksAddon((_e, url) => termApi().openExternal(url)))
  // The addon makes a link clickable and underlines it under the pointer; this
  // is what makes it LOOK like a link the rest of the time.
  const links = attachLinkPaint(term, currentLinkColor)

  const el = document.createElement('div')
  el.className = 'h-full w-full'
  term.open(el)

  // Touched means the USER typed (#99 found the lie): xterm also answers the
  // pty on its own - focus in/out (ESC[I / ESC[O, which pwsh 7.5 switches
  // on), device attributes at spawn (ESC[?1;2c), cursor position - and every
  // one of those went through onData and counted as typing, so a shell
  // nobody had touched read as touched from its first prompt. Keys are
  // heard on onKey, which only fires for a key; the rest of onData counts
  // only when it is plain text (an IME commit), never when it is a reply.
  term.onKey(() => markTouched(id))
  term.onData((d) => {
    if (looksTyped(d)) markTouched(id)
    termApi().termInput(id, d)
  })
  // The prompt's own report of where the shell is (#99): OSC 9;9, the
  // Windows Terminal convention, printed by the hook main put in the
  // bootstrap. Read here rather than in main because xterm already parses
  // the stream; handled (true) so it is never drawn as stray text.
  // The title (OSC 0/2) is where Claude Code writes its working state; App
  // reads the glyph. xterm parses it either way, this only passes it on.
  term.onTitleChange((t) => reportTitle(id, t))
  term.parser.registerOscHandler(9, (data) => {
    const p = parseOsc9(data)
    if (p) {
      markPrompt(id)
      reportCwd(id, p)
    }
    return true
  })
  // A resuming session shows a quiet spinner until claude's first paint:
  // the ~4s between an empty terminal and the conversation appearing read
  // as broken without one. Claude's own screen setup then paints over it.
  const resume = takeResume(id)
  let spin: ReturnType<typeof setInterval> | null = null
  if (resume) {
    markTouched(id) // a claude session from the first moment
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
    let i = 0
    term.write('\x1b[2m⠋ Resuming Claude session…\x1b[0m')
    spin = setInterval(() => {
      term.write(`\r\x1b[2m${frames[(i += 1) % frames.length]} Resuming Claude session…\x1b[0m`)
    }, 120)
  }
  const stopSpin = (): void => {
    if (spin) {
      clearInterval(spin)
      spin = null
      term.write('\r\x1b[2K')
    }
  }
  /**
   * The one paste. Bracketed for text - without that framing a multi-line
   * paste reaches the shell as a run of Enter presses, so the first line runs
   * and the rest are typed after it - and the ^V KEYSTROKE for an image,
   * which is what lets the TUI read the clipboard itself.
   *
   * Named and registered so a right-click Paste calls THIS rather than
   * growing a second, wrong copy of it.
   */
  const pasteHere = (): void => {
    const decision = decidePaste(termApi().readClipboard())
    if (decision.kind === 'key') {
      markTouched(id)
      termApi().termInput(id, '')
    } else if (decision.kind === 'text') {
      markTouched(id) // a paste is typing; bracketed, it starts with ESC
      term.paste(decision.data)
    }
  }

  const unsub = [
    attachClickCaret(term, el, id),
    termApi().onTermData((forId, data) => {
      if (forId === id) {
        stopSpin()
        term.write(data)
      }
    }),
    stopSpin,
    // A menu reaches this session's paste through lib/termBus while it is
    // alive; dropping the entry is part of disposing the session.
    registerPaste(id, pasteHere)
    // Exit is App's to handle: it owns the tab's term slot and must hear the
    // exit even while this panel is hidden. App disposes us via
    // disposeTermSession, so nothing is subscribed here.
  ]

  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown') return true
    // Ctrl+C over a SELECTION copies it, the way Windows Terminal does; with
    // nothing selected it stays the interrupt every shell expects.
    if (
      (e.key === 'c' || e.key === 'C') &&
      e.ctrlKey &&
      !e.shiftKey &&
      !e.altKey &&
      term.hasSelection()
    ) {
      void navigator.clipboard.writeText(term.getSelection())
      term.clearSelection()
      return false
    }
    // THE HOST'S CHORDS (core/renderer/host). Which keys belong to the app
    // even over a focused shell is the one thing the two apps disagree about
    // (Prism closes a tab on Ctrl+W and toggles the panel on Ctrl+`; Prism
    // Terminal leaves Ctrl+W to the shell as delete-word), so the host says.
    // Returning false keeps xterm from ALSO feeding the bytes to the pty: left
    // to xterm, Ctrl+` became a NUL, which counted as the user typing.
    if (termHost().ownsKey(e)) return false
    if (e.key === 'Enter' && e.shiftKey) {
      // Newline-without-submit, the continuation form Claude Code accepts
      // everywhere. This is what /terminal-setup exists to configure; here it
      // simply works.
      markTouched(id) // input like any other: its repaint is echo, not work
      termApi().termInput(id, '\\\r')
      return false
    }
    // ONE CTRL+V IS ONE PASTE (owner, 2026-09-22: "when I copy text and paste
    // it pastes twice"). Returning false only tells XTERM to leave the key
    // alone; it does not cancel the BROWSER's own action for Ctrl+V, which is
    // a native paste event into xterm's textarea - and xterm pastes on that
    // event too. So every paste arrived twice, once from here and once from
    // there. preventDefault cancels the native one; this handler is the paste,
    // since it is the one that knows about images (Claude Code reads those
    // itself when it gets the ^V keystroke) and bracketed framing.
    if ((e.key === 'v' || e.key === 'V') && e.ctrlKey && !e.shiftKey) {
      e.preventDefault()
      pasteHere()
      return false
    }
    if ((e.key === 'v' || e.key === 'V') && e.ctrlKey && e.shiftKey) {
      e.preventDefault()
      // The escape hatch: plain text paste even when an image rides along.
      const clip = termApi().readClipboard()
      if (clip.text) {
        markTouched(id)
        term.paste(clip.text)
      }
      return false
    }
    return true
  })

  const session: Session = { term, fit, search, links, el, unsub }
  sessions.set(id, session)

  // A session restored over a Claude conversation launches straight into it:
  // the resume id rides the SPAWN (main builds it into the shell's startup
  // command), so nothing is ever visibly typed.
  void termApi().termSpawn(id, root, shellId, resume ?? undefined).then((ok) => {
    if (!ok && sessions.has(id)) {
      term.write('\x1b[31mCould not start the shell.\x1b[0m\r\n')
      return
    }
    // The spawn is done: re-assert the real size once. The first fit can race
    // a slow spawn, and a static window will never resize on its own.
    if (sessions.has(id)) termApi().termResize(id, term.cols, term.rows)
  })
  return session
}

/**
 * Mounts (or re-attaches) the session for `sessionId`. Never disposes on
 * unmount: hiding the panel keeps the shell. Disposal is App's, on exit or
 * tab close, through disposeTermSession.
 */
export default function TerminalPanel({
  sessionId,
  root,
  shellId
}: {
  sessionId: string
  root: string
  shellId: string | undefined
}): JSX.Element {
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = box.current
    if (!host) return
    const s = sessions.get(sessionId) ?? createSession(sessionId, root, shellId)
    host.appendChild(s.el)
    s.term.focus()
    const refit = (): void => {
      // A hidden or zero-sized panel would fit to nonsense; the observer fires
      // again when it has real bounds.
      if (!host.clientWidth || !host.clientHeight) return
      // The redraw this resize provokes is us, not the shell working.
      suppressActivity(sessionId)
      fitKeepingCursorLine(s.term, s.fit)
      termApi().termResize(sessionId, s.term.cols, s.term.rows)
    }
    refit()
    const ro = new ResizeObserver(refit)
    ro.observe(host)
    // Ctrl+scroll zooms this session's text - unpersisted, the Settings base
    // size is untouched. Non-passive so the browser's own zoom never fires,
    // and in the CAPTURE phase because a full-screen TUI (Claude Code, codex,
    // vim, less) turns xterm's mouse reporting on: xterm then claims the
    // wheel to forward it to the program as a mouse report, and a listener
    // waiting for the bubble never heard it. Capture runs root-first, so the
    // zoom is decided before xterm sees the event at all - and only for
    // ctrl+wheel, which leaves plain scrolling to the program.
    const wheel = (e: WheelEvent): void => {
      if (!e.ctrlKey) return
      e.preventDefault()
      e.stopPropagation()
      zoomSession(sessionId, e.deltaY < 0 ? 1 : -1)
    }
    host.addEventListener('wheel', wheel, { passive: false, capture: true })
    return () => {
      ro.disconnect()
      host.removeEventListener('wheel', wheel, { capture: true })
      // Detach, don't dispose: the shell runs on unseen.
      if (s.el.parentElement === host) host.removeChild(s.el)
    }
  }, [sessionId, root, shellId])

  // Where the panel paints the ground, the 4px frame, the rows and the strip
  // under the last row are one surface in one coat (see currentTermTheme).
  // Where the host paints behind it, the panel adds nothing: a second
  // translucent coat is a visibly darker panel than the rest of the window.
  return (
    <div
      ref={box}
      data-term-region
      className={`h-full w-full min-h-0 min-w-0 p-1 ${paintsGround() ? 'bg-[var(--p-bg)]' : ''}`}
    />
  )
}
