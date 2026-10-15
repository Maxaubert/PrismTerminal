import { useEffect, useLayoutEffect, useRef, useState, type JSX, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { LAYER } from '@core/renderer/components/layers'
import { findKeeps, folderLine } from '../lib/sidebarRows'
import { useHomeDir } from '../lib/appFacts'

/**
 * THE +N LIST (#146; owner, 2026-10-15, option C of the many-tabs mockups):
 * the tabs the top bar had no room for, with a Find field. The tabs that need
 * you come first. Ctrl+Shift+K opens it with EVERY tab in it, so Find a tab
 * works in the top-bar layout too (it was the sidebar's alone).
 */

export interface OverflowRow {
  id: string
  label: string
  cwd: string
  icon: ReactNode
  /** The tab's ring, or null. */
  mark: ReactNode | null
  /** Finished, Question or Failed: listed first. */
  needs: boolean
}

export function TabOverflowList({
  rows,
  anchor,
  onPick,
  onRowMenu,
  onClose
}: {
  rows: OverflowRow[]
  /** The +N button's box: the list opens under its right edge. */
  anchor: DOMRect
  onPick: (id: string) => void
  onRowMenu: (e: MouseEvent, id: string) => void
  onClose: () => void
}): JSX.Element {
  const home = useHomeDir()
  const [query, setQuery] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLInputElement>(null)
  const [pos, setPos] = useState({ x: anchor.right, y: anchor.bottom + 4 })
  const kept = rows.filter((r) => findKeeps(query, r.label, r.cwd))
  const needs = kept.filter((r) => r.needs)
  const rest = kept.filter((r) => !r.needs)

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const w = el.getBoundingClientRect().width
    setPos({ x: Math.max(8, Math.min(anchor.right - w, window.innerWidth - w - 8)), y: anchor.bottom + 4 })
  }, [anchor])
  useEffect(() => {
    field.current?.focus()
    const onDown = (e: PointerEvent): void => {
      if (box.current && e.target instanceof Node && box.current.contains(e.target)) return
      onClose()
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])

  const row = (r: OverflowRow): JSX.Element => (
    <button
      key={r.id}
      role="option"
      aria-selected={false}
      data-overflow-row={r.id}
      className="flex h-[34px] w-full items-center gap-2.5 rounded-[3px] px-2.5 text-left text-[12.5px] text-[var(--p-text-soft)] transition-colors hover:bg-[var(--p-hover)] hover:text-[var(--p-text)] focus-visible:bg-[var(--p-hover)] focus-visible:outline-none"
      onClick={() => {
        onPick(r.id)
        onClose()
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        onRowMenu(e, r.id)
      }}
    >
      {r.icon}
      <span className="min-w-0 flex-1 truncate">
        {r.label}
        <span className="ml-2 text-[11px] text-[var(--p-dim2)]">{folderLine(r.cwd, home)}</span>
      </span>
      {r.mark && <span className="grid w-4 shrink-0 place-items-center">{r.mark}</span>}
    </button>
  )
  const head = (text: string): JSX.Element => (
    <div className="px-2.5 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[.06em] text-[var(--p-dim2)]">{text}</div>
  )

  return createPortal(
    <div
      ref={box}
      data-tab-overflow
      className={`no-drag fixed ${LAYER.menu} flex max-h-[min(440px,70vh)] w-[340px] flex-col overflow-hidden rounded-[4px] border border-[color:var(--p-divider)] bg-[var(--p-side-flat)] shadow-[0_10px_28px_rgba(0,0,0,.5)]`}
      style={{ left: pos.x, top: pos.y }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        }
      }}
    >
      <div className="flex items-center gap-2 border-b border-[color:var(--p-divider)] px-3 py-2 text-[var(--p-dim2)]">
        <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="11" cy="11" r="6" />
          <path d="M20 20l-4.5-4.5" />
        </svg>
        <input
          ref={field}
          role="combobox"
          aria-expanded
          aria-controls="tab-overflow-rows"
          aria-label="Find a tab"
          data-overflow-find
          placeholder="Find a tab"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && kept.length) {
              const first = needs[0] ?? rest[0]
              onPick(first.id)
              onClose()
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-[12.5px] text-[var(--p-text)] outline-none placeholder:text-[var(--p-dim2)]"
        />
      </div>
      <div id="tab-overflow-rows" role="listbox" aria-label="Tabs" className="min-h-0 flex-1 overflow-y-auto p-1">
        {needs.length > 0 && head('Needs you')}
        {needs.map(row)}
        {rest.length > 0 && head(needs.length ? 'Other tabs' : 'Tabs')}
        {rest.map(row)}
        {!kept.length && <div className="px-2.5 py-3 text-[12px] text-[var(--p-dim2)]">No tab has that name or folder.</div>}
      </div>
    </div>,
    document.body
  )
}
