import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type JSX } from 'react'
import type { AgentKind, DetectedAgent } from '@shared/types'
import TerminalPanel, {
  disposeTermSession,
  ensureTermSession,
  focusTermSession,
  focusedTermFullScreen,
  openTermPath,
  termContextAt,
  type TermPathAt
} from '@core/renderer/components/TerminalPanel'
import TermFind from '@core/renderer/components/TermFind'
import { TabStrip } from './components/TabStrip'
import TitleBar, { TitleButtons } from './components/TitleBar'
import { useTitleBarMode } from './lib/titleBarPrefs'
import EmptyState from './components/EmptyState'
import type { SettingsPage } from './components/settings/Settings'
import { Dialog } from './components/Dialog'
import {
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
import CopiedBadge from '@core/renderer/components/CopiedBadge'
import { copyText } from '@core/renderer/lib/copyNotice'
import UpdateChip from '@core/renderer/components/UpdateChip'
import UpdateDialog from '@core/renderer/components/UpdateDialog'
import { useUpdateFlow } from '@core/renderer/lib/useUpdateFlow'
import { crumb } from '@core/renderer/lib/diag'
import { humanFor, workingFor } from '@core/renderer/lib/agentClock'
import { forgetSession, markResume, markTouched } from '@core/renderer/lib/termActivity'
import { onCwd, onResumingChange, pasteInto, resumingIds } from '@core/renderer/lib/termBus'
import { ResumeSkeleton } from '@core/renderer/components/ResumeSkeleton'
import { peekState, settleRestore } from './lib/restorePlan'
import { quotePaths } from '@core/renderer/lib/termPaste'
import { ContextMenu } from './components/ContextMenu'
import { MenuIcon } from './components/MenuIcon'
import { rememberRoot } from '@core/renderer/lib/recentRoots'
import { savedShellId } from '@core/renderer/lib/termPrefs'
import { helpEnabled, helpShell, setHelpShell, useHelpEnabled } from '@core/renderer/lib/helpPrefs'
import { shellOfShellId, type HelpShellChoice } from '@core/shared/help/shells'
import { newTabFolder, newTabMode } from './lib/newTabPrefs'
import {
  AGENT_NAMES,
  asksBeforeClosingTab,
  closeQuestionTitle,
  holdsWindowClose
} from '@core/renderer/lib/agentClose'
import {
  onTermLookChange,
  termAcrylic,
  termFontStack,
  termGroundAlpha,
  termThemeId
} from '@core/renderer/lib/termLook'
import { presetAccent, resolveTermTheme } from '@core/renderer/lib/termTheme'
import { applyChrome, chromeTokens } from './lib/chromeTheme'
import { onWindowEdgesChange, windowEdges } from './lib/edgesPrefs'
import { onWindowAccentChange, windowAccent } from './lib/accentPrefs'
import { onWindowBackgroundChange, windowBackground } from './lib/backgroundPrefs'
import { attentionCount, drawBadge, useTaskbarBadgeOn } from './lib/taskbarBadge'
import { agentHooksOn, useAgentDoneOn, useAgentFailedOn, useAgentQuestionOn } from '@core/renderer/lib/termLook'

const Settings = lazy(() => import('./components/settings/Settings'))
// Loaded when it is first opened: the popup brings the whole catalogue with it,
// several hundred entries of text that a launch has no use for.
const HelpPanel = lazy(() => import('@core/renderer/components/HelpPanel'))

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
  /** The window question asked on behalf of an update install (#28): what to
   *  run on "yes", in place of closing the window. */
  install?: () => void
}

let seq = 0
const nextId = (): string => 't' + Date.now().toString(36) + '-' + String((seq += 1))

/** The window wears the terminal's theme; main hears about the material. The
 *  edges setting (#27) rides the same paint: it changes two of the tokens, and
 *  main is told so the DWM border round the window follows the lines in it. */
