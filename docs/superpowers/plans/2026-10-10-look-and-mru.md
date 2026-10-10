# Plan: see-through window, theme order, Most recent tab switching (#156, #157, #158)

Spec: `docs/superpowers/specs/2026-10-10-look-and-mru-design.md`. Worktree
`.claude/worktrees/look-mru`, branch `feat/look-mru` (stacked on #155). TDD: each pure function's
test first. One commit per task group. No em-dashes. No push, no PR, no merge from this plan's
build agents; e2e only in the Gate task, one run at a time.

## Task 0: versions

- `core/package.json` 0.30.0 to 0.31.0; `package.json` 0.36.0 to 0.37.0 (and `package-lock.json`'s
  root version fields).

## Task 1: theme order (#157), core

1. `core/renderer/lib/themeOrder.test.ts` (red): permutation; neutrals before coloured; L
   non-decreasing per group; neutral set = {pitch, high-contrast, volt, prism, campbell, pt-default,
   graphite, monokai, gruvbox-dark, mist, catppuccin-latte, paper}; no ground within 0.001 of
   `NEUTRAL_CHROMA`; stable ties (pitch before high-contrast); `toMatchSnapshot()` of the id order.
2. `core/renderer/lib/themeOrder.ts`: `oklch(hex)`, `NEUTRAL_CHROMA = 0.0125`,
   `orderTermThemes<T extends { bg: string }>(list: readonly T[]): T[]`. Comment the measurement.
3. `core/renderer/settings/theme/ThemeWall.tsx`: drop `lightFirst` and the luminance sort;
   `sortedPresets = orderTermThemes(TERM_PRESETS.filter((p) => p !== defaultPreset))`. Leading
   cards unchanged (Custom, host default, Follow style). Update the component's doc comment.

## Task 2: see-through default, core

1. `core/renderer/lib/seeThrough.test.ts` (red), then `core/renderer/lib/seeThrough.ts`:
   `SEE_THROUGH_ALPHA` (0xb9/255 dark, 0xd1/255 light; comment the Prism levels 70/49 and the
   paintedAlpha formula), `SEE_THROUGH_MAX = 0xf2 / 255`, `seeThroughAlpha(ground)` (luminance of
   the opaque colour > 0.4 is light; `luminance`/`normalizeColor` from `termAnsi.ts`, `opaque`
   from `colour.ts`).
2. `core/renderer/lib/termLook.ts`:
   - `termAcrylicInForce()`: `termAcrylic()` and not (`hostOwnsWindowAcrylic()` and
     `liveThemeId(termThemeId()) === 'high-contrast'`); `useTermAcrylicInForce()`.
   - `termGroundAlpha()`: window host, `termAcrylicInForce()`, raw alpha 1 (>= 255/255 by byte):
     `seeThroughAlpha(groundInForce())`; else as today. `groundInForce()` = `hostGround()` ??
     custom `bg` ?? `resolveTermTheme(termThemeId()).background` (call-time import of
     `./termTheme`; comment why the cycle is safe).
   - Export a pure `paintsAlpha(rawAlpha, ground, acrylicOn)` used by both `termGroundAlpha` and
     `useTermSetup`'s baseline, so the dirty check and the window share one rule.
3. Tests in `core/renderer/host.test.ts` (or a new `termLook.seeThrough.test.ts`): the cases in the
   spec's Tests list, with a window host and with a style host.
4. `core/renderer/settings/theme/useTermSetup.ts`: `ownByte` through `paintsAlpha` with the saved
   setup's own `acrylic` and ground.
5. `core/renderer/settings/theme/ThemeWall.tsx:448`: editor `bgAlpha` =
   `{ alphaMin: 0.3, alphaMax: SEE_THROUGH_MAX, alphaDisabled: !acrylicInForce || noAcrylic }`.

## Task 3: the row, core

1. `core/renderer/settings/sections/opts.ts`: `acrylicLabel()` ("See-through window" where the
   terminal owns the window acrylic, else `opt('term-acrylic').label`); `acrylicSub()` gives
   "The desktop shows behind every surface." there, and "High contrast stays solid." when High
   Contrast blocks it. Test both host kinds (new `opts.test.ts` or the existing options test).
2. `TerminalThemeSection.tsx`: the switch row BEFORE `{afterTheme}`; label `acrylicLabel()`;
   `off`/`disabled` also when High Contrast blocks it; Switch `on={acrylicInForce && !noAcrylic}`.
   Keep `id="term-acrylic"`.
3. `TerminalAppearance.tsx` (legacy) label through `acrylicLabel()`; `coreIndex.ts` label through
   `acrylicLabel()`.
4. `options.ts` entry unchanged (Prism's gate reads it as text). Keywords may gain nothing: "see
   through" is already there.

## Task 4: PT's window, src

1. `src/renderer/src/App.tsx` `paintChrome`: `const acrylic = termAcrylicInForce()` (material and
   alpha both).
2. `src/renderer/src/components/settings/AppearancePage.tsx`: `themeColours()` shows
   `termGroundAlpha()` while the switch is in force and nothing is picked; Background `range`
   `{ alphaMin: 0.3, alphaMax: SEE_THROUGH_MAX, alphaDisabled: !acrylic }`; `acrylic` from
   `useTermAcrylicInForce()`.
3. `settingsIndex.ts` `ROW_ORDER`: `'term-theme', 'term-acrylic', 'window-background',
   'window-accent'`.
4. `src/renderer/src/lib/chromeTheme.test.ts`: each preset at `seeThroughAlpha(its bg)`, text fills
   flattened and 4.5:1.
5. Run `npm test`, `npm run typecheck`, `npm run lint`; update snapshots only where the change is
   the intended one (say which in the commit).

## Task 5: Most recent (#158), src

1. `src/renderer/src/lib/tabSwitchPrefs.ts` (+ test): key `prism.window.tabSwitch`,
   `'order' | 'recent'`, default `'order'`, `useTabSwitch`, `onTabSwitchChange`.
2. `src/renderer/src/lib/tabMru.test.ts` (red), then `tabMru.ts`: `touchMru(mru, id)`,
   `syncMru(mru, tabIds, activeId)` (drop closed, add unknown ids after the known ones in strip
   order, active to the front when the list was empty), `startWalk(mru)`, `stepWalk(walk, dir)`,
   `walkTarget(walk)`. Cases from the spec.
3. `App.tsx`:
   - refs `mru` (seeded from the boot state: active, then strip order) and `walk`.
   - effect on `[state.tabs, activeId]`: `mru = syncMru(...)`; when no walk, `touchMru(activeId)`.
   - Ctrl+Tab branch: In order unchanged. Most recent: `hit()`; start a walk if none (from the
     synced list), step by `shiftKey ? -1 : 1`, `setState(pickTab(s, walkTarget))`; a list under 2
     does nothing.
   - Any other Ctrl chord handled in `onKey` first commits a running walk.
   - `keyup` (capture) on window: `e.key === 'Control'` commits; `blur` on window commits. Commit =
     `walk = null; mru = touchMru(mru, activeId)`. Remove both listeners in the cleanup.
4. `appOptions.ts`: `{ id: 'tab-switch', label: 'Tab switching', sub: 'Where Ctrl+Tab goes next.',
   section: 'window', page: 'appearance', icon: 'key', keywords: 'ctrl tab mru recent order cycle
   switch next previous last used', store: ['prism.window.tabSwitch'] }`, after `tab-style`.
5. `AppearancePage.tsx` Window section: a `SettingRow id="tab-switch"` with
   `Segmented` options `[{ id: 'order', name: 'In order' }, { id: 'recent', name: 'Most recent' }]`
   after Tab style; live sub per value (spec).
6. `settingsIndex.ts` `ROW_ORDER`: `'tab-width', 'tab-style', 'tab-switch', 'title-bar', ...`.
7. Unit: `appOptions.test.ts`, `settingsCopy.test.ts` (eight plain words), the ROW_ORDER test.

## Task 6: e2e scenarios (written, NOT run here)

In `tools/e2e/run.mjs`:
- `PREF_PAGE` (line ~170): `'tab-switch': 'appearance'`.
- New `seeThrough` and `tabSwitch` scenarios (spec). End idle; close through `closeApp`.
- `themeCards`: wall DOM order equals `[pt-default, ...orderTermThemes(rest)]`. The order is
  computed in the scenario from the same bg values read off the cards, or hardcoded from the
  unit snapshot (prefer reading `data-term-card` ids and comparing to a list exported for the test).
- `settingsLook` `want` (line ~3572): `['tab-width', 'tab-style', 'tab-switch', 'title-bar',
  'window-edges', 'term-theme', 'term-acrylic', 'window-background', 'window-accent']`.
- Check `options`, `opacityAlpha`, `accent`, `pickedGround` for assumptions the default see-through
  breaks (an acrylic-on window asserted opaque); fix the assertion to the new rule, never the rule.

## Task 7: docs

- `README.md` features and keys rows; `docs/two-apps.md` (theme order, see-through default,
  Appearance order); `core/README.md` (acrylic contract, `orderTermThemes`);
  `docs/regression-rules.md` new entry "Most recent commits on Ctrl release" with its tests.

## Task 8: Gate (one agent, alone)

1. `npm test`, `npm run typecheck`, `npm run lint` green.
2. `npm run e2e -- <name>` one at a time for: seeThrough, tabSwitch, themeCards, themeSwitch,
   settingsLook, settingsSearch, settingsKeys, options, opacityAlpha, accent, pickedGround,
   colourPicker, theme, reviewKeys, tabWidth, tabStyle. Then the full `npm run e2e` once.
3. LOOK at `.e2e-shots/settings-appearance-*.png`, `see-through.png`, `theme-wall.png`.
4. Commit fixes with the PR-ready message trailer.
