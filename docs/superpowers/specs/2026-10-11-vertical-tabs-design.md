# Vertical tabs and the mono Ring (#162)

Date: 2026-10-11. Owner decisions are marked `(owner)`, in their words where they gave them.
Mockups: `research/prism-terminal/mockups/2026-10-11-vertical-tabs/` (`vertical-tabs-chosen.html`
is the approved one; `vertical-tab-styles.html` holds the 20 styles and 7 ring versions that were
looked at on the way).

## 1. What it is

- A setting, **Tab position**: Horizontal (the strip, the default, nobody's window changes) or
  Vertical, a sidebar down the window's left side. (owner: "we have a switch for horizontal and
  vertical and another for classic or powerline")
- The sidebar has **two tab styles, the same setting as the strip's**: Classic and Powerline, so the
  UI gains no new style names. (owner: "bracket and prompt, but call them classic and powerline")
  - Classic: one row a tab; the tab in front has a soft fill and the accent rule on the terminal's
    side (the mockup's "Bracket").
  - Powerline: each row an arrow pointing at the terminal; the arrow's edge carries the Minimal and
    Full marks, as the chevrons do on the strip (the mockup's "Prompt").
- **No outlined styles.** (owner: "none with borders, this also applies to the other tab styles")
- **Two states for the sidebar**, kept between launches (owner: "a sidebar you can have open as a
  static sidebar, or it can open as the cursor moves near it"):
  - Open: beside the terminal; its right edge drags to resize (150 to 420 px, 220 at first).
  - Collapsed: it takes no room and slides over the terminal while the pointer is at the window's
    left edge (8 px), 90 ms in, 340 ms grace out. The terminal never resizes, so the shell is not
    redrawn each time it shows.
- **The collapse button is a sidebar-panel glyph with a chevron, in the sidebar only.** (owner: "not
  a normal pin ... like a collapse sidebar icon"; "dont have the collapse sidebar button in the title
  bar only in the actual sidebar")
- **Title bar hidden with vertical tabs: no top row.** The bar slides down when the pointer reaches
  the top edge, with only command help, Settings and the window buttons, and goes when the pointer
  leaves. (owner: "the titlebar should be invisible, and only appear when your cursor is near the
  top"; of the app's name: "dont show this in the hidden titlebar"). The sidebar's head is then the
  window's handle. With horizontal tabs the hidden title bar is unchanged (#91).

### Follow-ups the same day (owner, 2026-10-11)
- **Superseded the same evening: no title bar at all.** The bar that slid down at the top edge could
  not be dragged by, and did not always come. Now, with vertical tabs and the title bar off, there is
  none: command help and Settings sit at the left of the sidebar's head, whose empty space moves the
  window, and minimize, maximize and close float at the top right on the terminal's ground, always
  there (owner: "no title bar at all on vertical tabs with it hidden, settings and command help move
  to sidebar and the exit minimize maximize buttons stay overlayed without a whole bar ... either
  buttons that show once your cursor is close or always persistent"; always, since an edge reveal
  was what did not hold, and a visually impaired user should not have to hunt for them). With no tab
  open there is no sidebar, so the start screen keeps #91's top row to move the window by.
- The collapsed sidebar's edge reveal also listens to MAIN (`src/main/edgeWatch.ts`, the cursor read from Windows while
  asked): on a window that is not maximized the outermost pixels are the resize border, where the
  page hears no pointer move, so the bar often did not come ("doesnt always appear ... maximized
  seems a bit more stable").
- The sidebar's resize grip shows one hairline, not a 6 px bar ("more minimalist").
- The title bar shows the app's icon in outline, in the accent, and no name ("just show the logo
  ... an outline box with the outlined art inside").

- **Only tabs at the top; every button at the foot** (owner: "the sidebar buttons should be near
  the bottom rather than the top. only tabs at the top"): the +, then (with no title bar) command help
  and Settings, then the collapse button. With no title bar the sidebar's empty space, below the tabs
  and between the foot's buttons, moves the window ("i cant drag the window ... maybe we need a title
  bar or some way to drag it"). The e2e asks Windows itself (WM_NCHITTEST) where a press moves the
  window.

- **A clear title bar, not the sidebar, moves the window** (owner: "there should be a title bar to
  drag from not the sidebar. how about making it transparent"): with vertical tabs and the title bar
  off, a 32 px row over the terminal only, in the terminal's own ground with no line and no name,
  holds the window buttons and moves the window. The sidebar's empty space no longer does. With the
  sidebar collapsed the row spans the window.

- **Final, the same night: the pop-out bar, done well** (owner: "a pop out title bar is best actually
  we just need to do it well ... like zen browser's title bar ... when the sidebar is open the
  titlebar drops down but only from the sidebar edge and all the way to the right ... make sure the
  titlebar area is usable for content"; his screen recording of Zen, `Videos/2026-10-11 23-26-24.mp4`).
  The terminal has the whole height; the bar drops over it within 16 px of the top, from the open
  sidebar's edge to the right (the whole width when it is collapsed), with only the window buttons,
  and moves the window while down. The clear bar is gone.
  - **Why the first pop-out bar could not be dragged** (measured with WM_NCHITTEST): it slid with a CSS
    transform, and Windows is told where a drag region is from the layout, so the region stayed where
    the slide started, above the window. It now slides by `top`; the collapsed sidebar slides by
    `left` for the same reason.
  - The sidebar shows within 24 px of the left edge (was 8), the bar within 16 px of the top, both
    after 60 ms (was 90) ("it reacts a bit too late ... could be better if it was like 20px further
    into the window").
  - A 36 px strip above the tabs moves the window ("the tabs should start a bit further down on the
    sidebar so that you can grab that area").

- **The bar and the sidebar stay under the hand** (owner: "my cursor can be on the titlebar and its
  disappearing ... i should be able to have the cursor 2-3 px off the titlebar before it
  disappears"; "if i have the cursor on the sidebar at the top of it it will disappear"). Cause: the
  dropped bar and the sidebar's grab strip are drag regions, where a press is Windows', so the page
  hears no pointer move and Windows tells it the pointer left. Main now streams the cursor while
  either can show, and one rule (`lib/revealZones.ts`) decides from it or the page's pointer: in at
  the edge zone, out only past the far edge plus 4 px. The e2e hands main a cursor (`__e2eCursor`,
  under --e2e only) and fails on the old code.

- **2026-10-12, from the surfaces mockup** (`sidebar-surfaces.html`; owner's pick: "A shade lighter",
  "Thin strip", medium buttons, regular icon line, on Pitch):
  - **A new setting, Secondary colour** (Appearance, under Background and Accent; "make that into a new
    setting called secondary colour ... so the user can pick their own, but this is the gold standard.
    make it fit with each theme"). Unpicked it is the theme's flat panel, the ground 4 percent toward
    the text (a step darker on a light theme), the token `--p-secondary`. It paints the vertical tabs'
    sidebar, their pop-out title bar and their title bar when shown; the horizontal strip is unchanged.
    A theme pick resets it, as it does Background and Accent; inks are held to it.
  - **No line under the pop-out bar** ("dont have a border on the titlebar on hidden").
  - **New tab is the tab list's last row, a tab's size** ("make new tab a button attached to the end
    of the tab list and the same size as a tab"). Superseded by the sidebar looks below.
  - **A thin grab strip, 16 px**: a 10 px one was nearly all Windows' resize border (WM_NCHITTEST
    answered HTTOP at its middle on a window that is not maximized).
  - Under Ring, a tab with no mark keeps the 12 px slot, so every name starts at one x.

- **No sidebar button; Ctrl+Shift+B** (owner, 2026-10-12: "dont show this collapse show button.
  instead bind the sidebar to a hotkey like ctrl b or ctrl s. not sure whats available"). Ctrl+B is
  Claude Code's (background a running task) and the shell's cursor-left; Ctrl+S is PowerShell's
  forward history search and the terminal's pause. Ctrl+Shift+B is free, VS Code's sidebar key with
  Shift, and is taken only while the tabs are vertical (`isSidebarChord`, termHost's `ownsKey`).

- **Light themes get a darker sidebar** (owner, 2026-10-12: "make sure that light themes have a
  darker sidebar, not white ... go through each"). Every preset was drawn beside its terminal; the
  4 percent step is right on every dark and grey one and reads as white on every light one, where
  10 percent is a clearly darker panel in the theme's own tint (all eleven). Inks are held to it, so
  on light themes `--p-dim2` and a hard accent move a step darker.

- **2026-10-12, later** (owner): the sidebar casts a shadow, a plane above the terminal; no app icon
  in the title bar for now (the outline mark of #185 is in git history); Help and Settings stay in
  the title bar, the dropped one included, so the sidebar has no foot ("that way it stays consistent
  at all times"); Secondary sits above Accent; the window colours (Background, Secondary, Accent) are
  changes to save: Save changes lights in the accent, Save keeps them with Custom, Custom brings them
  back, and a theme switch asks before dropping them (core: `TerminalThemeSection` and `ThemeWall`
  take `extraDirty` / `onSaved`, `onThemePicked` says which card).
- **Light themes, readable controls** ("white themes having like a very light gray color for buttons"):
  the dim text and icons are held to the body floor (icons a step darker), the hint ink too, the off
  switch's track is a mid grey, and a pressed segment is a dark pill with the ground's ink
  (`--p-pressed`, `--p-pressed-ink`; a host without them keeps the grey). Dark themes unchanged.

- **The final look: "Same, with a line"** (owner, 2026-10-12, from `sidebar-treatments.html`, over a
  fixed step, a neutral grey, an inset terminal and a tint; the lifted 4 percent panel read as a muddy
  near-black on black themes). The secondary colour defaults to the terminal's own ground on every
  theme (still a setting); the open sidebar draws a hairline and no shadow; the tab in front is a
  pill in the accent's tint; the dropped title bar has no shadow. Slid out over the terminal, the
  collapsed sidebar still casts its shadow. On light themes the quiet inks are held to the form
  controls' fill too.

- **The sidebar looks** (owner, 2026-10-12, from `sidebar-looks.html`): row icon none; a second line
  with the folder the tab's folder sits in (`~` for the user's folder, `lib/sidebarRows.ts`); "Find a
  tab" at the top, on Ctrl+Shift+K (the mockup's Ctrl+K is the shell's kill-line), keeping the rows
  with every typed word in their name or folder, Enter putting the first in front, Escape letting go,
  no reordering while it filters; New tab a full-width button at the sidebar's foot (right click: the
  +'s places); the tab in front an accent pill; regular size; the title bar dropped down.
- **The base colour and the edge** (owner, 2026-10-12: "black theme should have black sidebar and
  all the others have the old style where its a bit darker than the bg + shadow", and "only show
  border on the sidebar if bg and secondary color is black, since then shadows dont work, otherwise
  shadow works as a border"). Unpicked, the secondary colour is the ground on a black theme
  (luminance under 0.0045), 22 percent toward black on other dark themes, 8 percent toward the text
  on light ones. The open sidebar's edge is a hairline only when both grounds are black, else a
  shadow (lighter on light themes), `lib/sidebarLook.ts`, following theme changes.

## 2. The indicators

- **Vertical tabs have no new look for the indicators** (owner: "vertical tabs shouldnt have a new
  look in terms of the indicators"): the same rule (`core/renderer/lib/tabMark.ts`), the same
  Minimal and Full, in both directions.
- **Ring becomes mono, in both directions** (owner: "the ring style should use just rings and dots
  ... ultra minimal ... the spinning circle for working and a dot for done, and a dot for question,
  and a dot for failure. maybe a checkmark could even work"; then "mono colour for ring, that should
  be the same for horizontal version"). Picked from the seven ring versions: Mono.
  - Working: the spinner. Finished: a check. Question: a breathing dot. Failed: a cross.
  - All in the name's own ink (`currentColor`), no colour role, no line under the tab, no Powerline
    edge. The rainbow switch does not touch it.
  - This is a CORE change. Prism's strip does not offer Ring (its `tabMarks` leaves it out), so Prism
    draws nothing new; the shared rule and component change.

## 3. Not in this change

- The sidebar on the RIGHT side (#162 lists it as a choice). Not asked for in the 2026-10-11
  session; a follow-up if wanted.
- ~~A key to toggle the sidebar~~: added 2026-10-12, see below.
- Ctrl+Tab, Most recent and Ctrl+1..9 are unchanged: they act on the tab list, whatever its shape.
