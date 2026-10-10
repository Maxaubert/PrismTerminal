# Plan: indicator styles and the Prompt tab style (#143)

Spec: `docs/superpowers/specs/2026-10-10-indicator-styles-design.md`. Branch
`feat/143-indicator-styles`, worktree `.claude/worktrees/indicator-styles`. Versions bumped in the
first commit: core 0.27.0 to **0.28.0**, app 0.34.0 to **0.35.0** (both minor: features).

Rules for every task: TDD for the pure parts (the failing test first, run it red, then the code);
no em-dashes; comments say WHY; `core/` stays lint-walled (relative imports, no `window.prism`);
`npm test`, `npm run typecheck`, `npm run lint` green at the end of each task. E2E: `npm run e2e --
<name>`, parked, ONE PT e2e process at a time. Never close `PrismTerminalStable`.

## Task 1. Pure: the rainbow and the colour floor (core)

Files: `core/renderer/lib/markColours.ts`, `core/renderer/lib/markColours.test.ts`.

- Tests first:
  - `ICON_RAINBOW` is the seven mockup colours, in order.
  - `floorMark(c, grounds, 3)` leaves a colour that already clears 3:1 on every ground untouched
    (Volt: all seven, lowest 3.89).
  - On Paper's grounds (`#f6f4ee`, its 4% and 11% segments) every result clears 3:1 on all three,
    and keeps its hue (hue within 2 degrees); the mockup's table holds (lowest 3.01).
  - On a dark mid-grey ground (Cinder `#383c44`) a short colour is LIGHTENED, not darkened.
  - A colour that can never reach the floor comes back as the nearest it got, never throws.
  - `rainbowGradient(cols, 'x')` loops (first colour repeated at the end); `'y'` is 180deg.
  - `opaqueOver('#d8ff2680', '#050706')` is the composite, 6 digits.
- Code: reuse `contrastRatio` / `luminance` (`termAnsi.ts`) and `parseColour` (`colour.ts`).
- Verify: `npx vitest run core/renderer/lib/markColours.test.ts`.

## Task 2. Pure: the name flip rule (core)

Files: `core/renderer/lib/nameInk.ts`, `nameInk.test.ts`.

- Tests first, the owner's cases from the issue comment and the r4 mockup:
  - Volt (text `#eef2e6`, dark): working `#d8ff26` flips to `#0b0b0b`; question `#3b82f6`,
    failed `#ff3b5c` and the badge `#383c44` keep the text.
  - Volt with a pale question `#cfe4ff` flips; light theme (text `#1d1f1a`) on working `#2a2c30`
    flips to `#ffffff`, on question `#2563eb` keeps the text.
  - Exactly 2:1 keeps the text (the rule is "under 2:1").
  - Dark or light comes from the GROUND passed in, never from the text.
- Verify: vitest on the file.

## Task 3. Pure: which mark a tab wears (core)

Files: `core/renderer/lib/tabMark.ts`, `tabMark.test.ts`.

- Tests first: one row per cell of the spec's section 3 table (indicator x state x active x
  tabStyle), plus rainbow off (`done` is `line`/`edge` in `done`, Full's done fill in `done`, no
  badge), Off (no working mark, attention marks as Minimal), Ring on the active tab, Full's active
  tab is Minimal's mark, and `state: null` is `none` everywhere.
- Code: `resolveTabMark({ indicator, tabStyle: 'flat' | 'prompt', state, active, rainbow })` returns
  `{ place, colour, motion }`. `tabStyle` is the core's word (`flat`); this app maps `classic` to it.
- Verify: vitest on the file.

## Task 4. The stores: indicator reader and the rainbow switch (core)

Files: `core/renderer/host.ts` (+ `host.test.ts`), `core/renderer/lib/termLook.ts`
(+ `termLook.test.ts`), `core/README.md` (the new field in the contract).

- Tests first:
  - `readIndicator('full', ALL, 'minimal')` is `'full'` (a stored Full reads as the NEW Full here:
    the migration is the meaning, no rewrite); `readIndicator('ring', OLD, 'minimal')` is
    `'minimal'`; `null`, `''` and `'loud'` read as the fallback.
  - With no `tabMarks` on the host, `agentIndicator()` never answers `'ring'` even when stored.
  - `applyCustomExtras({ indicator: 'ring' })` on a host without Ring writes nothing for it.
  - `agentRainbow()` is on by default, off only for `'0'`; `resetTermExtras` leaves it alone.
