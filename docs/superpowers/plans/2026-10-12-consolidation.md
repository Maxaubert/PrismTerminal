# Consolidation: one source of truth per rule (2026-10-12)

Owner, 2026-10-12: "fix all of those things. Make a plan, then go straight ahead". The findings are
the audit `Documents\Claude\research\prism-terminal\2026-10-12-duplication-audit.md` (4 finders, each
checked by a skeptic; 47 of 48 confirmed). This plan carries out its "Suggested order" and its "Worth
doing later" list. "Looked at and left alone" stays alone.

## Shape

- **One branch, one PR** (`refactor/consolidate`), one commit per step below. The steps touch the
  same files (App.tsx, TabStrip, TabSidebar, termLook), and main must be up to date before a merge,
  so separate PRs would conflict with each other while they wait for the owner. One install to try.
- **Behaviour stays the same** except where a step says otherwise (the close question's Tab trap and
  click-outside, the curly-quote handoff fix, Show in File Explorer under e2e).
- **core/ changes ship to Prism**: one core version bump in the PR. Every deleted core export is
  checked against Prism's pinned `core-v*` first.
- **Each step brings the test that holds it** (the audit's guarding-test column). Gate before the PR:
  typecheck, lint, vitest, the full e2e.

## Steps

1. **Dead code.** Root `Settings.tsx`; TabStrip's unreachable `inTitleRow=false` branch and `strip()`;
   TabSidebar's unused ref and comment; TitleBar's unused exports; stale headers (Dialog,
   `data-owns-escape`); orphan comments in `src/shared/types.ts`; CLAUDE.md's `termCwd` line.
2. **`psQuote`** in `core/shared`, used by `termPaste` and `updateHandoff` (curly quotes).
3. **`REVEAL_ZONE`** in `src/shared`, read by edgeWatch, hoverReveal, revealZones.
4. **Outside actions under e2e**: Show in File Explorer through `pathOpeners`; `e2e:*` handlers only
   under `--e2e`.
5. **Legacy settings layouts and dead hex helpers** deleted from core (after the Prism-pin check).
6. **The close question**: `no-drag`, Tab trapped.
7. **`windowAsk()`**: one builder for the working-agents question, both close paths.
8. **`chromeLayout.ts`**: `BAR_H`, `SIDEBAR_SLIDE`, `CARRY_MS`, `DRAG_SLOP`.
9. **`useTabReorder` + `tabParts.tsx`**: one reorder engine and one set of tab parts for the strip and
   the sidebar; every Powerline edge carries `data-rainbow`; the sidebar's tile measured, not 34.
10. **`keymap.ts`**: one chord table; App and `ownsKey` read it; labels from `keyLabel(id)`.
11. **Ground constants** in core: `LIGHT_GROUND` + `groundMode(bg)`, `DEFAULT_GROUND`.
12. **index.css first paint**: every chrome token, tested.
13. **`APP_CH`**: the app's IPC channel table; shared `EdgeNear`, `BadgeImage` types.
14. **Agent kinds**: `RESUMABLE_AGENTS`, `isResumable()`, one agent-name list.
15. **Core `Modal`**: scrim, Escape, Tab trap, focus; every dialog a thin caller.
16. **Later list**: `prefStore` (enum/bool prefs, keys byte-identical), agent-colour table, OKLab and
    canonical-hex in core, cell-to-text helpers in `termCells`, folder names, icons and
    `plusMenuRows`, `ON_DARK_INK`, `towardRoom`, `isWebUrl`, `writeAtomic` in core,
    `SYS.powershell` in dictationStore, the `LOCALAPPDATA` fallback, small core IPC copies, settings
    key test, `MIN_WINDOW`, z-index names.
17. **Big splits**: App.tsx (`termMenuItems`, chrome painting, badge), main `index.ts`
    (`closeFlow.ts`, `updateIpc.ts`), TerminalPanel `createSession` into attach pieces with one IPC
    listener.

Then: version bump (app and core), the full e2e, package and install for the owner, PR.
