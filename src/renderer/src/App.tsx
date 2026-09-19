import { lazy, Suspense, useCallback, useEffect, useRef, useState, type JSX } from 'react'
import type { AgentKind, DetectedAgent } from '@shared/types'
import TerminalPanel, {
  disposeTermSession,
  ensureTermSession,
  focusTermSession
} from '@core/renderer/components/TerminalPanel'
import TermFind from '@core/renderer/components/TermFind'
import { TabStrip } from './components/TabStrip'
import TitleBar from './components/TitleBar'
import EmptyState from './components/EmptyState'
import { Dialog } from './components/Dialog'
import {
  EMPTY,
  addTab,
  closeTab,
  openSettings,
  pickTab,
  reorderTabs,
  setCwd,
  shellTabs,
  stepTab,
  tabLabels,
  type TabState
} from './lib/tabs'
import { useAgentIndicator } from '@core/renderer/lib/useAgentIndicator'
import { useDictationArm } from '@core/renderer/lib/useDictation'
import { DictationPill } from '@core/renderer/components/DictationPill'
import { humanFor, workingFor } from '@core/renderer/lib/agentClock'
import { forgetSession, markResume, markTouched } from '@core/renderer/lib/termActivity'
import { onCwd, pasteInto } from '@core/renderer/lib/termBus'
import { quotePaths } from '@core/renderer/lib/termPaste'
import { ContextMenu } from './components/ContextMenu'
import { rememberRoot } from '@core/renderer/lib/recentRoots'
import { savedShellId } from '@core/renderer/lib/termPrefs'
import { newTabFolder, newTabMode } from './lib/newTabPrefs'
import {
  AGENT_NAMES,
  asksBeforeClosingTab,
  closeQuestionTitle,
  holdsWindowClose
} from '@core/renderer/lib/agentClose'
import { onTermLookChange, termAcrylic, termOpacity, termThemeId } from '@core/renderer/lib/termLook'
import { presetAccent, resolveTermTheme } from '@core/renderer/lib/termTheme'
import { applyChrome, chromeTokens } from './lib/chromeTheme'

const Settings = lazy(() => import('./components/Settings'))

/** What a close question is about to interrupt. */
interface Ask {
  /** A tab id, or 'window' for the whole window. */
  target: string
  label: string
  /** `forMs` is how long it has been mid-answer; null when it is only
   *  present, waiting at its own prompt. */
  agent: { kind: DetectedAgent; forMs: number | null }
  /** How many OTHER tabs are also mid-answer (the window question only). */
  others: number
}

let seq = 0
const nextId = (): string => 't' + Date.now().toString(36) + '-' + String((seq += 1))

/** The window wears the terminal's theme; main hears about the material. */
function paintChrome(): void {
  const acrylic = termAcrylic()
  const id = termThemeId()
  const tokens = chromeTokens(resolveTermTheme(id), acrylic ? termOpacity() : 100, presetAccent(id))
  applyChrome(tokens)
  window.prism.setWindowBg(tokens.vars['--p-bg-solid'])
  void window.prism.setAcrylic(acrylic)
}

