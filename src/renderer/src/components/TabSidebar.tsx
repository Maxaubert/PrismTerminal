import { useEffect, useLayoutEffect, useRef, useState, type JSX, type PointerEvent } from 'react'
import { tabLabels } from '../lib/tabs'
import { DictationTabMark } from '@core/renderer/components/DictationTabMark'
import { TabMark } from '@core/renderer/components/TabMark'
import { useTabLooks } from './tabLooks'
import { useTabMenus } from './tabMenus'
import { useTabReorder } from './useTabReorder'
import { TabEnd, TabIcon, TabLoading } from './tabParts'
import { auxClose, folderDrop, tabTitle, type TabListProps } from './tabList'
import { keyLabel } from '../lib/keymap'
import { useHoverReveal } from '../lib/hoverReveal'
import { useEdgeWants } from '../lib/edgeNear'
import { sideWants } from '../lib/revealZones'
import { findKeeps, folderLine } from '../lib/sidebarRows'
import { CORNER_R, OUTSIDE_CORNER } from '../lib/cornerShapes'
import { onDevicePixels, useDevicePixelRatio } from '../lib/devicePixels'
import {
  SIDEBAR_WIDTH,
  setSidebarWidth,
  useSidebarSliding,
  useSidebarLayout,
  useSidebarWidth
} from '../lib/sidebarPrefs'
import { BAR_H, SIDEBAR_SLIDE } from '../lib/chromeLayout'
import { LAYER } from '@core/renderer/components/layers'
import { useHomeDir } from '../lib/appFacts'

/** One card's height, and so its icon band's: the band is square. */
const ROW_H = 46

