# Plan: one colour picker with alpha, both apps

This plan implements `../specs/2026-10-03-colour-picker-alpha-design.md`. Both documents are approved together, once.

## Order

0. **Prism #246 unstuck**: fix the red `sort` on the open core-v0.20.0 bump, then it merges. Nothing below starts until Prism main pins core-v0.20.0.
1. **Prism PR A**: adds the `termColourPicker` gate scenario (skips itself until the pin carries the picker), relaxes `termOptions`, and computes the Full tab's ink on the composite.
2. **PT PR 1 (core)**: the picker and alpha in the terminal settings.
3. **Automatic step**: `core-release` opens the Prism bump PR. `terminal-gate` must be green, after which it auto-merges.
4. **PT PR 2 (app + core)**: the PT rows, the background alpha replacing Opacity, and the migration. It also touches `core/`, which means a second automatic Prism bump.
5. **Prism PR B**: #251 reworked onto the core picker, then the Style page.

Every PR follows the same rules:

- Issue, then branch `type/<issue>-slug`, worked in `<repo>\.claude\worktrees\<name>`.
- Commits are `type(scope): subject` with the trailer.
- Before asking "merge?" once: the full unit suite, typecheck, lint and the e2e named in the PR.
- Merge only on the owner's word for that PR. The one exception is the bot bump PRs, which `PRISM_AUTO_MERGE` covers.
- No em-dashes anywhere.

Version bumps (each PR takes the next number above main at branch time; these assume nothing else lands):

