# Settings redesign, both apps: spec and plan (2026-10-05)

One document for one approval: the design (part 1 and 2), the plan (part 3), and what is left
to decide (part 4).

**Approved look.** Version 1, "Grouped cards": `v1-grouped-cards/settings.html`, `notes.md` and
`shots/` in this folder, with the owner's one change: **no accent bar on the chosen rail item**.
The chosen page is a grey fill, bold text and a brighter icon. Labels come from `renames.md` as
v1 uses them.

**Read for this document (2026-10-05):** PrismTerminal `main` at `6266aa4` (app 0.30.0, core
`0.24.0`): `core/README.md`, `core/renderer/host.ts`, `core/renderer/settings/*`,
`core/shared/settingsCopy.ts`, `core/shared/dictationCatalog.ts`,
`src/renderer/src/components/Settings.tsx`, `tools/e2e/run.mjs`, both CLAUDE.md files. Prism
`origin/main` at `47ece4e` (0.87.0, pinned to `core-v0.24.0`; the local checkout is 7 commits
behind): `src/renderer/src/components/Settings.tsx`, `WinEShortcutSetting.tsx`,
`settingsCopy.test.ts`, `tools/e2e/run.mjs` (`termOptions`, `termColourPicker`, `dictationPage`,
`noCommandHelp`), its CLAUDE.md (#202 neutral controls, #272 no focus boxes, the terminal gate).
Plus this folder's `inventory.md`, `renames.md` and the v1 mockup's CSS and script.

**What changed since the mockup was drawn.** The mockup read core `0.23.0`. Core `0.24.0` (#131)
added two terminal rows the mockup does not show: `agent-failed-on` ("Failed indicator") and
`agent-hooks` ("Exact status from Claude Code"). Both are placed below (Agents page). Nothing
else in either app's settings changed.

---

## Part 1. Spec

### 1.1 What stays the same

- **Every behaviour.** Each control writes the store it writes today, with the same values.
  Nothing is added, removed or merged as a setting. The theme switch question, Save changes as
  Custom, the colour picker, the model manager, the Explorer verb read back from the registry,
  the Win+E helper status: all unchanged.
- **Every storage key and every stored value.** No `localStorage` key, settings file field or
  registry value changes name or form. Where a control changes TYPE, it maps onto the old values:
  "Show title bar" is a switch that writes `shown` / `hidden` to `prism.window.titleBar` (PT) and
  Prism's own title bar store, exactly as the segmented control did. A snapshot test per app
  freezes the list of keys (section 3, tasks 1.4 and 2.2).
- **Every row id.** `data-pref="<id>"` stays on every row that has one today, and the core's
  lists (`TERMINAL_OPTIONS`, `DICTATION_OPTIONS`, `HELP_OPTIONS`) keep their ids. Prism's own rows,
  which carry no `data-pref` today, get one (ids in 1.4.2; DOM only, not storage).
- **The DOM contracts both apps' e2e read:** `[data-settings-page]`, `[data-term-card]`,
  `[data-save-term]`, `[data-theme-wall-toggle]`, `[data-theme-switch-ask]`, `[data-theme-editor]`,
  `[data-follow-theme]`, the colour picker's contract (`core/README.md`), `[data-dictation-settings]`,
  `[data-dictation-item]`, `[data-item-name]`, `[data-item-badge]`, `[data-gpu-toggle]`,
  `[data-vendor]`, `[data-language-limited]`, `[data-seg]`, `[data-app-version]`, and also
  `[data-settings-tab=<page id>]` on every rail button (PT's e2e uses it about 40 times),
  `[data-use-home]`, `[data-choose-folder]`, `[data-edit-theme]`, `[data-save-custom]`,
  `[data-hotkey-capture]`, `[data-mic-meter]`, `[data-uninstall]`, `[data-state]`, `[data-active]`,
  `[data-owns-escape]`. New hooks: `[data-settings-section=<id>]` on every section and
  `[data-term-wall]` on the theme wall's block (neither exists today).
- **Neutral controls; only Save is accented** (PT #42, Prism #202). Still accented, since they are
  not buttons: Reset links, the chosen theme or style card, a dropdown's chosen item, a chosen
  swatch's ring, the Active, Enabled and Recommended badges, download progress, the hotkey capture while it
  listens, Prism's Win+E switch (its existing exception).
- **What changes about the accent:** the rail's chosen page. It was `--p-sel-bg` (PT) and
  `--p-sel-solid` (Prism, owner 2026-10-03 "more saturated"); the approved v1 replaces both with a
  grey fill. Both CLAUDE.md files are updated where they say the rail is accented.
- **Off means off** for dictation (rows dimmed and disabled while it is off) and command help (no
  button, no key, no row in Prism).
- **Settings remembers its page as today**, with the new page ids: in PT, App holds it while the
  Settings tab stays open (#123; in memory, nothing saved, so no old `'general'` value needs
  mapping); in Prism, the always-mounted `Settings` overlay holds it in its own state across
  open and close.

### 1.2 The look

All measurements are the v1 mockup's, translated onto the `--p-*` tokens both apps already define.
**No new CSS variable** is introduced (the core's README: a new token must be added to both apps).
Derived colours are `color-mix()` inside the core's classes.

**Frame.**
- Rail 244px wide, padding 18px 12px 12px, the chrome's own ground (`--p-side`), a 1px
  `--p-divider` rule on its right.
- Rail title "Settings": Segoe UI Variable Display, 15px, bold, letter-spacing -0.01em, 12px
  under it.
- Pane: the ground (`--p-bg`), scrolls with the hidden scrollbar of `.p-scroll`. Inner column
  max-width 960px, padding 26px 44px 64px.
- Page header: h2, Segoe UI Variable Display 24px bold, letter-spacing -0.02em, line-height 1.15.
  An optional control at its right end (Prism's Media switch).
- The settings font stays the system stack whatever the theme or style says (both apps' existing
  rule).

**Rail items.** Height 36px, padding 0 10px, radius 6px, gap 11px, 13px weight 500, text
`--p-text-soft`, icon 17px in `--p-dim`. Hover: `--p-hover` fill, `--p-text`. **Chosen:**
`--p-hover-hi` fill, weight 600, text and icon `--p-text`, `aria-current="page"`. No bar, no
accent. About sits at the bottom, after a flexible spacer. PT's old "Prism Terminal" footer word
goes (About says it).

**Find a setting.** At the top of the rail, under the title, 14px above the first item. Height
32px, radius 6px, the section panel's fill (below; there is no `--p-panel` token) and a `--p-line` edge, a 14px magnifier at 10px from the left,
placeholder "Find a setting" in `--p-dim`, a clear button (20px, an X) at the right while there is
text. Focus: the edge goes a step lighter (`color-mix(--p-text 22%)`), the field rule of Prism
#272, never a ring.

**Section.** A heading, then one panel.
- Heading: h3, 13px weight 600, `--p-text-soft`, sentence case (no uppercase eyebrows), 8px above
  the panel, an optional action at its right (a tag, or Save changes).
- Sections are 26px apart; the first sits 18px under the page header.
- Panel: fill `color-mix(in srgb, var(--p-text) 3.6%, transparent)` over the ground, so it is one
  thin coat that works on glass and never a solid slab; edge 1px `--p-line`; radius
  `max(4px, calc(var(--p-radius) + 3px))`, so Prism's Corner roundness rounds the panels (Onyx 2px
  gives 5px, Ruby 14px gives 17px) and PT, whose `--p-radius` is 2px, gets 5px.
- Every edge reads `--p-line`, so PT's Edges setting (None, Faint, Hairline, Solid) reaches the
  panels too, as its rule for every edge in the window requires.

**Row.** A grid: 32px icon column, the text, the control.
- `grid-template-columns: 32px minmax(0,1fr) auto`, column gap 14px, min-height 58px, padding
  10px 16px 10px 14px.
- Between two rows, a 1px `--p-line` hairline that starts after the icon column (60px in) and
  runs to the right edge; a full-width block (a wall, a swatch grid, a model list) is ruled the
  full width.
- Icon tile 32 x 32, radius `max(4px, calc(var(--p-radius) - 1px))`, fill
  `color-mix(var(--p-text) 6%, transparent)`, a 16px stroke icon (stroke 1.7) in `--p-text-soft`.
- Label: 13px weight 600 `--p-text`, line-height 1.3.
- Subtext: 11.5px `--p-dim`, 2px under the label, ONE line, truncated with an ellipsis, its full
  text on the title attribute. A warning subtext is amber
  (`color-mix(#e0a84b 85%, var(--p-text))`) and leads with an 11px warning glyph.
- Control slot: right aligned, items 10px apart.
- `off` (a row that cannot be used now): icon, text and control at 45% and not clickable,
  `aria-disabled`.
- A row whose control is a switch is clickable as a whole (hover
  `color-mix(var(--p-text) 2.5%, transparent)`); the switch stays the one focusable control.

**Block.** A full-width part of a panel for what is not a row: the theme and style walls
(padding 14px 16px 16px), swatch grids, the model and GPU lists, the About card.

**Controls.** The core's existing ones, unchanged in size and colour: `Switch`, `Segmented`,
`Select`, `ROW_BUTTON`, `SaveButton`, `ColourField`, `RESET_LINK`. Two changes from the mockup,
both on the new rows only (task 1.2): the dropdown's menu blurs what is behind it and casts no
shadow (owner's popup rule, 2026-09-22), and focus is shown as in Prism #272 (Q1).

**Search results.** While the field holds text, the pane shows a page titled "Results": one panel
of result rows. Each has the row's icon, label and subtext, and at its right, in `--p-dim`, where
it lives ("Terminal, Text"). Words must all match (prefix match, case and accent folded) against
the label, subtext, section, page and the row's hidden keywords; label matches rank first. No
match: "Nothing matches <query>. Try a shorter word." in the panel. The rail shows no chosen page
while results are up. Choosing a result clears the field, opens the page (and Prism's Media view),
scrolls the row to the centre, flashes it (1.4s fade of a 16% `--p-accent-hi` fill; the flash is a
mark, not a button), and puts the keyboard on the row's first control.

**Motion.** The wall's expand (240ms) stays; the flash; nothing else moves. Under
`prefers-reduced-motion` neither runs.

### 1.3 Accessibility

- The rail is `<nav aria-label="Settings pages">` holding buttons; the chosen one has
  `aria-current="page"`. Up and Down move between rail items; Home and End jump to the ends.
- The page is a `<main>`-like region with the h2; every section is `<section aria-labelledby>`
  its h3.
- Every control is named by its row's label (`aria-label`) and described by its subtext
  (`aria-describedby`), so a screen reader hears the live state ("Needs a speech model before it
  works.").
- **Search is reachable and usable by keyboard.** The field is `type="search"`,
  `aria-label="Find a setting"`, `aria-controls` the results list. Down from the field moves to the
  first result; Up and Down walk the results; Enter opens one; Escape in the field clears it, and
  only an empty field lets Escape through to the host (Prism closes Settings on Escape, so its
  listener must yield while the field has text, as it yields to the colour picker today).
- A `role="status"` line says "3 results" or "No results", and **exists only while a query is
  typed**. An idle live region left on the page was a real bug before (PT #58: the copied badge sat
  in Prism's page as the first status region and broke Prism's own lookups).
- Contrast, measured in the e2e on a dark and a light theme in each app: label 4.5:1 and subtext
  4.5:1 against the panel composited on the ground; the warning subtext 4.5:1; the icon 3:1.
- Hit targets: rows are at least 58px tall; the find field 32px; rail items 36px.
- Works at the narrowest window: below 760px of the FRAME's own width (a container query, not a
  media query: Prism zooms the whole frame by Interface text size, and PT's page is a tab) the
  rail collapses to 56px icons, Prism's existing compact width (titles on hover and in
  `aria-label`), and the find field becomes a magnifier button that opens the field over the
  pane. Prism's existing compact rail (its title-bar toggle) is the same icon mode.

### 1.4 Information architecture

Notation: **Label** (`row id`), control: *subtext*. Subtexts are final text. Where a row carries
live state its variants are listed. All pass the `settingsCopy` rules (letters, digits, spaces,
commas and full stops only, no key names) and the new 8-word limit (task 1.4). Rows marked
**[core]** are the core's components and read the same in both apps; the rest are the app's own.

#### 1.4.1 Prism Terminal

Rail: Find a setting, **Appearance, Terminal, Agents, Dictation**, (spacer) **About**. Settings
opens on Appearance. The v1 mockup and its approval cover Prism only (its `notes.md` menu is
Prism's), so this PT layout is derived here, not yet seen by the owner (Q6).

**Appearance.** WINDOW COMES FIRST, the theme after it: PT's owner rules put what no theme owns
above the theme wall (2026-09-28: tab width and edges "should be above the themes") and Tab width
at the top of Appearance (#56). Keeping Tab width first leaves the `tabWidth` e2e's placement
check and both rules as they are.
- Section **Window**
  - **Tab width** (`tab-width`), Dynamic | Fixed: *Sized to the name, or all equal.*
  - **Show title bar** (`title-bar`), switch (on = Shown): *When off, tabs share the top row.*
  - **Panel edges** (`window-edges`), None | Faint | Hairline | Solid: *Lines between panels and
    around the window.*
- Section **Theme** [core, `TerminalThemeSection`]. In this app the terminal theme dresses the
  window (`followsHostStyle: false`), so its section lives on Appearance (Q2).
  - **Terminal theme** (`term-theme`), Save changes: *Colours of the terminal and the window.*
  - Block: Custom, PT Default, then the 40 themes; the pencil on the chosen card opens the colour
    editor; the chevron shows all themes.
  - **Background colour** (`window-background`), colour field with alpha, Reset when picked:
    *Behind the text in window and terminal.* With acrylic on: *Its alpha lets the desktop show
    through.* (PT's `afterTheme` slot, as today.)
  - **Accent colour** (`window-accent`), colour field with alpha, Reset when picked:
    *Highlights, the active tab and selection.* (`afterTheme` slot.)
  - **Acrylic terminal background** (`term-acrylic`) [core], switch: *The desktop shows through
    the window.* Without the material: *Needs Windows 11.*, row off.

**Terminal**
- Section **Shell** [core, `ShellSection`]
  - **Default shell** (`term-shell`), dropdown of detected shells: *New terminals start with this
    shell.*
- Section **Opening terminals**
  - **Folder for new tabs** (`newtab-mode`), Open in a folder | Ask where each time, plus "Use my
    user folder" and "Choose folder…" as today, the folder's path on the tooltip: *Opens in your
    user folder.* / *Opens in the folder you chose.* / *Asks for a folder each time.*
  - **Add to the Explorer menu** (`explorer-verb`), switch read back from the registry: *Open
    terminal here, on every folder.* While asking Windows: *Checking with Windows.*, switch
    disabled.
- Section **Text** [core, `TerminalTextSection`]
  - **Terminal font** (`term-font-family`), dropdown in each face: *The typeface inside every
    terminal.*
  - **Terminal text size** (`term-font`), 50% to 200%: *Text size for every terminal.*
- Section **Command help** [core row, `HelpSection`]
  - **Command help** (`help-enabled`), switch: *Find a command by describing it.*

**Agents**
- Section **Tab marks** [core, `AgentMarksSection`]
  - **Agent working indicator** (`agent-indicator`), Off | Minimal | Full: *No mark while an agent
    works.* / *A line under the tab while it works.* / *The whole tab fills while it works.*
  - **Mark tabs when an agent finishes** (`agent-done-on`), switch: *Stays until you open the
    tab.*
  - **Mark tabs when an agent asks** (`agent-question-on`), switch: *Stays until you answer or
    open it.*
  - **Mark tabs when an agent fails** (`agent-failed-on`), switch: *When it stops on an error.*
  - **Count marked tabs on the taskbar** (`taskbar-badge`), switch: *A number on the taskbar
    button.* (PT's row, through the section's `after` slot.)
- Section **Claude Code** [core, `ClaudeCodeSection`]
  - **Exact status from Claude Code** (`agent-hooks`), switch: *Applies to terminals opened after
    a change.*
- Section **Mark colours** [core, `MarkColoursSection`], Save changes in the heading (Q3)
  - **Agent working colour** (`agent-color`): *Follows the accent.* / *Your own colour.*
  - **Agent finished colour** (`agent-done-color`): *Follows the theme green.* / *Your own colour.*
  - **Agent question colour** (`agent-question-color`): *Follows the theme.* / *Your own colour.*

**Dictation** [core, the whole page; identical in Prism]
- Section with no heading:
  - **Use dictation** (`dictation-enabled`), switch: *Speech to text on this PC, never sent.* On
    with no model installed, as a warning: *Needs a speech model before it works.*
- Section **Listening** (rows off while dictation is off)
  - **Key behaviour** (`dictation-mode`), Hold | Toggle: *Runs while the key is held.* / *One
    press starts, the next stops.*
  - **Dictation key** (`dictation-hotkey`), the key capture and its Reset: *Text is pasted at the
    cursor.*
  - **Microphone** (`dictation-mic`), level meter, Test, device dropdown: *Test it to see the
    level.* / *Microphone access was refused.* / *No working microphone was found.*
  - **Spoken language** (`dictation-language`), dropdown, with the globe mark: *The language you
    speak.* With a model that picks its own: *This model detects the language itself.*
- Section **While dictating**
  - **Pause media while dictating** (`dictation-pause-media`), switch: *Resumes when you stop.*
  - **Play start and stop sounds** (`dictation-sounds`), switch: *A short sound as the microphone
    opens.*
- Section **Speech models** (`dictation-model`), tag "Shared by both apps" in the heading; a
  block of model rows (vendor mark, name, size, badges, note, Download / progress and Cancel /
  Use and Uninstall). Notes, which are each row's subtext:
  - Whisper Base: *Fast live text on any PC.*
  - Whisper Small: *More accurate, about three times slower.*
  - Parakeet v3: *Fast and accurate, in fewer languages.*
  - Whisper Large v3 Turbo: *Close to Large v3 at half the download.*
  - Whisper Large v3: *The most accurate.*
  - Without the GPU pack, on the two large models, as a warning: *Slow without GPU acceleration.*
  - A failure replaces the note: *The download failed.* / *The file failed its check and was
    deleted.* / *It could not be written to disk.* / *It could not be unpacked.*
  - The two e2e-only entries: *For the automated tests only.*
- Section **GPU acceleration** (`dictation-gpu`, only with an NVIDIA adapter): one model row,
  NVIDIA GPU acceleration, 675 MB, Enable / Disable: *Large models answer in under a second.*
  After a failed start: *It could not start, the CPU is used.*
- The two intro sentences under Models and GPU acceleration go; the GPU note's "CUDA 12.4" goes
  with them (the row says what it does, not what it is).

**About**
- Block: the app's real icon (56px), "Prism Terminal", and one line: "A tabbed terminal for AI
  command line tools."
- **Version** (`app-version`): *The version you are running.*, the version as a tag.

Nothing dropped: all 32 rows of today's three pages are above (6 General, 17 Appearance,
9 Dictation), plus the theme editor, the show-all toggle and the folder buttons.

#### 1.4.2 Prism

Rail: Find a setting, **Appearance, Explorer, Terminal, Agents, Dictation, Media**, (spacer)
**About**. Settings opens on Appearance. The compact rail (title-bar toggle) and the page zoom
(Interface text size) are kept.

**Appearance**
- Section **Theme**
  - **Colour mode** (`mode`), Dark | Light: *Dark and light each keep their own style.*
  - **App theme** (`style-theme`), Save changes: *Edits below change the chosen style.*
  - Block: the style wall of the current mode, then saved presets.
- Section **Colours of <style name>**
  - **Viewer background** (`c-bg`): *Behind the file you are viewing.*
  - **Sidebar and tab bar colour** (`c-chrome`): *Also used for the title bar.*
  - **Accent colour** (`c-accent`): *Buttons, progress, visualizer and chosen cards.* (The mockup's
    "Chosen page" is no longer true: the rail is grey now.)
  - **Selection colour** (`c-selection`): *Tint of selected files and places.*
  - **Text colour** (`c-text`): *File names, labels and readouts.*
  - **Folder icon colour** (`c-folder-icon`): *Folder icons in the file tree.*
- Section **Text**
  - **App font** (`c-font`): *The typeface used across the app.*
  - **Interface text size** (`tree-size`): *Sidebar and settings text.*
- Section **Window**
  - **Show title bar** (`title-bar`), switch: *When off, tabs share the top row.*
  - **Tab width** (`tab-width`): *Sized to the name, or all equal.*
  - **Panel edges** (`c-edges`), None | Faint | Hairline | Strong: *Lines between panels and around
    the window.*
  - **Corner roundness** (`c-corners`), Square | Soft | Round: *How round the larger surfaces
    are.*

**Explorer**
- Section **Layout**: **Sidebar position** (`tree-side`): *The side the file tree sits on.*
  **Explorer row size** (`explorer-size`): *Row height, with text and icons.* **Scroll to the
  open file** (`auto-scroll`): *The tree follows the file you view.*
- Section **Opening things**: **Folder for new tabs** (`newtab-mode`): *Where a new tab starts.*,
  with a chosen folder *Opens in the folder you chose.* **First view of a new project**
  (`newtab-show`): *What a folder opened as a project shows.* **View for files from Windows**
  (`open-external`): *How files opened from Windows appear.*
- Section **When Prism starts**: **Reopen tabs at start** (`remember-tabs`): *Brings back the tabs
  from last time.* **Remember recent folders** (`remember-folders`), Clear and switch: *Kept only
  on this PC.*
- Section **Windows**: **Open in place of File Explorer** (`win-e-shortcut`, the control's
  existing element id), the accented switch: *A small
  helper starts with Windows.*, replaced by its status when there is one: *Checking with
  Windows.* / *Another Prism installation or profile controls this shortcut.* / *The shortcut
  helper is not running.* / *Could not check the Windows shortcut.* / *Could not change the
  Windows shortcut.* **Add to the Explorer menu** (`explorer-verb`): *Open files and folders in
  Prism.* / *Checking with Windows.* **Default app for file types** (`default-apps`), Choose in
  Windows: *Windows keeps this choice.*

**Terminal** [core sections, the same components as PT]
- **Shell**: Default shell. **Text**: Terminal font, Terminal text size. **Theme**: Terminal
  theme (*Colours of the terminal text and ground.*), the wall with Follow style, Acrylic terminal
  background (*The desktop shows through the terminal.*). No `afterTheme` rows, no command help.

**Agents** [core sections]: Tab marks (four rows, no taskbar row), Claude Code, Mark colours, all
as in PT.

**Dictation** [core page]: as in PT.

**Media**, with a Visualizer | Progress bar switch in the page header (the view is remembered
while Settings is open):
- Visualizer view. Section **Visualizer style** (`viz-style`): the 12 cards. Section
  **Visualizer colour** (`viz-colour`): Solid and Gradient swatch grids, then **Glow**
  (`viz-glow`): *A soft glow around the shapes.* **Cycle** (`viz-cycle`): *The colours shift hue
  over time.* **Move** (`viz-move`): *The colours slide across over time.* (Read from
  `lib/viz/core.ts`: cycle rotates the palette's hue, move scrolls it across the visual.)
- Progress bar view. Section **Progress bar style** (`transport-style`): Line, Compact, Waveform,
  Segmented groups. Section **Behind the controls**: **Control band opacity** (`transport-bg`),
  readout and slider: *A solid band behind the controls.* at 100, *No band, the picture runs to
  the bottom.* at 0, else *How solid the band behind the controls is.* Section **Progress bar
  colour** (`transport-colour`): swatches, then Glow, Cycle, Move (`transport-glow`,
  `transport-cycle`, `transport-move`) with the same subtexts.

**About**: block with Prism's real icon, "Prism", "A quick viewer for images, video, audio and
documents."; **Version** (`app-version`, from `appVersion()`): *The version you are running.*;
**Setup guide** (`show-setup`), Show setup again: *The first run steps, from the start.*

Nothing dropped: every row of `inventory.md` sections 3.1 to 3.7 is above, plus the two #131 rows.

### 1.5 Where live state appears

In the row's subtext, always, so a sighted user and a screen reader get the same words:
dictation's model warning, the microphone errors, the limited-language line, a model's failure or
GPU warning (amber, with the glyph), the GPU fall-back, the Explorer verb's "Checking with
Windows", Prism's Win+E status, the folder for new tabs, the band opacity, the indicator's chosen
style, a colour row following the theme or not, acrylic without the material. The Reset link still
marks a picked colour. Nothing is moved into tooltips (renames.md suggested the Win+E status as a
tooltip; the subtext holds it now, which is what the owner's decision says).

### 1.6 Parity: what the tests hold

- **Options lists, extended.** Every entry of `TERMINAL_OPTIONS`, `DICTATION_OPTIONS` and
  `HELP_OPTIONS` gains `section`, `icon`, `sub` (its default subtext, also what search reads) and
  optional `keywords`, as FLAT string fields. Prism's gate parses `options.ts` as text with
  `\{\s*id: '([a-z-]+)'[^}]*\}`, so an entry must never contain a brace; a new core test says so.
  The labels in the lists become the new labels. The list's ORDER does not change in PR 1: it is
  already the display order within every new section (shell; font, size; theme, acrylic;
  indicator, done, question, failed; hooks; the three colours), which keeps Prism's current gate
  green during the bump (section 3).
- **Order is checked per section, not per page.** Each app's e2e (`options` in PT, `termOptions`
  in Prism) reads each core section (`[data-settings-section]`) top to bottom and asserts the
  list's order inside it, that the section is one panel, and that every listed row is shown
  somewhere. Which PAGE holds a section is the host's: PT puts the theme on Appearance, Prism on
  Terminal (Q2).
- **Each app's own rows are a closed list** in a new `appOptions.ts` (id, label, sub, section,
  page, icon, keywords, and where the value lives: a `localStorage` key, Prism's settings file
  field, `registry`, or `null` for a row that stores nothing such as Version). The e2e's hard-coded `own` list goes; anything on the page
  that is in neither list is a fork, as before.
- **Copy rules, ADDED BESIDE the old ones, never inside them.** Prism's unit suite on the
  automatic bump calls the core's `copyProblem` and `settingsDescriptions` over Prism's current
  pages, whose hints run to 11 words ("The colour of the chosen page, buttons, progress bar and
  visualizer."), and the core's own legacy rows are as long. So both functions keep today's
  behaviour exactly, and PR 1 adds:
  - `subTooLong(text)` (more than 8 words), a separate export;
  - `settingsListCopy(source)`, returning `{ labels, subs }` from `label:` / `sub:` fields of a
    list or `appOptions` file (it never feeds `settingsDescriptions`, which Prism points at files
    full of `label:` fields that are not setting labels);
  - labels get the symbol check but not the key-name check ("Tab width" names a tab, not the Tab
    key).
  The word limit applies to the NEW files only (lists, `layout/`, `sections/`, `appOptions.ts`),
  never to the legacy components of 2.2. The core's copy test and `options.test.ts` scan
  `core/renderer/settings` RECURSIVELY and include the `.ts` lists; today both read only the
  folder's top level, so `sections/` would go unchecked. Both apps' copy tests read their new
  files.
- **Search index honesty.** A new e2e scenario in each app types every indexed row's label, opens
  the first result, and asserts that `[data-pref=<id>]` is on screen, flashed and holding the
  focus. A row that is not drawn on this PC (the GPU row without NVIDIA, help in Prism) is not in
  the index: the index is built with the same `dictationOptionIds` / `terminalOptionIds` inputs.
  A row that is drawn late (Default shell renders nothing until main lists the shells) is waited
  for: `flash.ts` retries until the row exists, up to 3 s, then lands on its section.

### 1.7 What moves between core and app

Into the core (`core/renderer/settings/`), because both apps would otherwise each write it and it
must look the same in both (the core's own test for what belongs there):
- The frame (rail, find field, results page, pane, header), the section, the row, the block, the
  row icon set, the search, the flash.
- The terminal sections as separate components: `ShellSection`, `TerminalTextSection`,
  `TerminalThemeSection`, `AgentMarksSection`, `ClaudeCodeSection`, `MarkColoursSection`,
  `HelpSection`, and the Dictation page rebuilt on the new parts.

Stays in each app: which pages exist and in what order, which section goes on which page, every
row that is not terminal or dictation (PT: window, new tabs, Explorer verb, taskbar, background
and accent, version; Prism: style, explorer, media, about), the About content, the page memory,
Prism's compact rail toggle and zoom.

---

## Part 2. Shared component design

### 2.1 New core files

```
core/renderer/settings/
  layout/SettingsFrame.tsx     rail, find, results, pane; props only
  layout/SettingsSection.tsx   heading + panel
  layout/SettingRow.tsx        icon, label, sub, warn, off, control slot
  layout/SettingBlock.tsx      full-width part of a panel
  layout/icons.ts              path strings by name (from the v1 mockup's set)
  layout/search.ts             pure: index, normalise, match, rank
  layout/search.test.ts
  layout/flash.ts              scroll to a row, flash it, focus its control
  sections/ShellSection.tsx
  sections/TerminalTextSection.tsx
  sections/TerminalThemeSection.tsx
  sections/AgentMarksSection.tsx
  sections/ClaudeCodeSection.tsx
  sections/MarkColoursSection.tsx
  sections/HelpSection.tsx
  sections/DictationPage.tsx
  theme/ThemeWall.tsx          the wall, cards, editor, ask: extracted from TerminalAppearance
  theme/useTermSetup.ts        dirty check and Save as Custom, shared by both Save buttons
  dictation/useDictationState.ts  extracted from Dictation.tsx
```

Interfaces (props only; none reaches a bridge but through what it already uses, `termApi()` and
`dictationHost()`):

```ts
interface SettingsPageDef { id: string; label: string; icon: string }
interface SettingsIndexEntry {
  id: string; page: string; view?: string; section: string
  label: string; sub: string; icon: string; keywords?: string
}
function SettingsFrame(p: {
  pages: SettingsPageDef[]; page: string; onPage(id: string, view?: string): void
  index: SettingsIndexEntry[]; title: string; headerAction?: ReactNode
  compact?: boolean; children: ReactNode
}): JSX.Element
function SettingsSection(p: { id: string; title?: string; action?: ReactNode; children: ReactNode }): JSX.Element
function SettingRow(p: {
  id: string; icon: string; label: string; sub?: string; warn?: boolean
  off?: boolean; tap?: boolean; children: ReactNode
}): JSX.Element
function SettingBlock(p: { full?: boolean; children: ReactNode }): JSX.Element
```

The row's prop is named `sub` on purpose: `settingsDescriptions` already scans `sub=`, so every
literal subtext in either app is checked without a new parser. Rows are written with a literal
id (`<SettingRow id="term-shell"`) so `options.test.ts`'s "names every row" scan still finds them;
its regex today matches only `<Pref id=` and `data-pref=` and gains `<SettingRow\s+id=`.

Sections take slots where a host adds rows, as `TerminalAppearanceSettings` does today:
`TerminalThemeSection({ afterTheme?, onThemePicked? })` (PT: Background and Accent; Prism:
nothing), `AgentMarksSection({ after? })` (PT: the taskbar row), `MarkColoursSection` and
`TerminalThemeSection` both render `SaveButton` from `useTermSetup()`, so either saves the same
whole setup and both light together.

### 2.2 Kept for the transition, removed in PR 3

`Pref`, `ThemeHead`, `ROWS`, `TerminalAppearanceSettings`, `AgentIndicatorSetting`,
`AttentionSettings`, `ShellSetting`, `HelpSetting` and the old `DictationSettings` view stay
exported and render exactly as today (old labels, old look) until Prism no longer imports them.
They are rebuilt on the extracted pieces (`ThemeWall`, `useTermSetup`, `useDictationState`), so
there is one copy of every rule and two layouts of it for a few days, not two copies of the code.

### 2.3 TermHostConfig

**No new field is needed.** Every difference the pages have is already declared or is a prop:
the theme row's subtext and Follow style card (`followsHostStyle`), the acrylic subtext and the
Background alpha (`acrylic.kind`), which rows a host adds (section slots), which page holds a
section (the host's own page code), Prism's compact rail (a frame prop). If the owner prefers a
different answer to Q1 per app, that WOULD be a new field (`focusStyle`), an owner decision.

---

## Part 3. Plan

### 3.0 Order of PRs, and why

1. **PT PR (core + PT page).** The core change is ADDITIVE: new components beside the old ones,
   list fields added, list order kept. PT's page moves to the new components. Core `0.24.0` to
   `0.25.0`, PT `0.30.0` to `0.31.0`.
2. **Automatic Prism bump PR** from `core-release.yml`: pin `core-v0.25.0`, Prism minor bump. It
   stays green because nothing Prism imports changed behaviour: `termOptions` still finds the 13
   rows in `[data-terminal-settings]` in the list's order (its regex tolerates the new flat
   fields), `termColourPicker` still finds "Pick Working colour" and a popover named "Working
   colour", `dictationPage` reads only ids, names, vendors and badges, and Prism's unit suite
   (`settingsCopy.test.ts` calls the core's `copyProblem`) sees the same rules. It auto-merges.
   NOT quite invisible: the catalogue notes and the download failure texts are shared data, so
   Prism's legacy Dictation page shows the new shorter notes from this release on (the same words
   PT shows, so parity holds there).
3. **Prism PR.** Prism's page rebuilt on the new components; its gate scenarios updated in the
   same PR. Prism minor bump.
4. **PT cleanup PR.** Removes the legacy exports (2.2) once Prism's main imports none of them
   (checked with `git grep` in Prism first). Core minor bump; no PT version bump (nothing a user
   sees). Its automatic Prism bump is a no-op and gates itself.

**Why the order must be this way.** An in-place core change would turn the automatic bump red on
three counts: Prism's `Settings.tsx` stops compiling (`withIndicator` and the old exports gone),
`termOptions` finds the agent rows outside `[data-terminal-settings]`, and `termColourPicker`
looks for "Pick Working colour", which becomes "Pick Agent working colour". The other way round
(a release candidate cut from PR 1's branch, Prism PR pinned to it and merged first) also works,
but releases Prism on an rc pin and needs a manual merge order; the additive route needs neither
(Q5).

Between steps 2 and 3, PT shows the new labels and Prism the old ones. That breaks "the same
names in both apps" for a few days; step 3 is opened as soon as the bump lands to keep it short.

### 3.1 PR 1: Prism Terminal (issue, then `feat/<n>-settings-grouped-cards`)

**Task 1.1 Layout primitives.** `layout/SettingsSection.tsx`, `SettingRow.tsx`, `SettingBlock.tsx`,
`icons.ts`. Tests: extend `neutralControls.test.ts` to read the layout files (no accent token but
the flash); a unit test that every icon name used by a list exists in `icons.ts`.

**Task 1.2 Frame, find and flash.** `layout/SettingsFrame.tsx`, `search.ts`, `flash.ts`; the
dropdown menu's blur-no-shadow and the #272 focus look on the new rows (Q1). Tests:
`search.test.ts` (every word must match, prefix, case and accent folding, label first, keywords,
empty query, nothing found).

**Task 1.3 Extract the shared pieces.** `theme/ThemeWall.tsx` and `theme/useTermSetup.ts` out of
`TerminalAppearance.tsx`; `dictation/useDictationState.ts` out of `Dictation.tsx`. The old
components recompose them with no visible change. Tests: the existing unit suite; the PT e2e at
this point, run before the page changes, must be green unchanged (it is the proof the extraction
changed nothing).

**Task 1.4 Lists and copy rules.** Add `section`, `icon`, `sub`, `keywords` to the three lists,
new labels. `settingsCopy.ts`: `subTooLong` and `settingsListCopy` as separate exports;
`copyProblem` and `settingsDescriptions` unchanged (1.6). Tests in `options.test.ts`: every entry
has section, icon and sub; entries contain no brace and never the word `onlyWhere` outside that
field (Prism's gate tests the entry text for it); every section id is a known section; the
storage keys snapshot (all three lists, frozen); copy and word limit for every label and sub; the
scans recurse into subfolders. Rewrite the catalogue `note:` fields and the `FAILURES` texts to
the 1.4.1 notes (the checksum one was "did not match its checksum").

**Task 1.5 Terminal sections.** `sections/*.tsx` as in 2.1, reading labels, icons and subs from
the lists. `MarkColoursSection` carries the second Save (Q3). Tests: `options.test.ts`'s
"names every row the sections render" now also reads `sections/` and matches `<SettingRow id=`;
`neutralControls.test.ts` also reads `sections/` and `DictationPage.tsx`.

**Task 1.6 Dictation page.** `sections/DictationPage.tsx` on `useDictationState`; model rows as a
block; subtext states as 1.4.1. `[data-dictation-settings]` on its root, every existing data
attribute kept.

**Task 1.7 PT's page.** Split `components/Settings.tsx` by page into
`components/settings/{Settings,AppearancePage,TerminalPage,AgentsPage,AboutPage,appOptions}.tsx|ts`
(one responsibility per file). `SettingsPage` becomes
`'appearance' | 'terminal' | 'agents' | 'dictation' | 'about'`; `App.tsx` defaults to and resets
to `'appearance'`. Title bar row becomes a switch over the same store. Tests: `appOptions.test.ts`
(unique ids, keys snapshot, copy and word limit); `settingsCopy.test.ts` reads the new folder.

**Task 1.8 e2e.** In `tools/e2e/run.mjs`:
- A helper `gotoPref(page, id)`: opens Settings, clicks rail pages until `[data-pref=id]` is
  there. The 24 scenarios that open Settings (accent, agentHooks, attention, colourPicker,
  dictation, dictationPage, dictationParakeet, edges, helpPanel, indicator, links, newTabFolder,
  opacityAlpha, options, pickedGround, reviewSettings, scrollbar, settingsPage, tabWidth, theme,
  themeCards, themeSwitch, titleBar, updateWindow) use it instead of fixed tab ids.
- Changed expectations: "Settings opens on Appearance" (`settingsPage`, which also reads
  `[data-settings-tab][aria-current]`, kept); Tab width stays the first row of Appearance
  (`tabWidth` unchanged in meaning, see 1.4.1); `titleBar` clicks the switch; `colourPicker`
  expects the swatch "Pick Agent working colour" AND the popover named "Agent working colour"
  (both follow the row label); `edges` measures the panel edge and a row hairline; `theme` shoots
  `[data-term-wall]` (new hook). Every `aria-label` a scenario matches on a renamed row is
  updated in the same commit (grep the old labels first).
- `options` rewritten: the three core lists shown, per-section order, each core section one
  panel, own rows a closed list from `appOptions.ts`, and the layout measured (card width at least
  150px, the wall wraps, row min-height 58px, icon tile 32px, panel radius `--p-radius` + 3px but
  at least 4px, hairline starting 60px in, no two controls overlapping).
- New `settingsLook`: on Pitch (dark), Paper (light) and with acrylic on: subtext and label 4.5:1
  on the composited panel, the chosen rail item's fill equals `--p-hover-hi` and is not the accent,
  the only accent-filled buttons are Save changes, no horizontal overflow at 900px and 1600px
  wide, the icon rail below 760px. Screenshots of every page in both schemes to
  `.e2e-shots/settings-<page>-<scheme>.png`, and LOOKED AT before the PR is called done (#20).
- New `settingsSearch`: every index entry found by its label and opened (1.6); keyboard only
  (focus the field, type, Down, Enter, the control focused); Escape clears; no `role="status"`
  without a query; "No results" path.
- New `settingsKeys`: Tab order field, rail, page; Up and Down in the rail; `aria-current`.

**Task 1.9 Docs.** `core/README.md`: the settings layout contract (components, DOM hooks,
`data-settings-section`, sections and their slots, flat list entries, legacy exports and their
end). PT CLAUDE.md: replace the paragraphs this changes (rail no longer accented, in "SETTINGS
CONTROLS ARE NEUTRAL"; the Appearance order in "WHAT NO THEME OWNS SITS ABOVE THE THEME WALL";
title bar a switch; theme on Appearance, agent rows on Agents; per-section order in "SETTINGS
DESCRIPTIONS ... ONE ORDER" and "THE TERMINAL'S SETTINGS ARE THE CORE'S TOO"), with a link to the spec,
which is copied to `docs/superpowers/specs/2026-10-05-settings-redesign-design.md`.

**Task 1.10 Versions and gates.** `core/package.json` 0.25.0 (CI `core-version`),
`package.json` 0.31.0. Gates: `npm test`, `npm run typecheck`, `npm run lint`, full
`npm run e2e`, screenshots reviewed. Then `npm run package`, kill `PrismTerminal` processes only
(never `PrismTerminalStable`), silent install, poll the exe, launch, report the version, hands-on
list 3.5. Then "merge?".

### 3.2 Automatic: Prism bump PR

Opened by `core-release.yml` on PR 1's merge. Expected green, auto-merges (`PRISM_AUTO_MERGE`).
If it is red, that is a hole to close FIRST as a gate scenario (the ratchet), then fixed in the
core with a patch.

### 3.3 PR 2: Prism (issue, then `feat/<n>-settings-grouped-cards`)

**Task 2.1 Pages.** Split `Settings.tsx` into `components/settings/{Settings,AppearancePage,
ExplorerPage,TerminalPage,AgentsPage,MediaPage,AboutPage,appOptions}.tsx|ts`, on the core's frame,
sections, rows and controls. Prism's own copies of `Switch`, `Segmented`, `Select`, `Pref`,
`Section`, `SaveButton`, `ThemeHead`, `ROW_BUTTON` go; the core's are used. `WinEShortcutSetting`
becomes a row (its status in the subtext, `role="status"` kept only while there is a status).
Media merges Visualizer and Progress bar with the header switch. About gets Version.
`data-terminal-settings` stays on the Terminal page's root and a new `data-agent-settings` on the
Agents page. The Escape listener yields while the find field has text.

**Task 2.2 Prism's tests.** `appOptions.test.ts` (ids, keys snapshot, copy, word limit);
`settingsCopy.test.ts` reads the new folder; `settingsControls.test.ts` and
`noFocusRings.test.ts` pointed at the new files; `theme.selection.test.ts` and CLAUDE.md lose the
rail's `--p-sel-solid`.

**Task 2.3 Prism e2e.** `termOptions`: the core rows across `[data-terminal-settings]` and
`[data-agent-settings]`, per-section order. `termColourPicker`: "Pick Agent working colour" and
the popover "Agent working colour", on Agents. `noCommandHelp`: unchanged in meaning. The seven
`Style` and three `General` clicks become Appearance and Explorer; the `Progress bar` click
becomes Media plus the header switch. Switches matched by their old names move to the new
labels: `[aria-label="Remember tabs"]` (Reopen tabs at start), `"Remember folders"` (Remember
recent folders), `"Prism in the Explorer menu"` (Add to the Explorer menu). New `settingsLook` and `settingsSearch` as in PT, plus Onyx (2px corners
give 5px panels), Ruby (14px give 17px) and Interface text size Large (zoom 1.12, nothing
overflows). Add `settingsLook` to `e2e:terminal`, runner-safe (no acrylic or material checks on
the runner; those stay in the local run), so a later core bump that breaks Prism's settings
layout is held by the gate.

**Task 2.4 Versions and gates.** Prism minor bump. `npm test`, typecheck, lint,
`npm run e2e:terminal`, full `npm run e2e`, screenshots reviewed, branch build installed for
hands-on. Then "merge?".

### 3.4 PR 3: Prism Terminal cleanup

Remove 2.2's legacy exports and their tests; drop the "kept for the transition" note from
`core/README.md`. Optionally reorder `TERMINAL_OPTIONS` to page order (harmless now: both apps
check per section). Core minor bump. Gates as 1.10 minus install. The automatic Prism bump must be
green.

### 3.5 Hands-on checks (both apps, on the installed branch builds)

- Every page in a dark and a light theme or style, and with acrylic on (PT) or Onyx (Prism): the
  panels read as one thin coat, nothing looks like a slab.
- Find a setting: type "font", "acrylic", "explorer", "colour"; keyboard only from the field to a
  control.
- Narrow the window below 760px: icon rail, search behind the magnifier.
- Prism: compact rail; Interface text size Large; the Win+E status line; the Media switch;
  Corner roundness on the panels.
- PT: Edges None to Solid on the panels; the theme switch question from both Save buttons;
  Settings tab memory across tabs.
- A screen reader pass (Narrator) on one page and on search results.

---

## Part 4. Risks and open questions

**Risks**
- Labels differ between the apps for the days between the automatic bump and PR 2. Kept short by
  opening PR 2 at once.
- Agent colours are saved by the terminal theme's Save, but now live on another page. Mitigation:
  the second Save on Mark colours (Q3).
- Prism's style-owned rows (App font, Panel edges, Corner roundness) now sit in sections beside
  global rows (Interface text size, Title bar, Tab width), all under "Edits below change the
  chosen style." Only the style's rows light Save, as today, but the subtext overstates it.
- The index can drift from the page; the search e2e opens every entry, which catches it.
- PT's panels are nearly square (5px, from its 2px `--p-radius`): expected, it follows the same
  rule as Prism's corners.

**Open questions for the owner**
- **Q1 Focus.** The new rows show keyboard focus as Prism #272 does (the hover fill; a field's
  edge a step lighter, no ring) in BOTH apps. PT today uses an accent edge on focused controls.
  Recommended: #272 in both. The alternative is a per-app `focusStyle` host field.
- **Q2 PT's terminal theme on Appearance.** In PT the theme dresses the whole window, so the Theme
  section (wall, Background, Accent, Acrylic) sits on Appearance, under the Window section, and
  Terminal holds shell, new tabs, text and command help. Recommended. Alternative: Theme on
  Terminal as in Prism, leaving Appearance with only the Window section.
- **Q3 Two Save buttons.** Mark colours gets its own Save changes, the same button as the theme's
  (both save the whole setup as Custom and light together). Recommended over a note under the
  colours.
- **Q4 Wording kept off the grammar.** "Acrylic terminal background" reads oddly in PT, where it
  is the window's material (its subtext says "the window"), and "Exact status from Claude Code"
  stays a noun phrase, as named in #131 today. Keep both?
- **Q5 Order of PRs.** Additive core plus a cleanup PR (recommended, 3.0), or a release candidate
  with Prism merged first.
- **Q6 PT's page was never mocked up.** The approved v1 is Prism's page. PT's five pages in 1.4.1
  are derived from it: Window above Theme on Appearance (PT's own rules), font and size on
  Terminal apart from the theme, agent rows on Agents. Approve as written, or see a PT mockup
  first? (Font and size are not part of Save changes since 2026-09-28, so splitting them from the
  wall costs nothing; the agent colours are, which is Q3.)
