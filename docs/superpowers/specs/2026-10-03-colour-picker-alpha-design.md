# One colour picker, with alpha, for every colour in both apps

Date: 2026-10-03. Repos: Prism Terminal (`core/` shared as `prism-term-core`) and Prism.
Status: design for owner approval, together with `../plans/2026-10-03-colour-picker-alpha-plan.md`.
Revised the same day after a review checked against PT `68e1cd9`, Prism `origin/main` and
`origin/feat/249-accent-opacity`.

## Why

Owner, 2026-10-03: "the colour pickers should be the same for both apps, i need an input field for
a color code and an alpha per colour on every colour setting colour picker both in pt and prism,
also in the terminal tab where we have things like agent indicators, and terminal themes with
specific colours".

Owner, earlier: alpha "should be built into the colour pickers like argb or ... hsl ..., it should
not be a separate opacity setting".

Owner, on the direction below: "go ahead". That covers one picker in the core, alpha on every
colour, and a background's alpha replacing the Opacity slider (option a).

Today there are two pickers, and neither has alpha:

- The core's `HexSwatch` (`core/renderer/settings/fields.tsx`) is a hex field plus the native
  `<input type=color>`. It is 6 digits only, and the native picker has no alpha.
- Prism's own `ColourWell` (`Settings.tsx` L359-420) is a copy of the same idea. It is missing the
  core's `hexCommit` guard, so tabbing through a Folder icons or scheme Accent well writes an
  override.
- Prism #251 adds a separate "Accent opacity" slider. That is the shape the owner rejected.

## What the user sees

### The row control (`ColourField`)

The row shows two things side by side:

- **A swatch button.** It shows the colour over a small checkerboard, split in two: the left half
  is the colour as solid, the right half is the colour at its alpha, so a see-through colour is
  visible at a glance. Clicking it, or pressing Enter or Space on it, opens the popover.
- **One code field.** This is the only typed field, and it accepts any of these forms:
  - HEX: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, with or without the `#`.
  - RGBA: `rgb(…)` or `rgba(…)`, comma or space syntax, alpha as 0-1 or a percentage, `/ a`
    accepted.
  - HSLA: `hsl(…)` or `hsla(…)`, hue in deg or unitless, alpha as above.

What the field shows depends on the format currently selected:

- HEX shows `#rrggbb` when the colour is opaque and `#rrggbbaa` otherwise.
- RGBA shows `rgba(r, g, b, a)` with `a` to two decimals.
- HSLA shows `hsla(h, s%, l%, a)`.

The field width follows the format: 76px for HEX and 172px for the other two. The text is
monospace, as it is today.

The field keeps today's commit rule, generalised as `colourCommit(draft, value)`:

- Only a typed draft that parses AND names a different colour (alpha included) is committed. "The
  same colour" is decided by comparing `toStored` of both, never the strings, since the RGBA and
  HSLA forms are rounded for display.
- It commits on blur and on Enter. Escape drops the draft.
- Tabbing through a row that follows the theme still pins nothing (#26, #71).

### The popover (`ColourPopover`)

The popover sits in a portal and is anchored under the swatch, or above it when there is no room
below. It is `role="dialog"`, its `aria-label` is the row's `label` as it is (the labels already
end in "colour" where they should: "Working colour", "Background colour"), and it carries
`data-colour-popover` and `data-owns-escape`. From top to bottom it holds:

1. **The saturation and brightness square**, 200 x 140. Pointer drag. A focusable `role="slider"`
   with `aria-label="Saturation and brightness"`. Keys:
   - Left and Right move saturation; Up and Down move brightness.
   - Each press moves 1%, or 10% with Shift.
   - `aria-valuetext` reads "saturation 60 percent, brightness 40 percent".
2. **The hue bar.** `role="slider"`, `aria-label="Hue"`, 0-360. Arrows move 1 degree, Shift moves
   10, and Home/End go to the ends.
3. **The alpha bar**, drawn over a checkerboard and running from transparent to the colour.
   `role="slider"`, `aria-label="Alpha"`, `aria-valuemin`/`aria-valuemax` from `alphaMin` and
   `alphaMax` in percent, `aria-valuetext` "60 percent opaque". Arrows move 1%, Shift 10%. It is
   absent when the caller passes `alpha={false}`, and `aria-disabled` (drawn faded, keys ignored)
   when the caller passes `alphaDisabled`.