- Code: `AgentIndicator` gains `'ring'`; `TermHostConfig.tabMarks?` (optional, documented as an
  owner-approved declared difference); `hostIndicators()` helper; `agentRainbow` /
  `setAgentRainbow` / `useAgentRainbow`.
- Verify: vitest on both files; `npm run typecheck`.

## Task 5. The motion, once (core)

Files: `core/renderer/styles/marks.css` (new), `src/renderer/src/index.css` (`@import` it; the old
`p-agent-run` block moves into it under the same class name, so the `indicator` and `attention`
e2e selectors keep working), `core/README.md` (a host imports the file).

- Keyframes and classes: `p-agent-run`, `p-mark-grow` (1.6 s, the four legs), `p-mark-breathe`
  (2 s, cosine-sampled), `p-mark-flow-x` / `p-mark-flow-y` (8 s / 7 s, tile from a CSS variable),
  `p-mark-ride` (1.4 s), and the reduced-motion block (spec section 5).
- Test: `core/renderer/styles/marks.test.ts` reads the file as text and asserts every class the
  resolver can name has a rule and a reduced-motion override (a missing keyframe is otherwise a
  still mark nobody notices).
- Verify: vitest; `npm run build` (Vite resolves the import).

## Task 6. The flat-tab marks component (core)

Files: `core/renderer/components/TabMark.tsx`, `TabMark.test.tsx` (render with
`react-dom/server`, as other core component tests do).

- Draws `run`, `line`, `ring`, `fill` (+ the badge and its rainbow foot, + the ride) from a
  resolved mark and its colours; every element `aria-hidden`, `pointer-events-none`; attributes
  `data-mark`, `data-mark-motion`, `data-attention` (kept: the e2e reads it), `data-rainbow`.
- Tests: each place renders its element and data attributes; a `fill` carries the name ink as a
  CSS variable, not per frame.
- Verify: vitest; lint (the core wall).

## Task 7. Settings rows (core)

Files: `core/renderer/settings/markOptions.ts` (new, `MARK_OPTIONS`, one flat entry:
`agent-rainbow`), `options.ts` (keywords of `agent-indicator` only), `sections/AgentMarksSection.tsx`,
`layout/icons.ts` (`rainbow`, `prompt`), `options.test.ts` (the list and the section held together;
`settingsCopy` checks on the new sub and label).

- The indicator's Segmented shows `hostIndicators()`; INDICATOR_SUB gains `ring` and the new
  `full` sub where the host draws the new marks (the old sub stays for a host without `tabMarks`).
- The rainbow row renders only where `tabMarks?.rainbow`, after `agent-done-on`.
- Verify: vitest (`options.test.ts`, the settings copy tests); typecheck.

## Task 8. The tab style setting (app)

Files: `src/renderer/src/lib/tabStylePrefs.ts` (+ test), `components/settings/appOptions.ts`,
`components/settings/AppearancePage.tsx`, `components/settings/settingsIndex.ts`, its test.

- Tests first: default `classic`; `prompt` stored reads `prompt`; anything else reads `classic`;
  `appOptions` order puts `tab-style` right after `tab-width`; the index finds it by "chevron".
- Verify: vitest; typecheck.

## Task 9. Chrome tokens for the segments (app)

Files: `src/renderer/src/lib/chromeTheme.ts` (+ its tests and snapshot), `index.css` `:root`
fallbacks.

- `--p-seg` / `--p-seg-on`: `--p-text` mixed into the SOLID strip ground at 4% / 11%.
- Recompute the `:root` fallbacks from `chromeTokens` for `prism` (CLAUDE.md rule); the snapshot
  test changes only by the two new tokens.
- Verify: vitest (`chromeTheme*.test.ts`).

## Task 10. The Classic strip (app)

Files: `src/renderer/src/components/TabStrip.tsx`, `termHost.ts`.

- Remove the tab `border-r`, `loud`, `onTint` and the brain slot. Each tab: `resolveTabMark`, then
  the core's `TabMark`; Ring's spinner sits where the resume ring sits; a Full fill paints the tab
  and sets `--mark-ink` for the label and the X.
- Colours: `useAgentColors()`; the rainbow from `rainbowOn([--p-tabs, --p-seg, --p-seg-on])`,
  recomputed on a chrome change; the flip ink from `nameInk` against the solid ground.
- `termHost.ts`: `tabMarks: { indicators: ['off', 'minimal', 'ring', 'full'], rainbow: true }`.
- Verify: typecheck, lint, vitest; `npm run e2e -- indicator`, `-- attention` (updated in task 13).

## Task 11. Pure: Prompt geometry (app)

Files: `src/renderer/src/lib/promptGeometry.ts` (+ test).

