# See-through window, theme order and Most recent tab switching (#156, #157, #158)

Date: 2026-10-10. Branch `feat/look-mru`, stacked on `feat/154-full-style` (PR #155).
Versions: app `package.json` 0.36.0 to **0.37.0**; `core/package.json` 0.30.0 to **0.31.0** (core
changes, so this ships to Prism too).

## The owner's words (2026-10-10, verbatim)

> also add support for the see through winmdow setting in prism terminal if its not here already,
> its in prism in style settings i wnat it here too.also sort all the terminal themes so therye
> ordered form black to white with colroed ones in between depending on where they fall on teh black
> or white scale not sure whta thats called but the tint of their colro determins weather their
> darker or brighter then teh next. but dark colros shoudl be before all colred, amybe acutally
> colroed themes last first black to white then colroed. also add a new tab switching mode called
> most recent. so you can either switch chronologically or by most recently used. createa plan for
> all this then build, ill be gone so youll have to do all these thigns and ill test once im back.

The owner is away; every decision below is made by the implementer and flagged for the owner's
review in the PR. The owner is visually impaired and works zoomed in: contrast and clarity matter.

---

## 1. See-through window (#156)

### What Prism has

Prism, Settings > Appearance, section "This theme"
(`Prism/src/renderer/src/components/settings/AppearancePage.tsx:99-141`, `appOptions.ts:74`):

- Row `see-through`, label **"See-through window"**, sub **"The desktop shows behind every
  surface."**, icon `glass`, a Switch. It sits right under the theme wall, before the theme's colours.
- The switch is the SAME value as Primary's alpha: on means the painted alpha is below 1
  (`paintedAlpha(shown) < 1`). Turning it on over a SOLID theme writes a see-through level of
  `SEE_THROUGH_LEVEL = { dark: 70, light: 49 }` (the levels Glacier and Orchid paint); turning it
  off over a glassy theme writes 0. Either is an edit of the theme, so it lights Save changes.
- Hidden on the high contrast themes: "their contrast is measured on a solid ground, and glass
  would put an unmeasurable desktop under the text."
- What a level paints (`theme.ts:1271-1286`): `glass = 0.85 - level/100 * 0.55`, painted alpha
  `1 - (1 - glass * 0.75)^3`. Level 70 (dark) paints **0.724 = byte 0xb9**; level 49 (light)
  paints **0.820 = byte 0xd1**.

### What Prism Terminal has today

PT already has the switch, under another name and with a gap that makes it look broken:

- Row `term-acrylic`, label "Acrylic terminal background", sub "The desktop shows through the
  window.", `core/renderer/settings/options.ts:54`; drawn by
  `core/renderer/settings/sections/TerminalThemeSection.tsx:45-54` in Settings > Appearance >
  Theme, AFTER the wall and after PT's own Background colour and Accent colour rows
  (`src/renderer/src/components/settings/AppearancePage.tsx:197-208`, `ROW_ORDER` in
  `settingsIndex.ts:41`). Store `prism.term.acrylic`, default off (`src/renderer/src/termHost.ts:27`).
- It switches the window's acrylic material (`App.tsx:100-123`, `paintChrome`), and the window
  paints at `termGroundAlpha()` (`core/renderer/lib/termLook.ts:423-437`): the picked Background's
  alpha, else a Custom's `bg` alpha, else **1 for every preset**.
- **THE GAP**: on any preset with no picked Background, switching it on changes the material but
  the ground is painted opaque, so the desktop does NOT show. It shows only after the user also
  lowers the Alpha slider of the Background colour picker (the #114 design: "the Background's alpha
  is the window's see-through"). That is why it reads as missing. Prism's switch, by contrast,
  makes the window see-through by itself.
- Windows 10: the row says "Needs Windows 11." and is off (`useNoAcrylic`).

### Decisions

1. **No second switch.** The existing `term-acrylic` row IS the see-through window. Same id, same
   store key, same `TERMINAL_OPTIONS` entry (so neither app's parity test and no saved setting
   changes).
2. **Name and words like Prism's, in PT only.** In a host whose terminal owns the window acrylic
   (`hostOwnsWindowAcrylic()`, i.e. PT) the row reads **"See-through window"** /
   **"The desktop shows behind every surface."** In Prism the terminal row keeps "Acrylic terminal
   background" and its own sub: there it is a TERMINAL setting under Prism's own app-level
   "See-through window", and two rows with one name would be wrong. Done the way the sub already
   differs per host (`sections/opts.ts:37` `acrylicSub`): a new `acrylicLabel()` beside it, used by
   `TerminalThemeSection`, the legacy `TerminalAppearance.tsx` and `coreIndex.ts` (Find a setting).
   `options.ts` keeps Prism's label (Prism's gate reads that file as text). No new `TermHostConfig`
   field: it derives from `acrylic.kind`, which is declared.
3. **On means see-through, by itself (Prism's behaviour).** Where the terminal owns the window
   acrylic and the switch is on, an OPAQUE ground in force (alpha 1: every preset, a picked
   Background with no alpha, an opaque Custom) paints at the **default see-through**:
   `0xb9/255` on a dark ground, `0xd1/255` on a light one, Prism's own two levels as they paint.
   Light or dark is MEASURED from the ground in force (relative luminance > 0.4, the same test
   `chromeTheme.ts:105` uses for `data-mode`), never read off a name. A ground that already carries
   an alpha (30% to 95%) keeps it: the Background picker's Alpha slider still tunes how much.
   - New pure `core/renderer/lib/seeThrough.ts`: `SEE_THROUGH_ALPHA = { dark: 0xb9 / 255, light:
     0xd1 / 255 }`, `SEE_THROUGH_MAX = 0xf2 / 255`, `seeThroughAlpha(groundHex): number`.
   - `termGroundAlpha()` (`termLook.ts:423`): where `hostOwnsWindowAcrylic()` and `termAcrylic()`
     and the raw alpha is 1, return `seeThroughAlpha(opaque ground in force)`; otherwise as today
     (floored at 30%). The opaque ground in force is `hostGround()`, else the Custom's `bg`, else
     the preset's background, read through `resolveTermTheme` (a call-time import; `termTheme.ts`
     already imports `termLook` the same way, and neither reads the other at module load).
   - So Prism, where `acrylic.kind` is 'style', is untouched.
4. **Opaque is the switch's off.** While the switch is on, the Background colour picker (PT's
   `window-background` row) and the theme editor's Background (`ThemeWall.tsx:448`) cap Alpha at
   `SEE_THROUGH_MAX` (95%), `alphaMin` stays 0.3: an Alpha of 100 would read back as the default
   and the slider would jump. Same rule as Prism: the switch and the alpha always agree.
   PT's Background row shows the alpha IN FORCE while nothing is picked (`themeColours()` in
   `AppearancePage.tsx:65-76` uses `termGroundAlpha()` under the switch instead of 1).
