# This repo is the terminal of TWO apps

Moved verbatim from `CLAUDE.md` on 2026-10-09, with anchors added; the short version stays there.
Paths below are relative to the repo root. The rules here (dictation, the update window, command
help, themes, the menu, release automation) must not regress either, like those in
[regression-rules.md](regression-rules.md).


**`core/` is WHAT THE TWO APPS SHARE, and Prism embeds it.** It began as the terminal and nothing
else; on 2026-09-19 (#28) the owner widened it on purpose. Asked whether the update window should be
built twice or once, the answer was "yes keep the core", so the update chip, the window it opens,
the release-notes parser and the update preview live in `core/` although none of them is terminal.
The test for what belongs there is now "would the two apps otherwise each write this, and must it
look and behave the same in both", not "is it part of the terminal". What an app's shell IS (tabs,
roots, the window, its own settings page) still stays in the app. The terminal half is the older rule
(owner, 2026-09-19, #15: "this terminal app is just
an extraction of the main Prism app and should therefore be reflected in both apps... all should be
synced, unless it conflicts with one app, then you need to ask me", and "why can't this repo be the
core?"). Read [`core/README.md`](../core/README.md) before touching anything under `core/`: it is the
contract. In one paragraph: what IS the terminal lives in `core/` once; what is an app's shell stays
in the app; every place the two apps legitimately differ is a DECLARED field of `TermHostConfig`
(`core/renderer/host.ts`), never a fork, and adding one is an owner decision; defaults are per host
so an update never silently changes what an existing user sees; the bridge to main is written once
(`core/shared/channels.ts`, `core/preload/api.ts`, `core/main/ipc.ts`). This app is one host
(`src/renderer/src/termHost.ts`); Prism is the other.

- **THE TERMINAL'S SETTINGS ARE THE CORE'S TOO** (owner, 2026-09-19: "they shouldn't be synced in
  terms of personalization, but the setting names, types, how they function and so on should be the
  same"). `core/renderer/settings`: the field primitives and, since the GROUPED CARDS redesign
  (#134, 2026-10-05; spec `docs/superpowers/specs/2026-10-05-settings-redesign-design.md`), the
  whole frame (rail, Find a setting, sections, rows, icons, search, flash: `layout/`) and the
  terminal's sections (`sections/`: Shell, Text, Theme, Tab marks, Claude Code, Mark colours,
  Command help, the Dictation page). Each app decides which page holds a section: here
  `components/settings/` is Appearance (Window, then the Theme section with Background and Accent
  in its slot), Terminal (Shell, Opening terminals, Text, Command help), Agents (Tab marks with the
  taskbar row, Claude Code, Mark colours), Dictation, About; this app's own rows are the closed list
  `appOptions.ts`. Values are per app (own userData), never shared. The core lists
  (`options.ts`, `dictationOptions.ts`, `helpOptions.ts`) name every row's section, icon, subtext
  and search words as FLAT entries (Prism's gate reads them as text); a unit test holds the lists
  and the sections together, and each app's e2e (`options`) asserts its page shows the lists, its
  own rows and nothing else. A row outside both is a fork. Every row is in Find a setting's index
  (`settingsIndex.ts`), and the `settingsSearch` e2e opens each one by its label. The old
  components (`TerminalAppearanceSettings` and friends) stay exported, unchanged, until Prism has
  moved (spec 3.0); do not build on them.
- <a id="tab-marks"></a>**THE TAB MARKS ARE THE CORE'S; WHICH ONES A HOST DRAWS IS DECLARED** (#143, 2026-10-10). The
  rules (`lib/tabMark.ts`, `markColours.ts`, `nameInk.ts`, `markPalette.ts`), the flat tab's marks
  (`components/TabMark.tsx`) and all their motion (`styles/marks.css`, which a host imports) are
  written once. `TermHostConfig.tabMarks` (optional; an owner decision named in #143's PR) says what
  the host's STRIP draws: this app passes Off, Minimal, Ring, Full and the rainbow; Prism passes
  nothing, so it keeps Off, Minimal and its own Full, a stored Ring reads as its default
  (`readIndicator`), and no rainbow row is drawn there. The "Rainbow finished mark" row is in its own
  list, `markOptions.ts`, NOT in `TERMINAL_OPTIONS`, for `helpOptions.ts`'s reason: Prism's gate reads
  that file as text and its unit test orders every id in it. Verified before the PR against Prism
  `952e309` (typecheck, unit suite, `terminal`, `termOptions`, `termColourPicker`, `settingsLook`,
  `tabs`, `agentTitle`, `promptLayout`). Prism adopting the marks is a later owner decision.
- <a id="product-for-others"></a>**THIS IS A PRODUCT FOR OTHER PEOPLE** (owner, 2026-09-19: "this isn't an app for just me. keep
  that in mind with all things you implement"). A feature bundles or fetches what it needs and works
  on a fresh Windows install: never lean on the owner's GPU, tools, caches or installed runtimes.
- <a id="dictation"></a>**DICTATION** (#13, 2026-09-19; spec in `docs/superpowers/specs/2026-09-19-dictation-design.md`).
  Built ONCE in `core/`, for Prism too. Hold Right Alt, speak, release: the FINAL text is pasted at the
  cursor of the shell that was in front when you started. The rules that must not regress:
  - **It is the FOURTH written exception to "the app never types into your shell"** (with the agent
    resume, Prism's `Set-Location`, and drop-to-type-path): the user spoke it on purpose, it arrives as
    one bracketed paste, and it NEVER carries Enter or a newline (`cleanTranscript` and the panel's
    `pasteSpokenText` both strip them; the e2e asserts no new prompt appears).
  - **Off means off.** Default off. With it off no key listener is armed, no process exists, nothing
    downloads. Switching it off kills the server. The e2e counts `whisper-server.exe` processes.
  - **Local only.** Audio goes renderer -> main -> `whisper-server` on 127.0.0.1 and is never written to
    disk. Official whisper.cpp binaries only, nothing we compile; every download (engine, models, the
    NVIDIA pack) is pinned by SHA-256 in `core/shared/dictationCatalog.ts` and an unverified file is
    deleted, never loaded. Model urls are pinned to a Hugging Face COMMIT, not `main`.
  - **Right Alt is AltGr** on Norwegian and most European keyboards (Windows sends Ctrl+RightAlt, then
    the key). So a bare-modifier hotkey is a SOLO HOLD of 200 ms; any other key during that window
    means it was typing. `core/renderer/lib/dictationKey.ts` is the pure reducer, heavily tested.
  - **Live text is provisional and only SHOWN** (in the pill); only the final pass is pasted. MEASURED:
    a phrase heard wrong at 6 s was corrected by 8 s, and text typed into a prompt cannot be unsent.
  - **The engine ships its own C++ runtime.** whisper.cpp's exe and DLLs import MSVCP140 /
    VCRUNTIME140(_1) / VCOMP140, which neither official zip carries and a fresh Windows may lack.
    `core/tools/fetch-whisper.mjs` copies them app-local from the build machine, only if validly
    signed by Microsoft, plus the MIT notice. The GPU pack finds them through PATH (the engine sets it).
  - **Shared files, per-app values.** Models and the GPU pack live in `%LOCALAPPDATA%\PrismDictation`
    (both apps; never removed by an uninstall); every setting VALUE is per app.
  - **THE ENGINE IS WARM BEFORE YOU SPEAK** (owner, 2026-09-28: "it should work from the get-go").
    MEASURED on an RTX 5090, Large v3 Turbo: the server answers in 1.1 s, but the FIRST pass took
    31.8 s with no cached kernels (the pack has none for the card) and 0.26 s with them. So the GPU
    engine has its own kernel cache (`%LOCALAPPDATA%\PrismDictation\cuda-cache`, 4 GB,
    `CUDA_CACHE_PATH`), the renderer asks for a warm-up (`dictationWarm`, a silent pass) when
    dictation is armed, when its model or language changes and at every press, a partial on a
    cold engine answers `warming` at once instead of queueing, and the pill says "Starting speech
    engine" rather than "Transcribing". After a failed warm-up partials go the ordinary way.
  - **GPU:** the official CUDA 12.4 pack (643 MB) is an optional download, offered only when an NVIDIA
    adapter is found. MEASURED on an RTX 5090: it runs (first run 9 s compiling kernels), Large-v3 then
    answers in 0.36-0.5 s. AMD/Intel stay on CPU (Base/Small) until there is an official build.
  - **Testing is REAL:** the `dictation` e2e feeds Chromium's fake microphone a WAV
    (`PT_E2E_MIC`), runs the real bundled engine with the Tiny model (cached in `.e2e-cache/`), and
    asserts the sentence lands on the prompt line. Not machine-testable, so on the hands-on list: how
    it sounds, AltGr on a physical keyboard, pause-media against a real player.
  - Re-pinning the engine: `fetch-whisper.mjs` and `ENGINE` in the catalog must agree (a test holds
    them together), and the GPU pack must be the SAME release tag.
  - **Which models, and why** (2026-10-04): `docs/research/2026-10-04-dictation-models.md`. Phonon 2
    is out (English only, not whisper.cpp); nothing is scrapped; quantized Whisper files are the next
    step to measure; Parakeet v3 runs one process per pass (below) and lacks Norwegian.
  - **PARAKEET V3 IS ONE PROCESS PER PASS** (#121; owner, 2026-10-04). `parakeet-cli.exe` +
    `parakeet.dll` come from the same pinned zip and GPU pack (research and timings:
    `docs/research/2026-10-04-dictation-models.md`). MEASURED: a
    fresh process answers in 0.72-0.86 s on CPU and 0.76-0.78 s on the pack (16 s once, kernels), so
    there is no server. The WAV goes in on STDIN (`-f -`), never to disk; it says `error:` on stderr
    with exit 0 for audio it cannot read, which (like a timeout) is NOT a GPU fault: only a pass
    whose engine died sends the session to the CPU, Whisper's rule; threads are half the logical CPUs, at most 16. The catalog's
    `limitedLanguages` flag (model-agnostic, no vendor in the words) asks "This model doesn't support
    all languages." before the download, and while it is active the language picker shows Auto-detect,
    disabled, with a globe icon saying the same; the STORED language is untouched (`languageFor`). The
    `dictationParakeet` e2e runs the real engine with the q4_0 file (e2e-only catalog entry).
- <a id="update-window"></a>**THE UPDATE CHIP OPENS A WINDOW; IT DOES NOT INSTALL** (#28; owner, 2026-09-19: "when you click
  the Update badge, it opens like a pop window, which shows the change log or like patch notes for
  the new update, and then you can choose cancel or install"). Built ONCE in `core/` for both apps:
  `shared/updateTypes.ts`, `shared/releaseNotes.ts`, `main/updatePreview.ts`,
  `renderer/lib/updateFlow.ts` (the pure reducer) + `useUpdateFlow.ts` (the hook; the host hands in
  its bridge and its install guard), `renderer/components/UpdateChip.tsx` + `UpdateDialog.tsx`
  (props only). This app's own part is `src/main/update.ts` (where to look: the repo, the installer's
  name), the wiring in `main/index.ts`, and App's install guard. The rules that must not regress:
  - **THE NOTES ARE PLAIN TEXT, NEVER HTML, NEVER MARKDOWN, NEVER A LINK.** They are a GitHub release
    body: text off the network, in a window that can reach the bridge to main. `parseReleaseNotes`
    reduces the body to a capped list of strings (the "by @user in url" tail dropped, the pull
    request number kept as text, New Contributors and Full Changelog dropped, controls and the
    bidi overrides stripped) and the dialog prints each as a text node. Do not add a markdown
    renderer, `dangerouslySetInnerHTML` or an `<a>` on this path. The `updateNotes` e2e hands the
    real page a hostile body and asserts the DOM: no anchor, image, script or frame, and the
    handler never ran.
  - **THE NOTES ARE SORTED UNDER HEADINGS AND WORDED FOR A READER** (#32; owner, 2026-09-20: "make
    it look a bit better like having headers bug fixes, new features, so on. make it look proper
    and not like a git commit", and "dont have the changelog inside a container, i just want it on
    the main window bg", and of the "This is a preview" line: "dont show this text").
    `shared/releaseGroups.ts` takes the parser's PLAIN STRINGS and only moves and trims them:
    New features / Improvements / Bug fixes / Under the hood, by a conventional-commit prefix
    (taken off) or how the title reads; an unmarked title is a feature; "Phone:" names a part of
    the app and stays; the trailing "(#31)" goes; each line starts with a capital. The notes sit
    on the dialog's own ground (no fill, no border, still scrolling inside a capped height), and a
    preview is not announced up front: what it did is said where it ends.
  - **THE CHIP IS ACCENT-FILLED, AND THE WINDOW STAYS FOR THE INSTALL AND DRAWS THE BAR** (#32;
    owner, 2026-09-20: "have the update available button be accented colour. and when you click
    install keep me with the panel open and have the progress bar straight there, kind of like the
    way extract works for zip files in Prism"). This SUPERSEDES #28's "the window closes on Install
    and the chip IS the progress bar" (Prism's 2026-08-24 design); do not rebuild either. The chip
    is one label at one width in every phase, filled with `--p-sel-bg` and NOT `--p-accent`: both
    apps derive that token as the accent moved until `--p-on-accent` clears 4.5:1, and the raw
    accent is only held to a button's 3:1 (MEASURED on the chip: 10.2:1 on the GitHub light theme).
    The window's progress track is ALWAYS in the layout and only fades in, the archive panel's own
    rule, and the e2e samples the box every 25ms through a whole install: it never changes size.
    While it runs the USER cannot put it away (Escape and a press outside do nothing); Cancel
    cancels the DOWNLOAD (`cancelUpdate` on the bridge, optional, so a host that cannot stop one
    gets a disabled button rather than one that lies) and is disabled once the installer has the
    file. A cancel is not a failure and says nothing. A failure or a preview's end is said on the
    status line IN the window (Close / Install again); the line under the chip survives only for
    an ending with the window hidden. Main's half: one `AbortController` per run, passed to `fetch`
    and the write, the partial installer removed with its temp folder.
  - **`--preview-update`** (owner: "make like a fake update"), in the INSTALLED app too and under
    `--e2e`: main offers the core's fake (next minor, a realistic generated body, `mock: true`) and
    the real watcher never starts. Install then runs about three seconds of fake progress, answers
    "nothing was installed", and the window says "Preview only: nothing was installed". It must never
    fetch, write a file, spawn anything or quit; `update.ts` counts checks and installs and the e2e
    asserts both are 0, that no `prismterminal-update-*` folder or process appeared, and that the
    app is still answering afterwards. What main OFFERED decides (`pendingUpdate.mock`), never what
    the page sent. A second launch with the flag previews in the running app, only when nothing
    real is on offer. An unpackaged build previews unasked (it replaced the old inert mock chip);
    under `--e2e` without the flag there is no chip and no network, as before.
  - **INSTALL IS HELD BY THE WINDOW'S OWN RULE.** Installing ends in a quit that main pre-answers
    (`closeAgreed`), so App's install guard asks first while an agent is WORKING
    (`holdsWindowClose`; title `closeQuestionTitle('install', ...)`, button "Install and restart").
    Until #28 nothing in this app asked: main's comment said the page settles it, which was true of
    Prism's page and never of this one. A preview asks nothing, since it quits nothing. A download
    that fails now says so in the window, where it used to fall back to "Update" in silence. The
    `updateGuard` e2e drives the question, Cancel, the go-ahead and the failure line with an offer
    whose url `installUpdate` refuses before it sends a byte (`PT_E2E_UPDATE_OFFER`, e2e only).
  - **ONE QUESTION AT A TIME** (review of #28, 2026-09-20). The app's chords still work over the
    update window, so Ctrl+W on an agent's tab (or Alt+F4) raised the close question UNDER it, with
    the focus on "Close tab" where nobody could see it: Enter, aimed at Install, ended the agent.
    MEASURED in the e2e with the fix taken out. The update window is put away whenever a question
    (`ask`) appears: that is `useUpdateFlow`'s `covered` argument since #32, the ONE way the window
    leaves mid-install (the host's, never the user's), and a running install's window comes back
    when the question has gone; `updateGuard` holds it. The window's Tab trap also leaves Ctrl+Tab
    alone, which used to switch tabs AND move the focus inside the window in one press.
- **ONE CTRL+V IS ONE PASTE** (owner, 2026-09-22: "found a bug in the terminals. when I copy text and
  paste it pastes twice"). The key handler pastes and returns `false`, and returning false only
  tells XTERM to leave the key alone: it does not cancel the BROWSER's default for Ctrl+V, which is
  a native paste event into xterm's textarea, which xterm pastes as well. Every paste arrived
  twice, in both apps. The handler now calls `preventDefault()` for Ctrl+V and Ctrl+Shift+V, so
  its own paste (the one that knows images and bracketed framing) is the only one. Any key the
  core takes over from the browser needs the same: returning false is not cancelling. The
  `paste` e2e counts what reached the shell for Ctrl+V, Ctrl+Shift+V and the right-click Paste
  (it failed with 2 copies before the fix).
- **THE TITLE BAR CAN BE HIDDEN** (#91; owner, 2026-09-28: "add a no title bar option for pt in
  appearance as well, not theme related", and of the shapes offered, "tabs in the top row").
  Settings > Appearance > Show title bar (`title-bar`, `prism.window.titleBar`, `lib/titleBarPrefs.ts`),
  above the theme wall, a SWITCH since #134 over the same stored values: on is **Shown** (the
  DEFAULT, the window as it was), off is **Hidden**: one row, the
  tab strip (`inTitleRow`) with `TitleButtons` (chip, help, cog, window buttons) at its end, the
  strip's empty space the drag handle; with no tabs the row is the handle and the buttons. This
  app's row. The `titleBar` e2e measures both and the start screen.
- **EVERY TAB IS ONE WIDTH** (owner, 2026-09-21: "make tabs in both apps have a fixed size, and not
  dynamically adjust based on the content"). A tab was as wide as its label, up to 14rem, so a
  folder with a long name shoved every tab after it sideways and the close button was never in
  the same place twice. Now `flex: 0 1 114px`, min 64px (the same day: 176px first, far too wide; then "way smaller...
  around 60%", 106px; then "a bit wider like 20%", 127px; then "10% less wide", 114px): one width, and all of them shrink
  EQUALLY only when the strip runs out of room, as a browser does; the label truncates inside and
  the whole path is on the tooltip. Prism's strip does the same. `tabWidth` measures the boxes.
  **AND SINCE 2026-09-23 IT IS A SETTING** (#56; owner: "add a setting for tab width, where the
  user can pick fixed size or dynamic, so essentially what we got now and what we had before").
  Then, the same day: "put the option closer to the top of appearance, and call it dynamic not
  based on name. also have dynamic be the default setting, not fixed". So Settings > Appearance
  opens with Tab width (`tab-width`, `prism.window.tabWidth`, `lib/tabWidthPrefs.ts`): **Dynamic** (the DEFAULT,
  by the owner's word, so a strip fixed since #35 goes back to dynamic with this update: the
  label sizes the tab, capped at 14rem, shrinking only when out of room) or **Fixed** (the above).
  This app's row, in the `options` e2e's own list; `tabWidth` measures both and that the row is
  first. Prism has the same row at the top of its Style page.
- **PITCH AND CINDER ARE THE APP ICON'S COLOURS** (owner, same day: "two themes that match the app
  icon colour scheme, one with orange and black, and one with orange and dark grey"; "change a
  couple is better"). Orange `#ec9448` for the cursor AND the chrome accent, on black (Pitch) and
  on the icon's own dark grey `#383c44` (Cinder). They were the two ORIGINALS whose names already
  fitted; the public schemes (Dracula, Nord) keep their real colours, since a scheme
  called Dracula that is not Dracula is a lie. Ids unchanged: they are saved-settings keys.
- **FORTY THEMES, EACH ITS OWN** (#62; owner, 2026-09-23: "clean up the themes. there's too many
  similar themes ... most should be normal themes grey, white, black ... but have some brown themes,
  pink, green ... i want a noctua theme, don't call it that but use that nice brown beige colour
  scheme"; then 2026-09-24: "make more themes so we have 40 themes total like the trailer says.
  verify all themes look good, no invisible text, make some typical colour schemes like a green
  window, blue, and more fun ones ... don't make them ugly"). THE COUNT IS FORTY, the trailer's
  number, held by a test. Core `TERM_PRESETS`: the neutrals (PT Default, Prism, Pitch, Cinder,
  Graphite, Volt, Paper, Mist); a dark and a light per colour (Umber and Fawn, the fan's brown and
  beige; Rosewood and Blossom; Moss and Sage); the classic looks (Phosphor, Amber, Marine,
  Retro, Campbell, High Contrast); more colours (Ocean, Garnet, Plum, Lavender, Sky, Peach,
  Butter, Mint); and well-known schemes in their real colours (Nord, Dracula, Solarized Dark,
  Gruvbox Dark, Tokyo Night, Catppuccin Mocha and Latte, Monokai, Kanagawa, Cobalt, Synthwave,
  Horizon). NO INVISIBLE TEXT is a test (`termTheme.legible.test.ts`): text 4.5:1, cursor and
  accent 3:1, all sixteen 3:1 against the theme's own ground. It caught Catppuccin Latte's own
  cursor at 2.3:1, which is its mauve here. Original themes give base colours only.
  **THE WALL'S ORDER IS MEASURED** (#157; owner, 2026-10-10: "first black to white then
  coloured"): after the leading cards (Custom, the host's default, Follow style in Prism), core
  `orderTermThemes` (`lib/themeOrder.ts`) puts the neutral grounds first, then the coloured ones,
  each black to white by OKLab L. Neutral is OKLab chroma below `NEUTRAL_CHROMA` 0.0125, measured
  in the widest gap of the forty grounds (Monokai 0.0109, Sage 0.0147), so Cinder, a blue slate,
  files with the coloured. One fixed order in both apps (it replaced the light-first flip);
  `themeOrder.test.ts` snapshots it and keeps every ground 0.001 off the threshold, and the
  `themeCards` e2e reads that snapshot against the wall.
  **VOLT TOOK INK'S PLACE** (#93; owner, 2026-09-28, with a screenshot: "make one of the black
  themes this colour scheme with black and that yellow greenish colour, kind of cyberpunk"):
  `#d8ff26` on `#050706`; Ink, the blue-black next to Prism and Tokyo Night, retired to `prism`.
  A THEME ID IS A SAVED SETTING, so a retired one maps to its nearest kept one
  (`termThemeRetired.ts`, read in `termThemeId` and `resolveTermTheme`), never to the default;
  `termThemeRetired.test.ts` holds the map to the list. The e2e picks Paper and Fawn where it
  picked GitHub and Solarized Light; Prism's `termOptions` picks Pitch (Prism #221, landed first,
  so the core bump's gate held).
- **A CLICK PUTS THE CARET THERE** (owner, 2026-09-22: "click inside the text to put the caret
  there"). A plain click on the line being edited sends the Left or Right presses that walk the
  shell's cursor to the cell clicked (`core/renderer/lib/termClickCaret.ts`, pure and tested; wired in
  `TerminalPanel` `attachClickCaret`). Refused, so the click does what it always did: a drag or
  selection, a double click, a modified click, a link, a program that owns the mouse, a full-screen
  program, a view scrolled back, a hidden cursor (tracked from DECTCEM, since xterm keeps it
  private), anything printed below the line, and any row off the cursor's logical line. Wide
  characters count once; a click past the text goes to its end. Up and Down are never sent. The
  `clickCaret` e2e proves it in a real pwsh.
- **THE TERMINAL'S SCROLLBAR IS MINIMAL AND WEARS THE THEME** (#52; owner, 2026-09-23: "make the
  scrollbar more minimalistic and make sure it follows the theme"). xterm 6 scrolls with its OWN
  slider (VS Code's scrollable element), which fades when idle; its sheet still gives
  `.xterm-viewport` `overflow-y: scroll`, so Chromium drew a second, EMPTY native bar: the grey
  gutter with steppers. `index.css` takes that away (`scrollbar-width: none`) and makes the slider
  6px and round; the core's `currentTermTheme` colours it from the theme's foreground (40%, 65%
  hovered or dragged), so both apps follow the theme (Prism's size and shape are its own CSS).
  Not a stale paint: the thumb is ABSENT until a scroll because xterm fades it, which the
  `scrollbar` e2e wakes with a wheel before it measures, on a dark and a light theme.
- **EVERY COPY SAYS "COPIED" AT THE BOTTOM CENTRE** (#54; owner, 2026-09-23: "when you copy
  something in the terminal including from the command help, i want to see a badge appear at the
  bottom center of the screen saying copied"). Every copy goes through the core's `copyText`
  (`lib/copyNotice.ts`): the page's clipboard first (no size cap; main's `writeClipboard`, capped
  at 4000, only when the page is refused), and ONLY a write that landed raises the badge
  (`components/CopiedBadge`, mounted once by each host): a neutral pill, no accent, no shadow,
  1.2s, a second copy restarts it, `role="status"` so a screen reader hears it. **IT IS IN THE
  PAGE ONLY WHILE IT SHOWS** (#58): it sat there empty at first, a permanent status line and live
  region, and in Prism it was the FIRST of each on the page, where the player's volume readout and
  sound notice are looked up the same way; Prism's `volume` and `dolby` scenarios read the badge
  instead (MEASURED, before Prism mounted it for real). A core component a host mounts must not
  leave idle ARIA landmarks behind. `helpPanel` asserts it leaves the page. Ctrl+C over a
  selection, the menu's Copy and Copy link, and Command help all use it. The badge REPLACED
  Command help's in-row check (owner's pick), so a success is said once; a failed copy still
  marks its row. `selectionEdit` and `helpPanel` assert it; `.e2e-shots/copied-badge.png`.
- **FIND IS CTRL+F, EXCEPT IN A FULL-SCREEN PROGRAM** (#50; owner, 2026-09-23: "can the find
  hotkey be ctrl f", then "lets do it"). This app's `ownsKey` and App's handler take Ctrl+F unless
  the focused shell is on the alternate screen or asked for the mouse (the core's
  `focusedTermFullScreen`): in vim and less Ctrl+F is page down and stays theirs. Ctrl+Shift+F
  finds everywhere, as before. Known cost, accepted: bash and readline lose Ctrl+F as cursor-right
  at a prompt (PSReadLine's Windows mode binds nothing to it, MEASURED). The `findKey` e2e proves
  both sides in a real pwsh by switching it onto the alternate screen. Prism's own chords are
  Prism's: this is not a change to Prism's find key.
- **BACKSPACE DELETES A SELECTION** (#44; owner, 2026-09-23: "i should also be able to highlight
  text and use backspace to delete the selected text"). Backspace or Delete, unmodified, over a
  selection that starts and ends on the line being edited sends the presses that do it by hand:
  Left or Right to the selection's end, then one DEL per character (`core/renderer/lib/
  termSelectionEdit.ts`, pure and tested; wired in `TerminalPanel` `deleteSelection`). The click
  caret's refusals apply (a program owning the mouse, full screen, scrolled back, a hidden cursor,
  text below); anywhere else the key is the shell's, untouched. Like the click, these are keys
  the user pressed, translated, not the app typing. In `core/`, so Prism's terminals have it too.
  xterm's `getSelectionPosition` is 0-based with the end exclusive, whatever its typings say
  (MEASURED). The `selectionEdit` e2e proves it in a real pwsh.
- <a id="menu-fits"></a>**THE MENU FITS WHAT WAS CLICKED** (#44; owner, same day: "if i click it on a link it shows copy
  link, if i click it with text marked it says copy ... remove close tab from the right click
  menu"). `termContextAt` (core, read-only) answers what is under the point: the selection's text
  and the link there (whole, across a wrap, by `findLinks`). App's menu leads with Copy link, Open link and
  Copy, both copies exact through main (`writeClipboard`); Close tab stays on the TAB's menu.
  **A RIGHT-CLICK ON A LINK OPENS NOTHING** (#95; owner, 2026-09-28): the link addon hands over a
  click of ANY button, so it opened the link and the menu at once; only a left click opens now. Every
  row of both menus carries a glyph (`components/MenuIcon.tsx`, Prism's `FileMenuIcon` paths; owner: "the items
  should have icons like in prism explorer").
  The `selectionEdit` e2e reads the clipboard back in main and puts the owner's back.
- **SETTINGS DESCRIPTIONS ARE PLAIN WORDS, AND THE ROWS KEEP ONE ORDER** (owner, 2026-09-22: "no
  symbols other than comma and dot, no mentioning of specific keys or tips"; "the terminal
  settings pages in Prism and Prism Terminal should be the same in terms of order"). Every hint,
  sub and note is checked by `core/shared/settingsCopy.ts` (a test in the core and one per app).
  Since #134 a subtext is ONE line of at most eight words (`subTooLong`) and a label passes the
  symbol rule (`labelProblem`), both held for the new files only (the legacy ones run longer).
  `TERMINAL_OPTIONS` is in display order WITHIN EACH SECTION, and the `options` e2e reads every core
  section (`[data-settings-section]`) against it; which page holds a section is each app's.
- **WHAT NO THEME OWNS SITS ABOVE THE THEME WALL** (owner, 2026-09-28: font and font size "should
  transcend" the theme's save, "so changing a theme should not reset the font and font size or if
  you use a minimal or full agent indicator, or edges. those options should be above the themes").
  Since #134 Appearance runs: the Window section (Tab width, Show title bar, Panel edges), then the
  Theme section (the theme row with Save changes, the wall, what a theme SETS: See-through window,
  Background, Accent; the see-through row right under the wall since #156, as in Prism). The font and its size are Terminal's Text section; the indicator and the agent colours
  are on Agents, where Mark colours carries the SAME Save changes (both save the whole setup and
  light together, `theme/useTermSetup.ts`). A theme switch and Save
  as Custom leave the font and its size alone (`termExtraDefaults`, `resetTermExtras`,
  `applyCustomExtras`; an older Custom's `font`/`fontPct` are ignored). Font size is 50% to 200%
  in tens; a saved size off that list reads as the nearest step. `themeSwitch` e2e holds it all.
- **THE RESTORE LOOKS UP CLAUDE SESSIONS OFF MAIN'S THREAD** (2026-09-22, the "soft lock on first
  launch"): `claudeSessionsAsync` stats sixteen at a time; a home folder holds thousands of
  transcripts. **AND IT RESUMES ONLY YOUR OWN CONVERSATIONS** (#87; owner, 2026-09-28: "it
  continued the wrong session... a message i hadnt sent... about a review"). A tool's Agent SDK
  runs (the commit review hook) write into the same folder, MEASURED 25 of the 26 newest there;
  `isInteractiveHead` reads each transcript's first 4 KB and drops a `queue-operation` first line
  or an `entrypoint` other than `cli`. The theme wall caches each preset's resolved look, and its previews use installed
  monospace faces rather than Mac ones Windows must look up.
- **A LAUNCH SHOWS ITS TABS FROM THE FIRST FRAME, AND A SKELETON WHILE THE AGENT COMES BACK** (#106;
  owner, 2026-09-30, of the start screen, then the tabs, then the path: "a loading screen on each tab
  ... it looks like it's meant to be this way"; of four mockups, "C is good"; spec
  `docs/superpowers/specs/2026-09-30-launch-skeleton-design.md`, mockups beside it).
  - **Tabs first.** `tabs:peek` (a sync read of tabs.json, no stat, no scan) draws the saved strip as
    placeholders (`Tab.pending`) before the restore answers. `lib/restorePlan` then settles each one
    in place by `RestoredTab.from`. A placeholder whose folder has gone, or that was closed meanwhile,
    goes. `EmptyState` shows only after a restore that came back EMPTY.
  - **The skeleton is core.** `ResumeSkeleton` covers a resuming session, so Prism's resumed terminals
    get it too. `resumeReveal` says when, MEASURED: the first title is exactly the agent's name
    (`claude`), then its own (`✳ Claude Code`), then the alternate screen. A local clear (screen and
    scrollback) is written just BEFORE the name title, so nothing the shell said is ever seen. The
    skeleton lifts on the agent's next title or the alternate screen plus 150 ms, on a key, an exit,
    a failed spawn, or 12 s.
  - **A folder path is not the program.** A folder called Claude is not `claude.exe`: a path counts
    only when it ends in the exe.
  - Tabs still coming back wear a ring in the strip (`resumingIds` in termBus). The text spinner is
    gone. The `launchSkeleton` e2e holds it all, with a stand-in claude and a temp HOME.
- **ONE COLOUR PICKER, ALPHA ON EVERY COLOUR** (#112; owner, 2026-10-03: "the colour pickers should
  be the same for both apps, i need an input field for a color code and an alpha per colour on every
  colour setting"; spec `docs/superpowers/specs/2026-10-03-colour-picker-alpha-design.md`, plan
  beside it in `plans/`). The core's `ColourField` (`settings/ColourPicker.tsx`) replaces the
  native `<input type=color>` everywhere; `HexSwatch` is it with `alpha={false}`, for rows not yet
  moved. Stored form `#rrggbb`, or `#rrggbbaa` with an
  alpha; every reader takes both. ALPHA 1 CHANGES NOTHING: a snapshot holds every preset and an
  opaque Custom byte for byte. A see-through Custom colour is composited against the ground in
  force, floored to `min(floor, contrast of the opaque pick)`; everything handed to xterm is 6 or 8
  digit hex (xterm throws on others). Opening and shutting writes nothing; Escape after a write
  calls the row's `onRevert`. The `colourPicker` e2e holds it; Prism's `termColourPicker`
  gates the bump.
  **THE BACKGROUND'S ALPHA IS THE WINDOW'S SEE-THROUGH; THERE IS NO OPACITY SLIDER** (#114, owner's
  option a). Under acrylic the window paints at the alpha of the ground in force: the picked
  Background colour's, else the theme's (a Custom `bg` may carry one), `termGroundAlpha`, passed to
  `chromeTokens` as the byte's fraction. Min 30%, inert while acrylic is off; Prism's theme
  Background has none (its style owns the glass). `lib/opacityMigration.ts` runs before the first
  paint and maps a saved Opacity N to byte round(N / 100 * 255), which is exactly what N painted
  (snapshot `chromeTheme.opacity.test.ts`): the saved `Custom.opacity` folds into `Custom.bg`, the
  live value onto the picked Background. The ground alpha takes Opacity's place in Save changes'
  dirty check, so a theme pick still asks first (#60).
  **ON MEANS SEE-THROUGH, BY ITSELF** (#156; owner, 2026-10-10, of Prism's "See-through window":
  "i want it here too"). Before it the switch changed the material and left every preset's ground
  opaque, so it looked broken. Now where `acrylic.kind` is 'window' an OPAQUE ground under the
  switch paints Prism's own levels as they paint (level 70 dark = byte 0xb9, level 49 light =
  0xd1, light measured as luminance > 0.4; `lib/seeThrough.ts`, and `paintsAlpha` in `termLook.ts`,
  shared by the window and Save changes' dirty check). A ground with an alpha keeps it; under the
  switch the Alpha stops at 95% (`SEE_THROUGH_MAX`: opaque is the switch's off). High Contrast
  stays solid (`termAcrylicInForce`; the row is drawn off with "High contrast stays solid."), and Save
  changes judges and saves the switch in force there, not the stored one (`termSetupState`).
  In this app the row reads "See-through window" / "The desktop shows behind every surface."
  (`acrylicLabel`, `acrylicSub`); Prism keeps "Acrylic terminal background", a terminal row under
  its own app-level See-through window, and nothing there changes. The `seeThrough` e2e holds it.
  The Accent's alpha is for FILLS;
  `--p-accent-solid` is the line (rules, spinner, progress, rings, an unpicked working colour),
  `--p-on-accent` is chosen 4.5:1 on the composite (`selectionFor`), and under a see-through
  ground the text fills are flattened over `--p-bg-solid`. The `opacityAlpha` and `accent` e2e
  hold it.
- **THE HELP POPUP BLURS THE WINDOW BEHIND IT AND CASTS NO SHADOW** (owner, 2026-09-22: "remove the
  shadow behind this and make the bg blurred when it's open"): `backdrop-blur` on a lighter scrim; the
  blur already lifts the panel off the page, and a shadow on top of it read as a dark halo.
- <a id="command-help"></a>**COMMAND HELP IS A POPUP THAT SHOWS AND COPIES, AND NOTHING ELSE** (#12; owner, 2026-09-19: "an
  easy to use panel where you can find shell commands... searchable... metadata on each command so a
  natural-language search finds it... optional in settings", and 2026-09-20: "a pop up with copy
  icons for easy copying"). Built ONCE in `core/` for both apps: the catalogue and its search in
  `shared/help/`, `renderer/lib/helpPrefs.ts`, `renderer/components/HelpPanel.tsx` (props only),
  `renderer/settings/Help.tsx` + `helpOptions.ts`, and `writeClipboard` on the bridge. This app's
  part is the way in: `F1`, the ? in the title bar, "Command help" in the terminal's right-click
  menu, the row in Settings > Terminal. The rules that must not regress:
  - **IT NEVER INSERTS AND NEVER RUNS** (owner, 2026-09-19: "picking a command in the help panel
    does NOT insert it into the shell"). The component is handed the clipboard and nothing else: no
    session id, no `termInput`, no bridge. It is NOT a fifth exception to "the app never types into
    your shell", and adding Run or Insert is a fresh owner decision. The `helpPanel` e2e reads the
    terminal's text before the popup is touched and after every search, copy and Enter in it.
  - **IT IS A TABLE, ONE COMMAND PER ROW** (owner, 2026-09-20: "this has too much text, it just
    needs the header and the command. no sub text and no highlighted ones. just a simple,
    minimalist but still elegant and beautiful searchable table", and "make the rows alternate in
    colour kind of like Prism Explorer"). An entry was a block (title, a sentence of summary, a
    bordered command box, a labelled box per variant, a list of placeholders) and two of them
    filled the popup. Now `rowsFor` FLATTENS an entry into rows: its own, named by the task, and
    one per variant named by what was that variant's label. Two columns under a header, every row
    34px, the command on one line and truncated (the copy and the tooltip carry the whole text),
    zebra-striped with `color-mix(var(--p-text) 3.5%)` and the first row plain, which is Prism's
    own rule. The summary and the placeholders are GONE FROM THE SCREEN and still read by the
    search, which is why the catalogue keeps writing them. NOTHING IS MARKED until somebody points
    at a row or walks the list: the cursor exists from row 0, so one Down marks it, but a table
    that opens with a row already filled reads as a selection nobody made. A DANGER is a mark on
    the row now (an amber triangle, its sentence on the title and in an sr-only span), not a
    paragraph: the e2e still reads the sentence, and a row that deletes things must not look like
    one that lists them.
  - **A ROW SAYS WHAT IT IS, AND CARRIES HIDDEN WORDS** (owner, 2026-09-20: "they should be ultra
    concise and they should not say things like copy it to the clipboard. what is it? and they
    should be very searchable. including a lot of meta tags that are not visible to the user but
    lets them search easier"). Every variant label was written as a CAPTION under its parent's
    title, and the table turned each one into a row name: "Copy it to the clipboard" now says
    nothing. So a name is at most 8 words and 54 characters, never opens with it/this/also/
    another, never leans on the row above, and differs from every other name in its entry; and
    every variant carries 3 to 12 lower-case `keywords` that are NEVER drawn, at least two of
    them words the name does not already contain. `catalogue.test.ts` enforces all of it, which
    is what makes the rewrite reviewable: 828 rows were renamed and keyed by six agents, and the
    same test says whether the next edit still holds. The entry SUMMARY is still written and
    still read by the search even though the panel no longer draws it.
  - **THE WIDTH IS THE USER'S** (same day: "you also need to be able to adjust the width of this
    since some text can be seen"). A row is one line and truncates, so the width is how a long
    command is read in place: an edge is dragged (the popup is centred, so one pixel of pointer
    is two of width), Left and Right do the same on the focused grip, and it is remembered per
    app in `prism.help.width`, clamped 560-1400 on the way in AND on the way out. NEVER SET IS
    NOT ZERO: `Number(null)` is 0 and a naive clamp read that as the narrowest popup, which the
    e2e caught as a footer line cut short.
  - **NO SENTENCE UNDER THE LIST** (same day: "remove this line"). It used to read "Nothing is
    typed or run for you: copy a command, then paste it yourself". The rule has not changed and
    is still proved where it counts - the component cannot reach a shell, and the e2e reads the
    terminal's text before and after everything it does - but the footer is the keys and
    nothing else.
  - **COPY IS EXACT.** What goes on the clipboard is the text on screen, placeholders and all: a
    command with FOLDER in it fails loudly when pasted unedited, and a panel that guessed would
    fail quietly. It goes through main (`clipboard:write`, text only, refused past 4000 characters,
    never trimmed) because `navigator.clipboard` refuses when the document has no focus. The e2e
    reads the clipboard back in main and compares it character for character, then restores what
    the clipboard held. A "command" that is a KEY (`Ctrl+C`, `Esc`; `isKeyPress`) is drawn as key
    caps with no copy button.
  - **CURATED AND OFFLINE.** A few hundred hand-written entries, task first, with keywords in the
    words of somebody who does not know the command; the search (`shared/help/search.ts`) is pure:
    stop words, a light stemmer, a small synonym table, prefix and one-typo matching, no model, no
    network, no dependency. The popup and its catalogue are a LAZY chunk (about 290 kB), loaded at
    the first open; what the app needs before then is in `shared/help/shells.ts`.
  - **`catalogue.test.ts` IS THE GATE FOR CONTENT.** To add an entry: put it in the file of its
    shell (`powershell.ts`, `cmd.ts`, `bash.ts`, or `git.ts` / `agents.ts` / `packages.ts` for what
    reads the same everywhere), RUN the command first where that is safe, and run `npm test`. The
    test holds: unique ids with the shell's prefix, a short task with no full stop, 6 to 16
    lower-case keywords, every placeholder declared and used (UPPER_SNAKE, never angle brackets,
    which a shell reads as redirection), no em-dash, and a `danger` line on EVERYTHING that matches
    a destructive pattern (Remove-Item, rm, del, rmdir /s, taskkill, kill, git reset --hard, git
    clean, a forced push, Set-Content, a single `>` over a file, a download over a file...). It
    also asks about twenty real questions per shell of the
    REAL catalogue and names the first answer each must get: a search can be right and the
    catalogue still lack the keyword.
  - **ON BY DEFAULT, AND OFF MEANS OFF.** It is a discoverability feature for exactly the people who
    would never find a switch to turn it on; the owner asked only that it be optional. Off: no
    button, no menu row, and `F1` is the shell's again (`ownsKey` and App's handler both read
    `helpEnabled()`). Known cost of F1 while on, accepted: PSReadLine's own F1 (help for the command
    under the cursor) and F1 inside a full-screen program under WSL do not arrive.
  - **ONE LAYER, ONE THING IN IT.** The popup is the same layer as the update window and a close
    question. It does not open over either, and App puts it away while RENDERING when one appears
    (Ctrl+W and Alt+F4 still work over it), so a question is never underneath it. It also LEAVES
    WHEN WHAT IS IN FRONT CHANGES (review, 2026-09-20): Ctrl+T, Ctrl+Tab and Ctrl+Shift+F work over
    it, a terminal takes the focus as it attaches, and the popup left up sat over a focused shell
    with the next "search" typed into it; `helpPanel` holds Ctrl+T and find. Escape returns
    the keyboard to the shell that had it; Tab stays inside (a PLAIN Tab only, Ctrl+Tab is the
    app's); the list draws a page at a time.
  - Its option list is `helpOptions.ts`, NOT a row in `TERMINAL_OPTIONS`: Prism's gate reads that
    file as text, and a row there would fail Prism's parity check until Prism wires the popup.
- <a id="page-looks-right"></a>**A PAGE THAT WORKS IS NOT A PAGE THAT LOOKS RIGHT** (#20, 2026-09-19). Moving the settings into
  `core/` dropped every Tailwind class used only there (`core/` is outside the scanned root; the fix
  is the `@source` line at the top of `index.css`, do not remove it). All 14 e2e scenarios passed over
  a ruined page, because they asserted that rows EXIST. The `options` scenario now MEASURES the
  layout (card width, wall rows, row padding) and writes `.e2e-shots/settings-*.png`. After any change
  that moves UI between `src/` and `core/`, LOOK at those screenshots before calling it done.
- <a id="merging-ships"></a>**MERGING TO MAIN SHIPS, IN BOTH APPS** (#23; owner, 2026-09-19: "that compiled copy needs to be auto
  bumped when a new Prism Terminal release or merge to main happens", and "users of the app can get
  an update available banner"). Three workflows:
  - `release.yml`: a push to main with a NEW `package.json` version builds the installer and publishes
    `v<version>` as the latest release, which is what the in-app update chip looks for. A version
    already released publishes nothing and does not fail. So: bump the version in the PR when a release
    is meant (patch for fixes, minor for features).
  - `core-release.yml`: a push to main that touches `core/` re-splits `core-dist`, tags
    `core-v<core/package.json version>`, and opens a PR in Maxaubert/Prism that bumps the pin AND
    Prism's version (minor when the core's major.minor moved, else patch). It then WAITS for that PR's
    checks, which now include Prism's terminal gate on a runner (`terminal-gate.yml` there; MEASURED
    green 3 of 3, real dictation included). Repo variable `PRISM_AUTO_MERGE = 'true'`: it merges the
    PR and Prism releases itself. Anything else (the default): the green PR waits for a person. A red
    check never merges. Auto-merge is a STANDING EXCEPTION to "never merge without the owner's word";
    only the owner switches it on, and it covers these bot-made bump PRs and nothing else.
  - `ci.yml`'s `core-version` job: **a PR that changes `core/` MUST bump `core/package.json`'s
    version**, or it fails on the PR (a released tag is never moved).
  **AUTO-MERGE IS ON** (owner, 2026-09-19: "we can say that they automerge"; `PRISM_AUTO_MERGE=true`).
  **AND THE RATCHET THAT MAKES IT SAFE** (owner, the same message: "if it ever, and it probably will
  at some point, create a bug in only one app, we'll make a test that it needs to pass, so the
  automation gets more and more secure over time"). So: a bug that reaches EITHER app through a core
  change is never just fixed. FIRST it becomes a scenario that fails on the broken build, in the suite
  that guards the app it broke: Prism's `terminal-gate` (`tools/e2e/run.mjs` there, listed in
  `e2e:terminal`, and RUNNER-SAFE so it runs in CI) or this repo's e2e. THEN the fix. A bump that
  passed the gate and still broke something is a hole in the gate, and the hole is the first thing
  to close. If a bump ever has to be undone: revert the bump PR in Prism (its pin goes back to the
  previous `core-v*` tag, which still exists) and publish a patch; never move or delete a tag.
  Never split, tag or push `core-dist` by hand on main any more; release candidates cut from an open
  PR's branch (`core-v0.2.0-rc.N`) are the one exception. The bump needs the secret
  `PRISM_BUMP_TOKEN` (fine-grained, Maxaubert/Prism, Contents + Pull requests read/write); without it
  the workflow warns and only releases the core.
- <a id="terminal-change-in-core"></a>**A terminal change goes in `core/`**, and is a change to Prism too: say so in the PR, and ask the
  owner when it would conflict with how Prism works. App-shell changes (tabs, start screen, window)
  stay in `src/`.
- <a id="core-lint-wall"></a>**`core/` is lint-walled** (`eslint.config.js`): relative imports only (a consumer resolves
  `@shared` against ITS OWN tree, MEASURED, silently), never `window.prism` (use `termApi()`), never
  a host's `src/`, never `electron`, never `chromeTheme`. The app reaches the core through `@core`.
- <a id="carry-superset"></a>**Carry the superset**: a capability only Prism uses (`cdTerm`, `decideFollow`, following the host
  style) lives in `core/` anyway; deleting it here takes it from Prism.
- Prism consumes `core/` as a DEV dependency pinned to a `core-v*` tag of the `core-dist` branch
  (`git subtree split --prefix=core`). Tags: `core-v*` for the core, `v*` for this app.

**History.** Made 2026-09-18 by COPYING Prism's terminal at Prism `4196c3a`, on the recommendation
"new repo, Prism untouched". That copy drifted within a day, which is what the core exists to end.
Prism's CLAUDE.md still holds the long history of WHY the terminal behaves as it does (search it for
the date in a copied comment).

Design spec and plan: `docs/superpowers/specs/2026-09-18-prism-terminal-design.md`,
`docs/superpowers/plans/2026-09-18-prism-terminal.md`. Owner decisions are marked `(owner)` there.