function paintChrome(): void {
  const acrylic = termAcrylic()
  const id = termThemeId()
  const edges = windowEdges()
  // A picked background replaces the theme's for the whole window; the panel
  // paints the terminal's ground from the same token, so it follows too.
  const theme = resolveTermTheme(id)
  const background = windowBackground()
  // THE WINDOW'S SEE-THROUGH IS THE GROUND'S ALPHA (#114, in place of the
  // Opacity slider): the picked Background's, else the theme's own (a Custom
  // may carry one), the same order the core reads. Passed as the byte's
  // fraction, unrounded, so the field and the window name the same alpha.
  const tokens = chromeTokens(
    background ? { ...theme, background } : theme,
    acrylic ? termGroundAlpha() : 1,
    presetAccent(id),
    edges,
    windowAccent()
  )
  applyChrome(tokens)
  window.prism.setWindowBg(tokens.vars['--p-bg-solid'])
  window.prism.setWindowEdges(edges)
  void window.prism.setAcrylic(acrylic)
}

export default function App(): JSX.Element {
  // TABS FROM THE FIRST FRAME (#106): the saved strip, read at once, drawn as
  // placeholders; the restore settles each when it answers (lib/restorePlan).
  const [boot] = useState(() => peekState(window.prism.peekTabs(), nextId))
  const [state, setState] = useState<TabState>(boot.state)
  /** The restore has answered: only then can "no tabs" be true. */
  const [restoreDone, setRestoreDone] = useState(false)
  /** The shell the find bar was opened over; it belongs to that shell alone. */
  const [findFor, setFindFor] = useState<string | null>(null)
  const [ask, setAsk] = useState<Ask | null>(null)
  /** The terminal's own right-click menu, at the pointer. */
  const [termMenu, setTermMenu] = useState<{
    /** The session it was opened on (code review 2026-09-24, #32): the menu
     *  shows only over that one, so a Ctrl+Tab never turns its Paste on the
     *  next shell while its Copy still holds the last one's selection. */
    id: string
    x: number
    y: number
    /** What was selected when the menu opened, and the link under the point. */
    selection: string
    link: string | null
    /** A file or folder under the point that exists (#99). */
    path: TermPathAt | null
  } | null>(null)
  /** The command help popup (#12). The core's, the same in Prism; what is this
   *  app's is the way in (F1, the ? in the title bar, the terminal's menu). */
  const [helpOpen, setHelpOpen] = useState(false)
  /** The chip it opens on, decided at the press that opens it. */
  const [helpFor, setHelpFor] = useState<HelpShellChoice>('powershell')
  const helpOn = useHelpEnabled()
  const titleBar = useTitleBarMode()
  /** Which shell each tab was SPAWNED with. The Shell setting only names what
   *  the next terminal launches, so a tab opened before it was changed still
   *  speaks its old language, and the popup preselects by what is running. */
  const shellIds = useRef(new Map<string, string | undefined>())
  const { tabs, activeId } = state
  const active = tabs.find((t) => t.id === activeId) ?? null
  // A placeholder has no shell yet (#106): nothing that needs one may see it.
  const activeShell = active && active.kind !== 'settings' && !active.pending ? active : null
  // The Settings tab keeps its page while it stays open (#123; owner,
  // 2026-10-04: "if i go from settings to another tab then to settings again
  // it should be the same tab it was on ... unless i close the settings tab
  // and reopen"). The page unmounts behind another tab, so App holds it, and
  // closing the tab is what forgets it.
  const [settingsPage, setSettingsPage] = useState<SettingsPage>('appearance')
  const settingsOpen = tabs.some((t) => t.kind === 'settings')
  // Adjusted while rendering, React's own pattern for state that follows other
  // state: no effect, so no frame painted with the stale page.
  if (!settingsOpen && settingsPage !== 'appearance') setSettingsPage('appearance')
  // Tabs still coming back to an agent wear a ring in the strip (#106): the
  // placeholders, then the sessions resuming until their agent has drawn.
  const resumingNow = useSyncExternalStore(onResumingChange, resumingIds)
  const loadingIds = useMemo(
    () => new Set([...tabs.filter((t) => t.pending === 'agent').map((t) => t.id), ...resumingNow]),
    [tabs, resumingNow]
  )
  // A tab change puts the terminal's menu away for good (#32), so coming back
  // to the tab it was opened on does not bring it back at the old spot.
  const [menuFront, setMenuFront] = useState(activeId)
  if (menuFront !== activeId) {
    setMenuFront(activeId)
    if (termMenu) setTermMenu(null)
  }
  const indicator = useAgentIndicator(activeShell ? activeShell.id : null)
  // Dictation (#13) is the core's. It is armed here because this is where
  // "which shell is in front" is known; it renders nothing and re-renders
  // nothing, and with the setting off it listens to nothing.
  useDictationArm(activeShell ? activeShell.id : null)
  const findOpen = !!activeShell && findFor === activeShell.id
  const { agentIds, workingIds, doneIds, questionIds, failedIds, failedKinds, agentKinds } = indicator

  // THE TIMELINE (#140): which tab is in front, and which Settings page, as
  // crumbs, so a stall in the log says what the user had just done.
  useEffect(() => {
    if (activeId) crumb('tab-switch', { id: activeId })
  }, [activeId])
  useEffect(() => {
    if (settingsOpen) crumb('settings-page', { page: settingsPage })
  }, [settingsOpen, settingsPage])

  // The latest of everything, for listeners registered once.
  const live = useRef({ state, workingIds, agentIds, blocked: false, front: '' })

  useEffect(() => {
    paintChrome()
    const offLook = onTermLookChange(paintChrome)
    const offEdges = onWindowEdgesChange(paintChrome)
    const offAccent = onWindowAccentChange(paintChrome)
    const offBackground = onWindowBackgroundChange(paintChrome)
    return () => {
      offBackground()
      offLook()
      offEdges()
      offAccent()
    }
  }, [])

  /** Start the shell for a tab that has (or is about to have) its place. */
  const spawnSession = useCallback((id: string, cwd: string, resume?: string): void => {
    // A shell restored over an agent conversation launches straight into it:
    // the id rides the spawn, nothing is ever visibly typed.
    if (resume) markResume(id, resume, cwd)
    rememberRoot(cwd)
    const shellId = savedShellId()
    shellIds.current.set(id, shellId)
    ensureTermSession(id, cwd, shellId)
  }, [])

  const openTab = useCallback(
    (cwd: string, resume?: string): string => {
      const id = nextId()
      crumb('tab-open', { id, cwd, resume: !!resume })
      spawnSession(id, cwd, resume)
      setState((s) => addTab(s, id, cwd))
      return id
    },
    [spawnSession]
  )

  /** The user's own folder: where a new tab opens when Settings names none.
   *  Asked once; main is the one that knows. */
  const home = useRef('')

  const prewarm = useCallback(() => {
    // Only a folder known ahead of the click can be warmed; asking cannot.
    const dir = newTabMode() === 'folder' ? newTabFolder() || home.current : ''
    // With the plugin or without, as the spawn will ask (#131): a warm shell
    // is only adopted by a spawn that wants what it was started with.
    if (dir) window.prism.termPrewarm(dir, savedShellId(), agentHooksOn())
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
  const restored = useRef(false)
  const restore = useCallback(() => {
    // Once per page (code review 2026-09-24, #31): StrictMode runs the mount
    // effect twice in dev, and a second restore opened every tab again,
    // resumed each agent twice and saved the doubled strip.
    if (restored.current) return
    restored.current = true
    void window.prism.restoreTabs().then((r) => {
      // Each placeholder drawn from the peek is settled in place (#106).
      const settled = settleRestore(live.current.state, boot.slots, r, nextId)
      setState(settled.state)
      for (const t of settled.spawn) spawnSession(t.id, t.cwd, t.resume)
      setRestoreDone(true)
      prewarm()
    })
  }, [boot.slots, spawnSession, prewarm])

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
      crumb('tab-close', { id, kind: tab.kind ?? 'shell' })
      if (tab.kind !== 'settings') {
        window.prism.termKill(id)
        disposeTermSession(id)
        forgetSession(id)
        indicator.forget(id)
        shellIds.current.delete(id)
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

  /**
   * THE UPDATE CHIP AND ITS WINDOW (#28). Both are the core's, the same in
   * Prism; what is this app's is the question an install has to get past.
   * Installing ends in the app QUITTING under the installer, and main
   * pre-answers the close question for it, so an agent mid-answer would be
   * killed without a word. (It was, until this change: main's comment said the
   * page settles that first, which was Prism's page and never this one.) The
   * rule is the window's own, `holdsWindowClose`: only an agent that is
   * WORKING holds it, since idle ones come back at the next launch. It is asked
   * when Install is chosen, before a byte is downloaded.
   */
  const installGuard = useCallback(
    (start: () => void) => {
      const { state: st, workingIds: working } = live.current
      const busy = shellTabs(st)
        .filter((t) => working.has(t.id))
        .map((t) => ({ t, forMs: workingFor(t.id) ?? 0 }))
        .sort((a, b) => b.forMs - a.forMs)
      if (!holdsWindowClose(busy.length)) {
        start()
        return
      }
      const first = busy[0]
      setAsk({
        target: 'window',
        label: tabLabels(st.tabs)[st.tabs.indexOf(first.t)],
        agent: { kind: agentKinds.current.get(first.t.id) ?? 'other', forMs: first.forMs },
        others: busy.length - 1,
        install: start
      })
    },
    [agentKinds]
  )
  // ONE QUESTION AT A TIME. The app's chords still work while the update window
  // is up (Ctrl+W, Alt+F4), and a close question raised from behind it mounted
  // UNDER it: same z-index, earlier in the document. The question then took the
  // focus onto its primary button where nobody could see it, so Enter, pressed
  // at what looked like Install, closed the tab and ended the agent. A question
  // about losing work outranks a list of patch notes, so the window gives way.
  // That is the core's `covered` (#32): it holds mid-install too, where the
  // user cannot close the window, and brings a running install's window back
  // once the question has been answered.
  const update = useUpdateFlow(window.prism, installGuard, !!ask)

  // COMMAND HELP (#12). It is the same layer as the update window and a close
  // question, so the same rule holds it: it never sits over either. It does not
  // OPEN while one of them is up, and it is PUT AWAY when one appears (Ctrl+W
  // and Alt+F4 still work over it, and a question mounted underneath would
  // take the focus where nobody can see it). Switched off in Settings, it goes.
  // Put away while RENDERING, not in an effect: an effect would paint one
  // frame of the popup over the question first.
  const helpBlocked = !!ask || update.state.open || !helpOn
  // AND IT LEAVES WHEN WHAT IS IN FRONT CHANGES. The app's chords keep working
  // over the popup, and three of them hand the keyboard to something BEHIND it:
  // Ctrl+T and Ctrl+Tab mount a terminal, which takes the focus as it attaches,
  // and Ctrl+Shift+F opens the find bar. Left up, the popup then sat over a
  // focused shell, and a question typed "into the search field" was typed into
  // that shell instead. So it remembers what was in front when it opened (the
  // tab, and whether find was showing) and goes as soon as that is no longer so.
  const inFront = `${activeId ?? ''}|${findFor ?? ''}`
  const [helpFront, setHelpFront] = useState(inFront)
  const helpStale = helpFront !== inFront
  if (helpOpen && (helpBlocked || helpStale)) setHelpOpen(false)
  const toggleHelp = useCallback(() => {
    // The chip it opens on is the language of the shell in front; with no
    // shell in front, the last one picked by hand, else what a new terminal
    // would launch.
    const { state: st } = live.current
    const front = st.tabs.find((t) => t.id === st.activeId)
    setHelpFor(
      front && front.kind !== 'settings'
        ? shellOfShellId(shellIds.current.get(front.id))
        : (helpShell() ?? shellOfShellId(savedShellId()))
    )
    setHelpFront(live.current.front)
    setHelpOpen((was) => (was ? false : helpEnabled() && !live.current.blocked))
  }, [])
  // The latest of everything, for listeners registered once. `blocked` is
  // whether something that outranks the help popup is up (see above).
  const updateOpen = update.state.open
  useEffect(() => {
    live.current = { state, workingIds, agentIds, blocked: !!ask || updateOpen, front: inFront }
  })
  /** The running version, for the window's "You have" line. Asked once. */
  const [version, setVersion] = useState('')
  useEffect(() => {
    void window.prism.appVersion().then(setVersion)
  }, [])

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

  // THE TASKBAR BADGE (2026-09-28): how many tabs show a mark, as a small grey
  // disc with a white number (2026-09-29, the owner's look).
  const badgeOn = useTaskbarBadgeOn()
  const doneOn = useAgentDoneOn()
  const questionOn = useAgentQuestionOn()
  const failedOn = useAgentFailedOn()
  const need = attentionCount({ doneIds, questionIds, workingIds, doneOn, questionOn, failedIds, failedOn })
  useEffect(() => {
    if (!badgeOn || need.count === 0) {
      window.prism.setTaskbarBadge(null, '')
      return
    }
    const said = `${need.count} ${need.count === 1 ? 'tab needs' : 'tabs need'} a look`
    const scale = window.devicePixelRatio || 1
    window.prism.setTaskbarBadge(drawBadge(need.count, scale) || null, said, scale)
  }, [badgeOn, need.count])

  // Whatever a tab interaction did to DOM focus, the shell in front gets the
  // keyboard back: clicking or dragging a tab is not "I left the shell".
  useEffect(() => {
    if (activeShell && !ask && !findOpen && !update.state.open && !helpOpen) focusTermSession(activeShell.id)
  }, [activeShell, ask, findOpen, update.state.open, helpOpen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'F11') {
        e.preventDefault()
        window.prism.windowToggleFullscreen()
        return
      }
      // F1 is command help, bare, and only while the setting is on: off, the
      // key is the shell's (termHost's ownsKey makes the same test, so xterm
      // yields it exactly when this takes it).
      if (e.key === 'F1' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey && helpEnabled()) {
        e.preventDefault()
        e.stopPropagation()
        toggleHelp()
        return
      }
      if (!e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      const hit = (): void => {
        e.preventDefault()
        e.stopPropagation()
      }
      // ONE QUESTION AT A TIME, for the tab chords too (code review
      // 2026-09-24, #10): under a close question or the update window, Ctrl+Tab
      // or Ctrl+T moved the keyboard into a shell behind it, and the Enter
      // meant for the question went there. They do nothing until it is
      // answered; Ctrl+W keeps its own rule.
      if (live.current.blocked && k !== 'w') {
        if (e.key === 'Tab' || /^[1-9]$/.test(e.key) || e.key === ',' || k === 't' || k === 'f') hit()
        return
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
      } else if (k === 'f' && (e.shiftKey || !focusedTermFullScreen())) {
        // Ctrl+F finds (owner, 2026-09-23), except over a full-screen program,
        // whose page down it is; Ctrl+Shift+F finds everywhere (termHost).
        hit()
        const id = live.current.state.activeId
        setFindFor((was) => (was === id ? null : id))
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [newTab, requestClose, toggleHelp])

  const openRecent = useCallback(
    (path: string) => {
      openTab(path)
      prewarm()
    },
    [openTab, prewarm]
  )

  // The title bar's buttons and the tab strip, placed by the title bar
  // setting below: in two rows, or in one (#91).
  const onSettings = (): void => setState(openSettings)
  const onHelp = helpOn ? toggleHelp : undefined
  const chip = (
    <UpdateChip
      info={update.state.info}
      phase={update.state.phase}
      onOpen={update.open}
      // Under the chip only while the window is not up to say it itself.
      notice={update.state.open ? null : update.state.notice}
      onDismissNotice={update.dismissNotice}
    />
  )
  const strip = (inTitleRow: boolean): JSX.Element => (
    <TabStrip
      tabs={tabs}
      activeId={activeId}
      workingIds={workingIds}
      doneIds={doneIds}
      questionIds={questionIds}
      failedIds={failedIds}
      failedKinds={failedKinds}
      agentIds={agentIds}
      loadingIds={loadingIds}
      onPick={(id) => setState((s) => pickTab(s, id))}
      onClose={requestClose}
      onNew={() => void newTab()}
      onDropFolder={(path) => void window.prism.folderOf(path).then((dir) => dir && openTab(dir))}
      onReorder={(id, to) => setState((s) => ({ ...s, tabs: reorderTabs(s.tabs, id, to) }))}
      onOpenRecent={openRecent}
      inTitleRow={inTitleRow}
    />
  )
  return (
    <div className="flex h-full w-full flex-col overflow-hidden text-[var(--p-text)]">
      {/* NO TITLE BAR (#91, owner's pick "tabs in the top row"): the tabs
          move up into the title bar's row and its buttons sit at the end.
          The strip's own empty space is the handle the window moves by; with
          no tabs (the start screen) the row is only that handle and the
          buttons. */}
      {titleBar === 'hidden' ? (
        <div
          data-title-bar="tabs"
          className="drag p-styled-font flex h-9 shrink-0 items-stretch border-b border-[var(--p-divider)] bg-[var(--p-tabs)] pr-1.5 text-[13px]"
        >
          {tabs.length > 0 ? strip(true) : <span className="min-w-0 flex-1" />}
          <div className="flex shrink-0 items-center gap-2.5 pl-2">
            <TitleButtons onSettings={onSettings} onHelp={onHelp} chip={chip} />
          </div>
        </div>
      ) : (
        <>
          <TitleBar onSettings={onSettings} onHelp={onHelp} chip={chip} />
          {tabs.length > 0 && strip(false)}
        </>
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
          // Quoted for the shell the tab runs (#5): PowerShell expands inside "...".
          window.prism.termInput(activeShell.id, quotePaths(paths, shellOfShellId(shellIds.current.get(activeShell.id))))
          focusTermSession(activeShell.id)
        }}
        onContextMenu={(e) => {
          if (!activeShell || !(e.target as HTMLElement).closest('[data-term-region]')) return
          e.preventDefault()
          setTermMenu({ id: activeShell.id, x: e.clientX, y: e.clientY, ...termContextAt(activeShell.id, e.clientX, e.clientY) })
        }}
      >
        {/* A placeholder (#106): the skeleton for a tab coming back to an agent,
            the bare ground for a plain shell, until the restore settles it. */}
        {active?.pending === 'agent' && (
          <div className="relative h-full w-full bg-[var(--p-bg)]">
            <ResumeSkeleton />
          </div>
        )}
        {active?.pending === 'shell' && <div className="h-full w-full bg-[var(--p-bg)]" />}
        {activeShell && (
          <TerminalPanel
            key={activeShell.id}
            sessionId={activeShell.id}
            root={activeShell.cwd}
            shellId={savedShellId()}
          />
        )}
        <DictationPill sessionId={activeShell ? activeShell.id : null} />
        {/* "Copied", at the bottom centre, for every copy the app makes. */}
        <CopiedBadge />
        {activeShell && findOpen && (
          <TermFind sessionId={activeShell.id} onClose={() => setFindFor(null)} />
        )}
        {/* The terminal paints its own ground (a second coat of a translucent
            --p-bg behind it reads darker than the rest of the window); the
            pages that are not a terminal paint theirs here. */}
        {active?.kind === 'settings' && (
          <div className="h-full min-h-0 w-full bg-[var(--p-bg)]">
            <Suspense fallback={null}>
              <Settings page={settingsPage} onPage={setSettingsPage} />
            </Suspense>
          </div>
        )}
        {!active && restoreDone && (
          <div className="h-full w-full bg-[var(--p-bg)]">
            <EmptyState
              onNew={() => void newTab()}
              onOpenFolder={openRecent}
              onSettings={() => setState(openSettings)}
            />
          </div>
        )}
      </div>

      {termMenu && activeShell && termMenu.id === activeShell.id && (
        <ContextMenu
          x={termMenu.x}
          y={termMenu.y}
          onClose={() => setTermMenu(null)}
          items={[
            // THE MENU FITS WHAT WAS CLICKED (owner, 2026-09-23: "if i click it
            // on a link it shows copy link, if i click it with text marked it
            // says copy"). Both copy exactly through the core's `copyText`, like
            // the command help, which also raises the "Copied" badge once the
            // clipboard has it. Close tab left this menu the same day ("remove close
            // tab from the right click menu"); the tab's own menu still has it.
            // A PATH (#99; owner, 2026-09-29): open it as a click would, show
            // it in Explorer, or copy it whole and absolute.
            ...(termMenu.path
              ? [
                  {
                    label: termMenu.path.kind === 'dir' ? 'Open folder' : 'Open',
                    icon: <MenuIcon name={termMenu.path.kind === 'dir' ? 'folder' : 'open'} />,
                    onPick: () => openTermPath(termMenu.id, termMenu.path!, 'open')
                  },
                  { label: 'Show in Explorer', icon: <MenuIcon name="folder" />, onPick: () => openTermPath(termMenu.id, termMenu.path!, 'reveal') },
                  { label: 'Copy path', icon: <MenuIcon name="copy" />, onPick: () => void copyText(termMenu.path!.abs) }
                ]
              : []),
            ...(termMenu.link
              ? [
                  { label: 'Copy link', icon: <MenuIcon name="link" />, onPick: () => void copyText(termMenu.link!) },
                  // A right-click never opens it (2026-09-28), so the menu does.
                  { label: 'Open link', icon: <MenuIcon name="open" />, onPick: () => window.prism.openExternal(termMenu.link!) }
                ]
              : []),
            ...(termMenu.selection
              ? [{ label: 'Copy', icon: <MenuIcon name="copy" />, hint: 'Ctrl+C', onPick: () => void copyText(termMenu.selection) }]
              : []),
            // Paste through the terminal's own rule (an image forwards the
            // keystroke to the agent, files become quoted paths, text is a
            // bracketed paste).
            { label: 'Paste', icon: <MenuIcon name="paste" />, hint: 'Ctrl+V', onPick: () => void pasteInto(activeShell.id) },
            { label: 'Find in scrollback', icon: <MenuIcon name="find" />, hint: 'Ctrl+F', onPick: () => setFindFor(activeShell.id) },
            // Only while the setting is on: off means the app offers it nowhere.
            ...(helpOn ? [{ label: 'Command help', icon: <MenuIcon name="help" />, hint: 'F1', onPick: toggleHelp }] : [])
          ]}
        />
      )}

      {ask && (
        <Dialog
          title={closeQuestionTitle(
            ask.install ? 'install' : ask.target === 'window' ? 'window' : 'tab',
            ask.agent.forMs
          )}
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
                .{' '}
                {ask.install
                  ? 'Installing restarts the app, which kills the shell, and the answer with it.'
                  : 'Closing kills the shell, and the answer with it.'}
              </>
            )
          }
          onCancel={() => setAsk(null)}
          choices={[
            { label: 'Cancel', onPick: () => setAsk(null) },
            {
              label: ask.install
                ? 'Install and restart'
                : ask.target === 'window'
                  ? 'Close window'
                  : 'Close tab',
              primary: true,
              onPick: () => {
                const { target, install } = ask
                setAsk(null)
                if (install) install()
                else if (target === 'window') window.prism.confirmClose()
                else closeNow(target)
              }
            }
          ]}
        />
      )}

      {/* COMMAND HELP (#12), mounted once. It is handed the clipboard and
          NOTHING ELSE: no session id, no termInput. It cannot type into a shell
          because it has no way to reach one, which is the owner's rule (picking
          a command does NOT insert it). */}
      {helpOpen && !helpBlocked && !helpStale && (
        <Suspense fallback={null}>
          <HelpPanel
            shell={helpFor}
            monoFont={termFontStack()}
            onCopy={copyText}
            onPickShell={setHelpShell}
            onClose={() => setHelpOpen(false)}
          />
        </Suspense>
      )}

      {/* Mounted once, here: the chip lives in the title bar, the window it
          opens belongs to the whole app. */}
      {update.state.open && update.state.info && (
        <UpdateDialog
          info={update.state.info}
          currentVersion={version}
          phase={update.state.phase}
          pct={update.state.pct}
          aborting={update.state.aborting}
          notice={update.state.notice}
          onInstall={update.install}
          onCancel={update.cancel}
          onAbort={update.abort}
        />
      )}
    </div>
  )
}