5. **The row moves up, right under the wall**, before Background colour and Accent colour, as in
   Prism (see-through first, then the theme's colours). `TerminalThemeSection` renders the switch
   before `afterTheme`. Prism passes no `afterTheme`, so its Terminal page does not change. PT's
   `ROW_ORDER` becomes `... 'term-theme', 'term-acrylic', 'window-background', 'window-accent' ...`.
6. **High Contrast stays solid** (Prism's rule, and this owner's eyes). In a window-acrylic host,
   when the theme in force is `high-contrast`, the row is drawn off and disabled with the sub
   "High contrast stays solid.", and the window paints solid whatever is stored
   (`termAcrylicInForce()` in `termLook.ts` = `termAcrylic()` and not that case; `paintChrome`,
   the Background row and the editor read it). The stored choice is kept, so leaving High Contrast
   gives it back.
7. **Save changes** keeps working: the switch is a theme extra already (`termExtraDefaults().acrylic`),
   and Save as Custom stores `withGroundAlpha(...)`, which now carries the default alpha, so a saved
   Custom stays see-through. `useTermSetup`'s dirty check compares the ground alpha in force with
   the alpha the saved setup paints, computed by the SAME rule (an older Custom saved with
   `acrylic: true` and an opaque `bg` paints the default, so it is not dirty on pick).
8. **Contrast.** Chrome text fills are already flattened under a see-through ground
   (`chromeTheme.ts`, #114). Unit-test every preset at the two default alphas (text 4.5:1 on the
   composite, as the existing `under a see-through ground` test does at its alpha).

**Known, accepted change on update**: anyone who had the switch ON with an opaque ground (it looked
solid) now sees a see-through window. That is the bug being fixed; the owner's Stable copy is one
such profile if he ever turned it on. Said in the PR.

---

## 2. Theme order (#157)

### Today

`core/renderer/settings/theme/ThemeWall.tsx:299-317`: Custom first, then the host's default preset
(PT Default in PT; none in Prism, whose default is 'style'), then "Follow style" (Prism only), then
every other preset sorted by the WCAG luminance of its background, DARK TO LIGHT or LIGHT TO DARK
depending on whether the theme worn when the page opened is light (`lightFirst`). No neutral vs
coloured grouping. The wall shows two rows until "Show all".

### Decision

**Neutral themes first, black to white; then coloured themes, black to white.** Computed, not typed:

- New pure `core/renderer/lib/themeOrder.ts`: `oklch(hex) -> { L, C }` (OKLab, Björn Ottosson's
  matrices) and `orderTermThemes(presets)`. Lightness is OKLab **L** (perceptual lightness, "the
  black or white scale"); a theme is **neutral** when the OKLab chroma **C** of its ground is below
  `NEUTRAL_CHROMA = 0.0125`. Each group sorts by L ascending; ties keep `TERM_PRESETS` order (stable
  sort), so Pitch stays before High Contrast.
- **The threshold is measured** (2026-10-10, the forty grounds): sorted by C, the grounds run 0
  (six pure greys), 0.0027 Mist, 0.0055 Volt, 0.0058 Catppuccin Latte, 0.0082 Paper, 0.0085 Prism,
  0.0109 Monokai, then **0.0147** Sage, 0.0149 Cinder and Blossom, 0.0157 Horizon and up to 0.1316
  Retro. 0.0109 to 0.0147 is the widest gap below 0.02, and 0.0125 sits in it. A unit test holds
  that no preset ground is within 0.001 of the threshold, so a new theme cannot land on the fence
  unnoticed.
- Neutral (12): Pitch, High Contrast, Volt, Prism, Campbell, PT Default, Graphite, Monokai, Gruvbox
  Dark, Mist, Catppuccin Latte, Paper. Coloured (28): the rest, from Phosphor (L 0.147) to Butter
  (0.967). Cinder (`#383c44`, a blue slate, C 0.0149) lands with the coloured: it is measurably as
  tinted as Blossom, and the rule is measured, not named.
- The fixed direction replaces `lightFirst` (the owner asked for one order). The leading cards stay
  as the owner set them (2026-09-22/23): **Custom, then the host's default (PT Default), then Follow
  style (Prism)**, then the computed order. In Prism, PT Default is not the default, so it takes its
  place among the neutrals.
- **Prism** gets the same order on its Terminal page's wall: the rule is about the terminal themes,
  which are the same forty in both apps, so it is right there too. Said in the PR.
- `docs/two-apps.md` (FORTY THEMES paragraph) gets the order rule.

---

## 3. Tab switching: Most recent (#158)

### Today

`src/renderer/src/App.tsx:538-540`: Ctrl+Tab / Ctrl+Shift+Tab call `stepTab(s, +-1)`
(`src/renderer/src/lib/tabs.ts:45-51`), strip order, wrapping; the Settings tab is a tab like any
other. `termHost.ts:70` claims Ctrl+Tab from xterm. There is no other next/previous chord
(no Ctrl+PageUp/PageDown). App shell only: nothing in `core/`, Prism unaffected.

### Decision

- Setting **"Tab switching"** (`tab-switch`), a Segmented control, **"In order"** (default) /
  **"Most recent"**, in Settings > Appearance > Window, right after Tab style (the strip's other
  rows). Sub at rest "Where Ctrl+Tab goes next."; live sub "Ctrl+Tab follows the strip." /
  "Ctrl+Tab goes to the tab you used last." Icon `key`. Store `prism.window.tabSwitch`
  (`'order' | 'recent'`, anything else reads 'order'), in a new `src/renderer/src/lib/tabSwitchPrefs.ts`
  shaped like `tabWidthPrefs.ts`. Never touched: In order, so nobody's keys change on update.
- In **Most recent**, Ctrl+Tab and Ctrl+Shift+Tab walk the most-recently-used list, as browsers and
  VS Code do:
  - The first Ctrl+Tab of a hold goes to the tab used before this one; each further Tab while Ctrl
    is held goes one further back; Ctrl+Shift+Tab goes the other way (from the far end on a fresh
    hold). Wraps.
  - The list is SNAPSHOT at the first press and only reordered when **Ctrl is released** (keyup of
    Control, or the window losing focus): then the tab landed on moves to the front. So a single
    Ctrl+Tab flips between the last two tabs, and repeated presses walk instead of ping-ponging.
  - Any other activation (a click, Ctrl+1..9, Ctrl+T, Ctrl+, , a close handing over) moves the tab
    in front to the head of the list at once. Any other Ctrl chord pressed during a walk ends the
    walk first (commit), then acts.
  - Closed tabs leave the list; new tabs enter it (at the front, as they are activated). At launch
    the list is the active tab, then the rest in strip order (not persisted: history across launches
    is not a thing the owner asked for). The Settings tab takes part, as in In order.
  - Under a close question or the update window the chords still do nothing (rule from #10).
- Pure `src/renderer/src/lib/tabMru.ts`: `touchMru`, `syncMru(mru, tabIds, activeId)`,
  `startWalk`, `stepWalk`, `walkTarget`. App holds the list and the walk in refs and listens to
  keyup (capture) and window blur. In order keeps `stepTab` exactly.
- Regression rule 10 is untouched: this listens to the Control keyup only, never to `onData`.

---

## What changes where

**core/ (ships to Prism; bump 0.31.0):**
- `lib/seeThrough.ts` (new), `lib/termLook.ts` (`termGroundAlpha` default, `termAcrylicInForce`),
  `lib/themeOrder.ts` (new).
- `settings/sections/opts.ts` (`acrylicLabel`, `acrylicSub` for High Contrast),
  `settings/sections/TerminalThemeSection.tsx` (label, row above `afterTheme`, High Contrast off),
  `settings/TerminalAppearance.tsx` (label; legacy, Prism-only in practice), `settings/coreIndex.ts`
  (label), `settings/theme/ThemeWall.tsx` (order; editor alpha cap and in-force acrylic),
  `settings/theme/useTermSetup.ts` (dirty check by the same rule).
- Prism-visible effect: only the terminal theme wall's order. Everything else is gated on
  `acrylic.kind === 'window'`, or is a host's own rows.

**src/ (PT only; app 0.37.0):** `App.tsx` (paintChrome reads `termAcrylicInForce`; MRU),
`lib/tabMru.ts`, `lib/tabSwitchPrefs.ts` (new), `components/settings/AppearancePage.tsx`
(Background alpha in force and cap; Tab switching row), `appOptions.ts` (`tab-switch`),
`settingsIndex.ts` (`ROW_ORDER`).

## Tests

Unit (vitest):
- `core/renderer/lib/seeThrough.test.ts`: dark and light bytes, the 0.4 luminance edge, a
  see-through hex reads its own opaque colour.
- `core/renderer/lib/termLook` / `host.test.ts`: window host + switch on + preset = default alpha
  (dark preset 0xb9, light preset 0xd1); picked Background with alpha keeps it; switch off = 1;
  style host (Prism) unchanged; High Contrast in force = acrylic not in force.
- `core/renderer/lib/themeOrder.test.ts`: permutation of the input; every neutral before every
  coloured; L non-decreasing in each group; the measured neutral list exactly; no ground within
  0.001 of the threshold; the full id order as a snapshot; stable on ties.
- `core/renderer/settings/sections/opts` test: label and sub per host kind.
- `src/renderer/src/lib/chromeTheme.test.ts`: every preset at its default see-through alpha, text
  4.5:1 on the composite.
- `src/renderer/src/lib/tabMru.test.ts`: touch, sync (closed leave, new enter), single flip, walk
  three back, Shift walks the other way, wrap, a walk over a list of one does nothing.
- `src/renderer/src/lib/tabSwitchPrefs.test.ts`: default, validation, notify.
- `appOptions.test.ts` / `settingsCopy.test.ts` / settingsIndex order test: the new row.

e2e (`tools/e2e/run.mjs`):
- New **`seeThrough`**: on a dark preset, the switch alone paints `--p-bg` at alpha `b9`; on Paper
  at `d1`; the Background picker's Alpha reads 73 / 82 and is capped at 95; a picked alpha of 60
  wins; off is solid; High Contrast shows the row disabled and the window solid; the row's label is
  "See-through window" and it sits right under the wall; screenshot `.e2e-shots/see-through.png`.
- New **`tabSwitch`**: default In order still steps the strip; set Most recent; visit A, B, C;
  Ctrl+Tab lands on B, again on C (no ping-pong); hold Ctrl, Tab, Tab lands on A, release; then
  Ctrl+Tab goes to C; Ctrl+Shift+Tab walks the other way; closing a tab removes it; a new tab enters.
- **`themeCards`**: the wall's DOM order equals `[pt-default, ...orderTermThemes(rest)]` (Custom
  absent in a fresh profile); keeps the `theme-wall.png` screenshot.
- **`settingsLook`** (line ~3572 `want`): Appearance rows gain `tab-switch` and `term-acrylic` moves
  up; the acrylic contrast check now runs over real glass.
- **`options`**: picks up the new app row from `APP_OPTIONS`; adjust if it hardcodes the theme
  section's slot order.

Gate scenarios: `seeThrough tabSwitch themeCards themeSwitch settingsLook settingsSearch
settingsKeys options opacityAlpha accent pickedGround colourPicker theme reviewKeys tabWidth
tabStyle`, then the full `npm run e2e` once, alone. LOOK at `.e2e-shots/settings-appearance-*.png`,
`see-through.png` and `theme-wall.png`.

## Docs

- `README.md`: features row "Themes that dress the window" says see-through window; the keys table
  `Ctrl+Tab` row says "next / previous tab, in strip order or most recently used".
- `docs/two-apps.md`: the theme order rule (FORTY THEMES paragraph); the #114 paragraph gets "on
  means see-through: an opaque ground under the switch paints Prism's levels"; the Appearance order
  line (the see-through row now under the wall).
- `core/README.md`: the acrylic contract paragraph (default see-through, `seeThroughAlpha`,
  `termAcrylicInForce`, `acrylicLabel`), and `orderTermThemes`.
- `docs/regression-rules.md`: new entry **"Most recent commits on Ctrl release"** (the walk is a
  snapshot; the order updates only when Ctrl is released or the window loses focus; held by
  `tabMru.test.ts` and the `tabSwitch` e2e).
