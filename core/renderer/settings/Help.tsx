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
 * `opensWith` is no longer shown (owner, 2026-09-22: settings descriptions say
 * what a setting does, and never name keys or give tips). It stays optional in
 * the signature so a host built against an older core still compiles.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function HelpSetting(_props: { opensWith?: string } = {}): JSX.Element {
  const on = useHelpEnabled()
  return (
    <Pref
      id="help-enabled"
      label="Command help"
      hint="Finds a command from a plain description so you can copy it."
    >
      <Switch on={on} onChange={setHelpEnabled} label="Command help" />
    </Pref>
  )
}
