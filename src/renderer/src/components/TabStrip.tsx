import { useCallback, useEffect, useLayoutEffect, useRef, useState, type JSX, type MouseEvent } from 'react'
import { tabLabels } from '../lib/tabs'
import { planStrip } from '../lib/stripPlan'
import { TabOverflowList, type OverflowRow } from './TabOverflowList'
import { DictationTabMark } from '@core/renderer/components/DictationTabMark'
import { TabMark } from '@core/renderer/components/TabMark'
import { useTabLooks } from './tabLooks'
import { useTabMenus } from './tabMenus'
import { useTabReorder } from './useTabReorder'
import { TabEnd, TabIcon, TabLoading } from './tabParts'
import { auxClose, folderDrop, tabTitle, type TabListProps } from './tabList'
import { keyLabel } from '../lib/keymap'

/**
 * The open shells, as a row under the title bar.
 *
 * Present from the first tab, so the `+` is always somewhere to reach and the
 * chrome never shifts under you when a second tab opens. It goes only when
 * there is nothing open at all, where EmptyState is already offering the way in.
 */

export function TabStrip({
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
  // Every tab's state, mark and colours: the one reading the sidebar shares (#162).
  const { indicator, paint, looks } = useTabLooks({
    tabs,
    activeId,
    workingIds,
    doneIds,
    questionIds,
    failedIds,
    agentIds
  })
  // While ANY drag is in flight the strip stops being a window-drag handle.
  // The empty space after the + is the natural place to drop a folder, but it
  // is app-region drag: Chromium hands presses there to the OS, so no
  // dragover ever arrived and the drop could only be made over a tab. The
  // handle comes back the moment the drag ends.
  const [dragInFlight, setDragInFlight] = useState(false)
  useEffect(() => {
    const on = (): void => setDragInFlight(true)
    const off = (): void => setDragInFlight(false)
    window.addEventListener('dragstart', on, true)
    window.addEventListener('dragenter', on, true)
    window.addEventListener('dragend', off, true)
    window.addEventListener('drop', off, true)
    // A drag that leaves the window, or ends where nothing takes a drop, sends
    // this page neither dragend (that goes to Explorer) nor drop, and the strip
    // stayed no window handle for good (code review 2026-09-24, #33). No
    // pointer event arrives while a system drag is in flight, so the first
    // one after it is proof the drag is over.
    window.addEventListener('pointermove', off, true)
    window.addEventListener('pointerdown', off, true)
    return () => {
      window.removeEventListener('pointermove', off, true)
      window.removeEventListener('pointerdown', off, true)
      window.removeEventListener('dragstart', on, true)
      window.removeEventListener('dragenter', on, true)
      window.removeEventListener('dragend', off, true)
      window.removeEventListener('drop', off, true)
    }
  }, [])
  const menu = useTabMenus({ onClose, onOpenRecent, onOrchestrator })
  const strip = useRef<HTMLDivElement>(null)
  const plus = useRef<HTMLButtonElement>(null)
  const moreBtn = useRef<HTMLButtonElement>(null)
  // MANY TABS (#146): the room the tabs have, measured, so the plan below can
  // say which are named, which are icons and which wait in the +N list.
  const [room, setRoom] = useState(Number.POSITIVE_INFINITY)
  const anyTabs = tabs.length > 0
  useLayoutEffect(() => {
    const el = strip.current
    if (!el) return
    const measure = (): void => setRoom(el.clientWidth - 4 - (plus.current?.offsetWidth ?? 28) - 4)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [anyTabs])
  /** The open +N list: its anchor, and whether it lists every tab (Find a tab). */
  const [list, setList] = useState<{ anchor: DOMRect; all: boolean } | null>(null)
  const closeList = useCallback((): void => setList(null), [])
  // FIND A TAB in this layout (#146): the list with every tab in it.
  useEffect(() => {
    const go = (): void => {
      const anchor = moreBtn.current?.getBoundingClientRect() ?? plus.current?.getBoundingClientRect()
      if (anchor) setList({ anchor, all: true })
    }
    window.addEventListener('prism:find-tab', go)
    return () => window.removeEventListener('prism:find-tab', go)
  }, [])
  // Carried along the row, never out of it (useTabReorder, the sidebar's too).
  const reorder = useTabReorder({ axis: 'x', container: strip, onReorder })
  const { carry } = reorder
  if (!tabs.length) return null
  const labels = tabLabels(tabs)
  const needs = new Set([...doneIds, ...questionIds, ...(failedIds ?? [])])
  const plan = planStrip({ ids: tabs.map((t) => t.id), activeId, needs, room })
  const hiddenIdx = plan.flatMap((s, i) => (s === 'hidden' ? [i] : []))
  /** Tab i's ring mark, or null: the end slot's and the +N list's. */
  const ringOf = (i: number): JSX.Element | null => {
    const { state, mark } = looks[i]
    return mark.place === 'ring' ? <TabMark mark={mark} state={state} background={paint(mark.colour, 'x')} /> : null
  }
  const rowOf = (i: number): OverflowRow => {
    const t = tabs[i]
    return {
      id: t.id,
      label: labels[i],
      cwd: t.cwd,
      icon: <TabIcon agent={agentIds.has(t.id) ? agentKinds?.current.get(t.id) : null} settings={t.kind === 'settings'} />,
      mark: looks[i].state ? ringOf(i) : null,
      needs: needs.has(t.id)
    }
  }
  return (
    <div
      role="tablist"
      aria-label="Open tabs"
      ref={strip}
      // A folder dropped here opens a NEW tab in it.
      {...folderDrop(onDropFolder)}
      // While a tab is genuinely being carried the whole strip wears the
      // closed hand, children included: a tab is made of a label button, an
      // icon slot and an X, each with a cursor of its own, and letting them
      // answer for themselves made it flicker under the moving pointer.
      data-tab-strip
      // In the top row the ROW paints --p-tabs: a second coat here made the
      // strip 92% solid under See-through while the buttons beside it were
      // 73% (owner, 2026-10-11: "the tab bar" stays opaque).
      className={`${dragInFlight ? 'no-drag' : 'drag'} p-styled-font relative flex min-w-0 flex-1 items-stretch gap-0 overflow-hidden pr-1 text-[12px] transition-[background-color,border-color] duration-[550ms] [transition-timing-function:cubic-bezier(.16,1,.3,1)] ${
        carry?.live ? 'cursor-grabbing [&_*]:cursor-grabbing' : ''
      }`}
    >
      {tabs.map((t, i) => {
        if (plan[i] === 'hidden') return null
        const on = t.id === activeId
        const { failed, state, mark } = looks[i]
        // The tab in front is told by its brighter ink.
        const nameInk = on ? 'text-[var(--p-text)]' : 'text-[var(--p-dim)] hover:text-[var(--p-text)]'
        // BAR: the line along the tab's foot (`run` while working, `line` after).
        const bar =
          state && (mark.place === 'run' || mark.place === 'line') ? (
            <TabMark mark={mark} state={state} background={paint(mark.colour, 'x')} />
          ) : null
        // RING: at the tab's end, in the close button's place (TabEnd). A tab
        // still coming back to its agent (#106) wears its loading ring there
        // too (owner, 2026-10-13: "make that ring appear where the ring style
        // agent indicator goes, not on the left side").
        const ring = loadingIds?.has(t.id) ? <TabLoading /> : ringOf(i)
        const body = (
          <>
            {bar}
            {t.kind !== 'settings' && <DictationTabMark sessionId={t.id} />}
            {/* THE AGENT'S ICON (owner, 2026-10-12, option 3 of the tab looks
                mockup): at the left, no box, the name centred in the rest. */}
            <TabIcon agent={agentIds.has(t.id) ? agentKinds?.current.get(t.id) : null} settings={t.kind === 'settings'} />
            <button
              role="tab"
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              // CENTRED (owner, 2026-09-28), and never under four characters
              // wide, so a one-letter name is not a sliver.
              data-label={labels[i]}
              className="relative z-[1] min-w-[4ch] flex-1 truncate py-1 text-center"
              title={tabTitle(t, failed, failedKinds)}
              data-tip-to="[data-tab]"
              onClick={() => {
                // A press that travelled is a drag, not a pick.
                if (reorder.isPick()) onPick(t.id)
              }}
            >
              {labels[i]}
            </button>
            <TabEnd ring={ring} label={labels[i]} on={on} size={16} onClose={() => onClose(t.id)} />
          </>
        )
        // The whole tab is the click target, a press that travels is a drag (#70).
        const shared = {
          'data-agent': state ? indicator : undefined,
          'data-agent-state': state ?? undefined,
          'data-agent-present': agentIds.has(t.id) ? '' : undefined,
          // EVERY TAB IS ONE WIDTH (owner, 2026-09-21; 2026-10-12, removing
          // Dynamic: "have it just be fixed"), shrinking equally when out of room.
          'data-tab-active': on || undefined,
          onClick: () => {
            // A press that travelled is a drag, not a pick.
            if (reorder.isPick()) onPick(t.id)
          },
          onAuxClick: (e: MouseEvent) => auxClose(e, () => onClose(t.id)),
          // The tab's own menu (2026-08-30). The wrapper owns it, not the inner
          // button: the padding and the mark slots are part of the target. A
          // right click cannot start a carry: onTabPointerDown ignores button 2.
          onContextMenu: (e: MouseEvent) => menu.openTabMenu(e, t),
          'data-tab': true,
          'data-tab-orchestrator': t.orchestrator || undefined,
          ...reorder.handlers(t.id, i)
        }
        const motion = reorder.motion(t.id, i)
        // THE ORCHESTRATOR LEADS (owner, 2026-10-16: "first in the list and
        // there's a divider line"): an accent outline on the tab, and an accent
        // rule after it, before the rest.
        const lead = t.orchestrator ? ' outline outline-[1.5px] -outline-offset-[1.5px] outline-[color-mix(in_srgb,var(--p-accent-hi)_70%,transparent)]' : ''
        const withRule = (el: JSX.Element): JSX.Element | JSX.Element[] =>
          t.orchestrator
            ? [
                el,
                <span
                  key={`${t.id}-lead`}
                  data-tab-lead-divider
                  aria-hidden
                  className="mx-1.5 my-2 w-0.5 shrink-0 self-stretch rounded-full bg-[color-mix(in_srgb,var(--p-accent-hi)_60%,transparent)]"
                />
              ]
            : el
        if (plan[i] === 'icon')
          return withRule(
            // AN ICON TAB (#146): a tab at rest when names no longer fit. Its
            // name is its tooltip and its accessible name; its mark sits on the
            // icon's corner; it closes from its menu, a middle click or Ctrl+W.
            <div
              key={t.id}
              {...shared}
              data-tab-icon-only
              className={`no-drag group relative isolate flex w-10 shrink-0 items-center justify-center transition-colors ${nameInk} hover:bg-[var(--p-hover)]${lead}`}
              style={motion}
            >
              {bar}
              {t.kind !== 'settings' && <DictationTabMark sessionId={t.id} />}
              <button
                role="tab"
                aria-selected={false}
                tabIndex={-1}
                aria-label={labels[i]}
                data-label={labels[i]}
                className="relative z-[1] grid h-full w-full place-items-center"
                title={tabTitle(t, failed, failedKinds)}
                data-tip-to="[data-tab]"
                onClick={() => {
                  if (reorder.isPick()) onPick(t.id)
                }}
              >
                <TabIcon agent={agentIds.has(t.id) ? agentKinds?.current.get(t.id) : null} settings={t.kind === 'settings'} />
                <span className="sr-only">{labels[i]}</span>
              </button>
              {ring && (
                <span
                  data-tab-icon-mark
                  className="pointer-events-none absolute right-[2px] top-[3px] z-[2] grid h-[15px] w-[15px] place-items-center rounded-full bg-[var(--p-tabs)]"
                >
                  {ring}
                </span>
              )}
              <span data-tab-sep aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-px bg-[var(--p-divider)]" />
            </div>
          )
        return withRule(
          <div
            key={t.id}
            {...shared}
            // WIDER FOR THE ICON (2026-10-12): 18 px and its gap came out of the
            // name's room, so the basis grew from 114 to 150 and the floor from
            // 64 to 84; every tab is still one width.
            className={`no-drag group relative isolate flex items-center gap-1.5 px-2.5 transition-colors min-w-[84px] flex-[0_1_150px] ${nameInk}${lead} ${
              on
                ? // THE SECONDARY COLOUR (owner, 2026-09-03): the strip, the
                  // tabs at rest and this one are all --p-tabs, one surface
                  // with the title bar. --p-tab-active is kept as a token (it
                  // equals --p-tabs on an opaque window and paints nothing on
                  // an acrylic one, where a second coat would be a fill by
                  // accident) and the active tab is told by its ink, not a fill.
                  'bg-[var(--p-tab-active)]'
                : // --p-hover, not a white film: the theme may be a light
                  // one, where white over paper is no hover at all.
                  'hover:bg-[var(--p-hover)]'
            }`}
            style={motion}
          >
            {/* The active mark: an accent rule along the top. */}
            {on && (
              <span
                className="absolute inset-x-0 top-0 z-[3] h-0.5 bg-[var(--p-accent-hi)]"
                aria-hidden
              />
            )}
            {body}
            {/* A FAINT LINE AT EVERY TAB'S RIGHT (owner, 2026-10-11: "no
                borders on classic tabs ... just a faint border"; 2026-10-12:
                "if every tab just had a right border that would solve both
                issues", the last tab having had none before the +). The
                strip's full height, in the divider's ink, so it follows the
                Edges setting. */}
            <span
              data-tab-sep
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 w-px bg-[var(--p-divider)]"
            />
          </div>
        )
      })}
      {hiddenIdx.length > 0 && (
        // THE +N BUTTON (#146): how many tabs wait in the list, and a dot in
        // its mark colour for each that needs you (up to four).
        <button
          ref={moreBtn}
          data-tab-more
          aria-haspopup="listbox"
          aria-expanded={!!list}
          aria-label={`${hiddenIdx.length} more tabs`}
          title={`${hiddenIdx.length} more tabs`}
          className={`no-drag my-1 flex shrink-0 items-center gap-1.5 rounded px-2 text-[12px] font-semibold tabular-nums text-[var(--p-text-soft)] transition-colors hover:bg-[var(--p-hover-hi)] hover:text-[var(--p-text)] ${
            list ? 'bg-[var(--p-hover-hi)] text-[var(--p-text)]' : ''
          }`}
          onClick={(e) => {
            const anchor = e.currentTarget.getBoundingClientRect()
            setList((l) => (l ? null : { anchor, all: false }))
          }}
        >
          +{hiddenIdx.length}
          {hiddenIdx.some((i) => needs.has(tabs[i].id)) && (
            <span className="flex gap-[3px]" aria-hidden>
              {hiddenIdx
                .filter((i) => needs.has(tabs[i].id))
                .slice(0, 4)
                .map((i) => (
                  <span
                    key={tabs[i].id}
                    data-tab-more-dot={looks[i].state ?? ''}
                    className="h-[6px] w-[6px] rounded-full"
                    style={{ background: paint(looks[i].mark.colour, 'x') }}
                  />
                ))}
            </span>
          )}
          <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}
      <button
        ref={plus}
        className="no-drag my-1 grid w-7 shrink-0 place-items-center rounded text-[var(--p-icon)] transition-colors hover:bg-[var(--p-hover-hi)] hover:text-[var(--p-text)]"
        title={`New tab (${keyLabel('new-tab')}). Right-click for recent folders`}
        aria-label="New tab"
        onClick={onNew}
        // The + adds a tab instantly; its RIGHT click is where "somewhere I
        // have been before" lives, so the instant verb stays instant.
        onContextMenu={menu.openPlusMenu}
      >
        <svg
          viewBox="0 0 24 24"
          width={13}
          height={13}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M12 6v12m6-6H6" />
        </svg>
      </button>
      {menu.menus}
      {list && (
        <TabOverflowList
          rows={(list.all ? tabs.map((_, i) => i) : hiddenIdx).map(rowOf)}
          anchor={list.anchor}
          onPick={onPick}
          onRowMenu={(e, id) => {
            const t = tabs.find((x) => x.id === id)
            if (t) menu.openTabMenu(e, t)
          }}
          onClose={closeList}
        />
      )}
    </div>
  )
}
