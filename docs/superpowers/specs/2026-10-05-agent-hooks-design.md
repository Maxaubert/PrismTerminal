# Agent states from Claude Code hooks (#131): design and plan

Owner, 2026-10-05. The design dialogue happened in session. The owner chose the small version, Claude only
("go ahead and build that"), with recommendations accepted throughout. Research and spike evidence:
`C:\Users\Admin\Documents\Claude\research\prism-terminal\2026-10-05-agent-hooks-inventory.md` (sections 1-9).

## Why
Today's indicator infers state from the outside: the terminal title, a process poll, output activity, and screen
text for questions.
- **"Waiting on you" is fragile.** It matches Claude's English footer text (`agentQuestion.looksLikeQuestion`), so a
  Claude Code rewording would silence the Question line and the taskbar count without any error.
- **Failure is invisible.** A rate-limited or errored turn looks finished.

Claude Code hooks report these states exactly.

## Decisions (owner)
1. **Claude Code only** in this PR. Codex stays on its title, plus one small fix: Codex's `[ ! ] Action Required` /
   `[ . ] Action Required` title means "needs you" (Question). Codex hooks need a per-hash trust in Codex and add
   almost nothing over its title. They stay a possible later opt-in on the same reader.
2. **In the core**, shared with Prism. The plugin files live in `core/` so both apps can ship them.
3. **On by default**, with a switch. Off means off: the variable is not set, so no plugin is loaded.
4. **Indicator only.** No notifications, cost display or the like.
5. **States:**
   - Waiting for permission, an MCP elicitation and Claude's own question all show the existing Question line.
   - Done shows Finished.
   - **Failed** is a new line in the theme's red, behind its own switch, with its kind (rate limit, overloaded, ...)
     in the tab's tooltip.
   - Subagents and compacting count as Working.
6. **What stays of today's method:**
   - For a session that has spoken through hooks, screen reading for questions is off.
   - The title still clears Working after an Esc (no hook fires on interrupt; measured: the idle title comes 72 ms
     after Esc).
   - The process poll still decides whether an agent is present at all.
   - Sessions that never speak through hooks keep the whole current method: Codex, a claude started before the
     update, a folder not yet trusted, or plugins blocked by policy.

## Design
**Transport: in-band OSC 777.**
- A bundled Claude Code plugin's command hooks print
  `{"terminalSequence":"\u001b]777;prism-agent;state=<state>[;kind=<kind>]\u0007"}`.
- Claude writes that sequence into its own terminal, so it reaches the tab's pty.
- **No network, listener or tab ids.** `claude -p` and SDK runs never write it (measured), so nested runs cannot
  light up a tab.
- **The hook must stay trivial**, because blocking events wait for it: a `.cmd` that echoes a static JSON line (no
  node, 20-100 ms measured).
- **One static entry per event.** StopFailure has one per `error` matcher value, so each kind is a static string.

**Plugin:** `core/claude-plugin/`, with `.claude-plugin/plugin.json`, `hooks/hooks.json` and `hook.cmd`.

| Event | `state=` |
|---|---|
| UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, SubagentStart, PreCompact | `working` |
| PermissionRequest, Elicitation | `question` |
| Notification, matchers `permission_prompt`, `elicitation_dialog`, `elicitation_url_dialog` | `question` |
| Stop | `done` |
| StopFailure, each matcher | `failed;kind=<matcher>` |

SessionStart and SessionEnd are left out: their bytes rarely reach the pty (measured 1 of 3 and 0 of 3).

**Attaching:**
- Main's `ptyEnv` (core) appends the plugin directory to `CLAUDE_CODE_PLUGIN_DIRS`, keeping any value the user set,
  joined with `;`. It does this only when the host passes a plugin path and the setting is on.
- The app copies `core/claude-plugin` to `resources/claude-plugin` (electron-builder `extraResources`), and main
  passes that path. In dev, it passes the source path.
- A host that passes no path (Prism, until it ships the files) gets nothing, and nothing changes there.