- Core: PR 1 is a minor, `0.20.0` to `0.21.0`. PR 2 is also a minor, `0.22.0`: it removes a user-visible setting and renames an export.
- PT app: PR 1 is a minor, `0.25.x` to `0.26.0`, because PT's own settings page changes (the core page it shows). PR 2 is a minor, `0.27.0`.
- Prism: PR A a patch; PR B the next minor above main (replacing #251's 0.80.0 if main has moved). The two bump PRs are versioned by `core-release`.

---

## Step 0: Prism #246 (`core-v0.20.0`, Prism 0.79.0)

- Reproduce `sort` locally on #246's branch (`npm run e2e -- sort`); it timed out at `fileRows.first().waitFor` in run 36830652255.
- If it is a real regression from core 0.20.0: by the ratchet rule, it becomes a failing scenario in the suite that guards Prism FIRST, then the fix (in the core when the cause is there, with its own core bump). If it is a flake of the runner: fix the wait, not the timeout.
- Merge #246 on the owner's word (its auto-merge already covers it once green).

---

## Prism PR A: `test(e2e): gate the core colour picker` (Prism repo)

**A1. Add `termColourPicker` to `tools/e2e/run.mjs`.**

- If `node_modules/prism-term-core/renderer/settings/ColourPicker.tsx` does not exist (`existsSync`), log `skipped (core has no ColourPicker)` and pass. No version number is hard-coded.
- Otherwise, using only the DOM contract in the spec:
  1. Open Settings > Terminal.
  2. Read `prism.term.agentColor` (empty: following the theme).
  3. Open the picker on `[data-pref="agent-color"] [data-colour-swatch]`; close it with Escape at once. Assert storage is unchanged and no Reset shows.
  4. Open it again. Press Shift+Left on `[data-colour-popover] [role="slider"][aria-label="Alpha"]` until `aria-valuenow` is 50.
  5. Assert `prism.term.agentColor` matches `/^#[0-9a-f]{8}$/`, and the indicator's computed colour has alpha.
  6. Set the indicator to Full on a working stand-in tab; assert the tab text is at least 4.5:1 against the tint composited over the strip's ground.
  7. Press Escape. Assert `prism.term.agentColor` is back to what step 2 read (unset).
  8. Open the theme editor on `pitch` and assert the Background well's popover has no `Alpha` slider.
  9. Open `red` and assert it has one.
  10. Assert no control in the popover is accent-filled.

**A2. Relax `termOptions`** (L896-898): replace `rows.length === wanted.length + 1` with "every non-`onlyWhere` row is on the page in order, and every `onlyWhere` row is absent". Today the one `onlyWhere` row is `term-opacity`, and PT PR 2 removes it; without this the second bump can never auto-merge.

**A3. The Full tab's ink on the composite.** `TabStrip.tsx` L106 (`onTint`) composites the tint over the strip's opaque ground with Prism's own `mix` before `contrastRatio`. It is a no-op for an opaque tint. PR B swaps it for the core's `inkOn`.

**A4.** Add `=termColourPicker` to `e2e:terminal` in `package.json`, and bump Prism's version by a patch.

**Verify:**

```
npm test
npm run typecheck
npm run lint
npm run e2e:terminal
```

On the current pin it must be green, with `termColourPicker` skipped and `termOptions` passing.

**Merge before PT PR 1 merges.** Otherwise the first bump is not gated on the picker.

---

## PT PR 1: `feat(core): one colour picker with alpha for every colour (#<issue>)`

Write the tests first in each task, watch them fail, then implement.

**1.1 Colour maths: `core/renderer/lib/colour.ts` + `colour.test.ts`**

- Tests: see the spec's Testing section. Round trips run on `Rgba` and numeric `Hsla`, not on `format()` strings.
- Implement:
  - `Rgba`, `parseColour`, `toStored`, `format`
  - `rgbToHsv` / `hsvToRgb`, `rgbToHsl` / `hslToRgb`
  - `opaque`, `alphaOf`, `withAlpha`, `alphaHex` (0..1, `round(a * 255)`, no clamp)
  - `composite`, `legibleOn` (floor `min(floor, contrast of the opaque pick)`), `legibleOnStrict`, `inkOn`, `selectionFor` (moved from #251, with its tests)
  - `colourCommit`, comparing `toStored` of both sides
- `legibleOn` reuses `ensureContrast` and `contrastRatio` from `termAnsi.ts`.

**1.2 Format pref: `core/renderer/lib/colourFormat.ts` + test**

- Key `prism.term.colourFormat`. Junk or missing reads as `hex`. Every access is wrapped in try/catch.
- Export `useColourFormat()` and `cycleColourFormat()`.

**1.3 Picker UI: `core/renderer/settings/ColourPicker.tsx`**

- Exports `ColourField`, `ColourPopover`, `SvSquare`, `HueBar`, `AlphaBar`. Props as in the spec (`onRevert`, `alphaMin`, `alphaMax`, `snapAlpha`, `alphaDisabled`).
- The DOM contract exactly as the spec fixes it (field, swatch, popover, slider labels `Saturation and brightness` / `Hue` / `Alpha`, `data-colour-format`, `data-colour-eyedropper`). The popover's `aria-label` is `label` as it is.
- Live `onChange` is throttled with rAF. The popover tracks whether it wrote.
- Escape: nothing written, just close; otherwise `onRevert`, or `onChange(opened)` when no `onRevert` is given.
- It closes on outside press, on focus leaving it for anything but its swatch, and on anchor unmount. Its z-index is below the update window, Command help and the close question.
- Its root stops propagation of the keys it handles, so React ancestors do not see them through the portal.
- Focus returns to the swatch. Tab is trapped (plain Tab only).
- EyeDropper: rendered when `'EyeDropper' in window`, no probe. A rejected press other than `AbortError` hides it for the session. Press it once by hand in the installed build and record the result in the PR body.
- Neutral controls only (`ROW_BUTTON`). Focus rings use `--p-accent-hi`.
- Extend `neutralControls.test.ts` to read `ColourPicker.tsx`.
- `core/package.json`: add `react-dom` to `peerDependencies`.

**1.4 `fields.tsx`**

- `HexSwatch` becomes `<ColourField alpha={false} …/>`, so PT's app rows are unchanged until PR 2.
- Keep `parseHexInput` and `hexCommit` exported.
- Extend `fields.test.ts` with a case showing that `HexSwatch` drops a typed alpha.

**1.5 Storage: `core/renderer/lib/termLook.ts` + `termLook.test.ts`**

- Tests: agent colours accept hex8; `customTermTheme` validates `bg`, `fg`, `cursor`, `selection` and each `ansi` value; `applyCustomExtras` writes only valid colours.
- `HEX` becomes `/^#[0-9a-f]{6}([0-9a-f]{2})?$/i`.
- Add `CustomTermTheme.selection?`.
- Validate with `parseColour` and store `toStored`.
- Add `termGroundAlpha()`: the alpha of the host's `terminalGround`, else of the Custom bg, 1 for a preset.

**1.6 Theme resolution: `termTheme.ts`, `termAnsi.ts`, `termGround.ts`**

- First, take a snapshot test of `resolveTermTheme` for every preset plus an opaque Custom with a failing cursor, then implement.
- `resolveTermTheme(id, ground?)` composites Custom colours once against the ground in force:
  - `fg`: `legibleOn(…, 4.5)`; `cursor`: `legibleOn(…, 3)`; the sixteen: `legiblePalette` on the composites.
  - `selectionBackground` is `c.selection ?? opaque(cursor) + '55'`.
- `legiblePalette` normalises inputs first.
- `onGround` no longer composites. It keeps a theme-supplied selection and derives `<cursor>55` only when the selection was the derived one.
- `currentTermTheme()` passes the ground in force; a test asserts every value it returns is 6 or 8 digit hex.
- Extend `termTheme.legible.test.ts` with the alpha sweep from 0.1 to 0.9.

**1.7 Theme editor: `TerminalAppearance.tsx`**

- `paletteOf('custom')` returns `customTermTheme()` raw (alphas, selection). Presets and `'style'` keep normalising.
- `well()` uses `ColourField`.
- Add a Selection well with `alphaMax={254 / 255}`. It shows the derived selection until the user sets one.
- The Background well gets `alpha={false}` in PR 1. PR 2 turns it on for `acrylic.kind === 'window'`.
- The agent colour rows (`agent-color`, `agent-done-color`, `agent-question-color`) use `ColourField` with alpha, and pass `onRevert` that restores the prior stored value (`''` included).
- The editor's capture Escape listener and `trapTab` ignore events from inside `[data-colour-popover]`.
- `TermThemeCard` ring becomes `var(--p-accent-solid, var(--p-accent))`.

**1.8 Accent lines in core components**

- `UpdateDialog.tsx` L263 (the progress bar) reads `var(--p-accent-solid, var(--p-accent))`.
- Grep `core/` for `--p-accent)` and classify each use as a line or a fill. Lines get the fallback form; fills stay as they are.

**1.9 PT's own use of the new helpers**

- `TabStrip.tsx` L153: `onTint` becomes the core's `inkOn(tint, ground)`.
- `agentColors.ts` L33: the theme-derived working colour reads `--p-accent-solid` (falling back to `--p-accent` until PR 2 publishes it).

**1.10 PT e2e: `tools/e2e/run.mjs`**

- New `colourPicker` scenario, as described in the spec (no-change open, Escape to unset, Full ink, popover gone under F1 and the update preview, Custom alphas surviving Save changes).
- `reviewSettings`:
  - The selector `input[aria-label="Background hex value"]` becomes `input[aria-label="Background"]`.
  - Add tab-through on a closed picker.
  - Add Escape on the popover inside the editor.
- Rerun and check: `themeSwitch`, `pickedGround`, `accent`, `options`, `attention`.
- Look at `.e2e-shots/colour-picker-*.png` and `settings-*.png`.

**1.11 Docs, versions and wiring**

- `core/package.json` to 0.21.0; `package.json` to 0.26.0.
- `core/README.md`: a line on `ColourField`, its DOM contract and the `react-dom` peer.
- `CLAUDE.md`: a short rule, "ONE COLOUR PICKER, ALPHA ON EVERY COLOUR", pointing at the spec.
- Move the spec and plan into `docs/superpowers/specs/` and `docs/superpowers/plans/`.
- The PR body says that this changes Prism's Terminal page (the picker replaces the native one there, and the agent colours gain alpha).

**Verify:**

```
npm test
npm run typecheck
npm run lint
npm run e2e -- colourPicker
npm run e2e -- reviewSettings
npm run e2e -- themeSwitch
npm run e2e -- pickedGround
npm run e2e -- accent
npm run e2e -- options
npm run e2e
```

Then install the branch build following "Installing is the last verification step", and ask "merge?".

After the merge, watch the `core-release` run and the Prism bump PR's `terminal-gate`, including `termColourPicker`, which now runs for real.

---

## PT PR 2: `feat(settings): background alpha replaces Opacity, alpha on Background and Accent (#<issue>)`

**2.1 Colour prefs: `src/renderer/src/lib/colourPref.ts`**

- `HEX` accepts 8 digits. Values are stored with `toStored`.
- Extend `accentPrefs.test.ts` and `backgroundPrefs.test.ts`.

**2.2 Chrome tokens: `src/renderer/src/lib/chromeTheme.ts` + test**

- Tests first:
  - A hex8 chosen accent publishes `--p-accent` as hex8 (never `rgba()`, the file's own rule).
  - `--p-accent-solid` (new, in `CHROME_COLOUR_TOKENS`) stays opaque.
  - `--p-sel-bg` carries the alpha over an opaque ground, and is flattened over `--p-bg-solid` when the ground alpha is below 1.
  - `--p-on-accent` is at least 4.5:1 on the composite over both `--p-bg` and `--p-side-flat`.
  - The ground alpha is taken as a fraction of its byte; for every old N, `round(N / 100 * 255)` gives tokens identical to today's `opacityPct = N`.
  - `--p-bg-solid` is always 7 characters.
- Use the core's `alphaHex`, `composite` and `selectionFor`; PT's own 0-100 `alphaHex` goes.
- Add a `:root` fallback for `--p-accent-solid` in `index.css`.

**2.3 Paint: `App.tsx` `paintChrome`**

- `chromeTokens` gets `acrylic ? groundAlpha : 1`, the byte's fraction passed through unrounded.
- `groundAlpha` is the alpha of `windowBackground()`, else `termGroundAlpha()`, in that order.
- Grep `src/renderer` for line uses of `--p-accent` (spinner border `TabStrip.tsx` L500, rings) and swap them to `--p-accent-solid`. The active tab rule already reads `--p-accent-hi` and is left alone.

**2.4 Migration: `src/renderer/src/lib/opacityMigration.ts` + test**

- It runs in `main.tsx` before the first render.
- It follows the spec's rule exactly: the saved `Custom.opacity` folds into `Custom.bg` only when `Custom.acrylic !== false` and never takes the live value; the live value goes on the picked Background first, then the Custom already folded, then a new picked Background.
- New core function `legacyTermOpacity()` (read only).

**2.5 Core: remove Opacity**

- `TerminalAppearance.tsx`: remove the `term-opacity` row.
- `options.ts`: remove its entry.
- `termLook.ts`:
  - Remove `setTermOpacity` and `termExtraDefaults().opacity`.
  - Rename `termOpacity` to `legacyTermOpacity`.
- `extras` and `baseline` carry `groundAlpha` (`termGroundAlpha()` against the theme's own bg alpha), so a see-through Background lights Save changes and a theme pick asks first (#60).
- Theme Background well: `alpha={termHost().acrylic.kind === 'window'}`, `alphaMin={0.3}`, `alphaDisabled` while acrylic is off.
- Save as Custom carries the in-force ground alpha onto `Custom.bg`. Test it in `termLook.test.ts`.
- Update `options.test.ts`, `host.test.ts` and `termLook.test.ts`.
- Bump `core/package.json` by a minor (0.22.0).

**2.6 Rows: `Settings.tsx` `WindowColour`**

- Use `ColourField`, with `onRevert` restoring the prior stored value (`null` included).
- Background: `fromTheme` is the theme's solid ground plus `termGroundAlpha()`'s byte, so the row shows the alpha the window paints. `alphaMin={0.3}`, `alphaDisabled` while acrylic is off. Hint: "Follows the theme." / "Uses your own colour.", plus "Shows the desktop through it when acrylic is on." if `copyProblem` passes.
- Accent gets `alphaMin={0.1}`.

**2.7 e2e**

- New `opacityAlpha` scenario, as described in the spec, with seeded profiles.
- `accent`:
  - A hex8 accent keeps the active tab rule solid.
  - The Save fill is see-through over an opaque ground and its label is at least 4.5:1; under a see-through ground it is opaque.
  - The neutral controls are unchanged.
- `options`: the closed list is unchanged, and `term-opacity` is gone.
- `theme`, `pickedGround`, `themeSwitch`: rerun.

**2.8 Versions:** `package.json` to 0.27.0.

**Verify:**

```
npm test
npm run typecheck
npm run lint
npm run e2e
```

Then install the branch build. Hands-on check: an acrylic window with a 60% background looks like the old Opacity 60. Ask "merge?". After the merge, watch the second Prism bump and its gate (`termOptions` passes only because PR A relaxed it).

---

## Prism PR B: rework #251 (`feat/249-accent-opacity`)

The pin must carry `ColourPicker.tsx` (core 0.21.0 or later).

**B1. Rebase #251 on main.**

- Keep `accentAlpha.ts` as the storage of the accent's alpha, in 1/255 steps. Reword the `ALPHA_MIN` comment: "the lowest alpha the picker offers".
- Replace its `alphaHex`, `composite`, `selectionFor` and `parseHexAlpha` with the core's (mandatory), and keep their tests as tests of the call sites.
- Keep the token swaps, `cleanDraft`, `setAccentAlpha` and `resetAccent`.

**B2. Remove the opacity row**

- In `Settings.tsx`, delete the `c-accent-alpha` row, the `ALPHA_MIN` import, and the `ColourWell` alpha props.
- `Settings.tsx` L631 and L804 (`accentColor: var(--p-accent)` on range controls) read `--p-accent-solid`.

**B3. Wire the Style page to the core picker**

- In `Settings.tsx`, delete the local `ColourWell` and `parseHexInput`.
- Import `ColourField` from `prism-term-core/renderer/settings/ColourPicker`. Each row passes `onRevert` that restores its prior override state (none included).
- `theme.ts`: `hex2rgb` reads the first six digits only; `isStylesOwn` compares through `toStored`; `cleanDraft` also validates `prism.style.presets` on load.
- Primary (`c-bg`):
  - The value is `style.bg + alphaHex(paintedAlpha(style))`, with `alphaMin` the slider's low end (about 0.53) and `snapAlpha` snapping 95-100% to 95%.
  - On change, split the value: the hex6 part goes to `setOverride('bg')`. Only when the alpha changed: `setAcrylic(levelFor(alpha))`, which does what the Acrylic slider's own handler does for that level today (verify against Settings.tsx: mica stays mica). A hue-only edit never touches the material or the level.
  - Alpha 1 means level 0, which is solid.
  - Add `levelFor` and its inverse to `theme.ts` with tests.
  - Delete the `c-glass` row. This depends on open question 1.
- Secondary (`c-chrome`): shown at the painted alpha; stores hex8 in `side`, `title` and `tabs` only once its alpha is moved, else hex6. `variablesFor` uses the colour's own alpha when it has one, otherwise `paintedAlpha`. This depends on open question 2.
- Text (`c-text`): `legibleOn(…, 4.5)` against `bg` and `sideOf` in `derive`.
- Folder icons (`c-folder-icon`): `legibleOn(…, 3)` against `sideOf`.
- Accent (`c-accent`):
  - The value is `paletteOf(accent)[0] + alphaHex(accentAlpha)`, with `alphaMin={ALPHA_MIN}`.
  - On change, if the hex6 part changed, call `setOverride('accent', hex6)`. If the alpha changed, call `setAccentAlpha(a)`.
  - Reset calls `resetAccent`.
  - Turn the hand-built `<div>` into a `Pref`.
- `TabStrip.tsx` `onTint`: swap PR A's local composite for the core's `inkOn`.
- Extend `cleanDraft` to validate every colour field with `parseColour`, and to split a Primary hex8 into the colour and the acrylic level.

**B4. Tests**

- `theme.test.ts`: `hex2rgb` on 8 digits; the text and folder floors under alpha; `levelFor` round trip within one level; every saved level maps to the same painted alpha; a hue-only Primary edit leaves the material and level alone.
- `accentAlpha.test.ts`: kept, 1/255 steps.
- `theme.storage.test.ts`: `cleanDraft` with a hex8 bg, and a presets list with a bad colour.

**B5. e2e: `tools/e2e/run.mjs`**

- `accentOpacityScenario` drives the accent picker:
  - Shift+Left on the `Alpha` slider to 25%.
  - The field reads 8 digits.
  - Typing `#rrggbb81` reads back `#rrggbb81`.
  - Reset puts everything back.
  - Keep its token, label contrast and tree-row asserts.
- New `styleColours` scenario:
  - Primary alpha below 100 makes the style translucent, and 100 makes it solid; a mica style stays mica.
  - A hue-only Primary edit does not light the edited state for the material.
  - A pre-change saved `acrylic: 40` draft shows the same painted alpha.
  - Tab-through on Folder icons and on a scheme Accent writes no override (the #71 guard, now fixed).
  - Text alpha keeps the text at least 4.5:1.
- `termOptionsScenario`, `sortScenario`, `termColourPicker`: rerun.

**B6. Version and docs**

- Bump to the next minor above main. This replaces #251's 0.80.0 if main has moved.
- `CLAUDE.md`: replace #249's "Accent opacity" line with the picker rule.

**Verify:**

```
npm test
npm run typecheck
npm run lint
npm run e2e -- accentOpacity styleColours termOptions sort termColourPicker
npm run e2e:terminal
```

Then install the branch build, and ask "merge?".

---

## Done when

- Every colour row in both apps opens the same picker with a code field and alpha, except the two places the spec excludes on purpose:
  - Prism's terminal theme Background has no alpha (the style owns see-through).
  - `HexSwatch` callers keep alpha off until they are moved.
- No Opacity or Accent opacity slider remains.
- An existing user's window looks the same after updating, and a theme pick still asks before it throws away a see-through.
- Both apps' suites and Prism's `terminal-gate` are green.