4. **A footer row**, which holds:
   - The eyedropper button. It appears when `'EyeDropper' in window` (Chromium's `EyeDropper`,
     present in Electron 43). There is no probe: `open()` needs a user gesture and shows the
     dropper, so it cannot be tried silently. If a real press rejects with anything other than
     the user's own cancel (`AbortError`), the button is hidden for the rest of the session. Its
     result replaces the colour's RGB and keeps its alpha.
   - The preview: the colour the popover opened with beside the new one, both over a
     checkerboard.
   - The format toggle, a neutral `ROW_BUTTON` that shows `HEX`, then `RGBA`, then `HSLA`. The
     choice is per app and per viewer (localStorage `prism.term.colourFormat`, read defensively).
     It changes how every field shows its value; it changes nothing that is stored.

How the popover behaves:

- **Live.** Dragging repaints as it goes, throttled to one `onChange` per animation frame, so the
  app or the theme editor's preview follows the pointer.
- **Opening and closing with no change writes nothing.** The popover tracks whether it wrote.
- **Escape** undoes the popover's writes and closes it. If nothing was written, nothing happens
  but the close. If something was, it calls the caller's `onRevert`, which puts back the stored
  state the row had when the popover opened, an unset state included (a row that followed the
  theme follows it again, with no Reset showing). A caller with no unset state may omit
  `onRevert`, and then the opening value is written back in one `onChange`. Every row that can
  follow the theme passes `onRevert`; the plan lists each.
- Pressing outside keeps the colour and closes it. The focus stays where the press put it (the
  user chose something else); only Escape gives it back to the swatch. Tab never leaves the
  popover (see below). (Amended in the review of PT #113, which built it this way: the earlier
  wording, "Tab-ing out of the last control" closing it and the focus always going back to the
  swatch, contradicted the Tab rule below and the plan.)
- **It closes when the focus leaves it** for anything but its own swatch. Settings is a TAB in PT
  and stays mounted under the update window, Command help (F1) and a close question, so "it
  closes when its anchor unmounts" is not enough: each of those takes the focus as it opens, and
  that closes the popover before it can sit over or beside them (ONE QUESTION AT A TIME, ONE
  LAYER). Its z-index is below those layers, so even for a frame it is drawn under them. It also
  closes when its anchor unmounts.
