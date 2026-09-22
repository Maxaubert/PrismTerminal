import { useEffect, useState, type JSX } from 'react'
import { termApi } from '../host'
import { savedShellId, saveShellId } from '../lib/termPrefs'
import { setAgentIndicator, useAgentIndicator, type AgentIndicator } from '../lib/termLook'
import { Pref, Segmented, Select } from './fields'

// THE TERMINAL'S BEHAVIOUR ROWS, for both hosts (#15): which shell a new
// terminal launches, and how loudly a working agent shows on its tab. Rows
// rather than a page, because where they sit is each app's own layout: Prism
// Terminal puts them under General, Prism under its Terminal tab.

/** Which shell new terminals launch, from the ones main detected. */
export function ShellSetting(): JSX.Element | null {
  // Fetched when the row first shows. A saved id may name a shell that no
  // longer exists; the select then shows the real default, which is also what
  // a new terminal would actually launch.
  const [shells, setShells] = useState<Array<{ id: string; name: string }>>([])
  const [choice, setChoice] = useState(() => savedShellId() ?? '')
  useEffect(() => {
    let live = true
    void termApi()
      .termShells()
      .then((list) => {
        if (live) setShells(list.map((s) => ({ id: s.id, name: s.name })))
      })
    return () => {
      live = false
    }
  }, [])
  if (!shells.length) return null
  const value = shells.some((s) => s.id === choice) ? choice : (shells[0]?.id ?? '')
  return (
    <Pref id="term-shell" label="Shell" hint="The shell that new terminals start with.">
      <Select
        id="term-shell"
        value={value}
        onChange={(v) => {
          setChoice(v)
          saveShellId(v)
        }}
        options={shells}
      />
    </Pref>
  )
}

/** Off, a line under the tab, or the whole tab filled. It is about how YOU like
 *  the indicator, not part of a colour theme: a theme pick never resets it and
 *  a saved theme never carries it (owner, 2026-09-19, for both apps). */
export function AgentIndicatorSetting(): JSX.Element {
  const volume = useAgentIndicator()
  return (
    <Pref
      id="agent-indicator"
      label="Agent indicator"
      hint="How a tab shows that its agent is working. Minimal draws a line under the tab, full fills the tab."
    >
      <Segmented
        value={volume}
        onChange={(v) => setAgentIndicator(v as AgentIndicator)}
        options={[
          { id: 'off', name: 'Off' },
          { id: 'minimal', name: 'Minimal' },
          { id: 'full', name: 'Full' }
        ]}
      />
    </Pref>
  )
}
