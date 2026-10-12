import { useEffect, useRef, useState, type JSX, type MouseEvent, type PointerEvent } from 'react'
import { tabLabels, type Tab } from '../lib/tabs'
import { DictationTabMark } from '@core/renderer/components/DictationTabMark'
import { TabMark } from '@core/renderer/components/TabMark'
import { motionClass } from '@core/renderer/components/markClasses'
import { failedLabel } from '@core/renderer/lib/agentHookSignal'
import { useTabLooks } from './tabLooks'
import { useTabMenus } from './tabMenus'
import { useTabStyle } from '../lib/tabStylePrefs'
import { sideEdgeClip, sideSegmentClip } from '../lib/promptGeometry'
import { dropSlot, type Lane } from '../lib/tabDrop'
import { useHoverReveal } from '../lib/hoverReveal'
import { useEdgeWants } from '../lib/edgeNear'
import { sideWants } from '../lib/revealZones'
import { AppMark } from './AppMark'
import { findKeeps, folderLine } from '../lib/sidebarRows'
import { useSidebarEdge } from '../lib/sidebarLook'
import {
  SIDEBAR_WIDTH,
  setSidebarWidth,
  useSidebarMode,
  useSidebarWidth
} from '../lib/sidebarPrefs'

/** The bar beside the sidebar (App's `data-title-bar="beside"`, h-9). */
const BAR_H = 36
/** How far the pointer must travel before a press becomes a drag rather than
 *  a click on the tab: the strip's own slop. */
const DRAG_SLOP = 4

/**
 * THE TABS AS A SIDEBAR (#162; owner, 2026-10-11): the strip's tabs, one row
 * each, down the window's left side. Everything a tab IS stays the strip's:
 * the same marks from the same rule (`useTabLooks`), the same menus, the same
 * close, middle-click, reorder and folder drop. What is new is only the shape:
 *
 * - Classic: a row with a soft fill on the tab in front and the accent rule on
 *   the terminal's side. Powerline: each row an arrow pointing at the
 *   terminal, its edge the mark, as the chevrons are on the strip.
 * - Open, the default, it sits beside the terminal and its right edge drags to
 *   resize it. Collapsed, it takes no room: it slides over the terminal while
 *   the pointer is at the window's left edge, and the terminal never resizes,
 *   so the shell is not redrawn each time it shows.
 * - No colour that the strip does not have, and no outline: the owner's
 *   "ultra minimal".
 */
