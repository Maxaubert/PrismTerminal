import { useEffect, useState, useSyncExternalStore, type JSX, type ReactNode } from 'react'
import { setNewTabMode, useNewTabFolder, useNewTabMode } from '../lib/newTabPrefs'
import { setWindowEdges, useWindowEdges } from '../lib/edgesPrefs'
import { WINDOW_EDGES, type WindowEdges } from '@shared/windowEdges'
import { HexSwatch, Pref, RESET_LINK, ROWS, ROW_BUTTON, Segmented, Switch } from '@core/renderer/settings/fields'
import { setWindowAccent, useWindowAccent } from '../lib/accentPrefs'
import {
  onWindowBackgroundChange,
  setWindowBackground,
  useWindowBackground,
  windowBackground
} from '../lib/backgroundPrefs'
import { chromeTokens } from '../lib/chromeTheme'
import { onTermLookChange, termThemeId } from '@core/renderer/lib/termLook'
import { presetAccent, resolveTermTheme } from '@core/renderer/lib/termTheme'
import { DictationSettings } from '@core/renderer/settings/Dictation'
import { HelpSetting } from '@core/renderer/settings/Help'
import { TerminalAppearanceSettings } from '@core/renderer/settings/TerminalAppearance'
import { ShellSetting } from '@core/renderer/settings/TerminalBehaviour'

// THE SETTINGS PAGE IS THIS APP'S; THE TERMINAL'S SETTINGS ARE THE CORE'S (#15).
// Every terminal option, its name, type and behaviour, is the same code here and
// in Prism (`core/renderer/settings`); only the personal values differ, and
// each app keeps its own. What is left in this file is the page (two tabs and
// a rail) and the rows that are about THIS app: where a new tab opens, the
// Explorer menu, the window's edges, the version.
//
// Settings WRITES STORES and nothing else. The window's chrome and its acrylic
// material follow the terminal theme, and App is the one listening to
// onTermLookChange to repaint them.


/* ---------- general ---------- */

function GeneralTab(): JSX.Element {
  const [version, setVersion] = useState('')
  // Explorer's context-menu verb lives in the registry, not in a settings
  // file: the switch reports what Windows actually has.
  const [verb, setVerbState] = useState(false)
  const [verbBusy, setVerbBusy] = useState(true)
  useEffect(() => {
    let live = true
    void window.prism.appVersion().then((v) => {
      if (live) setVersion(v)
    })
    void window.prism.shellVerbStatus().then((on) => {
      if (live) {
        setVerbState(on)
        setVerbBusy(false)
      }
    })
    return () => {
      live = false
    }
  }, [])
  const setVerb = (on: boolean): void => {
    setVerbBusy(true)
    void window.prism.setShellVerb(on).then(async () => {
      // Read it back rather than trusting the write: this is the registry.
      setVerbState(await window.prism.shellVerbStatus())
      setVerbBusy(false)
    })
  }
  const tabMode = useNewTabMode()
  const tabFolder = useNewTabFolder()
  const chooseFolder = (): void => {
    void window.prism.pickFolder().then((dir) => {
      if (dir) setNewTabMode('folder', dir)
    })
  }
  // With no folder chosen, "a folder" is the user's own (owner, 2026-09-18:
  // the + should simply open, and asking is the option, not the default).
  const [home, setHome] = useState('')
  useEffect(() => {
    void window.prism.homeDir().then(setHome)
  }, [])
  return (
    <div className={ROWS}>
      <Pref
        id="newtab-mode"
        label="New tabs"
        hint={
          tabMode === 'ask'
            ? 'Asks which folder to open each time a new tab is made.'
            : tabFolder
              ? 'New tabs open in the folder you chose.'
              : 'New tabs open in your user folder.'
        }
      >
        {/* The folder itself is a path, which the description no longer holds
            (plain words only), so it rides on the controls' tooltip. */}
        <div className="flex items-center gap-2.5" title={tabMode === 'folder' ? tabFolder || home || undefined : undefined}>
          {tabMode === 'folder' && tabFolder && (
            <button data-use-home onClick={() => setNewTabMode('folder', '')} className={ROW_BUTTON}>
              Use my user folder
            </button>
          )}
          {tabMode === 'folder' && (
            <button data-choose-folder onClick={chooseFolder} className={ROW_BUTTON}>
              Choose folder…
            </button>
          )}
          <Segmented
            value={tabMode}
            onChange={(v: 'ask' | 'folder') => setNewTabMode(v)}
            options={[
              { id: 'folder', name: 'Open in a folder' },
              { id: 'ask', name: 'Ask where each time' }
            ]}
          />
        </div>
      </Pref>
      <ShellSetting />
      {/* The agent indicator lives with its colours on Appearance now, in the
          core, so both apps show the terminal rows in one order. */}
      <HelpSetting />
      {/* Explorer's own menu. Windows 11 hides classic verbs behind "Show more
          options", and saying so is better than the user hunting for it. The
          hint QUOTES the entry (#27): it no longer names the app, so the row
          has to say which line of Explorer's menu it is talking about. */}
      <Pref
        id="explorer-verb"
        label="Explorer menu"
        hint={
          verbBusy
            ? 'Checking with Windows.'
            : 'Adds an entry to the folder menu in Explorer that opens a terminal there.'
        }
      >
        <Switch
          on={verb}
          onChange={setVerb}
          label="Open terminal here, in the Explorer menu"
          disabled={verbBusy}
        />
      </Pref>
      <Pref id="app-version" label="Version" hint="The installed version of Prism Terminal.">
        <span id="app-version" data-app-version className="font-mono text-[12px] text-[var(--p-text-soft)]">
          {version}
        </span>
      </Pref>
    </div>
  )
}

