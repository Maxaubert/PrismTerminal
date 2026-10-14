# Agent hotkeys (#198)

Owner, 2026-10-13: "maybe having a toggle for better key bindings, because I know that a lot of the
normal key bindings are occupied by the terminal, but I think most people who use this terminal will
just use it for agents, so those key bindings are not really needed and can be better utilized for
actual functions, like for example, control s, I want to be the sidebar toggle", then "build that and
set it to be something natural ... make it a setting thats by default on".

- **Setting:** Appearance > Window > "Agent hotkeys", a switch, ON by default, stored in
  `prism.window.agentKeys` (`lib/agentKeysPrefs.ts`). This app only: the keys are the app shell's.
- **Keys** (each chord's `agent` in `lib/keymap.ts`, a SECOND key for an existing action; the usual
  key keeps working):
  - **Ctrl+S** shows or hides the sidebar, while the tabs are vertical (owner, by name).
  - **Ctrl+PageDown / Ctrl+PageUp** next / previous tab, the browser's and Windows Terminal's habit.
- **What the shell loses while it is on:** Ctrl+S is Claude Code's stash-the-prompt
  (code.claude.com/docs/en/interactive-mode, read 2026-10-13), PowerShell's forward history search
  and the terminal's pause. Ctrl+PageUp/PageDown are bound by neither Claude Code nor Codex. Every other
  Claude Code key (Ctrl+B, O, R, G, K, L, J, T is already the app's new tab) stays the agent's; the
  keymap test holds that list.
- **Off:** the keys are the shell's again; Ctrl+Shift+B and Ctrl+Tab are unchanged either way.
- The row's subtext names no key (settingsCopy); its tooltip lists them from the keymap.
- Tests: `keymap.test.ts` (on, off, vertical only, Claude's keys untouched); e2e `agentKeys`.
