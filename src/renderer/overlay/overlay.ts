import './overlay.css'
import type { OverlayLook, OverlayRow, OverlayState } from '../../shared/dictOverlay'

/**
 * THE DICTATION WIDGET (owner, 2026-10-16): above every window, never taking
 * focus, sized for 225% zoom. Listening (the level and the live words), then
 * the outcome: sent with a check mark, or the numbered sessions to pick from.
 * Plain DOM: it opens on a key press and must draw at once.
 */

declare global {
  interface Window {
    overlay: {
      onState(cb: (s: OverlayState) => void): void
      onLook(cb: (l: OverlayLook) => void): void
      pick(id: string): void
      dismiss(): void
    }
  }
}

const card = document.getElementById('card') as HTMLDivElement

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

const svg = (paths: string, cls: string): SVGSVGElement => {
  const ns = 'http://www.w3.org/2000/svg'
  const s = document.createElementNS(ns, 'svg')
  s.setAttribute('viewBox', '0 0 24 24')
  s.setAttribute('class', cls)
  s.setAttribute('aria-hidden', 'true')
  for (const d of paths.split('|')) {
    const p = document.createElementNS(ns, 'path')
    p.setAttribute('d', d)
    s.appendChild(p)
  }
  return s
}
const MIC = 'M12 3.5a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0v-5a3 3 0 0 0-3-3z|M6 11.5a6 6 0 0 0 12 0|M12 17.5v3'
const CHECK = 'M6 12.5l4 4 8-9'
const WARN = 'M12 4l9 16H3z|M12 10v4|M12 17.2v.1'

function head(icon: SVGSVGElement, title: string, ring = false): HTMLDivElement {
  const h = el('div', 'head')
  const badge = el('div', ring ? 'badge ring' : 'badge')
  badge.appendChild(icon)
  h.append(badge, el('div', 'title', title))
  return h
}

function rowEl(r: OverlayRow): HTMLButtonElement {
  const b = el('button', 'row')
  b.type = 'button'
  b.dataset.pick = r.id
  if (r.disabled) {
    b.disabled = true
    b.title = r.disabled
  }
  b.append(el('span', 'num', String(r.n)))
  const name = el('span', 'name')
  name.append(el('span', 'label', r.label), el('span', 'folder', r.copy ? `${r.copy} \u00b7 ${r.folder}` : r.folder))
  b.append(name)
  const chip = r.lead ? 'orchestrator' : r.disabled ? 'asking' : r.state === 'working' ? 'working' : null
  if (chip) b.append(el('span', `chip ${chip}`, chip))
  b.addEventListener('click', () => window.overlay.pick(r.id))
  return b
}

let levelBar: HTMLDivElement | null = null

function draw(s: OverlayState): void {
  card.dataset.phase = s.phase
  if (s.phase === 'listening' && levelBar && card.querySelector('.live')) {
    // A level or words update: no rebuild, so nothing flickers.
    levelBar.style.transform = `scaleX(${Math.max(0.04, Math.min(1, s.level * 3))})`
    ;(card.querySelector('.live') as HTMLElement).textContent = s.text || (s.starting ? 'Starting the speech engine' : 'Speak now')
    return
  }
  card.replaceChildren()
  levelBar = null
  if (s.phase === 'listening') {
    card.append(head(svg(MIC, 'icon'), 'Listening', true))
    const meter = el('div', 'meter')
    levelBar = el('div', 'level')
    meter.append(levelBar)
    card.append(meter, el('div', 'live', s.text || (s.starting ? 'Starting the speech engine' : 'Speak now')))
    card.append(el('div', 'hint', 'Let go to finish. Esc cancels.'))
  } else if (s.phase === 'transcribing') {
    card.append(head(svg(MIC, 'icon'), 'Transcribing'))
    card.append(el('div', 'dots'))
  } else if (s.phase === 'pick') {
    card.append(head(svg(MIC, 'icon'), 'Send to'))
    card.append(el('div', 'said', s.text))
    const list = el('div', 'rows')
    s.rows.forEach((r) => list.append(rowEl(r)))
    card.append(list, el('div', 'hint', 'Press a number or click. Esc keeps it unsent.'))
  } else if (s.phase === 'sending') {
    card.append(head(svg(MIC, 'icon'), `Sending to ${s.to}`))
  } else if (s.phase === 'sent') {
    card.append(head(svg(CHECK, 'icon check'), `Sent to ${s.to}`))
  } else if (s.phase === 'note') {
    card.append(head(svg(s.tone === 'warn' ? WARN : MIC, s.tone === 'warn' ? 'icon warn' : 'icon'), s.message))
  }
}

window.overlay.onState(draw)
window.overlay.onLook((l) => {
  const r = document.documentElement.style
  r.setProperty('--ground', l.ground)
  r.setProperty('--text', l.text)
  r.setProperty('--dim', l.dim)
  r.setProperty('--accent', l.accent)
  r.setProperty('--edge', l.edge)
})
