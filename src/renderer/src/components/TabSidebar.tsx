import {
  useEffect,
  useRef,
  useState,
  type JSX,
  type MouseEvent,
  type PointerEvent,
  type ReactNode
} from 'react'
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
import { REVEAL, useHoverReveal } from '../lib/hoverReveal'
import { useEdgeNear } from '../lib/edgeNear'
import {
  SIDEBAR_WIDTH,
  setSidebarMode,
  setSidebarWidth,
  useSidebarMode,
  useSidebarWidth
} from '../lib/sidebarPrefs'

/** How far the pointer must travel before a press becomes a drag rather than
 *  a click on the tab: the strip's own slop. */
const DRAG_SLOP = 4

/** The sidebar's own button: a panel with its left column and a chevron, the
 *  way editors draw "collapse the sidebar" (owner, 2026-10-11: "not a normal
 *  pin ... like a collapse sidebar icon"). The chevron points the way it goes. */
const PanelGlyph = ({ open }: { open: boolean }): JSX.Element => (
  <svg
    viewBox="0 0 24 24"
    width={15}
    height={15}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect x="3" y="3.5" width="18" height="17" rx="2.5" />
    <path d="M9 3.5v17" />
    <path d={open ? 'M16 15l-3-3 3-3' : 'M13 9l3 3-3 3'} />
  </svg>
)

