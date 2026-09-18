import { lazy, Suspense, useCallback, useEffect, useRef, useState, type JSX } from 'react'
import type { AgentKind, DetectedAgent } from '@shared/types'
import TerminalPanel, {
  disposeTermSession,
  ensureTermSession,
  focusTermSession
} from './components/TerminalPanel'
import TermFind from './components/TermFind'
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
import { useAgentIndicator } from './lib/useAgentIndicator'
import { humanFor, workingFor } from './lib/agentClock'
import { forgetSession, markResume } from './lib/termActivity'
import { onCwd } from './lib/termBus'
import { rememberRoot } from './lib/recentRoots'
import { savedShellId } from './lib/termPrefs'
import { newTabFolder, newTabMode } from './lib/newTabPrefs'
import { confirmClose } from './lib/closePrefs'
import { onTermLookChange, termAcrylic, termOpacity, termThemeId } from './lib/termLook'
import { presetAccent, resolveTermTheme } from './lib/termTheme'
import { applyChrome, chromeTokens } from './lib/chromeTheme'

const Settings = lazy(() => import('./components/Settings'))

const AGENT_NAMES: Record<DetectedAgent, string> = {
  claude: 'Claude',
  codex: 'Codex',
  other: 'The agent'
}

/** What a close question is about to interrupt. */
interface Ask {
  /** A tab id, or 'window' for the whole window. */
  target: string
  label: string
  agent: { kind: DetectedAgent; forMs: number }
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
  const { tabs, activeId } = state
  const active = tabs.find((t) => t.id === activeId) ?? null
  const activeShell = active && active.kind !== 'settings' ? active : null
  const indicator = useAgentIndicator(activeShell ? activeShell.id : null)
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

  const prewarm = useCallback(() => {
    // Only a fixed folder is known ahead of the click.
    if (newTabMode() === 'folder') window.prism.termPrewarm(newTabFolder(), savedShellId())
  }, [])

  const newTab = useCallback(async () => {
    let cwd: string | null = newTabMode() === 'folder' ? newTabFolder() : null
    // Cancelling the chooser opens nothing.
    if (!cwd) cwd = await window.prism.pickFolder()
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
      const forMs = workingFor(id)
      const { state: st, workingIds: working } = live.current
      const tab = st.tabs.find((t) => t.id === id)
      // 'Off' means off: a confirmation that appears anyway is a setting that lies.
      if (tab && tab.kind !== 'settings' && confirmClose() && working.has(id) && forMs !== null) {
        const label = tabLabels(st.tabs)[st.tabs.indexOf(tab)]
        setAsk({
          target: id,
          label,
          agent: { kind: agentKinds.current.get(id) ?? 'other', forMs },
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
    window.prism.setAgentBusy(confirmClose() && workingIds.size > 0)
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
      } else if (e.shiftKey && k === 't') {
        hit()
        void newTab()
      } else if (e.shiftKey && k === 'w') {
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
      <div className="relative min-h-0 flex-1">
        {activeShell && (
          <TerminalPanel
            key={activeShell.id}
            sessionId={activeShell.id}
            root={activeShell.cwd}
            shellId={savedShellId()}
          />
        )}
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

      {ask && (
        <Dialog
          title={ask.target === 'window' ? 'Stop the agent and close the window?' : 'Stop the agent and close?'}
          body={
            // Naming the work is the whole point of asking: an idle prompt and
            // an agent eleven minutes into an answer are not the same close.
            <>
              <span className="text-[var(--p-text)]">{AGENT_NAMES[ask.agent.kind]}</span> has been
              working for {humanFor(ask.agent.forMs)} in{' '}
              <span className="text-[var(--p-text)]">{ask.label}</span>
              {ask.others > 0 &&
                `, and ${ask.others} other ${ask.others === 1 ? 'tab is' : 'tabs are'} working too`}
              . Closing kills the shell, and the answer with it.
            </>
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
