# Plan: permission prompts and the agent indicator (#148)

Spec: `docs/superpowers/specs/2026-10-10-permission-indicator-design.md`. Evidence:
`C:\Users\Admin\Documents\Claude\research\prism-terminal\2026-10-10-permission-indicator.md`. Branch
`fix/148-permission-indicator`, worktree `.claude/worktrees/permission-indicator`, from `origin/main`
at `bded1e2`. Versions bumped in the first code commit: core 0.28.0 to **0.28.1**, app 0.35.0 to
**0.35.1** (both patch: a fix).

Rules for every task: test first, run it red, then the code; no em-dashes; comments say WHY, with the
measurement; `core/` stays lint-walled (relative imports, no `window.prism`). `npm test`,
`npm run typecheck`, `npm run lint` green at the end of each task. E2E: `npm run e2e -- <name>`,
parked, ONE PT e2e process at a time. Never close or touch `PrismTerminalStable` (process or
`%LOCALAPPDATA%\PrismTerminalStable`).

The plan follows the owner's recommended answers in spec section 9 (1a, 2a, 3 separate issue,
4 C and E count). Another answer changes only the task it names there.

## Task 0. Versions

Files: `core/package.json` (0.28.1), `package.json` and `package-lock.json` (0.35.1;
`npm version 0.35.1 --no-git-tag-version`).

- Verify: `npm run typecheck`.
- Commit: `chore: bump core 0.28.1 and app 0.35.1 (#148)`.

## Task 1. The e2e first, red on today's code

File: `tools/e2e/run.mjs`, scenario `agentHooks`, a new section after "Asked on the tab in front"
and before "DONE on a background tab". The stand-in pwsh writes the bytes measured in cases A and G2
(spec section 2), using the scenario's own `osc`, `say`, `at`, `IDLE`, `look`, `state`, `line`.

```js
// A PERMISSION PROMPT, ANSWERED YES (#148): case A's bytes. The box, the idle
// title, the question; then the box goes and Claude's spinner title comes back
// with NO hook (MEASURED: none fires until PostToolUse, 26 s later), frames
// about every 960 ms; then PostToolUse and Stop.
const BOX = "Write-Host 'Do you want to proceed?'; Write-Host ' 1. Yes'; Write-Host ' 2. No'"
const spin = (g) => `$Host.UI.RawUI.WindowTitle = [char]0x${g} + ' Claude Code'`   // 25D0 / 25D1
const frames = Array.from({ length: 8 }, (_, i) => `${spin(i % 2 ? '25D1' : '25D0')}; Start-Sleep -Milliseconds 900`).join('; ')
await at(0, say('working'))
await at(0, `${BOX}; ${IDLE}; ${say('question')}; Start-Sleep -Milliseconds 2500; Clear-Host; ${frames}; ${say('working')}; Start-Sleep -Milliseconds 500; ${say('done')}`)
ok(!!(await until(async () => (await state(0)) === 'question', 8000, 50)), 'a permission prompt raises the Question line')
ok(!!(await until(async () => (await state(0)) === 'working', 6000, 50)), 'the spinner after the answer is Working again')
// Held through the tool: sampled every 250 ms for 5 s, never blank.
const blank = []
for (let t = 0; t < 20; t++) { const s = await state(0); if (s !== 'working') blank.push(s); await sleep(250) }
ok(blank.length === 0, `Working holds through the long tool, with no hook (${JSON.stringify(blank)})`)
await tab(1).click()
ok(!!(await until(async () => (await state(0)) === 'done', 10000, 50)), 'and Stop on a background tab is Finished')
await look(0)
await until(async () => (await state(0)) === null, 4000, 50)

// ANOTHER AGENT'S WORK DOES NOT TAKE THE QUESTION DOWN (#148): case G2's bytes.
// A background subagent's box is up; its sibling's PreToolUse and PostToolUse,
// and the main turn's Stop, arrive while it waits.
await at(0, say('working'))
await at(0, `${BOX}; ${IDLE}; ${say('question')}; Start-Sleep -Milliseconds 1500; ${say('working')}; Start-Sleep -Milliseconds 1000; ${say('done')}; Start-Sleep -Milliseconds 1000; ${say('working')}; Start-Sleep -Milliseconds 3000; Clear-Host; ${spin('25D0')}; ${say('working')}`)
ok(!!(await until(async () => (await state(0)) === 'question', 8000, 50)), 'a subagent asks: the Question line')
const lost = []
for (let t = 0; t < 14; t++) { const s = await state(0); if (s !== 'question') lost.push(s); await sleep(250) }
ok(lost.length === 0, `other agents' signals leave it up while the box shows (${JSON.stringify(lost)})`)
ok(!!(await until(async () => (await state(0)) === 'working', 8000, 50)), 'answered, the box gone, it is Working')
await at(0, say('done'))
```

Notes for writing it: the `look`/`tab(1)` choices follow the section before it; end the section idle
(the existing "DONE" section starts with `say('working')`, so no reset is needed). Check
`HALF` in `agentTitle.ts` holds `◐` (U+25D0) and `◑` (U+25D1): it does. The title is ready (an idle
title came first), so a spinner reads `working`, not `starting`.

- Run red: `npm run e2e -- agentHooks`. Expected on today's code: "the spinner after the answer is
  Working again" fails (the hooked title path ignores it; the Question stays with no key pressed),
  and "other agents' signals leave it up" fails (the first `working` takes it down). Record both
  failure lines for the PR.
- Commit (red e2e only): `test(e2e): permission prompt timelines from #148 (red)`.