const BTN =
  'no-drag grid h-[26px] w-7 shrink-0 place-items-center rounded text-[var(--p-icon)] transition-colors hover:bg-[var(--p-hover-hi)] hover:text-[var(--p-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--p-accent-hi)]'

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
  onOpenRecent,
  titleRow,
  headStart
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
  /** The title bar is hidden: the sidebar's head is the window's handle. */
  titleRow: boolean
  /** Command help and Settings, at the foot, when there is no title bar. */
  headStart?: ReactNode
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
  const nav = useRef<HTMLElement>(null)
  // A width being dragged lives here until the drag ends; only then is it stored.
  const [dragW, setDragW] = useState<number | null>(null)
  const width = dragW ?? storedWidth
  const collapsed = mode === 'collapsed'
  // Main's word too: the page hears nothing over the resize border (edgeWatch.ts).
  const edge = useEdgeNear(collapsed)
  // COLLAPSED: shown while the pointer is at the window's left edge or on the
  // sidebar itself, and held while one of its menus is open.
  const shownNow = useRef(false)
  const shown = useHoverReveal(
    collapsed,
    (e) => {
      const el = nav.current
      if (!el) return false
      // Its own height (under a title bar there is one).
      const box = el.getBoundingClientRect()
      if (e.clientY < box.top || e.clientY > box.bottom) return false
      if (e.clientX <= REVEAL.zone) return true
      // ON IT once shown, measured to where it COMES TO REST, not where the
      // slide has got to (owner, 2026-10-11: "the sidebar closes before my
      // cursor is near the edge"): a pointer that outran the 260 ms slide was
      // outside the half-drawn box, so it was put away under the hand. The
      // layout width ignores the slide; a few pixels past the edge are its.
      return shownNow.current && e.clientX <= el.offsetWidth + REVEAL.zone
    },
    menu.open || dragW !== null || (edge.left && edge.y >= (titleRow ? 0 : 36)) // 36: the title bar's h-9
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
    if (e.button !== 0) return
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

  // A drag in from Explorer (a folder for a new tab) is not a pointer: no
  // pointermove arrives while it is in flight, so the head stops being a
  // window handle for the length of it, as the strip does.
  const [dragInFlight, setDragInFlight] = useState(false)
  useEffect(() => {
    const on = (): void => setDragInFlight(true)
    const off = (): void => setDragInFlight(false)
    window.addEventListener('dragenter', on, true)
    window.addEventListener('dragend', off, true)
    window.addEventListener('drop', off, true)
    window.addEventListener('pointermove', off, true)
    return () => {
      window.removeEventListener('dragenter', on, true)
      window.removeEventListener('dragend', off, true)
      window.removeEventListener('drop', off, true)
      window.removeEventListener('pointermove', off, true)
    }
  }, [])

  if (!tabs.length) return null
  const labels = tabLabels(tabs)
  const auxClose = (e: MouseEvent, id: string): void => {
    if (e.button === 1) {
      e.preventDefault()
      onClose(id)
    }
  }
  // Hidden off to the left, it is no handle and no stop for Tab: an element
  // moved out of sight can still claim the window's drag region and the keys.
  const handle = titleRow && visible && !dragInFlight ? 'drag' : 'no-drag'
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
        className={`p-styled-font absolute inset-y-0 left-0 flex flex-col border-r border-[var(--p-divider)] bg-[var(--p-tabs)] text-[13px] ${
          collapsed
            ? 'transition-[transform,box-shadow] duration-[260ms] [transition-timing-function:cubic-bezier(.16,1,.3,1)]'
            : ''
        } ${collapsed && visible ? 'shadow-[14px_0_40px_-8px_rgba(0,0,0,.8)]' : ''} ${carry?.live ? 'cursor-grabbing [&_*]:cursor-grabbing' : ''}`}
        style={{ width, transform: collapsed && !visible ? 'translateX(calc(-100% - 16px))' : '' }}
      >
        <div
          ref={rows}
          data-sidebar-rows
          // ONLY TABS AT THE TOP (owner, 2026-10-11: "the sidebar buttons
          // should be near the bottom rather than the top. only tabs at the
          // top"). With no title bar, the list's empty space below the tabs
          // is what moves the window ("i cant drag the window"); each row is
          // no-drag, so a tab still clicks and drags as a tab.
          className={`${handle} p-scroll flex min-h-0 flex-1 flex-col gap-px overflow-y-auto pb-2 pt-1.5`}
        >
          {tabs.map((t, i) => {
            const on = t.id === activeId
            const { failed, state, mark } = looks[i]
            const filled = mark.place === 'fill' && state !== null
            const ink = filled ? palette.ink[state] : undefined
            const nameInk =
              on || indicator === 'full'
                ? 'text-[var(--p-text)]'
                : 'text-[var(--p-dim)] hover:text-[var(--p-text)]'
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
                className={`no-drag group relative isolate flex h-[34px] shrink-0 items-center gap-2 overflow-hidden transition-colors ${nameInk} ${
                  prompt ? 'mr-1 pl-3 pr-6' : 'mx-1.5 rounded-[4px] pl-3 pr-1.5'
                } ${on ? 'bg-[var(--p-hover)]' : 'hover:bg-[var(--p-hover)]'}`}
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
                {mark.place === 'ring' && (
                  <TabMark mark={mark} state={state} background={paint(mark.colour, 'x')} />
                )}
                <button
                  role="tab"
                  aria-selected={on}
                  tabIndex={on ? 0 : -1}
                  className={`relative z-[1] min-w-0 flex-1 truncate py-1 text-left ${filled || on ? 'font-semibold' : ''}`}
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
                  {labels[i]}
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
        {/* THE BUTTONS, AT THE FOOT (owner, 2026-10-11): the +, then, with no
            title bar, command help and Settings, then the sidebar's own
            button. The space between them moves the window too. */}
        <div
          data-sidebar-foot
          className={`${handle} flex h-10 shrink-0 items-center gap-0.5 px-1.5`}
        >
          <button
            className={BTN}
            title="New tab (Ctrl+T). Right-click for recent folders"
            aria-label="New tab"
            data-sidebar-new
            onClick={onNew}
            onContextMenu={menu.openPlusMenu}
          >
            <svg
              viewBox="0 0 24 24"
              width={14}
              height={14}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M12 6v12m6-6H6" />
            </svg>
          </button>
          <span className="min-w-2 flex-1 self-stretch" />
          {headStart && <div className="no-drag flex items-center gap-0.5">{headStart}</div>}
          <button
            className={BTN}
            data-sidebar-toggle={collapsed ? 'expand' : 'collapse'}
            title={
              collapsed
                ? 'Keep the sidebar open'
                : 'Collapse the sidebar: it shows when the pointer reaches the left edge'
            }
            aria-label={collapsed ? 'Keep the sidebar open' : 'Collapse the sidebar'}
            onClick={() => setSidebarMode(collapsed ? 'open' : 'collapsed')}
          >
            <PanelGlyph open={!collapsed} />
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