export default function App(): JSX.Element {
  const [state, setState] = useState<TabState>(EMPTY)
  /** The shell the find bar was opened over; it belongs to that shell alone. */
  const [findFor, setFindFor] = useState<string | null>(null)
  const [ask, setAsk] = useState<Ask | null>(null)
  /** The terminal's own right-click menu, at the pointer. */
  const [termMenu, setTermMenu] = useState<{ x: number; y: number } | null>(null)
  const { tabs, activeId } = state
  const active = tabs.find((t) => t.id === activeId) ?? null
  const activeShell = active && active.kind !== 'settings' ? active : null
  const indicator = useAgentIndicator(activeShell ? activeShell.id : null)
  // Dictation (#13) is the core's. It is armed here because this is where
  // "which shell is in front" is known; it renders nothing and re-renders
  // nothing, and with the setting off it listens to nothing.
  useDictationArm(activeShell ? activeShell.id : null)
  const findOpen = !!activeShell && findFor === activeShell.id
  const { agentIds, workingIds, doneIds, agentKinds } = indicator

  // The latest of everything, for listeners registered once.
  const live = useRef({ state, workingIds, agentIds })
  useEffect(() => {
    live.current = { state, workingIds, agentIds }
  })

  useEffect(() => {
    paintChrome()
    return onTermLookChange(paintChrome)
  }, [])

  const openTab = useCallback((cwd: string, resume?: string): string => {
    const id = nextId()
    // A shell restored over an agent conversation launches straight into it:
    // the id rides the spawn, nothing is ever visibly typed.
    if (resume) markResume(id, resume)
    rememberRoot(cwd)
    ensureTermSession(id, cwd, savedShellId())
    setState((s) => addTab(s, id, cwd))
    return id
  }, [])

  /** The user's own folder: where a new tab opens when Settings names none.
   *  Asked once; main is the one that knows. */
  const home = useRef('')

  const prewarm = useCallback(() => {
    // Only a folder known ahead of the click can be warmed; asking cannot.
    const dir = newTabMode() === 'folder' ? newTabFolder() || home.current : ''
    if (dir) window.prism.termPrewarm(dir, savedShellId())
  }, [])

  const newTab = useCallback(async () => {
    const cwd =
      newTabMode() === 'folder'
        ? newTabFolder() || home.current || (await window.prism.homeDir())
        : // Cancelling the chooser opens nothing.
          await window.prism.pickFolder()
    if (!cwd) return
    openTab(cwd)
    prewarm()
  }, [openTab, prewarm])

  /** Rebuild last session's strip. Every shell spawns NOW, in front or not:
   *  each conversation resumes at launch, not when its tab is first visited. */
  const restore = useCallback(() => {
    void window.prism.restoreTabs().then((r) => {
      const ids = r.tabs.map((t) => openTab(t.cwd, t.resume))
      const front = ids[r.active]
      if (front) setState((s) => pickTab(s, front))
      prewarm()
    })
  }, [openTab, prewarm])

  useEffect(() => {
    void window.prism.homeDir().then((dir) => {
      home.current = dir
    })
    restore()
    const offs = [
      window.prism.onOpenFolder((cwd) => openTab(cwd)),
      onCwd((id, path) => setState((s) => setCwd(s, id, path)))
    ]
    return () => offs.forEach((off) => off())
    // Registered once: everything inside reads refs or stable callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Close for real: the shell dies. The LAST tab closing leaves the start
   *  screen, not a closed window (owner, 2026-09-18); the X is what quits. */
  const closeNow = useCallback(
    (id: string) => {
      const tab = live.current.state.tabs.find((t) => t.id === id)
      if (!tab) return
      if (tab.kind !== 'settings') {
        window.prism.termKill(id)
        disposeTermSession(id)
        forgetSession(id)
        indicator.forget(id)
      }
      setState((s) => closeTab(s, id))
    },
    [indicator]
  )

  const requestClose = useCallback(
    (id: string) => {
      const { state: st, workingIds: working, agentIds: agents } = live.current
      const tab = st.tabs.find((t) => t.id === id)
      // A tab whose shell HOSTS an agent asks, working or idle (2026-09-19,
      // owner: "the prompt when you close a tab with an active agent didn't
      // work, it just closed"). The first build asked only mid-answer, and an
      // agent waiting at its own prompt is still a conversation the close
      // ends: Prism's rule, which is the one that was expected. A plain shell
      // has nothing to lose and closes unasked. NOT a setting any more
      // (owner, same day): the rule is core/renderer/lib/agentClose, the same
      // in Prism.
      if (tab && tab.kind !== 'settings' && asksBeforeClosingTab(agents.has(id))) {
        const label = tabLabels(st.tabs)[st.tabs.indexOf(tab)]
        setAsk({
          target: id,
          label,
          agent: {
            kind: agentKinds.current.get(id) ?? 'other',
            forMs: working.has(id) ? workingFor(id) : null
          },
          others: 0
        })
      } else closeNow(id)
    },
    [agentKinds, closeNow]
  )

  // The shell ended: typed exit, or died. Its tab goes with it, unasked.
  useEffect(() => window.prism.onTermExit((id) => closeNow(id)), [closeNow])

  // The window is closing while an agent works: main held the close and asks.
  useEffect(
    () =>
      window.prism.onCloseRequest(() => {
        const { state: st, workingIds: working } = live.current
        const busy = shellTabs(st)
          .filter((t) => working.has(t.id))
          .map((t) => ({ t, forMs: workingFor(t.id) ?? 0 }))
          .sort((a, b) => b.forMs - a.forMs)
        if (!busy.length) {
          window.prism.confirmClose()
          return
        }
        const first = busy[0]
        setAsk({
          target: 'window',
          label: tabLabels(st.tabs)[st.tabs.indexOf(first.t)],
          agent: { kind: agentKinds.current.get(first.t.id) ?? 'other', forMs: first.forMs },
          others: busy.length - 1
        })
      }),
    [agentKinds]
  )

  // Tell main what is open, whenever it changes: persistence for next launch,
  // and whether closing the window would interrupt anything.
  useEffect(() => {
    const shells = shellTabs(state)
    window.prism.tabsChanged({
      tabs: shells.map((t) => {
        const kind = agentIds.has(t.id) ? agentKinds.current.get(t.id) : undefined
        const agent: AgentKind | undefined = kind === 'claude' || kind === 'codex' ? kind : undefined
        return agent ? { cwd: t.cwd, agent } : { cwd: t.cwd }
      }),
      active: Math.max(
        0,
        shells.findIndex((t) => t.id === activeId)
      )
    })
  }, [state, activeId, agentIds, agentKinds])

  useEffect(() => {
    window.prism.setAgentBusy(holdsWindowClose(workingIds.size))
  }, [workingIds])

  // Whatever a tab interaction did to DOM focus, the shell in front gets the
  // keyboard back: clicking or dragging a tab is not "I left the shell".
  useEffect(() => {
    if (activeShell && !ask && !findOpen) focusTermSession(activeShell.id)
  }, [activeShell, ask, findOpen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'F11') {
        e.preventDefault()
        window.prism.windowToggleFullscreen()
        return
      }
      if (!e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      const hit = (): void => {
        e.preventDefault()
        e.stopPropagation()
      }
      if (e.key === 'Tab') {
        hit()
        setState((s) => stepTab(s, e.shiftKey ? -1 : 1))
      } else if (!e.shiftKey && /^[1-9]$/.test(e.key)) {
        const t = live.current.state.tabs[Number(e.key) - 1]
        if (t) {
          hit()
          setState((s) => pickTab(s, t.id))
        }
      } else if (!e.shiftKey && e.key === ',') {
        hit()
        setState(openSettings)
      } else if (k === 't') {
        // With or without shift: Ctrl+T is the chord, Ctrl+Shift+T the habit
        // Windows Terminal leaves in the hand.
        hit()
        void newTab()
      } else if (k === 'w') {
        // Ctrl+W closes a tab in BOTH apps (owner, 2026-09-19), with or without
        // shift. Known cost, accepted: the shell loses delete-word on that
        // chord; Ctrl+Backspace does the same job.
        hit()
        const id = live.current.state.activeId
        if (id) requestClose(id)
      } else if (e.shiftKey && k === 'f') {
        hit()
        const id = live.current.state.activeId
        setFindFor((was) => (was === id ? null : id))
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [newTab, requestClose])

  const openRecent = useCallback(
    (path: string) => {
      openTab(path)
      prewarm()
    },
    [openTab, prewarm]
  )

  return (
    <div className="flex h-full w-full flex-col overflow-hidden text-[var(--p-text)]">
      <TitleBar onSettings={() => setState(openSettings)} />
      {tabs.length > 0 && (
        <TabStrip
          tabs={tabs}
          activeId={activeId}
          workingIds={workingIds}
          doneIds={doneIds}
          agentIds={agentIds}
          onPick={(id) => setState((s) => pickTab(s, id))}
          onClose={requestClose}
          onNew={() => void newTab()}
          onDropFolder={(path) => void window.prism.folderOf(path).then((dir) => dir && openTab(dir))}
          onReorder={(id, to) => setState((s) => ({ ...s, tabs: reorderTabs(s.tabs, id, to) }))}
          onOpenRecent={openRecent}
        />
      )}
      <div
        className="relative min-h-0 flex-1"
        data-term-host
        // A FILE DROPPED ON THE TERMINAL TYPES ITS PATH (2026-09-19, #16): the
        // other way a file, or a screenshot, gets into an agent's prompt.
        // Quoted, at the cursor, as the paste rule quotes copied files, and
        // never followed by Enter. In Prism this lived in the split dock, and
        // went with it when the dock was stripped; the README went on
        // claiming it for a day. Only over a shell: the start screen and
        // Settings have nothing to type into.
        onDragOver={(e) => {
          if (!activeShell || !e.dataTransfer.types.includes('Files')) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }}
        onDrop={(e) => {
          if (!activeShell) return
          e.preventDefault()
          e.stopPropagation()
          const paths = [...e.dataTransfer.files]
            .map((f) => window.prism.getDroppedPath(f))
            .filter((path) => path.length > 0)
          if (!paths.length) return
          markTouched(activeShell.id) // input like any other: its echo is not the agent working
          window.prism.termInput(activeShell.id, quotePaths(paths))
          focusTermSession(activeShell.id)
        }}
        onContextMenu={(e) => {
          if (!activeShell || !(e.target as HTMLElement).closest('[data-term-region]')) return
          e.preventDefault()
          setTermMenu({ x: e.clientX, y: e.clientY })
        }}
      >
        {activeShell && (
          <TerminalPanel
            key={activeShell.id}
            sessionId={activeShell.id}
            root={activeShell.cwd}
            shellId={savedShellId()}
          />
        )}
        <DictationPill sessionId={activeShell ? activeShell.id : null} />
        {activeShell && findOpen && (
          <TermFind sessionId={activeShell.id} onClose={() => setFindFor(null)} />
        )}
        {/* The terminal paints its own ground (a second coat of a translucent
            --p-bg behind it reads darker than the rest of the window); the
            pages that are not a terminal paint theirs here. */}
        {active?.kind === 'settings' && (
          <div className="h-full min-h-0 w-full bg-[var(--p-bg)]">
            <Suspense fallback={null}>
              <Settings />
            </Suspense>
          </div>
        )}
        {!active && (
          <div className="h-full w-full bg-[var(--p-bg)]">
            <EmptyState
              onNew={() => void newTab()}
              onOpenFolder={openRecent}
              onSettings={() => setState(openSettings)}
            />
          </div>
        )}
      </div>

      {termMenu && activeShell && (
        <ContextMenu
          x={termMenu.x}
          y={termMenu.y}
          onClose={() => setTermMenu(null)}
          items={[
            // Paste through the terminal's own rule (an image forwards the
            // keystroke to the agent, files become quoted paths, text is a
            // bracketed paste). No Copy row: xterm owns its selection, and
            // Ctrl+C over one already copies.
            { label: 'Paste', hint: 'Ctrl+V', onPick: () => void pasteInto(activeShell.id) },
            { label: 'Find in scrollback', hint: 'Ctrl+Shift+F', onPick: () => setFindFor(activeShell.id) },
            { label: 'Close tab', hint: 'Ctrl+Shift+W', onPick: () => requestClose(activeShell.id) }
          ]}
        />
      )}

      {ask && (
        <Dialog
          title={closeQuestionTitle(ask.target === 'window' ? 'window' : 'tab', ask.agent.forMs)}
          body={
            // Naming the work is the whole point of asking: an idle prompt and
            // an agent eleven minutes into an answer are not the same close.
            ask.agent.forMs === null ? (
              <>
                <span className="text-[var(--p-text)]">{AGENT_NAMES[ask.agent.kind]}</span> is
                running in <span className="text-[var(--p-text)]">{ask.label}</span>. Closing the
                tab kills the shell, and the session with it.
              </>
            ) : (
              <>
                <span className="text-[var(--p-text)]">{AGENT_NAMES[ask.agent.kind]}</span> has been
                working for {humanFor(ask.agent.forMs)} in{' '}
                <span className="text-[var(--p-text)]">{ask.label}</span>
                {ask.others > 0 &&
                  `, and ${ask.others} other ${ask.others === 1 ? 'tab is' : 'tabs are'} working too`}
                . Closing kills the shell, and the answer with it.
              </>
            )
          }
          onCancel={() => setAsk(null)}
          choices={[
            { label: 'Cancel', onPick: () => setAsk(null) },
            {
              label: ask.target === 'window' ? 'Close window' : 'Close tab',
              primary: true,
              onPick: () => {
                const target = ask.target
                setAsk(null)
                if (target === 'window') window.prism.confirmClose()
                else closeNow(target)
              }
            }
          ]}
        />
      )}
    </div>
  )
}