## Task 2. Pure: the box the measurement saw (core)

Files: `core/renderer/lib/agentQuestion.test.ts`.

- Tests first, with the rows copied from the measured screens (`pt148/out/A.raw.txt` at 13796, and
  `G2.raw.txt` while subagent 1's box was up, rendered to text rows, the `← 3 agents` footer included):
  - `looksLikeQuestion(A_BOX_ROWS)` is true; the same rows after the 22866 repaint (the
    `✻ Cultivating…` line, the empty input box, the status line) are false.
  - `looksLikeQuestion(G2_BOX_ROWS)` is true with the agents footer below it, inside 16 rows (the
    `readScreenTail` default).
- No code change expected. If a fixture fails, the hold in task 4 cannot work: stop and report.
- Verify: `npx vitest run core/renderer/lib/agentQuestion.test.ts`.

## Task 3. Pure: the spinner after a question is Working (core)

Files: `core/renderer/lib/agentHookState.ts`, `agentHookState.test.ts`.

- Tests first:
  - `working-title` after `question` gives `{ phase: 'working', working: true, raise: [], clear: ['question'] }`.
  - After `stopped` (working, then `idle-title`) the same.
  - After `working`, `done`, `failed`, and with no phase: `null`.
  - Case B: working, idle-title, question, and nothing else: the phase stays `question`, never
    working (a No or an Esc leaves the title idle).
- Code: `HookEvent` gains `{ state: 'working-title' }`; one `case` in `hookStep`. The file comment
  gets the measurement (34 ms after Yes, no hook until PostToolUse, 26 s for a 25 s sleep; a key cannot
  tell Yes from No).
- Verify: vitest on the file.

## Task 4. Pure: the box holds the Question (core)

Files: `core/renderer/lib/agentHookState.ts`, `agentHookState.test.ts`.

- Tests first:
  - `screenDecides(prev, ev)` is true only for phase `question` with `working`, `working-title` or
    `done`; false for every other pair (a table test).
  - Phase `question`, `{ questionOnScreen: true }`: `working` gives `null`; `working-title` gives
    `null`; `done` gives `{ phase: 'question', working: false, raise: ['finished'], clear: [] }`;
    `question` and `failed` as without it.
  - The same with `{ questionOnScreen: false }` and with no third argument: exactly today's results
    (the existing tests stay unchanged and green).
- Code: `hookStep(prev, ev, seen?: { questionOnScreen: boolean })`, the hold checked first; export
  `screenDecides`.
- Verify: vitest on the file.

## Task 5. Pure: the measured timelines, replayed (core)

Files: `core/renderer/lib/agentHookTimelines.ts` (test data only, the events of cases A, B, C, D, E,
G2, C3 from the report, each `{ t, ev, box }` where `box` is whether the box was on screen),
`core/renderer/lib/agentHookState.timelines.test.ts`.

- The test runs each timeline through `hookStep` (with `seen` where `screenDecides` says so) and a
  ten-line mark keeper that applies `raise` / `clear` for a tab away, then asserts per moment:
  - A, C, E: Q from the question signal; W from the first spinner with the box gone; W at every
    sample until PostToolUse; F at Stop.
  - D: the same twice.
  - B: Q, then nothing; never W.
  - G2: Q from 22267 to the key at 36396 with every sibling `working` and nothing taking it down; W
    after; F at 44731 (spec decision 3: unchanged).
  - C3: W, then F; no Q.
- Verify: vitest on the file. A replay of today's rules (no `working-title`, no `seen`) is NOT kept:
  the e2e is the red check.

## Task 6. Wiring: `useAgentIndicator` (core)

File: `core/renderer/lib/useAgentIndicator.ts`.

- `onTitle`, hooked branch: `if (r.state === 'idle') applyHook(id, { state: 'idle-title' }); else if
  (r.state === 'working') applyHook(id, { state: 'working-title' }); return`.
- `applyHook(id, ev)`: `const prev = hooked.current.get(id)`; when `screenDecides(prev, ev)`, read
  `looksLikeQuestion(readScreenTail(id))` and pass it. When the result is `null`, the event was
  `working-title` and the read said the box is up, arm the re-read (below); otherwise unchanged.
- The re-read: `titleRecheck = useRef(new Map<string, number>())`, one timer per session, 250 ms,
  calling `applyHook(id, { state: 'working-title' })` again only if
  `titleState.current.get(id) === 'working'`. Cleared when a question signal arrives (with
  `stopAnswerCheck`), in the poll's "agent left" branch, and in `forget`. A second held title while
  one is armed does nothing (the armed one is enough).
- Comment the measurement there: the first spinner after Yes came 6 ms before the repaint erasing
  the box (A: 22860 and 22866), so without the re-read Working would wait for the next frame, about
  960 ms.
- Verify: `npm test`, `npm run typecheck`, `npm run lint`; then `npm run e2e -- agentHooks`: green,
  including task 1's lines. Commit: `fix(core): Working after a permission is granted, and a
  Question held while its box shows (#148)`.

## Task 7. Docs

- `docs/regression-rules.md` `#claude-hooks`: "its title only says an Esc" becomes "its title says an
  Esc, and a spinner after a question (or an Esc's stop) is the approved work, since no hook fires
  between the answer and PostToolUse (#148, MEASURED: spinner 34 ms after Yes, PostToolUse 26 s
  later)"; "never ... read for a question" becomes "read only to HOLD a Question its hooks raised,
  while the box is on screen (#148: a sibling agent's signals took it down 1 to 4 s after it went up)".
  `#finished-and-question`: "work again (a hook or title)" stays true; add that another agent's
  signal does not count while the box shows.
- `CLAUDE.md` item 9: add "a spinner after a question is Working (#148)". Keep it one line.
- `docs/superpowers/specs/2026-10-05-agent-hooks-design.md`: one dated line at the end pointing to
  this spec.
- The research report gets a "Fixed in" line with the PR number once it exists (it lives outside
  the repo, so no commit for it).
- Commit: `docs: the permission prompt rules (#148)`.

## Task 8. Gates

In this order, one at a time, from the worktree:

1. `npm run typecheck`, `npm run lint`, `npm test`: all green.
2. `npm run e2e -- agentHooks`, then `npm run e2e -- attention`, then `npm run e2e -- indicator`:
   each green, never two at once. LOOK at `.e2e-shots/attention-*.png` and
   `agent-hooks-failed.png`: no strip change is expected.
3. The red proof: the task 1 commit's run on today's code (recorded in task 1) is the "fails on
   main" evidence for the PR.

## Task 9. PR

- Push the branch, open a PR to `main` titled `fix(core): permission prompts and the agent indicator
  (#148)`, body: the measured timeline (spec section 2's block), what changes, the decisions as
  answered, the red lines from task 1, "core change: reaches Prism with the core bump; Prism passes
  no plugin dir, so nothing changes there until it ships the plugin", "Closes #148", and the
  attribution lines.
- Wait for `check` and `core-version` to exist AND pass (pending is not green). If main moved,
  `gh pr update-branch` and wait again.
- Present the link and a recommendation, then run `gh pr merge --squash --delete-branch`; the merge
  prompt is the owner's approval. If declined, stop with the PR open.
- File the follow-up issue for spec decision 3 (Finished too early while background agents run),
  only if the owner chose "separate issue".

## Task 10. Install (the normal app only)

- From the merged main (or the branch if the owner asks before merging): `npm run package`.
- Stop processes named exactly `PrismTerminal` and `PrismTerminal-Setup*`. NEVER
  `PrismTerminalStable`, never by path or window title.
- Run `dist\PrismTerminal-Setup-x64-0.35.1.exe /S`, poll
  `%LOCALAPPDATA%\Programs\PrismTerminal\PrismTerminal.exe` until its LastWriteTime moves, wait for
  setup to exit, launch it, report the installed version.
- The Stable copy moves only when the owner runs `npm run install:stable` or clicks its own update
  chip.

## Hands-on, for the owner (not machine-testable here)

- In the installed app, a real `gh pr merge` prompt: the blue line at once; Yes, and the working
  mark within about a second, holding while the merge runs; Finished at the end on another tab.
- The same with background agents running ("← N agents"): the blue line stays until you answer.
