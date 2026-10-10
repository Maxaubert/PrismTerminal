# Permission prompts and the agent indicator (#148)

Status: APPROVED by the owner on 2026-10-10, together with the plan
(`docs/superpowers/plans/2026-10-10-permission-indicator.md`), with the recommended answer to every
decision in section 9: (1) a), Working after Yes comes from Claude's own spinner title (a
`working-title` step in phase `question` or `stopped`), never from the answer key; (2) a), a pending
Question survives working and done signals while `looksLikeQuestion` still sees the box, with no
plugin change; (3) the early Finished with background subagents running is OUT of scope, now issue
#149; (4) auto mode's prompts from ask rules and asking hooks (cases C and E) count as the
classifier criterion, since the classifier never prompts on 2.1.296 (C3). Core change, so a Prism
change too (section 7).

Evidence: `C:\Users\Admin\Documents\Claude\research\prism-terminal\2026-10-10-permission-indicator.md`
(every case's raw timeline and its replay through main at `bded1e2`). Background: the hooks spec
`2026-10-05-agent-hooks-design.md` (#131) and the question rule of #144 / #145.

## 1. The report

Owner, 2026-10-10, Prism Terminal Stable 0.34.0, a Claude Code session in auto mode (issue #148):

1. "When Claude Code asks for permission (for example before a `gh pr merge`), the tab often does not
   get the blue question line."
2. "After the permission was accepted, Claude went on working: the screenshot shows
   `Moseying… (7m 12s)` and a shell command running for 33 s. The tab still showed no working
   indicator, and it stayed that way while the work continued."

Expected, from the issue: "A permission prompt raises Question every time. Accepting it goes
straight back to Working, until Stop." And "The same holds for an auto-mode classifier prompt."

## 2. What was measured

A real `claude.exe` 2.1.296 in a real pty (node-pty with the ConPTY dll, no window, keys written to
the pty), our plugin plus a logging plugin handed over through `CLAUDE_CODE_PLUGIN_DIRS` exactly as
`ptyEnv` does, the owner's own hooks and plugins left out. Prompts came from a project ask rule
`Bash(powershell *)` and from a project PreToolUse hook answering "ask" (the mechanism of the
owner's merge guard). The long tool was `Start-Sleep 25`.

The order is the same in every mode tested (default, auto with an ask rule, auto with a hook that
asks), quoted from the report:

```
UserPromptSubmit                         -> OSC working
PreToolUse (Bash)                        -> OSC working        (+0 ms)
title becomes idle "✳ ..."               (13-15 ms BEFORE the question OSC)
PermissionRequest                        -> OSC question       (+63-77 ms after PreToolUse; +361 ms when a hook asks)
Notification:permission_prompt           -> OSC question       (6.0-8.8 s later, only if not answered by then)
[user answers]                           -> NO HOOK AT ALL
title spinner again                      (34 ms after Yes; 2.7 s in case E), a frame about every 960 ms while the tool runs
PostToolUse                              -> OSC working        (only when the tool ENDS: 26 s later for a 25 s sleep)
Stop                                     -> OSC done
```

Case A, the plain Yes, raw (ms from spawn):

```
 13730  OSC    prism-agent;state=working        (PreToolUse)
 13792  title  '✳ Powershell sleep command'
 13796  (the permission box is drawn: "Do you want to proceed?", "❯ 1. Yes", "2. No")
 13804  OSC    prism-agent;state=question       (PermissionRequest)
 19831  OSC    prism-agent;state=question       (Notification:permission_prompt)
 22827  KEY    Enter (Yes)
 22860  title  '◑ Powershell sleep command'     (spinner, then a frame about every 960 ms)
 22866  (the repaint that erases the box)
 49016  OSC    prism-agent;state=working        (PostToolUse, 26 s later)
 49815  OSC    prism-agent;state=done           (Stop)
```

Two details in it matter for the design: the box is on screen BEFORE the question signal arrives
(13796 before 13804), and the first spinner title after Yes arrives 6 ms BEFORE the repaint that
erases the box (22860 before 22866).

Other cases:

- **B, Esc or No:** "no hook at all, no Stop and no PostToolUseFailure. The title stays `✳`".
- **D, two prompts in a row:** the same sequence twice; both Questions went up, looking or not.
- **E, auto mode, a hook asks:** the same sequence; the spinner came back 2.7 s after Yes.
- **C3, auto mode, the classifier:** "in 2.1.296 the classifier does not prompt. It denies."
  PreToolUse, 3.8 s of spinner, `PermissionDenied`, Stop. "In auto mode, a prompt appears only for an
  ask rule (the owner's settings ask on `gh pr merge`) or for a hook that asks (`guard-policy.py`).
  Both fire PermissionRequest at once (cases C and E)."
- **G2, two background subagents, one asks:** subagent hooks write the same OSC as the main agent's.
  The main turn's Stop (done) at 22.2 s, then subagent 1's PermissionRequest (question) at 22.3 s,
  then subagent 2's PreToolUse / PostToolUse (working) every 1 to 3 s while subagent 1's box stayed on
  screen until the key at 36.4 s. The title stayed `✳` the whole time the box was up.
- **The plugin was loaded:** Stable's `hooks.json` is byte-identical to main's and this Stable
  session's environment carries `CLAUDE_CODE_PLUGIN_DIRS`. The issue's fourth lead is not the cause.

## 3. Why it goes wrong

**Gap 1: no Working after Yes (complaint 2).** After the answer no hook fires until the tool ENDS.
Claude's title says it at once (the spinner, 34 ms after the key), but a hooked session ignores every
title except the idle one (`useAgentIndicator`: "the title only says an Esc"), and the answer key
only clears the Question. Replayed through main, the tab shows nothing for "26.2 s" (A), "26.0 s" (C),
"28.7 s" (E), "13.8 s and 11.3 s" (D): the owner's 33 s command is this.

**Gap 2: any working signal takes a pending Question down (complaint 1, with agents).** `hookStep`
clears `question` on every `working` and every `done`, whichever agent sent it. In G2 the Question
"was up for 3.9 s of the 14 s the box waited", came back with the 6 s Notification, and the next
sibling signal took it down again. The owner's sessions run background agents ("← 3 agents" on
screen), so this is the likely cause of "often" today.

**Gap 3, already fixed on main by #145:** Stable 0.34.0 raised a Question only on a tab NOT in front,
and a look took it down, so a prompt on the tab being watched never showed the line. 0.34.1 and later
raise it on any tab and keep it until it is answered.

**Smaller, measured, not in the issue:** a main Stop while background subagents still run shows
Finished early (G2 at 44.7 s); `PermissionDenied` has no hook of ours (harmless, Stop follows); the
idle title before every question turns the phase to `stopped` for 15 ms (harmless).

## 4. Behaviour at each moment

What the tab shows, after the change. W is the working mark, Q the Question line, F the Finished
line. "Away" means the tab is not in front or the window is not focused.

| Moment | Today on main | After |
|---|---|---|
| Prompt shown (PermissionRequest) | Q, in front or away | Q, in front or away (unchanged) |
| Prompt still up, another agent's tool call (working) arrives | Q taken down, W shown | Q stays while the box is on screen |
| Prompt still up, the main turn's Stop (done) arrives | Q taken down, F (away) | Q stays; F is raised under it (away), and shows if the box is then turned down |
| Yes | nothing | W at the first spinner title once the box is gone: about 0.3 s (a re-read 250 ms after a title that came before the repaint), at worst the next spinner frame (about 1 s) |
| A long tool running after Yes | nothing until PostToolUse | W throughout (spinner frames, then PostToolUse) |
| Stop | F (away) | F (away) (unchanged) |
| No or Esc | Q goes when the key is heard and the box has gone; nothing after | the same: the title stays `✳`, so nothing turns W on (case B) |
| A second prompt after a seen or answered Question (D) | Q, then nothing for the tool | Q, then W, each time |
| Answered from somewhere else (no key in this tab) | Q stays until PostToolUse | W at the first spinner frame with the box gone |
| Auto mode, an ask rule or a hook that asks (C, E) | as the first row | as the rows above: identical sequence, measured |
| Auto mode, the classifier | never prompts on 2.1.296: it denies, then Stop (C3) | unchanged: W, then F |

## 5. The rule changes (core)

### 5.1 `agentHookState`: a spinner title after a question is the approved work

New event `{ state: 'working-title' }`, sent for a hooked session when its title reads `working`
(`readAgentTitle`; a spinner after the agent's first idle title).

- In phase `question` or `stopped`: `{ phase: 'working', working: true, raise: [], clear: ['question'] }`.
- In `working`, `done`, `failed`, or no phase: `null` (nothing).

Why each part:

- **The title is Claude's own word, and the only one there is.** No hook fires between the answer
  and PostToolUse (measured in A, C, D, E, G2). The spinner returns 34 ms after Yes and repeats about
  every 960 ms for as long as the tool runs.
- **Not from the answer key.** A key cannot tell Yes from No: Enter on "2. No" is the same key as
  Enter on "1. Yes". After No or Esc the title stays `✳` (case B), so the title rule needs no
  guessing.
- **`stopped` too,** for a prompt whose question signal never arrived (a hook that timed out, an
  older plugin): the box is up, the tab shows nothing, and Yes should still light it. After a real Esc
  the title stays `✳` (case B, and #131's measurement), so no spinner follows to relight it.
- **Not in `done` or `failed`:** a new turn always sends UserPromptSubmit first, and a last spinner
  frame racing a Stop must not relight a finished tab. Not in `working`: nothing to change.
- **It covers an answer given elsewhere** (the phone, another client), where no key reaches this tab.

### 5.2 `agentHookState`: while the box is on screen, the Question stands

`hookStep(prev, ev, seen?)` takes a third, optional argument `{ questionOnScreen: boolean }`. When the
phase is `question` and the box is still on screen:

- `working` (a hook from any agent): `null`. The tab keeps saying Question.
- `working-title`: `null`. The caller re-reads the screen 250 ms later and sends it again (5.3).
- `done`: `{ phase: 'question', working: false, raise: ['finished'], clear: [] }`. Finished is raised
  under the Question (the strip draws the Question, which outranks it), so a No or Esc to the box
  still leaves the finish the main turn made.
- `question` and `failed`: as today.

When `seen` is absent or the box is gone, everything is as today. A pure helper
`screenDecides(prev, ev)` says when the caller must read the screen at all: phase `question` and an
event of `working`, `working-title` or `done`. Every other step reads nothing.

Why the screen, and not the hook's sender: the box is the agent waiting on you, whoever drew it. It
is on screen before the question signal (13796 before 13804) and gone in the repaint after the
answer, so it brackets the wait exactly. It also covers a main Stop landing next to a subagent's
question, which tagging the sender would not. `looksLikeQuestion` already reads it for #144's answer
check, so no new reading is invented: a hooked session's screen is read only to HOLD a Question its
hooks raised, never to raise one (the `agentHooks` e2e keeps proving the footer alone marks nothing).

### 5.3 `useAgentIndicator`: carrying it out

- `onTitle`, hooked branch: `idle` sends `idle-title` (as today); `working` now sends `working-title`.
  `starting` and Codex's `question` are untouched (a hooked session is Claude).
- `applyHook`: when `screenDecides(prev, ev)`, pass `{ questionOnScreen: looksLikeQuestion(readScreenTail(id)) }`.
- A held `working-title` arms ONE re-read per session at 250 ms (the first spinner after Yes comes
  6 ms before the box is erased, so the title alone would wait for the next frame, about 1 s). The
  re-read sends `working-title` again; a new question signal, the agent leaving or `forget` cancels
  it, as #144's answer timers are cancelled.
- Nothing else in the hook moves: Finished-while-away, the answer key, the poll, the fallback paths.

### 5.4 The plugin: no change

No hook is added. `hooks.json` and `hook.cmd` stay byte for byte, so Stable and Prism's copies stay
valid, and the plugin keeps its rule "nothing from stdin is read or repeated". Mapping
`PermissionDenied` is not needed (Stop follows it, C3). Tagging subagent events is decision 2.

## 6. What stays

From `docs/regression-rules.md` (`#claude-hooks`, `#finished-and-question`), all kept:

- A hooked session is never scored from output; a Claude footer on screen never RAISES a Question
  (the e2e line "the question footer on screen does not mark a hooked session" stays green).
- An idle title after `working` with no Stop is an Esc: idle, no Finished line; a Stop after it still
  finishes.
- A Question goes up on the tab in front too, a look never takes it down, and it lasts until answered
  (#144); the answer key with the box gone is still how a No or an Esc is heard.
- Question outranks Failed, which outranks Finished; the strip and the badge hide a Question under
  Working (`TabStrip`, `attentionCount`), which is why a held Question keeps `working: false`.
- Sessions that never send a signal (Codex, an older claude, an untrusted folder, plugins blocked,
  the setting off) keep the old method whole: the new code runs only in the hooked branch.

The rule text changes in two places: "its title only says an Esc" becomes "its title says an Esc,
and a spinner after a question is the approved work (#148)"; "never read for a question" becomes
"read only to hold a Question its hooks raised (#148)".

## 7. Prism, and sessions without hooks

- **Prism:** the change is in `core/`, so it reaches Prism with the next core bump. Prism passes no
  `claudePluginDir` today, so none of its sessions is hooked and nothing it shows changes until it
  ships the plugin; when it does, it gets this behaviour with it. Prism's `terminal-gate` runs on the
  bump as usual. Core version 0.28.0 to 0.28.1 (a fix).
- **Non-hooked sessions** (Codex, Claude without the plugin): untouched. Their title path already
  treats a spinner as working and reads the screen for questions, as before.

## 8. Risks

- **A spinner title while a box is up.** Not seen in any run (the title was `✳` while every box was
  up, G2 included, with a sibling agent busy). If a later Claude does it, 5.2's hold keeps the
  Question anyway, since `working-title` is held while the box shows.
- **A rewording of the box** in a Claude update: `looksLikeQuestion` stops seeing it, and the hold
  falls back to today's behaviour (a sibling takes the line down). Same exposure as #144's answer
  check, in the same function; its fixtures gain the measured box rows (plan task 2).
- **The 6 s Notification racing a Yes:** a question signal landing just after the answer puts the
  phase back to `question`; the next spinner frame (about 1 s) brings Working back, with the box gone.

## 9. Decisions for the owner

1. **How Working comes back after Yes.** (a) Claude's own spinner title, once the box is gone;
   (b) the key that answered; (c) leave it until the tool ends. **Recommended: (a).** It is Claude's
   word, it arrives 34 ms after Yes, it says nothing after No or Esc, and it works when you answer from
   another device. (b) lights the tab on a No too. (c) is today's bug.
2. **How a Question survives other agents' activity.** (a) Hold it while the box is on screen;
   (b) also make the plugin tag subagent events (reads the hook's stdin, changes the plugin's files and
   Stable's copy); (c) only (b). **Recommended: (a) alone.** It covers the measured case and the main
   Stop race, needs no plugin change, and (b) can follow if a case appears that (a) misses.
3. **Finished too early while background agents still run** (G2: Finished at 44.7 s while an approved
   tool ran on). **Recommended: a separate issue,** measured on its own (`SubagentStart` / `SubagentStop`
   counting), not in this fix. The marks flip back to Working at the next sibling hook today.
4. **The issue's "auto-mode classifier prompt" criterion.** Claude 2.1.296 never prompts from the
   classifier; it denies and goes on (C3). The prompts auto mode does show (an ask rule, a hook that
   asks: the owner's `gh pr merge` guard) were measured and fire exactly the default-mode sequence.
   **Recommended: count C and E as that criterion,** and note C3 in the PR. If a later Claude starts
   prompting from the classifier, it is re-measured then.

## 10. Done when

- Unit: the measured timelines A, B, C, D, E, G2 and C3, replayed through the new rules, give Q at
  the prompt, W within one re-read after Yes, W held through the tool, F at Stop; nothing after Esc;
  G2's Question held for the whole 14 s the box waited.
- e2e `agentHooks`, extended with A's and G2's exact byte sequences, fails on main and passes after.
- `attention` and `indicator` e2e still green; typecheck, lint, unit green.
- The installed app (normal `PrismTerminal`, never the Stable copy) is the new version.
