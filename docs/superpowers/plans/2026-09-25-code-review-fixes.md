# Code review fixes, 2026-09-25

The owner, on the 39 confirmed findings of `docs/reviews/2026-09-24-code-review.md`: "Create a plan
for tackling them all in stages, do one at a time, but don't come back until all is done, make it 3
PRs, once all are verified go ahead and merge them."

Numbers are the review's. Each PR: tests that fail on the old code where the defect is observable,
the full unit suite, typecheck, lint, the full e2e, a core bump where `core/` changed, then merge
once its checks exist and pass. A core change reaches Prism through the automatic bump, gated by
Prism's terminal gate.

## PR 1: security and safety (#67)

What reaches a shell, what main runs, what is on disk.

- #1 paste injection: `sanitizePaste` strips ESC, C1 CSI and C0 controls but tab, newline, CR.
- #3 system tools by full path (`core/main/sysTools.ts`); main leaves its launch folder.
- #5 dropped/pasted paths quoted per shell (`quotePath`).
- #7 `cdCommand`: curly quotes doubled for PowerShell; cmd refuses `%` and `"`.
- #13 DWM helper: stdin 'error' is heard.
- #14 the install pre-answers the close question at the quit, not at the download.
- #15 `update:install` installs main's own offer only.
- #16 command-line paths resolved against the typing folder, saved absolute.
- #17 a drive root's `C:"` is `C:\` again.
- #18 `tabs.json` / `window.json` written atomically.
- #19 installer handoff: spawn errors heard, temp folder removed after install.

## PR 2: terminal and app behaviour

Sessions, keys, focus.

- #2 warm-shell leak (stale onExit deletes the newer warm shell).
- #12 spawn/kill race (a tab closed while its shell is starting).
- #4 dictation: a second hold while transcribing pastes twice.
- #6 Ctrl+C / Ctrl+V by physical key (`e.code`), not the layout's letter.
- #9, #23 a `cd` no longer remounts the panel and steals focus.
- #10 app chords held while a question or the update window is open.
- #20, #25 cell offsets vs UTF-16 indexes (resize carry, link hit-testing).
- #21 Shift+Enter's continuation only where an agent is running.
- #24 the resume spinner stops when the spawn fails.
- #31 StrictMode double restore (dev).
- #32 the terminal menu closes on a tab change.
- #33 a drag that ends outside the window gives the strip back.

## PR 3: settings, release, CI, harness

- #8, #29 the editor's Save as Custom keeps font, size, acrylic, agent colours, and calls
  `onThemePicked`.
- #22 `ThemeSwitchAsk` registers its listener once.
- #26 `HexSwatch` commits only a changed value.
- #27 hotkey capture refuses plain typing keys.
- #28 the theme editor takes focus and traps Tab.
- #30 dictation's first-download auto-select reads fresh state.
- #11 release tags the commit it built.
- #34 `core-release` runs only from main.
- #38 the auto-merge gate requires `terminal-gate` by name.
- #39 two open PRs cannot claim the same core version.
- #35 a per-scenario timeout in the e2e runner.
- #36 e2e profiles removed after each scenario.
- #37 the agent poll's first verdict is waited for, not slept for.
