import type { JSX } from 'react'
import { setHelpEnabled, useHelpEnabled } from '../lib/helpPrefs'
import { Pref, Switch } from './fields'

// THE COMMAND HELP SWITCH, for both hosts (#12). A row rather than a page, as
// the shell and indicator rows are: where it sits is each app's own layout.
//
// On by default; the owner asked only that it be OPTIONAL ("optional in
// settings whether a user wants to see them"). Off means off: the host hides
// its button and gives the key back to the shell.

/**
 * `opensWith` is the host's own way in ("F1, or the ? in the title bar"): the
 * key is a chord each host claims for itself, so each host says which.
 */
export function HelpSetting({ opensWith }: { opensWith: string }): JSX.Element {
  const on = useHelpEnabled()
  return (
    <Pref
      id="help-enabled"
      label="Command help"
      hint={`Find a command by describing it, then copy it. Nothing is typed or run for you. ${opensWith}`}
    >
      <Switch on={on} onChange={setHelpEnabled} label="Command help" />
    </Pref>
  )
}