export function TabSidebar({
  tabs,
  activeId,
  workingIds,
  doneIds,
  questionIds,
  failedIds,
  failedKinds,
  agentIds,
  loadingIds,
  onPick,
  onClose,
  onNew,
  onDropFolder,
  onReorder,
  onOpenRecent
}: {
  tabs: Tab[]
  activeId: string | null
  workingIds: ReadonlySet<string>
  doneIds: ReadonlySet<string>
  questionIds: ReadonlySet<string>
  failedIds?: ReadonlySet<string>
  failedKinds?: { readonly current: ReadonlyMap<string, string> }
  agentIds: ReadonlySet<string>
  loadingIds?: ReadonlySet<string>
  onPick: (id: string) => void
  onClose: (id: string) => void
  onNew: () => void
  onDropFolder: (path: string) => void
  onReorder: (id: string, toIndex: number) => void
  onOpenRecent: (path: string) => void
  /** The title bar is hidden: the sidebar starts at the window's top. */
}): JSX.Element | null {
  const prompt = useTabStyle() === 'prompt'
  const mode = useSidebarMode()
  const storedWidth = useSidebarWidth()
  const { indicator, palette, paint, looks } = useTabLooks({
    tabs,
    activeId,
    workingIds,
    doneIds,
    questionIds,
    failedIds,
    agentIds,
    prompt
  })
  const menu = useTabMenus({ onClose, onOpenRecent })
  const edge = useSidebarEdge()
  const nav = useRef<HTMLElement>(null)
  // FIND A TAB (owner, 2026-10-12, of the sidebar looks mockup): typing keeps
  // the rows whose name or folder has every word; Enter puts the first in
  // front, Escape lets go. Ctrl+Shift+K (App) comes here.
  const [query, setQuery] = useState('')
  const [finding, setFinding] = useState(false)
  const find = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const go = (): void => find.current?.focus()
    window.addEventListener('prism:find-tab', go)
    return () => window.removeEventListener('prism:find-tab', go)
  }, [])
  // The user's own folder, for the folder line's `~`. Asked once.
  const [home, setHome] = useState('')
  useEffect(() => {
    let live = true
    void window.prism.homeDir().then((h) => {
      if (live) setHome(h)
    })
    return () => {
      live = false
    }
  }, [])
  // A width being dragged lives here until the drag ends; only then is it stored.
  const [dragW, setDragW] = useState<number | null>(null)
  const width = dragW ?? storedWidth
  const collapsed = mode === 'collapsed'
  // COLLAPSED: shown while the pointer is at the window's left edge or on the
  // sidebar itself, and held while one of its menus is open. One rule for the
  // page's pointer and main's (lib/revealZones): over the grab strip at its
  // top the page hears nothing, a press there being Windows', and the sidebar
  // went away under the hand (owner, 2026-10-11: "if i have the cursor on the
  // sidebar at the top of it it will disappear when im still on the sidebar").
  // Measured to where it COMES TO REST, never the half-slid box ("closes before
  // my cursor is near the edge"): its stored width, not a rectangle.
  const shownNow = useRef(false)
  // The sidebar runs from the window's top (no bar across it).
  const top = 0
  const fromMain = useEdgeWants(collapsed, (p) => sideWants(p, shownNow.current, top, width))
  const shown = useHoverReveal(
    collapsed,
    (e) => sideWants({ x: e.clientX, y: e.clientY }, shownNow.current, top, width),
    menu.open || dragW !== null || finding || fromMain
  )
  useEffect(() => {
    shownNow.current = shown
  }, [shown])
  const visible = !collapsed || shown

  // ---- Reorder: the strip's pointer drag, along y ----
  const [dropAt, setDropAt] = useState<number | null>(null)
  const [carry, setCarry] = useState<{
    id: string
    from: number
    height: number
    dy: number
    live: boolean
  } | null>(null)
  const lanes = useRef<Lane[]>([])
  const rows = useRef<HTMLDivElement>(null)
  const startY = useRef(0)
  const dragging = useRef(false)
  const heldFocus = useRef<HTMLElement | null>(null)
  const endDrag = (): void => {
    setDropAt(null)
    setCarry(null)
    lanes.current = []
    const el = heldFocus.current
    heldFocus.current = null
    if (el && document.contains(el)) requestAnimationFrame(() => el.focus())
  }
  const onRowDown = (e: PointerEvent<HTMLDivElement>, id: string, i: number): void => {
    if (e.button !== 0 || query) return
    if ((e.target as HTMLElement).closest('[data-tab-close]')) return
    heldFocus.current = document.activeElement as HTMLElement | null
    // The lanes run down the column: `left` and `width` are a row's top and height.
    const boxes = [...(rows.current?.querySelectorAll('[data-tab]') ?? [])].map((el) =>
      el.getBoundingClientRect()
    )
    lanes.current = boxes.map((b) => ({ left: b.top, width: b.height, mid: b.top + b.height / 2 }))
    startY.current = e.clientY
    dragging.current = false
    setCarry({ id, from: i, height: boxes[i]?.height ?? 0, dy: 0, live: false })
    setDropAt(i)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onRowMove = (e: PointerEvent<HTMLDivElement>): void => {
    if (!carry) return
    const raw = e.clientY - startY.current
    if (!dragging.current && Math.abs(raw) < DRAG_SLOP) return
    dragging.current = true
    const lane = lanes.current[carry.from]
    const box = rows.current?.getBoundingClientRect()
    const dy =
      lane && box
        ? Math.max(box.top - lane.left, Math.min(raw, box.bottom - (lane.left + lane.width)))
        : raw
    setCarry((c) => (c ? { ...c, dy, live: true } : c))
    setDropAt(dropSlot(lanes.current, carry.from, dy))
  }
  const onRowUp = (e: PointerEvent<HTMLDivElement>): void => {
    if (!carry) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    const landed = dragging.current ? dropAt : null
    const id = carry.id
    endDrag()
    if (landed !== null) onReorder(id, landed)
  }
  const slide = (i: number): number => {
    if (!carry || dropAt === null || i === carry.from) return 0
    if (dropAt > carry.from && i > carry.from && i < dropAt) return -carry.height
    if (dropAt <= carry.from && i >= dropAt && i < carry.from) return carry.height
    return 0
  }

  // ---- Resize: the right edge, while open ----
  const resize = (e: PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    e.preventDefault()
    const x0 = e.clientX
    const w0 = width
    const grip = e.currentTarget
    grip.setPointerCapture(e.pointerId)
    let last = w0
    const move = (ev: globalThis.PointerEvent): void => {
      last = Math.max(SIDEBAR_WIDTH.min, Math.min(SIDEBAR_WIDTH.max, w0 + ev.clientX - x0))
      setDragW(last)
    }
    const up = (): void => {
      grip.removeEventListener('pointermove', move)
      grip.removeEventListener('pointerup', up)
      grip.removeEventListener('pointercancel', up)
      setSidebarWidth(last)
      setDragW(null)
    }
    grip.addEventListener('pointermove', move)
    grip.addEventListener('pointerup', up)
    grip.addEventListener('pointercancel', up)
  }

  if (!tabs.length) return null
  const labels = tabLabels(tabs)
  const kept = query
    ? tabs.map((t, i) => findKeeps(query, labels[i], t.kind === 'settings' ? '' : t.cwd))
    : null
  const firstKept = kept ? tabs.find((_, i) => kept[i]) : undefined
  const auxClose = (e: MouseEvent, id: string): void => {
    if (e.button === 1) {
      e.preventDefault()
      onClose(id)
    }
  }
  return (
    <div
      data-sidebar-slot
      className="relative z-30 flex min-h-0 shrink-0"
      // Collapsed, the slot takes no room: the terminal keeps its full width.
      style={{ width: collapsed ? 0 : width }}
    >
      <nav
        ref={nav}
        role="tablist"
        aria-label="Open tabs"
        aria-orientation="vertical"
        data-tab-sidebar
        data-tab-style={prompt ? 'prompt' : 'classic'}
        data-sidebar-mode={mode}
        data-sidebar-shown={visible || undefined}
        data-sidebar-edge={edge}
        inert={!visible}
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          for (const f of e.dataTransfer.files ?? []) {
            const path = window.prism.getDroppedPath(f)
            if (path) onDropFolder(path)
          }
        }}
        // COLLAPSED, it is never see-through (owner, 2026-10-12: "when you
        // have the compact sidebar, that sidebar should not be see-through ...
        // you can see the content underneath"); pinned open, it is.
        className={`p-styled-font absolute inset-y-0 left-0 flex flex-col ${collapsed ? 'bg-[var(--p-secondary-solid)]' : 'bg-[var(--p-secondary)]'} text-[13px] ${
          collapsed
            ? 'transition-[left,box-shadow] duration-[240ms] [transition-timing-function:cubic-bezier(.16,1,.3,1)]'
            : ''
        } ${
          // SLID OUT over the terminal it floats: the deep shadow. Open: a
          // shadow as its edge, or on black, where a shadow cannot show, a
          // hairline.
          collapsed && visible
            ? 'shadow-[14px_0_40px_-8px_rgba(0,0,0,.8)]'
            : edge === 'line'
              ? 'border-r border-[var(--p-divider)]'
              : edge === 'none'
                ? ''
                : edge === 'shadow-light'
                  ? 'shadow-[4px_0_16px_-6px_rgba(0,0,0,.22)]'
                  : 'shadow-[6px_0_22px_-6px_rgba(0,0,0,.55)]'
        } ${carry?.live ? 'cursor-grabbing [&_*]:cursor-grabbing' : ''}`}
        // Slid by its LEFT, never a transform: Windows is told where a drag
        // region is from the layout, and a transformed panel's grab strip was
        // reported where its slide started (measured, WM_NCHITTEST).
        // The shadow falls on the terminal's side only, BELOW the bar beside
        // it: blurred, it reached up into the bar and drew a seam between the
        // two (owner, 2026-10-12: "I can see a border between them"; then, of
        // the slid-out sidebar, "it doesn't seem like it connects with the
        // title bar"). Clipped above and below, open to the right under the bar.
        style={{
          width,
          left: collapsed && !visible ? -(width + 16) : 0,
          clipPath: `polygon(0 0, 100% 0, 100% ${BAR_H}px, calc(100% + 60px) ${BAR_H}px, calc(100% + 60px) 100%, 0 100%)`
        }}
      >
        {/* SLID OUT, THE CORNER WHERE IT MEETS THE BAR: a quarter circle of
            the shared colour under the bar's end, as the open sidebar's
            terminal is cut round there, so the two read as one surface. */}
        {collapsed && visible && (
          <span
            data-sidebar-corner
            aria-hidden
            className="pointer-events-none absolute left-full h-2.5 w-2.5"
            style={{
              top: BAR_H,
              background:
                'radial-gradient(circle at 100% 100%, transparent 9.5px, var(--p-secondary-solid) 10px)'
            }}
          />
        )}
        {/* THE APP'S NAME, at the top (owner, 2026-10-12: "a prism terminal
            logo and text could look nice up there"): the app's own mark in
            the accent (AppMark), beside its name.
            With no title bar it is also what moves the window (owner,
            2026-10-11: "so that you can grab that area"): Windows keeps the
            top few pixels as its resize border (measured with WM_NCHITTEST, a
            10 px strip answered HTTOP at its middle), so the band below that
            moves it. */}
        <div
          data-sidebar-brand
          data-sidebar-grab
          className="drag flex h-11 shrink-0 items-center gap-2.5 px-4 pt-1"
        >
          <AppMark size={20} className="shrink-0 text-[var(--p-accent-solid)]" />
          <span className="truncate text-[13.5px] font-semibold tracking-[0.01em] text-[var(--p-side-text)] select-none">
            Prism Terminal
          </span>
        </div>
        <label
          data-sidebar-find
          className="no-drag mx-2 mb-2 flex h-8 shrink-0 cursor-text items-center gap-2 rounded-md bg-[var(--p-hover)] px-2.5 text-[var(--p-dim)] focus-within:ring-1 focus-within:ring-[var(--p-accent-hi)]"
        >
          <svg
            viewBox="0 0 24 24"
            width={14}
            height={14}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            className="shrink-0"
            aria-hidden
          >
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4 4" />
          </svg>
          <input
            ref={find}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFinding(true)}
            onBlur={() => setFinding(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                setQuery('')
                find.current?.blur()
              } else if (e.key === 'Enter' && firstKept) {
                e.preventDefault()
                setQuery('')
                find.current?.blur()
                onPick(firstKept.id)
              }
            }}
            placeholder="Find a tab"
            aria-label="Find a tab"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--p-text)] outline-none placeholder:text-[var(--p-dim)]"
          />
          {!query && (
            <kbd className="shrink-0 font-[inherit] text-[11.5px] text-[var(--p-dim2)]">
              Ctrl+Shift+K
            </kbd>
          )}
        </label>
        <div
          ref={rows}
          data-sidebar-rows
          // ONLY TABS AT THE TOP (owner, 2026-10-11: "the sidebar buttons
          // should be near the bottom rather than the top. only tabs at the
          // top"). With no title bar, the list's empty space below the tabs
          // is what moves the window ("i cant drag the window"); each row is
          // no-drag, so a tab still clicks and drags as a tab.
          className="p-scroll flex min-h-0 flex-1 flex-col gap-px overflow-y-auto pb-2"
        >
          {tabs.map((t, i) => {
            const on = t.id === activeId
            const { failed, state, mark } = looks[i]
            const filled = mark.place === 'fill' && state !== null
            const ink = filled ? palette.ink[state] : undefined
            // Every name in the sidebar's own ink, held to 7:1 (chromeTheme):
            // the accent pill, not a dimmer name, says which tab is in front.
            const nameInk = 'text-[var(--p-side-text)]'
            // The flat marks lie along the row's foot, as along a strip tab's;
            // under Powerline they are the arrow's edge instead.
            const flatMark =
              !prompt &&
              state &&
              (mark.place === 'run' || mark.place === 'line' || mark.place === 'fill') ? (
                <TabMark
                  mark={mark}
                  state={state}
                  background={filled ? palette.fill[state] : paint(mark.colour, 'x')}
                  overlay={mark.overlay === 'run' ? palette.overlay.run : undefined}
                  ink={ink}
                />
              ) : prompt && state && mark.place === 'fill' ? (
                <TabMark mark={mark} state={state} background={palette.fill[state]} ink={ink} />
              ) : null
            const edge =
              prompt && mark.place === 'edge' && state
                ? { motion: mark.motion, background: paint(mark.colour, 'y') }
                : null
            return (
              <div
                key={t.id}
                data-tab
                data-tab-active={on || undefined}
                data-agent={state ? indicator : undefined}
                data-agent-state={state ?? undefined}
                data-agent-present={agentIds.has(t.id) ? '' : undefined}
                onClick={() => {
                  if (dragging.current) {
                    dragging.current = false
                    return
                  }
                  onPick(t.id)
                }}
                onAuxClick={(e) => auxClose(e, t.id)}
                onContextMenu={(e) => menu.openTabMenu(e, t)}
                onPointerDown={(e) => onRowDown(e, t.id, i)}
                onPointerMove={onRowMove}
                onPointerUp={onRowUp}
                onPointerCancel={() => carry && endDrag()}
                hidden={kept ? !kept[i] : undefined}
                className={`no-drag group relative isolate flex h-[46px] shrink-0 items-center gap-2 overflow-hidden transition-colors ${nameInk} ${
                  prompt ? 'mr-1 pl-3 pr-6' : 'mx-1.5 rounded-[4px] pl-3 pr-1.5'
                } ${
                  // The tab in front is a clear filled pill in the accent's tint
                  // (Warp's way, 2026-10-12); the rest light only on hover.
                  on
                    ? 'bg-[color-mix(in_srgb,var(--p-accent-hi)_18%,transparent)]'
                    : 'hover:bg-[var(--p-hover)]'
                }`}
                style={{
                  transform: `translateY(${carry?.id === t.id ? carry.dy : slide(i)}px)`,
                  zIndex: carry?.id === t.id ? 5 : undefined,
                  transition:
                    carry && carry.id !== t.id
                      ? 'transform 170ms cubic-bezier(.23,1,.32,1)'
                      : undefined,
                  ...(prompt ? { clipPath: sideSegmentClip() } : {})
                }}
              >
                {flatMark}
                {/* POWERLINE: the arrow's edge, the divider's ink when plain, the
                    mark's colour and motion when there is one. */}
                {prompt && (
                  <span
                    data-prompt-border
                    aria-hidden
                    className="pointer-events-none absolute inset-0 z-0 bg-[var(--p-divider)]"
                    style={{ clipPath: sideEdgeClip() }}
                  />
                )}
                {edge && state && (
                  <span
                    data-mark="edge"
                    data-prompt-edge={state}
                    data-mark-motion={edge.motion ?? undefined}
                    data-attention={state !== 'working' ? state : undefined}
                    aria-hidden
                    className="pointer-events-none absolute inset-0 z-[1]"
                    style={{ clipPath: sideEdgeClip() }}
                  >
                    <i
                      className={`absolute inset-0 ${motionClass(edge.motion, 'y')}`}
                      style={{
                        background: edge.background,
                        ...(edge.motion === 'flow'
                          ? { backgroundSize: '100% 34px', ['--tile-y' as string]: '34px' }
                          : {})
                      }}
                    />
                  </span>
                )}
                {/* The tab in front: the accent rule. Classic on the terminal's
                    side; Powerline down the row's left, the arrow being its right. */}
                {on && (
                  <span
                    data-side-rule
                    aria-hidden
                    className={`pointer-events-none absolute z-[3] w-0.5 bg-[var(--p-accent-hi)] ${
                      prompt ? 'inset-y-0 left-0' : 'inset-y-[7px] right-0 rounded-full'
                    }`}
                  />
                )}
                {t.kind !== 'settings' && <DictationTabMark sessionId={t.id} />}
                {loadingIds?.has(t.id) && (
                  <span
                    data-tab-loading
                    aria-hidden
                    className="pointer-events-none relative z-[1] inline-block h-[9px] w-[9px] shrink-0 rounded-full border-[1.5px] border-[color-mix(in_srgb,var(--p-text)_22%,transparent)] border-t-[var(--p-accent-solid)] motion-safe:animate-spin"
                  />
                )}
                {mark.place === 'ring' ? (
                  <TabMark mark={mark} state={state} background={paint(mark.colour, 'x')} />
                ) : (
                  // Under Ring every name starts at one x: a tab with no mark
                  // keeps the mark's 12 px slot, as the New tab row's + does.
                  indicator === 'ring' &&
                  !loadingIds?.has(t.id) && <span aria-hidden className="-mr-0.5 w-3 shrink-0" />
                )}
                <button
                  role="tab"
                  aria-selected={on}
                  tabIndex={on ? 0 : -1}
                  className="relative z-[1] flex min-w-0 flex-1 flex-col py-1 text-left"
                  style={ink ? { color: ink } : undefined}
                  title={
                    t.kind === 'settings'
                      ? undefined
                      : failed
                        ? `${t.cwd}\n${failedLabel(failedKinds?.current.get(t.id))}`
                        : t.cwd
                  }
                  onClick={(e) => {
                    e.stopPropagation()
                    if (dragging.current) {
                      dragging.current = false
                      return
                    }
                    onPick(t.id)
                  }}
                >
                  <span className={`truncate ${filled || on ? 'font-semibold' : ''}`}>
                    {labels[i]}
                  </span>
                  {/* The folder it sits in (owner, 2026-10-12: "Second line:
                      Folder path"), dim, so two tabs with one name differ. */}
                  {t.kind !== 'settings' && (
                    <span
                      data-tab-folder
                      className="truncate text-[11.5px] font-normal text-[var(--p-side-dim)]"
                      style={ink ? { color: ink, opacity: 0.75 } : undefined}
                    >
                      {folderLine(t.cwd, home)}
                    </span>
                  )}
                </button>
                <button
                  className={`relative z-[1] grid h-[18px] w-[18px] shrink-0 place-items-center rounded-sm text-[var(--p-icon)] transition-opacity hover:bg-[var(--p-hover-hi)] hover:text-[var(--p-text)] ${
                    on ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                  style={ink ? { color: ink } : undefined}
                  data-tab-close
                  title={`Close ${labels[i]} (Ctrl+Shift+W)`}
                  aria-label={`Close ${labels[i]}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onClose(t.id)
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width={10}
                    height={10}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    aria-hidden
                  >
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
            )
          })}
        </div>
        {/* NEW TAB, A BUTTON AT THE FOOT (owner, 2026-10-12, of the sidebar
            looks mockup: "New tab: Button at the bottom"). Its right click is
            the +'s list of places, as on the strip. */}
        <div className="shrink-0 border-t border-[var(--p-divider)] p-2">
          <button
            data-sidebar-new
            title="New tab (Ctrl+T). Right-click for recent folders"
            onClick={onNew}
            onContextMenu={menu.openPlusMenu}
            className="no-drag flex h-[34px] w-full items-center justify-center gap-2 rounded-md border border-[var(--p-divider)] bg-[var(--p-hover)] text-[13px] text-[var(--p-text)] transition-colors hover:bg-[var(--p-hover-hi)]"
          >
            <svg
              viewBox="0 0 24 24"
              width={13}
              height={13}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M12 5v14m7-7H5" />
            </svg>
            New tab
          </button>
        </div>
        {/* The resize grip, on the sidebar's right edge, while it is open. */}
        {!collapsed && (
          // A 6 px target, and what it shows is one hairline over the
          // sidebar's own edge (owner, 2026-10-11: the 6 px accent bar was
          // too much, "make it more minimalist").
          <div
            data-sidebar-grip
            aria-hidden
            onPointerDown={resize}
            className="no-drag group/grip absolute inset-y-0 -right-[3px] z-10 w-1.5 cursor-col-resize"
          >
            <span
              data-sidebar-grip-line
              className={`pointer-events-none absolute inset-y-0 left-[2px] w-px transition-colors duration-150 ${
                dragW !== null
                  ? 'bg-[var(--p-accent-hi)]'
                  : 'bg-transparent group-hover/grip:bg-[color-mix(in_srgb,var(--p-accent-hi)_60%,transparent)]'
              }`}
            />
          </div>
        )}
      </nav>
      {menu.menus}
    </div>
  )
}