/* ---------- appearance ---------- */

// WEAKEST TO STRONGEST, the order Prism's own Edges row uses (None, Faint,
// Hairline, Strong). The owner asked for the option "like we have in the main
// app", and a segmented control that is a scale reads as one only when its
// steps are in order; the order he happened to say them in ("Hairline, Faint,
// or like Solid edges, or even No edges") was a sentence, not a layout. The
// names come from the ids in `WINDOW_EDGES`, so the two lists cannot drift.
const EDGE_NAMES: Record<WindowEdges, string> = {
  none: 'None',
  faint: 'Faint',
  hairline: 'Hairline',
  solid: 'Solid'
}
const EDGE_OPTIONS: Array<{ id: WindowEdges; name: string }> = WINDOW_EDGES.map((id) => ({
  id,
  name: EDGE_NAMES[id]
}))

/**
 * The Appearance page: the terminal's look, which is the core's and the same in
 * Prism, and under it THIS APP'S one row about its own window (owner,
 * 2026-09-19, #27: "add the option to specify the edges that you have in the
 * Terminal app, like we have in the main app").
 *
 * It is this app's and not the core's because the edges are the window's
 * chrome: in Prism that belongs to the app style, which has an Edges row of its
 * own, so a terminal option for it there would be a second control over the
 * same lines. It sits in the e2e's closed list of this app's rows for the same
 * reason. No `ROWS` wrapper: the list above ends in its own bottom rule, and a
 * second top rule under it would be a doubled line (at "solid", a visible one).
 */
/** What the THEME in force would give the window, which is what a swatch
 *  shows while nothing is chosen: computed the way the window computes it
 *  (chromeTokens), not read back off the page, so it cannot lag a repaint.
 *  The theme's accent is measured against the PICKED background when there is
 *  one, since that is the ground it has to be seen on. */
const themeColours = (): string => {
  const id = termThemeId()
  const theme = resolveTermTheme(id)
  const bg = windowBackground()
  const vars = chromeTokens(bg ? { ...theme, background: bg } : theme, 100, presetAccent(id)).vars
  const themeBg = chromeTokens(theme, 100, presetAccent(id)).vars['--p-bg-solid']
  return `${vars['--p-accent']}|${themeBg}`
}
const onColoursChange = (cb: () => void): (() => void) => {
  const offs = [onTermLookChange(cb), onWindowBackgroundChange(cb)]
  return () => offs.forEach((off) => off())
}

/**
 * A window colour the user may pick over the theme's (owner, 2026-09-22): the
 * ACCENT ("the accents you see, like the blue highlight effect and tab
 * effect") and the BACKGROUND ("let background colour be a setting"). Each
 * follows the theme until a colour is picked, and a plain Reset word puts it
 * back, as in Prism. This app's own rows, for the edges' reason: in Prism the
 * window's colours are the app style's. They sit right under Font size (the
 * core lends the place, `afterFont`).
 */
function WindowColour({
  id,
  label,
  what,
  chosen,
  fromTheme,
  onPick
}: {
  id: string
  label: string
  what: string
  chosen: string | null
  fromTheme: string
  onPick: (hex: string | null) => void
}): JSX.Element {
  return (
    <Pref id={id} label={label} hint={chosen ? `${what} Uses your own colour.` : `${what} Follows the theme.`}>
      <div className="flex items-center gap-2.5">
        {chosen && (
          <button data-follow-theme={id.replace('window-', '')} onClick={() => onPick(null)} className={RESET_LINK}>
            Reset
          </button>
        )}
        <HexSwatch label={label} value={chosen ?? fromTheme} onChange={onPick} />
      </div>
    </Pref>
  )
}