/**
 * THE TABS AS A SIDEBAR (#162; owner, 2026-10-11): the strip's tabs, one row
 * each, down the window's left side. Everything a tab IS stays the strip's:
 * the same marks from the same rule (`useTabLooks`), the same menus, the same
 * close, middle-click, reorder and folder drop. What is new is only the shape:
 *
 * - THE ICON BAND (owner, 2026-10-12, style 10 of the sidebar looks mockup):
 *   each tab a faint card, its agent's icon in a square band at its left, the
 *   name and folder beside it, the ring at its end in the close's place. The
 *   card in front is tinted with the accent. One style: Powerline went.
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
  agentKinds,
  loadingIds,
  onPick,
  onClose,
  onNew,
  onDropFolder,
  onReorder,
  onOpenRecent,
  onOrchestrator
}: TabListProps): JSX.Element | null {
  const mode = useSidebarLayout()
  // Pinned or unpinned just now: its room and its left slide together.
  const sliding = useSidebarSliding()
  const storedWidth = useSidebarWidth()
  const { indicator, paint, looks } = useTabLooks({
    tabs,
    activeId,
    workingIds,
    doneIds,
    questionIds,
    failedIds,
    agentIds
  })
  const menu = useTabMenus({ onClose, onOpenRecent, onOrchestrator })
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
  const home = useHomeDir()
  // A width being dragged lives here until the drag ends; only then is it stored.
  const [dragW, setDragW] = useState<number | null>(null)
  // On a whole screen pixel, where it meets the bar and the terminal (lib/devicePixels).
  const ratio = useDevicePixelRatio()
  const width = onDevicePixels(dragW ?? storedWidth, ratio)
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
  // The sidebar starts under the bar across the window's top.
  const top = BAR_H
  const fromMain = useEdgeWants(collapsed, (p) => sideWants(p, shownNow.current, top, width))
  // WHILE ITS EDGE IS DRAGGED THE POINTER IS ON IT, whatever the width says:
  // the window hears each move before the grip has widened the sidebar, so the
  // last reading before the release was "just outside", and with a short wait
  // (100 ms) the sidebar went away under the hand that had resized it.
  const resizing = useRef(false)
  const shown = useHoverReveal(
    collapsed,
    (e) => resizing.current || sideWants({ x: e.clientX, y: e.clientY }, shownNow.current, top, width),
    menu.open || dragW !== null || finding || fromMain
  )
  useEffect(() => {
    shownNow.current = shown
  }, [shown])
  const visible = !collapsed || shown
  // How much of the page beside it a slid-out sidebar covers: App cuts that
  // strip of the page away, so only the window's acrylic lies under it.
  // Out: its width. Hidden: -CORNER_R, the cut's curve parked just off the
  // window's edge, where the sidebar's own right edge waits too.
  const cover = collapsed && tabs.length > 0 ? (visible ? width : -CORNER_R) : 0
  // Before paint, in the same frame as the slide's own start: set after it,
  // the cut started a frame late and ran behind the sidebar's edge.
  useLayoutEffect(() => {
    const root = document.documentElement.style
    root.setProperty('--p-sidebar-cover', `${cover}px`)
    // A width being dragged moves the cut at once, never on the slide's curve.
    root.setProperty('--p-sidebar-cover-t', dragW !== null ? '0s' : '')
  }, [cover, dragW])
  useEffect(
    () => () => {
      document.documentElement.style.setProperty('--p-sidebar-cover', `-${CORNER_R}px`)
    },
    []
  )

  // ---- Reorder: the strip's carry, down the column (useTabReorder) ----
  const rows = useRef<HTMLDivElement>(null)
  // Not while Find a tab filters: the hidden rows would be lanes.
  const reorder = useTabReorder({ axis: 'y', container: rows, onReorder, refuse: !!query })
  const { carry } = reorder

  // ---- Resize: the right edge, while open ----
  const resize = (e: PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    e.preventDefault()
    const x0 = e.clientX
    const w0 = width
    const grip = e.currentTarget
    grip.setPointerCapture(e.pointerId)
    resizing.current = true
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
      resizing.current = false
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
  return (
    <div
      data-sidebar-slot
      className={`relative ${LAYER.panel} flex min-h-0 shrink-0`}
      // Collapsed, the slot takes no room: the terminal keeps its full width.
      // Pinned or unpinned, the room grows or shrinks on the slide's curve,
      // so the terminal beside it moves with the sidebar's edge.
      style={{ width: collapsed ? 0 : width, transition: sliding && dragW === null ? `width ${SIDEBAR_SLIDE}` : undefined }}
    >
      <nav
        role="tablist"
        aria-label="Open tabs"
        aria-orientation="vertical"
        data-tab-sidebar
        // A tip here sits BESIDE the row it names (Tooltips), not over the
        // next row down.
        data-tip-side="right"
        data-sidebar-mode={mode}
        data-sidebar-shown={visible || undefined}
        inert={!visible}
        {...folderDrop(onDropFolder)}
        // SLID OUT UNDER SEE-THROUGH, ACRYLIC LIKE THE REST (owner,
        // 2026-10-12: "make sure its acrylic like the rest not just see
        // through"): the window's tint over the window's own acrylic, the page
        // under it cut away (App, --p-sidebar-cover) so the terminal's text
        // never shows through. CSS backdrop blur does nothing in a see-through
        // window (measured in the e2e window, 2026-10-12). It lies ABOVE the
        // page beside it: Settings' search icon showed through (same day).
        className={`p-styled-font absolute inset-y-0 left-0 ${LAYER.panel} flex flex-col bg-[var(--p-secondary)] text-[13px] ${carry?.live ? 'cursor-grabbing [&_*]:cursor-grabbing' : ''}`}
        // Slid by its LEFT, never a transform: Windows is told where a drag
        // region is from the layout, and a transformed panel's grab strip was
        // reported where its slide started (measured, WM_NCHITTEST).
        // OPEN, it draws no edge: the terminal's own (TermEdge) runs down its
        // side and round the corner into the bar's. Clipped to itself, open to
        // the right for its slid-out corner (below).
        style={{
          width,
          // Hidden its width and the corner's off the edge, so its right edge
          // and the page's cut (App's COVER_CUT, -CORNER_R to its width) travel
          // the same way on the same curve: from -(width + 16) the sidebar ran
          // 6 px behind the cut and a band of the window showed beside its line
          // all through the slide (owner, 2026-10-13: the edge "grows thicker
          // to like between 5 to 10 pixels"; measured 14 px, verticalTabs e2e).
          left: collapsed && !visible ? -(width + CORNER_R) : 0,
          transition: collapsed || sliding ? `left ${SIDEBAR_SLIDE}` : undefined,
          clipPath: 'inset(0 -60px 0 0)'
        }}
      >
        {/* SLID OUT, THE CORNER WHERE IT MEETS THE BAR: a quarter circle of
            the shared colour under the bar's end, as the open sidebar's
            terminal is cut round there, so the two read as one surface. Drawn
            whenever it is collapsed, so it travels with the slide both ways;
            hidden, it waits off the window's edge with the sidebar. */}
        {collapsed && (
          <span
            data-sidebar-corner
            aria-hidden
            className="pointer-events-none absolute left-full top-0"
            style={{ width: CORNER_R, height: CORNER_R }}
          >
            {/* The fill, the sidebar's tint cut to the curve by a mask. */}
            <span
              className="absolute inset-0 bg-[var(--p-secondary)]"
              style={{ maskImage: OUTSIDE_CORNER, maskSize: '100% 100%' }}
            />
            {/* The line, round the curve into the bar's. */}
            <span
              className="absolute inset-0"
              style={{
                background:
                  'radial-gradient(circle at 100% 100%, transparent 9px, var(--p-divider) 9.5px, var(--p-divider) 10px, transparent 10.5px)'
              }}
            />
          </span>
        )}
        {/* Slid out, its line: from the bar down, meeting the bar's line
            through the corner above (owner, 2026-10-12: it "has no border ...
            it has that when it's in static mode"), as Panel edges draws it. */}
        {collapsed && (
          <span
            data-sidebar-line
            aria-hidden
            className="pointer-events-none absolute bottom-0 right-0 w-px bg-[var(--p-divider)]"
            style={{ top: CORNER_R }}
          />
        )}
        <label
          data-sidebar-find
          className="no-drag mx-2 mb-2 mt-2.5 flex h-8 shrink-0 cursor-text items-center gap-2 rounded-md bg-[var(--p-hover)] px-2.5 text-[var(--p-dim)] focus-within:ring-1 focus-within:ring-[var(--p-accent-hi)]"
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
              {keyLabel('find-tab')}
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
          className="p-scroll flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pb-2"
        >
          {tabs.map((t, i) => {
            const on = t.id === activeId
            const { failed, state, mark } = looks[i]
            // BAR: the line along the card's foot (`run` while working).
            const bar =
              state && (mark.place === 'run' || mark.place === 'line') ? (
                <TabMark mark={mark} state={state} background={paint(mark.colour, 'x')} />
              ) : null
            // RING: at the card's end, in the close button's place (TabEnd),
            // the loading ring of a tab coming back (#106) included (owner,
            // 2026-10-13).
            const ring = loadingIds?.has(t.id) ? (
              <TabLoading />
            ) : mark.place === 'ring' ? (
              <TabMark mark={mark} state={state} background={paint(mark.colour, 'x')} />
            ) : null
            const row = (
              <div
                key={t.id}
                data-tab
                data-tab-orchestrator={t.orchestrator || undefined}
                data-tab-active={on || undefined}
                data-agent={state ? indicator : undefined}
                data-agent-state={state ?? undefined}
                data-agent-present={agentIds.has(t.id) ? '' : undefined}
                onClick={() => {
                  if (reorder.isPick()) onPick(t.id)
                }}
                onAuxClick={(e) => auxClose(e, () => onClose(t.id))}
                onContextMenu={(e) => menu.openTabMenu(e, t)}
                {...reorder.handlers(t.id, i)}
                hidden={kept ? !kept[i] : undefined}
                // Every name in the sidebar's own ink, held to 7:1 (chromeTheme):
                // the tint, not a dimmer name, says which tab is in front.
                className={`no-drag group relative isolate mx-2 flex shrink-0 items-center gap-2.5 overflow-hidden rounded-[8px] pr-2 text-[var(--p-side-text)] transition-colors ${
                  t.orchestrator ? 'outline outline-[1.5px] -outline-offset-[1.5px] outline-[color-mix(in_srgb,var(--p-accent-hi)_70%,transparent)] ' : ''
                }${
                  on
                    ? 'bg-[color-mix(in_srgb,var(--p-accent-hi)_14%,transparent)]'
                    : 'bg-[color-mix(in_srgb,var(--p-text)_3%,transparent)] hover:bg-[color-mix(in_srgb,var(--p-text)_6%,transparent)]'
                }`}
                style={{ height: ROW_H, ...reorder.motion(t.id, i) }}
              >
                {bar}
                {/* THE ICON BAND: a square the card's height, a shade darker
                    than the card, the agent's icon in it. */}
                <span
                  data-icon-band
                  className="relative z-[1] grid shrink-0 place-items-center self-stretch bg-[color-mix(in_srgb,var(--p-text)_5%,transparent)]"
                  style={{ width: ROW_H }}
                >
                  <TabIcon agent={agentIds.has(t.id) ? agentKinds?.current.get(t.id) : null} settings={t.kind === 'settings'} />
                </span>
                {t.kind !== 'settings' && <DictationTabMark sessionId={t.id} />}
                <button
                  role="tab"
                  aria-selected={on}
                  tabIndex={on ? 0 : -1}
                  className="relative z-[1] flex min-w-0 flex-1 flex-col py-1 text-left"
                  title={tabTitle(t, failed, failedKinds)}
                  data-tip-to="[data-tab]"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (reorder.isPick()) onPick(t.id)
                  }}
                >
                  <span className={`truncate ${on ? 'font-semibold' : ''}`}>
                    {labels[i]}
                  </span>
                  {/* The folder it sits in (owner, 2026-10-12: "Second line:
                      Folder path"), dim, so two tabs with one name differ. */}
                  {t.kind !== 'settings' && (
                    <span
                      data-tab-folder
                      className="truncate text-[11.5px] font-normal text-[var(--p-side-dim)]"
                    >
                      {folderLine(t.cwd, home)}
                    </span>
                  )}
                </button>
                <TabEnd ring={ring} label={labels[i]} on={on} size={18} onClose={() => onClose(t.id)} />
              </div>
            )
            // THE ORCHESTRATOR LEADS (owner, 2026-10-16: "first in the list and
            // there's a divider line under it"): its card wears an accent
            // outline, and an accent rule sets it apart from the rest.
            return t.orchestrator && !(kept && !kept[i])
              ? [
                  row,
                  <div
                    key={`${t.id}-lead`}
                    data-tab-lead-divider
                    aria-hidden
                    className="mx-4 my-1 h-0.5 shrink-0 rounded-full bg-[color-mix(in_srgb,var(--p-accent-hi)_60%,transparent)]"
                  />
                ]
              : row
          })}
        </div>
        {/* NEW TAB, A BUTTON AT THE FOOT (owner, 2026-10-12, of the sidebar
            looks mockup: "New tab: Button at the bottom"). Its right click is
            the +'s list of places, as on the strip. */}
        <div className="shrink-0 border-t border-[var(--p-divider)] p-2">
          <button
            data-sidebar-new
            title={`New tab (${keyLabel('new-tab')}). Right-click for recent folders`}
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
        {/* The resize grip, on the sidebar's right edge: pinned, and slid out
            too (owner, 2026-10-13: "i cant adjust the sidebar width anymore",
            using the sidebar unpinned, which had none). */}
        {visible && (
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
