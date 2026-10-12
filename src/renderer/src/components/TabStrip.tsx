import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type JSX,
  type MouseEvent,
  type PointerEvent
} from 'react'
import { tabLabels, type Tab } from '../lib/tabs'
import { DictationTabMark } from '@core/renderer/components/DictationTabMark'
import { TabMark } from '@core/renderer/components/TabMark'
import { motionClass } from '@core/renderer/components/markClasses'
import { failedLabel } from '@core/renderer/lib/agentHookSignal'
import { useTabLooks } from './tabLooks'
import { useTabMenus } from './tabMenus'
import { useTabStyle } from '../lib/tabStylePrefs'
import { OVERLAP, edgeBand, ruleClip, segmentClip } from '../lib/promptGeometry'
import { dropSlot, type Lane } from '../lib/tabDrop'
import { CARRY_SLIDE, DRAG_SLOP } from '../lib/chromeLayout'

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
}: {
  tabs: Tab[]
  activeId: string | null
  /** Sessions with SUSTAINED recent output: with an agent present, this IS
   *  the indicator. Idle looks default - only working paints. */
  workingIds: ReadonlySet<string>
  /** Sessions whose agent finished while their tab was in the background;
   *  they wear the finished colour until the tab is visited. */
  doneIds: ReadonlySet<string>
  /** Sessions whose agent waits for your answer, unseen (2026-09-28). */
  questionIds: ReadonlySet<string>
  /** Sessions whose turn ended on an error, unseen (#131), and the error's
   *  kind where Claude Code named one. */
  failedIds?: ReadonlySet<string>
  failedKinds?: { readonly current: ReadonlyMap<string, string> }
  /** Sessions whose shell currently hosts an AI CLI (Claude Code, codex). */
  agentIds: ReadonlySet<string>
  /** Tabs still coming back to an agent (#106): a ring before the name,
   *  until the agent has drawn itself. */
  loadingIds?: ReadonlySet<string>
  onPick: (id: string) => void
  onClose: (id: string) => void
  /** The + at the end ADDS a tab. Where it opens is App's to decide (a
   *  chooser, or the one fixed folder Settings names). */
  onNew: () => void
  /** Something dragged in from Explorer and dropped on the strip: a new tab
   *  there. The path is handed over AS DROPPED, folder or file, because the
   *  renderer cannot stat; whoever owns the handler resolves a file to the
   *  folder holding it. */
  onDropFolder: (path: string) => void
  /** A tab dragged along the strip lands in front of `toIndex` (#70). */
  onReorder: (id: string, toIndex: number) => void
  /** Open a folder from the + menu's list of places a tab has been opened. */
  onOpenRecent: (path: string) => void
}): JSX.Element | null {
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
  // A tab being carried (#71 follow-up): the strip animates it rather than
  // drawing a hairline - the tab lifts out and its neighbours slide across to
  // open the gap it would drop into, which is what "picked up" looks like.
  // Reordering is a POINTER drag, not an HTML5 one (owner, 2026-08-23): a
  // system drag goes anywhere on screen and carries an OS snapshot; a tab
  // should slide left and right inside its own row and nowhere else. The
  // strip keeps its HTML5 handlers for a FOLDER dropped onto it from Explorer
  // - that is a different gesture with a different meaning.
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
  const [dropAt, setDropAt] = useState<number | null>(null)
  const [carry, setCarry] = useState<{
    id: string
    from: number
    width: number
    dx: number
    /** True once the press travelled past the slop: only THEN is it a drag. */
    live: boolean
  } | null>(null)
  // The tab boundaries as they were when the drag STARTED. Asking which tab
  // sits under the pointer cannot work once they animate: the neighbour
  // slides out from under the cursor, the answer flips back, and the strip
  // judders. Frozen geometry has no feedback loop.
  const lanes = useRef<Lane[]>([])
  const strip = useRef<HTMLDivElement>(null)
  const startX = useRef(0)
  /** True once the press has travelled far enough to BE a drag: a plain click
   *  must still switch tabs. */
  const dragging = useRef(false)
  /** Whatever had the keyboard before the drag, which is nearly always the
   *  shell. Dragging a tab is not leaving it. */
  const heldFocus = useRef<HTMLElement | null>(null)
  const endDrag = (): void => {
    setDropAt(null)
    setCarry(null)
    lanes.current = []
    const el = heldFocus.current
    heldFocus.current = null
    if (el && document.contains(el)) requestAnimationFrame(() => el.focus())
  }
  const onTabPointerDown = (e: PointerEvent<HTMLDivElement>, id: string, i: number): void => {
    if (e.button !== 0) return
    // The X is not a handle: capturing the pointer here would swallow its
    // own click and close nothing.
    if ((e.target as HTMLElement).closest('[data-tab-close]')) return
    heldFocus.current = document.activeElement as HTMLElement | null
    const boxes = [...(strip.current?.querySelectorAll('[data-tab]') ?? [])].map((el) =>
      el.getBoundingClientRect()
    )
    lanes.current = boxes.map((b) => ({ left: b.left, width: b.width, mid: b.left + b.width / 2 }))
    startX.current = e.clientX
    dragging.current = false
    setCarry({ id, from: i, width: boxes[i]?.width ?? 0, dx: 0, live: false })
    setDropAt(i)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onTabPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    if (!carry) return
    const raw = e.clientX - startX.current
    if (!dragging.current && Math.abs(raw) < DRAG_SLOP) return
    dragging.current = true
    // Clamped to the row: the tab cannot be carried out of the strip, which
    // is the whole point of doing this with the pointer.
    const lane = lanes.current[carry.from]
    const box = strip.current?.getBoundingClientRect()
    const dx =
      lane && box
        ? Math.max(box.left - lane.left, Math.min(raw, box.right - (lane.left + lane.width)))
        : raw
    setCarry((c) => (c ? { ...c, dx, live: true } : c))
    // The CARRIED tab decides, not the pointer: it is what the eye is
    // following, and it keeps a grab near an edge honest. Its leading edge,
    // so first place is in reach (#125, lib/tabDrop).
    setDropAt(dropSlot(lanes.current, carry.from, dx))
  }
  const onTabPointerUp = (e: PointerEvent<HTMLDivElement>): void => {
    if (!carry) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    const landed = dragging.current ? dropAt : null
    const id = carry.id
    endDrag()
    if (landed !== null) onReorder(id, landed)
  }
  /** How far a tab slides to open the gap: everything between the carried
   *  tab's old slot and the one under the pointer shifts by its width. */
  const slide = (i: number): number => {
    if (!carry || dropAt === null || i === carry.from) return 0
    if (dropAt > carry.from && i > carry.from && i < dropAt) return -carry.width
    if (dropAt <= carry.from && i >= dropAt && i < carry.from) return carry.width
    return 0
  }
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
  // Middle-click closes, the way every tab strip does. `auxclick` rather than
  // mousedown so a stray middle press while scrolling does not lose a tab.
  const auxClose = (e: MouseEvent, id: string): void => {
    if (e.button === 1) {
      e.preventDefault()
      onClose(id)
    }
  }
  return (
    <div
      role="tablist"
      aria-label="Open tabs"
      ref={strip}
      onDragOver={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onDrop={(e) => {
        // Dropping a folder here opens a NEW tab in it; stopPropagation keeps
        // a window-level drop handler from hearing it too. Tabs themselves
        // reorder by pointer, not by this.
        e.preventDefault()
        e.stopPropagation()
        for (const f of e.dataTransfer.files ?? []) {
          // Empty for a File that did not come off the disk (an image dragged
          // out of a browser): there is no folder to open a shell in.
          const path = window.prism.getDroppedPath(f)
          if (path) onDropFolder(path)
        }
      }}
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
            {loadingIds?.has(t.id) && (
              <span
                data-tab-loading
                aria-hidden
                className="no-drag pointer-events-none relative z-[1] -mr-0.5 ml-2 inline-block h-[9px] w-[9px] shrink-0 rounded-full border-[1.5px] border-[color-mix(in_srgb,var(--p-text)_22%,transparent)] border-t-[var(--p-accent-solid)] motion-safe:animate-spin"
              />
            )}
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
              // The label is the folder's last segment; the whole path is here.
              // While the Failed line shows, what failed is said under the
              // path (#131): "Failed: rate limit".
              title={
                t.kind === 'settings'
                  ? undefined
                  : failed
                    ? `${t.cwd}\n${failedLabel(failedKinds?.current.get(t.id))}`
                    : t.cwd
              }
              onClick={() => {
                // A press that travelled is a drag, not a pick.
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
              className={`relative z-[1] grid h-4 w-4 shrink-0 place-items-center rounded-sm text-[var(--p-icon)] transition-opacity hover:bg-[var(--p-hover-hi)] hover:text-[var(--p-text)] ${
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
            if (dragging.current) {
              dragging.current = false
              return
            }
            onPick(t.id)
          },
          onAuxClick: (e: MouseEvent) => auxClose(e, t.id),
          // The tab's own menu (2026-08-30). The wrapper owns it, not the inner
          // button: the padding and the mark slots are part of the target. A
          // right click cannot start a carry: onTabPointerDown ignores button 2.
          onContextMenu: (e: MouseEvent) => menu.openTabMenu(e, t),
          'data-tab': true,
          onPointerDown: (e: PointerEvent<HTMLDivElement>) => onTabPointerDown(e, t.id, i),
          onPointerMove: onTabPointerMove,
          onPointerUp: onTabPointerUp,
          onPointerCancel: () => carry && endDrag()
        }
        const motion = {
          transform: `translateX(${carry?.id === t.id ? carry.dx : slide(i)}px)`,
          zIndex: carry?.id === t.id ? 5 : undefined,
          // What you carry is a COPY - Chromium's own drag snapshot - so the
          // tab you picked up stays exactly where it was, solid, and the strip
          // only really rearranges when the drop lands. The neighbours sliding
          // open the gap are the preview.
          transition:
            carry && carry.id !== t.id ? `transform ${CARRY_SLIDE}` : undefined
        }
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
          const edge =
            mark.place === 'edge' && state
              ? { motion: mark.motion, background: paint(mark.colour, 'y') }
              : null
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
                <span
                  data-mark="edge"
                  data-prompt-edge={state}
                  data-mark-motion={edge.motion ?? undefined}
                  data-attention={state !== 'working' ? state : undefined}
                  data-rainbow={mark.place === 'edge' && mark.colour === 'rainbow' ? '' : undefined}
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 z-0"
                  style={{ right: band.right, width: band.width, clipPath: band.clip }}
                >
                  <i
                    className={`absolute inset-0 ${motionClass(edge.motion, 'y')}`}
                    style={{
                      background: edge.background,
                      ...(edge.motion === 'flow'
                        ? {
                            backgroundSize: `100% ${stripH}px`,
                            ['--tile-y' as string]: `${stripH}px`
                          }
                        : {})
                    }}
                  />
                </span>
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
        title="New tab (Ctrl+T). Right-click for recent folders"
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