**Reader (core renderer):**
- `TerminalPanel` registers an OSC 777 handler.
- A pure parser (`lib/agentHookSignal.ts`) accepts only `prism-agent;...` payloads with a known state and a sane kind.
  It ignores everything else and returns `false`, so other OSC 777 users are unaffected.
- The parsed state goes onto termBus for the session.
- `useAgentIndicator` treats a hook state as the agent's own word, above the title, and remembers per session that
  hooks are live:
  - **working:** working.
  - **question:** the Question state (the Question line when not looking, as today).
  - **done:** finished.
  - **failed:** a new failed state with its kind.
- **Precedence:**
  - An idle title after a hook `working`, with no Stop, means interrupted. That gives idle with no Finished line
    (an Esc is not a finish).
  - A new `working` clears question and failed.
  - The process poll's "no agent" still clears everything.

**Failed line:**
- Like Finished and Question: a static 3 px line when you were not looking, cleared when the tab is opened.
- It outranks Finished; Question outranks Failed.
- **Switch:** `agent-failed-on`, key `prism.term.agentFailedOn`, on by default, in the core options list next to the
  other two. Each app's options e2e must show it, and Prism's page composes from the core rows, so it appears there.
- **Colour:** the theme's red, moved to the contrast floor like Finished's green. A colour picker is not asked for.
- **Taskbar badge:** counts a failed tab too.
- **Tab tooltip:** "Failed: rate limit" and so on.

**Setting:** "Exact status from Claude Code", key `prism.term.agentHooks`, on by default. It lives in the core next
to the indicator rows, in the same options list. Off means the env var is not added for new shells; running shells
keep what they started with. Its plain-words hint follows `settingsCopy`.

**Codex title:** `agentTitle` maps an `Action Required` title from Codex to "needs you".

**Privacy:** PRIVACY.md gets a line: PT adds a local plugin to Claude Code sessions started in its tabs, to read the
agent's state. Nothing leaves the PC, and the setting turns it off.

**Versions:** core and app take a minor bump. CLAUDE.md gets a rule section.

## Testing
- **Unit tests:**
  - the signal parser (valid, unknown state, other prefixes, malformed);
  - the indicator state machine with hook states (precedence, interrupt, failed, a new prompt clearing it, falling
    back when there are no hooks);
  - `ptyEnv` appending to and keeping the user's `CLAUDE_CODE_PLUGIN_DIRS`, and leaving it alone when off;
  - `hooks.json` covering every event and matcher above with valid JSON and the static strings, plus `hook.cmd`
    printing valid JSON per state when run (cmd is on Windows CI).
- **E2E** (headless, `npm run e2e`): a stand-in agent prints the OSC 777 sequences in a real pwsh. The scenario
  asserts:
  - Working, then Question (the line when not looking), Done, and Failed with its tooltip;
  - the badge count;
  - an idle title after Working with no Stop ends with no Finished line;
  - the switch off means no Failed line;
  - another OSC 777 payload is ignored.
- **Real Claude check (hands-on, before merge):** run the packaged app with a real claude:
  - an invalid model gives Failed (`model_not_found`, no tokens);
  - a permission prompt gives Question;
  - a reply gives Done.

## Plan
1. Plugin files in `core/claude-plugin/`, plus the hooks.json and hook.cmd unit tests.
2. `ptyEnv` plugin-dir injection, the host dependency, the setting read in main; builder `extraResources`; tests.
3. The parser plus the OSC handler in TerminalPanel, then termBus.
4. Hook states in `useAgentIndicator`: precedence, interrupt, the failed state, the screen question off for hooked
   sessions; tests.
5. The Failed line, switch, colour, badge and tooltip, plus the "Exact status from Claude Code" switch; options and
   settingsCopy tests.
6. Codex `Action Required` in agentTitle; test.
7. The e2e scenario, a fail-on-main proof, and the full gate.
8. PRIVACY.md, the CLAUDE.md section, the versions, a hands-on check with the packaged build, and the PR.