function WindowColours(): JSX.Element {
  const accent = useWindowAccent()
  const background = useWindowBackground()
  const [themeAccent, themeBg] = useSyncExternalStore(onColoursChange, themeColours).split('|')
  return (
    <>
      <WindowColour
        id="window-background"
        label="Background colour"
        what="The colour behind the text in the window and terminal."
        chosen={background}
        fromTheme={themeBg}
        onPick={setWindowBackground}
      />
      <WindowColour
        id="window-accent"
        label="Accent colour"
        what="The colour of highlights, the selected row and the active tab."
        chosen={accent}
        fromTheme={themeAccent}
        onPick={setWindowAccent}
      />
    </>
  )
}

function AppearanceTab(): JSX.Element {
  const edges = useWindowEdges()
  return (
    <>
      <TerminalAppearanceSettings afterFont={<WindowColours />} withIndicator />
      <Pref
        id="window-edges"
        label="Edges"
        hint="The lines between the parts of the window, and the border round it."
      >
        <Segmented value={edges} onChange={setWindowEdges} options={EDGE_OPTIONS} />
      </Pref>
    </>
  )
}

/* ---------- page shell ---------- */

type TabId = 'general' | 'appearance' | 'dictation'

const Ico = ({ d }: { d: string }): JSX.Element => (
  <svg
    viewBox="0 0 24 24"
    width={17}
    height={17}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d={d} />
  </svg>
)

// How the app behaves, what it looks like, then the one optional feature
// that is big enough for a page of its own (#13).
const TABS: Array<{ id: TabId; label: string; icon: ReactNode }> = [
  {
    id: 'general',
    label: 'General',
    icon: (
      <Ico d="M4 7h8M16 7h4M4 17h4M12 17h8M12 7a2 2 0 1 0 4 0 2 2 0 1 0-4 0M8 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0" />
    )
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: (
      <Ico d="M12 3a9 9 0 1 0 0 18 3 3 0 0 0 0-6 3 3 0 0 1 0-6h3a6 6 0 0 0-3-6ZM7.5 10.5h.01M10 7h.01M14 7h.01" />
    )
  },
  {
    id: 'dictation',
    label: 'Dictation',
    icon: <Ico d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  }
]

// Settings keeps the system font whatever the terminal wears: the faces on
// offer in here are monospace ones for the shell, and a page of preference
// rows set in one is harder to read, not more consistent.
const UI_FONT = '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif'

/**
 * The Settings page. It rides the tab strip as a tab of its own, so it FILLS
 * whatever App mounts it in rather than fixing itself over the window, and it
 * takes no props: there is nothing to close (the tab's X does that) and every
 * setting is a store it writes.
 */
export default function Settings(): JSX.Element {
  const [tab, setTab] = useState<TabId>('general')
  const active = TABS.find((t) => t.id === tab) ?? TABS[0]
  return (
    <div
      data-settings-page
      className="flex h-full min-h-0 w-full"
      style={{ fontFamily: UI_FONT, fontSize: '12.5px' }}
    >
      <aside className="flex w-[212px] shrink-0 flex-col overflow-hidden border-r border-[var(--p-divider)] bg-[var(--p-side)] p-2.5">
        <div className="px-2 pb-1 pt-1 text-[14px] font-bold tracking-tight text-[var(--p-text)]">
          Settings
        </div>
        <nav className="flex flex-col gap-0.5 pt-3">
          {TABS.map((t) => {
            const on = t.id === tab
            return (
              <button
                key={t.id}
                data-settings-tab={t.id}
                onClick={() => setTab(t.id)}
                aria-current={on ? 'page' : undefined}
                className={`flex items-center gap-2.5 rounded-[var(--p-radius-sm)] px-2.5 py-[7px] text-left text-[13px] transition ${
                  on
                    ? 'bg-[var(--p-sel-bg)] font-semibold text-[var(--p-on-accent)]'
                    : 'font-medium text-[var(--p-dim)] hover:bg-[var(--p-hover)] hover:text-[var(--p-text)]'
                }`}
              >
                <span className={on ? 'opacity-90' : ''}>{t.icon}</span>
                {t.label}
              </button>
            )
          })}
        </nav>
        <div className="mt-auto px-2 pb-0.5 text-[10.5px] text-[var(--p-dim2)]">Prism Terminal</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col bg-[var(--p-bg)]">
        <header className="px-6 pb-3 pt-5">
          <h2 className="text-[21px] font-bold leading-none tracking-[-.022em] text-[var(--p-text)]">
            {active.label}
          </h2>
        </header>
        <div className="p-scroll min-h-0 flex-1 overflow-y-auto px-6 py-2">
          {tab === 'general' ? (
            <GeneralTab />
          ) : tab === 'appearance' ? (
            <AppearanceTab />
          ) : (
            <DictationSettings />
          )}
        </div>
      </div>
    </div>
  )
}