- Tests first: for given segment boxes, the edge band's left, width and `--o` (ARROW 12, GAP 2.5,
  TUCK 1; the last segment without the next TUCK); the rule's clip polygon (slant run
  `ARROW * 2 / (height / 2)`, SEAM 0.5, no notch cut on the first segment). Values checked against
  the mockup's `placeEdges()`.
- Also `lib/tabDrop`: a test that drop slots stay right with segments overlapping by 9.5 px.

## Task 12. The Prompt strip (app)

Files: `src/renderer/src/components/PromptEdges.tsx` (new), `TabStrip.tsx`.

- Segments: clip-path arrow and notch, `--p-seg` / `--p-seg-on`, overlap, padding (spec 4); fixed
  and dynamic widths; works in the title row (`inTitleRow`).
- `PromptEdges`: one band per marked segment and the active rule, placed from a ResizeObserver,
  moved never rebuilt, riding the carried tab's `translateX`; the band's inner element carries the
  motion class; working on the tab in front wears `--p-accent-hi`.
- Data attributes: `data-tab-style` on the strip, `data-prompt-edge` (state) and `data-prompt-rule`.
- Verify: typecheck, lint; `npm run e2e -- tabStyle` (task 13).

## Task 13. E2E (app), one scenario at a time

File: `tools/e2e/run.mjs`.

- `indicator`: Minimal out of the box, its run the accent (kept); Full now fills a BACKGROUND
  working tab (`data-mark="fill"`) and never the active one; no `[data-activity]` brain anywhere.
- `attention`: the question line breathes (`animation-name` is `p-mark-breathe`), the finished line
  flows the rainbow (`data-rainbow`), with Rainbow finished off it is the finished colour; lines
  only on tabs not looked at (kept).
- NEW `tabStyle`: the row is right after Tab width; Prompt stored; segments clipped, overlapping by
  9.5 px; a working background tab's edge band sits flush in the gap (its box between the two
  segments' boxes) and grows; the active tab's rule present; no tab has a right border in either
  style; widths fixed and dynamic; screenshots `.e2e-shots/tabs-classic.png`,
  `tabs-prompt.png`, `tabs-prompt-light.png` (Paper).
- NEW `indicatorStyles`: Ring shows a spinner beside a working tab's name and Minimal's line after;
  Full's name ink by the flip rule, measured on Volt (working flips) and Paper; with
  `emulateMedia({ reducedMotion: 'reduce' })` no mark has a running animation; screenshots per
  style.
- `colourPicker`: the half-alpha working colour's Full tab is a background tab now, opaque, its name
  by the flip rule (2:1).
- `edges`: no tab separator to measure any more; it asserts none exists and measures the rest.
- `options`, `settingsSearch`: the new rows (the lists drive both).
- LOOK at every new screenshot against the mockups' `overview.png` before calling it done.
- Verify: `npm run e2e` whole, once, at the end.

## Task 14. Prism stays green (read only)

- In a worktree of the Prism repo (`<Prism>/.claude/worktrees/core-check`, removed after), point
  `prism-term-core` at this branch's `core/` and run Prism's `npm test -- appOptions`, typecheck and
  `npm run e2e -- "terminal options"`. Nothing is committed in Prism.
- Expected: green, the Agents page unchanged (no Ring, no rainbow row), Full still Prism's fill.

## Task 15. Docs

- `docs/regression-rules.md`: rewrite "FINISHED AND QUESTION ARE LINES" and "The indicator is
  MINIMAL by default" for the four choices, the rainbow, the breathe and the two tab styles; a new
  entry "Prompt tabs: the edge is the mark" with the geometry's measurements.
- `docs/two-apps.md`: the marks in the core, `tabMarks`, `MARK_OPTIONS` and why it is not in
  `TERMINAL_OPTIONS`.
- `core/README.md`: `tabMarks`, `styles/marks.css`.
- `README.md`: the indicator row of the feature table, Prompt tabs.
- CLAUDE.md: one line under the core list if needed, nothing more (lean).

## Task 16. Ship

- Full `npm test`, typecheck, lint, `npm run e2e`; `npm run package`; install the branch build per
  CLAUDE.md (kill `PrismTerminal` and `PrismTerminal-Setup*` ONLY, never `PrismTerminalStable`),
  report the installed version.
- PR `feat(core): indicator styles, the rainbow finish and Prompt tabs (#143)`: says it is a core
  change (Prism unchanged until it adopts `tabMarks`), names the new `TermHostConfig` field and the
  Off / Classic naming for the owner's word, attaches the screenshots. Ask "merge?" once.
