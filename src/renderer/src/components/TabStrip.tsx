import { useEffect, useLayoutEffect, useRef, useState, type JSX, type MouseEvent } from 'react'
import { tabLabels } from '../lib/tabs'
import { DictationTabMark } from '@core/renderer/components/DictationTabMark'
import { TabMark } from '@core/renderer/components/TabMark'
import { useTabLooks } from './tabLooks'
import { useTabMenus } from './tabMenus'
import { useTabReorder } from './useTabReorder'
import { PromptEdge, TabClose, TabLoading } from './tabParts'
import { auxClose, folderDrop, tabTitle, type TabListProps } from './tabList'
import { useTabStyle } from '../lib/tabStylePrefs'
import { keyLabel } from '../lib/keymap'
import { OVERLAP, edgeBand, ruleClip, segmentClip } from '../lib/promptGeometry'

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
  loadingIds,
  onPick,
  onClose,
  onNew,
  onDropFolder,
  onReorder,
  onOpenRecent
}: TabListProps): JSX.Element | null {
  // The tab style (#143): Classic, the flat strip, or Powerline's chevrons.
  const prompt = useTabStyle() === 'prompt'
  // Every tab's state, mark and colours: the one reading the sidebar shares (#162).
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
  const menu = useTabMenus({ onClose, onOpenRecent })
  const strip = useRef<HTMLDivElement>(null)
  // Carried along the row, never out of it (useTabReorder, the sidebar's too).
  const reorder = useTabReorder({ axis: 'x', container: strip, onReorder })
  const { carry } = reorder
  // The strip's height, for the Powerline rule's cut along the slant and the
  // rainbow's tile down an edge: 32 px under a title bar, the title row's
  // height without one (#91).
  const [stripH, setStripH] = useState(32)
  const hasTabs = tabs.length > 0
  useLayoutEffect(() => {
    const el = strip.current
    if (!el) return
    const measure = (): void => setStripH(el.clientHeight || 32)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [hasTabs])
  if (!tabs.length) return null
  const labels = tabLabels(tabs)
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
      data-tab-style={prompt ? 'prompt' : 'classic'}
      // In the top row the ROW paints --p-tabs: a second coat here made the
      // strip 92% solid under See-through while the buttons beside it were
      // 73% (owner, 2026-10-11: "the tab bar" stays opaque).
      className={`${dragInFlight ? 'no-drag' : 'drag'} p-styled-font relative flex min-w-0 flex-1 items-stretch gap-0 overflow-x-auto pr-1 text-[12px] transition-[background-color,border-color] duration-[550ms] [transition-timing-function:cubic-bezier(.16,1,.3,1)] ${
        carry?.live ? 'cursor-grabbing [&_*]:cursor-grabbing' : ''
      }`}
    >
      {tabs.map((t, i) => {
        const on = t.id === activeId
        const { failed, state, mark } = looks[i]
        const filled = mark.place === 'fill' && state !== null
        const ink = filled ? palette.ink[state] : undefined
        const first = i === 0
        const last = i === tabs.length - 1
        // FULL: ONE NAME COLOUR (owner, 2026-10-10: "Every tab name in Full
        // uses the theme's own text colour, on every tab, idle ones included").
        // Elsewhere the tab in front is told by its brighter ink, as always.
        const nameInk =
          on || indicator === 'full'
            ? 'text-[var(--p-text)]'
            : 'text-[var(--p-dim)] hover:text-[var(--p-text)]'
        // What a flat tab's own mark draws (run, line, fill); the ring sits by
        // the name, and a Powerline edge is drawn by the segment's band.
        const flatMark =
          state && (mark.place === 'run' || mark.place === 'line' || mark.place === 'fill') ? (
            <TabMark
              mark={mark}
              state={state}
              background={filled ? palette.fill[state] : paint(mark.colour, 'x')}
              overlay={mark.overlay === 'run' ? palette.overlay.run : undefined}
              ink={ink}
            />
          ) : null
        const body = (
          <>
            {flatMark}
            {t.kind !== 'settings' && <DictationTabMark sessionId={t.id} />}
            {loadingIds?.has(t.id) && <TabLoading className="no-drag -mr-0.5 ml-2" />}
            {/* RING (#143): the spinner beside the name, only while working. */}
            {mark.place === 'ring' && (
              <TabMark mark={mark} state={state} background={paint(mark.colour, 'x')} />
            )}
            <button
              role="tab"
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              // Fixed: takes whatever the tab leaves after its marks and the
              // close button, and truncates there. Fit: the label sizes the
              // tab, up to 14rem, as before #35.
              // CENTRED in both widths (owner, 2026-09-28), and never under
              // four characters wide, so a one-letter name is not a sliver.
              // THE WEIGHT NEVER MOVES THE STRIP (#164; owner, 2026-10-10: "when
              // you click tabs the ui shifts"). The name goes semi-bold in front
              // on Powerline and on a Full fill, and a heavier name is a wider
              // tab under Fit, which pushed every tab after it. An invisible,
              // zero-height semi-bold copy (`::after`, so never in the text)
              // holds every name at its semi-bold width.
              data-label={labels[i]}
              className={`relative z-[1] min-w-[4ch] truncate py-1 text-center after:invisible after:block after:h-0 after:overflow-hidden after:font-semibold after:content-[attr(data-label)] flex-1 ${
                filled || (prompt && on) ? 'font-semibold' : ''
              } ${prompt ? 'pl-1' : ''}`}
              style={ink ? { color: ink } : undefined}
              title={tabTitle(t, failed, failedKinds)}
              onClick={() => {
                // A press that travelled is a drag, not a pick.
                if (reorder.isPick()) onPick(t.id)
              }}
            >
              {labels[i]}
            </button>
            <TabClose label={labels[i]} on={on} ink={ink} size={16} onClose={() => onClose(t.id)} />
          </>
        )
        // The handlers and the carry are the same in both styles: the whole
        // tab is the click target, a press that travels is a drag (#70).
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
          ...reorder.handlers(t.id, i)
        }
        const motion = reorder.motion(t.id, i)
        if (prompt) {
          // PROMPT (#143): a chevron segment whose arrow EDGE is the mark. The
          // wrapper is the flex item and the carry; it lets the pointer
          // through, so a click lands on the segment's own SHAPE and the notch
          // belongs to the tab whose arrow fills it. The band sits BEHIND the
          // segment and is cut by this segment and the next one, so it fills
          // the gap flush, tip to both corners (lib/promptGeometry).
          // The band tucks 1 px under each segment it meets so the seam never
          // shows, but only under one that PAINTS: an idle segment is see-
          // through now, and a tuck under it would widen the 2.5 px edge to
          // 4.5 (the ground-coloured seam is invisible there anyway).
          const band = edgeBand(last, { self: looks[i].paints, next: !last && looks[i + 1].paints })
          const rule = ruleClip(stripH, first)
          // The edge this segment wears: Minimal's own. A Full working fill has
          // none (owner, 2026-10-10: the pulsing arrow is for the tab you are on).
          const edge = mark.place === 'edge' && state ? { background: paint(mark.colour, 'y') } : null
          return (
            <div
              key={t.id}
              {...shared}
              data-prompt-segment
              className={`no-drag group pointer-events-none relative flex ${'min-w-[72px] flex-[0_1_122px]'}`}
              style={{ ...motion, marginRight: last ? 4 : -OVERLAP }}
            >
              {/* The plain border, the band with no mark (owner, 2026-10-11):
                  the tabs wear the ground, so a ground-coloured gap was no
                  border at all. It wears the divider's ink, so it matches every
                  other edge and follows the Edges setting (fainter on Faint,
                  gone on None): "the chevron border should match the edge
                  border colour". It is drawn UNDER a mark too: the working
                  edge GROWS, and while it was short the border was gone ("the
                  border is gone when it's working, that edge border should
                  still be there"). */}
              <span
                data-prompt-border
                aria-hidden
                className="pointer-events-none absolute inset-y-0 z-0 bg-[var(--p-divider)]"
                style={{ right: band.right, width: band.width, clipPath: band.clip }}
              />
              {edge && state && (
                <PromptEdge
                  mark={mark}
                  state={state}
                  background={edge.background}
                  tile={stripH}
                  className="inset-y-0 z-0"
                  style={{ right: band.right, width: band.width, clipPath: band.clip }}
                />
              )}
              <div
                data-prompt-shape
                // ON THE THEME'S OWN GROUND (2026-10-10 rework): an idle
                // segment paints nothing over the strip and the tab in front is
                // --p-tab-active, exactly Classic's; a hover is Classic's too.
                className={`pointer-events-auto relative z-[1] flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden transition-colors ${nameInk} ${
                  on ? 'bg-[var(--p-tab-active)]' : 'group-hover:bg-[var(--p-hover)]'
                }`}
                style={{ clipPath: segmentClip(first), padding: `0 22px 0 ${first ? 10 : 14}px` }}
              >
                {body}
              </div>
              {/* The tab in front's top rule, cut along the slant and running
                  half a pixel past it, above the segment and its band. */}
              {on && (
                <span
                  data-prompt-rule
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-0.5 bg-[var(--p-accent-hi)]"
                  style={{ clipPath: rule.clip }}
                />
              )}
            </div>
          )
        }
        return (
          <div
            key={t.id}
            {...shared}
            className={`no-drag group relative isolate flex items-center gap-1.5 px-2.5 transition-colors ${'min-w-[64px] flex-[0_1_114px]'} ${nameInk} ${
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
            {/* The active mark: an accent rule along the top. Full never fills
                the tab in front (#143), so the rule is always there. */}
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
      <button
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
    </div>
  )
}