- **Escape is heard only by the popover.** The popover's root stops the propagation of every key
  it handles (Escape, Tab, the arrows, Home, End, Enter), so React ancestors, which see portal
  events through the React tree, never get them. Window-level listeners (the theme editor's
  capture-phase Escape and `trapTab`, Prism's own dialogs) are native and see the event first, so
  each of them must check whether it comes from inside a `[data-colour-popover]` and leave it
  alone, or the editor would close behind the popover.
- **Tab stays inside**, following the editor's own `trapTab` pattern; Ctrl+Tab is left alone.
- **No accent on the controls.** Settings controls stay neutral (#42): the toggle and the
  eyedropper use `ROW_BUTTON`, and the thumbs are drawn in ink with a ground-coloured ring. The
  accent appears only on focus rings (`--p-accent-hi`).

### Copy

No hint text is added beyond what the plan names. Every hint passes `copyProblem`: plain words,
no symbols other than comma and dot, and no key names. The format labels are button text, not
hints.

### Where it appears

**Prism Terminal**

| Row | Section | Alpha means |
|---|---|---|
| Theme editor: Background | Terminal theme | window see-through (replaces Opacity); bar disabled while acrylic is off |
| Theme editor: Foreground | Terminal theme | text, composited |
| Theme editor: Cursor | Terminal theme | composited |
| Theme editor: Selection (NEW well) | Terminal theme | see-through fill, at most 254/255 (see xterm below) |
| Theme editor: the sixteen | Terminal theme | composited |
| Working / Finished / Question colour | Appearance | see-through indicator |
| Background colour (`window-background`) | Appearance, app row | window see-through (replaces Opacity); bar disabled while acrylic is off |
| Accent colour (`window-accent`) | Appearance, app row | fills see-through, lines solid |

**Prism**

| Row | Page | Alpha means |
|---|---|---|
| Terminal page: everything in the Prism Terminal table except its two app rows | Terminal | as above, except that the theme's Background has no alpha bar (the style owns see-through, `acrylic.kind === 'style'`) |
| Primary colour `c-bg` | Style | window see-through (replaces the Acrylic slider; see open question 1) |
| Secondary colour `c-chrome` | Style | see-through panels (open question 2) |
| Text `c-text` | Style | text, composited |
| Folder icons `c-folder-icon` | Style | composited |
| Accent `c-accent` | Style | fills see-through, lines solid (#251's semantics) |

## Alpha semantics per colour kind

| Kind | Members | What alpha does | Floor |
|---|---|---|---|
| **Fill** | Accent (both apps), Selection, Secondary | Painted with its alpha; what is behind shows through. | Text drawn ON it (`--p-on-accent`) is chosen against the composite over the worst ground it sits on, at 4.5:1 (core `selectionFor`, moved from #251). Under a see-through ground, see "Fills under glass". |
| **Line or solid accent use** | rings, rules, progress, range `accentColor` | Never faded: these read `--p-accent-solid`. | 3:1 as today (`--p-accent-hi`). |
| **Indicator** | Working, Finished, Question | Painted with its alpha. | The user's pick is not floored, as today; a theme-derived one is floored at 3:1 as today, opaque, and derived from `--p-accent-solid`. Text on a Full fill is chosen on the composite (`inkOn`). |
| **Text** | terminal Foreground, Prism Text | Composited over the ground and handed on as an opaque colour. | The composite is floored to `min(4.5, contrast of the opaque pick)`. |
| **Mark** | Cursor, Prism Folder icons | Composited, then opaque. | `min(3, contrast of the opaque pick)`. |
| **Terminal palette** | the sixteen | Composited, then opaque. | 3:1 on the composite, as `legiblePalette` already floors them at alpha 1. |
| **Background** | terminal theme Background (PT), PT Background colour, Prism Primary | Window see-through. This IS the old Opacity, and it only shows where acrylic (or Prism's material) lets the desktop through; over a solid window the composite is the same colour, and the bar is disabled. | The window-alpha minimum: 30% in PT (today's Opacity clamp, `alphaMin={0.3}`); in Prism, the range of the old slider (see Data). Ink floors are measured against the opaque ground colour, as today (the desktop behind is unknown). |

**Why `min(floor, contrast of the opaque pick)`.** Today a Custom foreground and cursor are never
floored (`termTheme.ts` L361 hands them through). A plain floor would move an existing opaque
Custom with a failing cursor on update, and would jump at 99% (floored) against 100% (not). With
the min, alpha can never make a colour less legible than the user's own opaque pick, the result is
continuous in alpha, and at alpha 1 the floor equals the pick's own contrast, so nothing moves.

**Alpha exactly 1 changes nothing.** An opaque colour takes today's result byte for byte, pinned
by a snapshot of every preset and an opaque Custom taken before the change:

- Custom foreground and cursor stay unfloored.
- The sixteen are floored by `legiblePalette` exactly as today.
- `selectionBackground` stays `<cursor>55` when no Selection is set.

**What xterm gets.** xterm 6 parses `#rrggbb[aa]` and comma `rgba()` only; space syntax and
`hsla` go to a canvas path that throws on anything not opaque. So everything handed to xterm is
`toStored()` hex, and a test pins that every value `currentTermTheme()` returns matches
`^#[0-9a-f]{6}([0-9a-f]{2})?$`. Foreground, cursor and the sixteen are opaque composites, because
xterm blends its text against a canvas that is clear here. The selection keeps its alpha. xterm
draws an OPAQUE selection at 0.3 (`ThemeService.ts` L99-102, issue 2737), so the Selection well's
alpha bar stops at 254/255 (`alphaMax`): what the user picks is what is drawn.

**Fills under glass.** When the ground in force is see-through (acrylic, alpha below 1), a
text-bearing fill (`--p-sel-bg`: the update chip, Save, Install, the theme-switch ask) would sit
over the unknown desktop, so its 4.5:1 cannot be held. Then those fills are flattened: published
as the composite of the accent fill over `--p-bg-solid`, opaque. Over an opaque ground, or with an
opaque accent, this changes nothing (the CLAUDE.md "MEASURED 10.2:1" chip stays as it is).
Non-text fills (the tab tint, the indicator) stay see-through.

### Background alpha replaces Opacity (option a), and nobody's window changes on update

The settings change like this:

- In Prism Terminal, Settings > Appearance > Opacity (`term-opacity`) goes. Acrylic background
  (`term-acrylic`) stays, as the switch that lets the desktop through at all. With it off, the
  Background alpha bars are disabled (as the Opacity row was), and the hint says so.
- The window's surface alpha becomes the alpha of the ground in force, in this order (the same
  order everywhere: `paintChrome`, the migration, the Background row, `extras`):
  1. the picked Background colour (`windowBackground()`, which the core sees as the host's
     `terminalGround`);
  2. else the theme's background (Custom can carry one; presets are opaque).
- `paintChrome` passes that alpha's BYTE straight through to `chromeTokens` (as a fraction,
  byte / 255), never via a percentage, so the field and the window name the same alpha.

The one-time migration lives in `src/renderer/src/lib/opacityMigration.ts` and runs before the
first `paintChrome`. It is idempotent, because its marker is the old key's absence. It reads two
values that can differ: the LIVE `prism.term.opacity` (which may be an unsaved edit) and the
SAVED `Custom.opacity`.

1. **The saved Custom.** If `prism.term.custom` has `opacity` N < 100 and `acrylic !== false`, its
   `bg` takes `alphaHex(N / 100)`. `opacity` is then ignored, as `font`/`fontPct` already are.
   The saved slot never takes the live value.
2. **The live value**, when acrylic is on and the live N < 100:
   - If a Background colour is picked, the alpha goes onto it.
   - Else, if the theme is Custom and the step above already gave `Custom.bg` alpha N, nothing
     more is needed.
   - Else (a preset, or a Custom whose live opacity differs from its saved one),
     `prism.window.background` becomes the theme's opaque ground + `alphaHex(N / 100)`.
3. The old key is removed. With acrylic off the live value had no effect and is simply removed.

This is behaviour-identical to today:

- What paints is unchanged: the picked Background is read first, as `paintChrome` reads it first.
- Picking Custom again restores the SAVED see-through, as it did, because the live value never
  wrote the saved slot.
- **The unsaved-changes question survives.** Opacity was in `extras`, so a changed opacity lit
  Save changes and a theme pick asked first (#60). The ground alpha in force takes its place in
  `extras` (and in `baseline`, as the theme's own bg alpha), so a see-through picked or migrated
  Background lights Save changes and a theme pick asks before it forgets it. Save as Custom
  carries the alpha onto `Custom.bg`.
- A theme pick forgets the picked Background (`onThemePicked`), so the alpha leaves at the same
  moment Opacity did (`resetTermExtras`).

## Data and storage

- **One canonical stored form**, which is `toStored(rgba)`:
  - Lower-case `#rrggbb` when the alpha is 1.
  - `#rrggbbaa` otherwise, with alpha quantised to 1/255. Every alpha stored anywhere is in
    1/255 steps (#251's `accentAlpha` included), so a typed `…81` reads back as `…81`.
  - So every value saved before this change is already canonical and reads as opaque, and an
    opaque pick writes exactly what it writes today.
- **Every reader accepts 6 or 8 digits.** Concretely:
  - `termLook` `HEX` becomes `/^#[0-9a-f]{6}([0-9a-f]{2})?$/i`, for the agent working, finished
    and question colours.
  - `colourPref` `HEX` (PT `prism.window.background` / `.accent`) becomes the same.
  - Custom theme (`prism.term.custom`): `customTermTheme` validates `bg`, `fg`, `cursor`,
    `selection?` and each `ansi` value with `parseColour`. A bad value reads as absent; it falls
    back for ANSI and the whole slot for `bg`/`fg`, as today. Validation also covers what
    `applyCustomExtras` writes, which today writes unchecked.
  - The theme editor edits what is STORED: `paletteOf('custom')` returns `customTermTheme()` raw
    (alphas included), never the resolved, floored composites, so Save changes on Custom never
    turns the user's alphas into opaque floored colours. `paletteOf('style')` and presets keep
    normalising (Prism's `sort` asserts the follow-style Background is `^#[0-9a-f]{6}$`, and
    Prism's style background is `rgba()`).
  - Main: `material.validBg` keeps `#rrggbb` only. Main is only ever sent `--p-bg-solid`, which
    stays flat; a test pins that.
  - Prism's colour maths: `hex2rgb` (`theme.ts` L363) parses the whole string, so 8 digits come
    out as G, B, A and overflow the shifts. It reads the first six digits only, and `isStylesOwn`
    compares through `toStored`. `prism.style.presets` is validated on load by the same
    `cleanDraft` as the draft.
- **Prism Style storage.** All of this is validated by `cleanDraft` on load, which #251 starts and
  this widens to every colour field:
  - `side` and `folderIcon` and `text` store `#rrggbb`, or `#rrggbbaa` once the user has moved
    that row's alpha (open question 2 for Secondary).
  - Primary's alpha is stored as the existing `acrylic` level (open question 1), because the
    material and its glass already live there and Prism's presets carry `glass`. A Primary hex8
    that arrives anyway (pasted, or an old local draft) is split by `cleanDraft`.
  - `accent` keeps #251's split: `accent` (a scheme id OR `#rrggbb`) plus `accentAlpha` (1/255
    steps). A scheme accent with an alpha must keep its palette for the visualizer, so the alpha
    cannot live inside a hex.
- **The format toggle is display only**: `prism.term.colourFormat` holds `hex`, `rgba` or `hsla`,
  and anything else reads as `hex`.
- **Values stay per app** (own userData). Nothing is shared between the apps.

## Contrast and legibility on composites

Core, `core/renderer/lib/colour.ts`:

- `composite(c, ground)` gives the opaque `#rrggbb` seen when `c` (with its alpha) lies on an
  opaque `ground`.
- `legibleOn(c, ground, floor)` is `ensureContrast(composite(c, ground), ground, f)` with
  `f = min(floor, contrastRatio(opaque(c), ground))`. Use `legibleOnStrict` (plain floor) for the
  sixteen, which `legiblePalette` floors today.
- `inkOn(tint, ground)`: black or white text for a fill, chosen on `composite(tint, ground)`.
  Both apps' Full indicator uses it (PT `TabStrip.tsx` L153, Prism `TabStrip.tsx` L106 today call
  `contrastRatio` on the raw tint, which drops the alpha).
- `selectionFor(fill, grounds)`, moved from #251 into the core (both apps would otherwise each
  write it): the ink for text on a see-through fill, at 4.5:1 over the worst ground.
- ONE `alphaHex(a: 0..1): string` (two hex digits, `round(a * 255)`, no clamp). PT's
  `chromeTheme` 0-100 helper and #251's clamped one are replaced by it; clamping is the caller's.
- `resolveTermTheme(id, ground?)`: Custom colours are composited ONCE, against the ground in force
  (the host's `terminalGround`, else the theme's own opaque bg):
  - fg: `legibleOn(…, 4.5)`; cursor: `legibleOn(…, 3)`; the sixteen: `legiblePalette` on the
    composites.
  - Selection is `c.selection ?? opaque(cursor) + '55'`. This fixes today's `${c.cursor}55`,
    which on a hex8 cursor gives 10 digits.
- `onGround` takes the resolved theme and re-floors it against a picked ground as today, but no
  longer composites, and it keeps a theme-supplied selection: it rewrites `selectionBackground` to
  `<floored cursor>55` only when the theme's selection was the derived one.
- `legiblePalette` normalises its inputs first, so an rgba or hex8 ANSI value can no longer reach
  `hexToRgb` and produce NaN.
- The ground used is the opaque ground colour, as today. Under acrylic the desktop is unknowable.

Prism:

- Text and Folder icons use `legibleOn` against `bg` and `sideOf`, worst of the two.
- Accent fills use the core's `selectionFor`.
- The tests (`termTheme.legible.test.ts`, Prism's `theme.test.ts`/`accentAlpha.test.ts`) sweep
  alpha 0.1-1 in tenths over every preset and style.

## Architecture

**New in the core.** All of these are pure where marked, and relative-import only:

- `core/renderer/lib/colour.ts` (pure):
  - Types: `Rgba {r, g, b, a}`, `Hsva`, `Hsla`.
  - Parse and store: `parseColour(text): Rgba | null` (every form above); `toStored(rgba)`;
    `format(rgba, 'hex'|'rgba'|'hsla')`.
  - Conversions: `rgbToHsv`/`hsvToRgb`, `rgbToHsl`/`hslToRgb`.
  - Helpers: `opaque(c)`, `alphaOf(c)`, `withAlpha(c, a)`, `alphaHex(a)`.
  - Contrast: `composite`, `legibleOn`, `legibleOnStrict`, `inkOn`, `selectionFor`.
  - The commit rule: `colourCommit(draft, value, {alpha, alphaMin, alphaMax})`.
  - `termAnsi.normalizeColor` stays as the opaque reader it is.
- `core/renderer/lib/colourFormat.ts`: the per-viewer format pref plus `useColourFormat()`
  (`useSyncExternalStore`, as the other prefs).
- `core/renderer/settings/ColourPicker.tsx`: `ColourField` (the row control), `ColourPopover`, and
  the slider parts (`SvSquare`, `HueBar`, `AlphaBar`), all props only.
- `fields.tsx`: `HexSwatch` stays as a thin wrapper, `<ColourField alpha={false} …/>`, for any
  caller not yet moved; `parseHexInput` and `hexCommit` stay exported, carrying the superset.
- `core/package.json` adds `react-dom` to `peerDependencies` (the portal needs it; both hosts
  already have it, and the README already dedupes it).

`ColourField` props:

```ts
{
  label: string            // the code field's and the popover's aria-label, as it is
  value: string            // stored form, or any parseable colour (shown value in force)
  onChange: (stored: string) => void   // always toStored(); 6 digits when opaque
  onRevert?: () => void    // Escape after a write: restore the row's prior stored state
  alpha?: boolean          // default true; false hides the bar and drops a typed alpha
  alphaMin?: number        // 0..1, default 0
  alphaMax?: number        // 0..1, default 1
  snapAlpha?: (a: number) => number    // optional quantiser (Prism Primary's glass range)
  alphaDisabled?: boolean  // the bar shows, faded and inert (acrylic off)
  id?: string              // for <label htmlFor>
}
```

The DOM contract that both apps' e2e rely on (PR A in Prism is written against it before the core
PR exists, so these names are fixed here):

- The code field is the row's only `<input>` with no `type` attribute while the popover is
  closed. Its `aria-label` is `label`. Its value in HEX format is the lower-case stored form.
- The swatch is a `<button aria-label="Pick <label>" data-colour-swatch>`.
- The popover is `[data-colour-popover][role="dialog"]`, `aria-label` = `label`.
- The sliders are `[role="slider"]` with `aria-label` exactly `Saturation and brightness`, `Hue`
  and `Alpha`. The alpha bar's `aria-valuenow` is the alpha in whole percent.
- The format toggle is `button[data-colour-format]`, its text `HEX`, `RGBA` or `HSLA`.
- The eyedropper is `button[data-colour-eyedropper]`.
- Prism's `sortScenario` reads `input[aria-label="red"]` and fills
  `input[aria-label="Background"]`. Today those match the hidden native colour input; with this
  contract they match the code field. That is why the label carries no "hex value" suffix any
  more.

**What each host passes.** No new `TermHostConfig` field is needed:

- Whether the terminal theme's Background offers alpha is decided by the existing
  `acrylic.kind`. `'window'` (PT) offers it, as the window see-through. `'style'` (Prism) does
  not, because the style's Primary owns see-through, exactly as the Opacity row was `onlyWhere`
  window.
- The ground alpha in force is computed in the core (`termGroundAlpha()`: the host's
  `terminalGround`, else the Custom bg's alpha, 1 for presets) and in PT's `paintChrome` in the
  same order.
- Core components that use `--p-accent` as a LINE (the `UpdateDialog` progress bar L263, the
  `TermThemeCard` ring L86) read `var(--p-accent-solid, var(--p-accent))`. A host without the
  token is unchanged. Fills (Save, Install, ThemeSwitchAsk, the HelpPanel row, the Dictation
  badge) keep `--p-accent` and pair it with `--p-on-accent`, which each host chooses on the
  composite.
- Every token stays `#rrggbb` or `#rrggbbaa`, never `rgba()` (`chromeTokens`' own rule, which
  xterm's search decorations depend on). A see-through accent is published as hex8.

**Lint walls.** `core/` keeps to its rules:

- Relative imports only.
- No `window.prism` (the eyedropper is a DOM API, not the bridge).
- No `electron`, no `chromeTheme`, no host `src/`.
- `chromeTokens` stays in PT's `src/`; it imports the core's `alphaHex`, `composite` and
  `selectionFor` rather than writing its own.

## What is removed

- **PT `term-opacity`.** Removed from:
  - The row in `TerminalAppearance.tsx` (L650-675).
  - `options.ts`.
  - `setTermOpacity` usage.
  - `termExtraDefaults().opacity` (the ground alpha takes its place in `extras`).
  - `CustomTermTheme.opacity`, which is read once by the migration.
  - `termOpacity()` itself, which becomes `legacyTermOpacity()`: read only, for the migration.
- **#251's `c-accent-alpha` row** (the Accent opacity slider), its `ALPHA_MIN` import in
  Settings, and the slider reads in `accentOpacityScenario`.
- **#251's own `alphaHex`, `composite`, `selectionFor` and `parseHexAlpha`**, replaced by the
  core's.
- **Prism's `c-glass` Acrylic slider.** It is replaced by Primary's alpha (open question 1).
- **Prism's local `ColourWell` and `parseHexInput`**, replaced by the core's `ColourField`, which
  also fixes the missing `hexCommit` guard.
- **The native `<input type=color>`** everywhere, since it cannot carry alpha.

## Testing

**Unit tests (core, vitest):**

- `colour.test.ts`:
  - Every parse form, plus rejects: `#12345`, `rgb(300,0,0)`, `hsl(…)` with a missing %, and
    `''`.
  - `toStored` canonical form (opaque gives 6 digits, lower case).
  - Round trips over a 6x6x6 RGB grid times all 256 alphas: hex8 to `Rgba` to hex8 exact;
    `Rgba` to numeric `Hsla` to `Rgba` exact after `toStored` (on numbers, not on `format()`
    strings, which round for display); hsv to rgb to hsv within 0.5. `format()` strings are
    tested only for re-parsing to a colour `colourCommit` calls the same.
  - `composite` endpoints (a = 0 is the ground, a = 1 is the colour).
  - `legibleOn`: alpha 1 returns the pick unchanged even when it fails the floor; the result is
    continuous in alpha; never less legible than the opaque pick.
  - `inkOn` on a see-through tint over a dark ground picks white.
  - `colourCommit`: nothing typed, same colour, same colour in another format, a new alpha,
    junk, `alpha:false` dropping a typed alpha, `alphaMin`/`alphaMax` clamping.
- `termLook.test.ts`: agent colours accept hex8 and reject 7- or 9-digit values;
  `customTermTheme` drops a bad ANSI value and keeps the rest; `applyCustomExtras` validates.
- `termTheme.test.ts`:
  - The Dracula selection is still `#bbbbbb55`.
  - A Custom hex8 cursor gives a 9-character selection from the opaque cursor.
  - Custom `selection` is honoured, and survives `onGround`.
  - Opaque Custom (a failing cursor included) resolves byte-identical to before; a snapshot of
    every preset's `resolveTermTheme` is taken before the change.
  - Every value `currentTermTheme()` returns, over every preset and an alpha Custom, matches
    `^#[0-9a-f]{6}([0-9a-f]{2})?$`.
- `termTheme.legible.test.ts`: every preset, alpha 0.1-0.9 on fg, cursor and the sixteen gives
  fg and cursor at least their opaque pick's contrast up to the floor, and the sixteen at least 3
  on the composite.
- `fields.test.ts`: `HexSwatch` still drops an alpha.
- `neutralControls.test.ts` covers `ColourPicker.tsx`: no `--p-accent` fill on its controls.
- `settingsCopy`: the new hints.

**Unit tests (PT):**

- `colourPref` accepts hex8.
- `chromeTokens` with a hex8 chosen accent: `--p-accent` hex8 and see-through, `--p-accent-solid`
  solid, `--p-on-accent` at least 4.5 on the composite over `--p-bg` and `--p-side-flat`; with a
  see-through ground, `--p-sel-bg` is opaque (flattened).
- `chromeTokens` with ground alpha byte B equals today's output for `opacityPct` wherever B/255 is
  what today's percentage produced (every saved N maps to `round(N / 100 * 255)`).
- `agentColors`: a see-through accent leaves the theme-derived working colour opaque.
- `opacityMigration.test.ts`: preset; picked background; Custom with live equal to saved; Custom
  with live differing from saved (saved slot untouched, live on the picked background); Custom
  plus picked background (picked takes the live value); `Custom.acrylic === false` (no fold);
  acrylic off; idempotent; junk.

**Unit tests (Prism):**

- `accentAlpha.test.ts` kept, rewritten against the core helpers, alpha in 1/255 steps.
- `theme.test.ts`:
  - `hex2rgb` on 8 digits.
  - Text and folder alpha floors.
  - Primary alpha to acrylic level mapping and back, within one level; a hue-only edit leaves
    `acrylic` and the material untouched.
  - `cleanDraft` splits a Primary hex8, and validates the presets list.

**e2e. A core change auto-merges into Prism, so both apps are gated:**

- **PT `colourPicker`** (new). It covers:
  - The agent-colour popover: Shift+Left on the Alpha slider until 50%; the field shows 8 digits;
    the stored value is hex8; the indicator's computed colour has alpha; a Full tab's text is
    at least 4.5:1 on its composite.
  - Open and close a following row with no change: storage untouched, no Reset.
  - Change, then Escape: the row follows the theme again (stored value unset).
  - The format toggle through RGBA and HSLA; typing `hsla(200, 50%, 40%, 0.5)` stores the same
    hex8.
  - The eyedropper with a stubbed `window.EyeDropper` keeps the alpha.
  - Theme editor: red at 40% and fg at 30%, then Save as Custom; the applied theme meets 3:1 and
    4.5:1; reopening Custom shows the 40% and 30% alphas, and Save changes keeps them.
  - The popover is gone after F1 opens Command help, and after the update preview window opens.
  - Screenshots `.e2e-shots/colour-picker-*.png`.
- **PT `reviewSettings`** extended: tabbing through a closed picker stores nothing; the editor
  stays open on an Escape aimed at its popover.
- **PT `opacityAlpha`** (new, PR 2): a seeded `prism.term.opacity=60` with acrylic on gives the
  same `--p-bg` alpha after launch and no Opacity row; a seeded Custom with saved 80 and live 60
  paints 60 and restores 80 on picking Custom again; the Background picker's alpha moves it; a
  theme pick with a see-through Background asks first.
- **PT `accent`, `pickedGround`, `themeSwitch`, `options`** updated where a selector or the
  closed list changes.
- **Prism `termOptions`** is relaxed in PR A to "every non-`onlyWhere` row is shown and every
  `onlyWhere` row is absent", since the one `onlyWhere` row (`term-opacity`) goes in PT PR 2.
- **Prism `termColourPicker`**, added to `e2e:terminal`, so it is in the gate the bump PR waits
  on. It runs the core picker on Prism's Terminal page: alpha on the working colour, the Full
  tab's ink on the composite, Escape restoring an unset row, and no alpha bar on the theme
  Background. It is landed in Prism BEFORE the core PR merges and skips itself while
  `node_modules/prism-term-core/renderer/settings/ColourPicker.tsx` does not exist (feature
  detection, not a version number), so the bump is gated on it the first time.
- **Prism `styleColours`** (new, in the #251 rework) and **`accentOpacityScenario`** rewritten to
  drive the picker. `sortScenario` must pass; it is red on #246 today and is fixed first (plan,
  step 0), after which it is the compat proof for the field labels.

## Risks and open questions

Risks, handled in the plan:

- **The auto-merge pipeline is stuck today.** Prism #246 (core-v0.20.0, Prism 0.79.0) is open
  with `gate` red (`sort` timed out at `fileRows.first().waitFor`, run 36830652255), and Prism
  main still pins core-v0.19.1. Any later core bump carries that red too, so the plan's step 0 is
  to fix it (as a ratchet scenario if it is a real regression) and merge #246 first.
- **`EyeDropper` in Electron 43** under `sandbox: true`. Measured by hand in PR 1; a rejected
  press hides the button, and the rest stands.
- **Escape layering in nested dialogs and app layers.** Tested in both apps.
- **Main's `validBg`** must never receive hex8. `--p-bg-solid` stays flat, and a unit test pins it.

Open questions for the owner:

1. **Prism's Acrylic slider.** In Prism the slider is both the material switch (0 means solid)
   and the glass level, and there is no separate Acrylic switch to keep.
   - *Recommendation:* Primary colour's alpha replaces it, with the slider's own rule. Alpha 100
     means solid. Below 100 does exactly what the slider does today for that level (mica stays
     mica, at that glass). The range is about 53% to 95%, the slider's two ends; a value
     between 95% and 100% snaps to 95% (`snapAlpha`). Changing only the hue never touches the
     material or the level.
   - Saved levels map 1:1, so no window changes.
   - The alternative is to keep the slider in Prism, which leaves Primary without alpha and goes
     against "not a separate opacity setting".
2. **Secondary colour's alpha in Prism.**
   - *Recommendation:* its own alpha, for the sidebar, title and tab strip, shown as the alpha
     the style already paints them at. It is stored only once the user moves the alpha bar; a
     hue-only edit stores 6 digits and keeps following Primary's level.
   - The alternative is that it always follows Primary's and shows no bar of its own.
3. **The format the fields open in.**
   - *Recommendation:* HEX, with the toggle remembered per app.
   - The alternative is RGBA, since alpha is the new thing.
4. **The order of the two Prism Terminal PRs.**
   - *Recommendation:* PR 1 (core) first. It replaces the native picker in both apps and adds
     alpha to the terminal theme colours and the agent colours, but changes no colour anyone
     already has. PR 2 then does the Opacity replacement and PT's own rows, with its migration.
   - The other order would leave the core's theme-Background alpha with nothing to drive.
5. **Fills under glass.** *Recommendation:* flatten text-bearing fills over `--p-bg-solid` when
   the ground is see-through, as specced above. The alternative is to keep them see-through and
   accept that text on them may fall under 4.5:1 over a bright desktop.
