# Prism Terminal

A tabbed Windows terminal for AI CLIs (Claude Code, Codex): one shell per tab, an agent indicator on
every tab, terminal themes that colour the whole window. Electron + React 19 + TypeScript + Vite +
Tailwind v4, node-pty + xterm. x64, Windows 10 1809+ / 11, per-user unsigned NSIS installer,
GitHub Releases.

## This repo is the terminal of TWO apps

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
core?"). Read [`core/README.md`](core/README.md) before touching anything under `core/`: it is the
contract. In one paragraph: what IS the terminal lives in `core/` once; what is an app's shell stays
in the app; every place the two apps legitimately differ is a DECLARED field of `TermHostConfig`
(`core/renderer/host.ts`), never a fork, and adding one is an owner decision; defaults are per host
so an update never silently changes what an existing user sees; the bridge to main is written once
(`core/shared/channels.ts`, `core/preload/api.ts`, `core/main/ipc.ts`). This app is one host
(`src/renderer/src/termHost.ts`); Prism is the other.

- **THE TERMINAL'S SETTINGS ARE THE CORE'S TOO** (owner, 2026-09-19: "they shouldn't be synced in
  terms of personalization, but the setting names, types, how they function and so on should be the
  same"). `core/renderer/settings`: the field primitives, `TerminalAppearanceSettings` (theme wall and
  editor, font, size, acrylic, the two indicator colours) and the rows `ShellSetting` /
  `AgentIndicatorSetting`. Each app composes its OWN page round them (`components/Settings.tsx` here
  is only the page plus this app's rows: new tabs, Explorer menu, window edges, accent, version). Values are per app (own
  userData), never shared. `settings/options.ts` lists every terminal option by id; a unit test holds
  the list and the sections together, and each app's e2e (`options`) asserts its page shows that
  list and no terminal-looking row of its own. A row outside the list is a fork.
- **THIS IS A PRODUCT FOR OTHER PEOPLE** (owner, 2026-09-19: "this isn't an app for just me. keep
  that in mind with all things you implement"). A feature bundles or fetches what it needs and works
  on a fresh Windows install: never lean on the owner's GPU, tools, caches or installed runtimes.
- **DICTATION** (#13, 2026-09-19; spec in `docs/superpowers/specs/2026-09-19-dictation-design.md`).
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
  - **GPU:** the official CUDA 12.4 pack (643 MB) is an optional download, offered only when an NVIDIA
    adapter is found. MEASURED on an RTX 5090: it runs (first run 9 s compiling kernels), Large-v3 then
    answers in 0.36-0.5 s. AMD/Intel stay on CPU (Base/Small) until there is an official build.
  - **Testing is REAL:** the `dictation` e2e feeds Chromium's fake microphone a WAV
    (`PT_E2E_MIC`), runs the real bundled engine with the Tiny model (cached in `.e2e-cache/`), and
    asserts the sentence lands on the prompt line. Not machine-testable, so on the hands-on list: how
    it sounds, AltGr on a physical keyboard, pause-media against a real player.
  - Re-pinning the engine: `fetch-whisper.mjs` and `ENGINE` in the catalog must agree (a test holds
    them together), and the GPU pack must be the SAME release tag.
- **THE UPDATE CHIP OPENS A WINDOW; IT DOES NOT INSTALL** (#28; owner, 2026-09-19: "when you click
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
- **EVERY TAB IS ONE WIDTH** (owner, 2026-09-21: "make tabs in both apps have a fixed size, and not
  dynamically adjust based on the content"). A tab was as wide as its label, up to 14rem, so a
  folder with a long name shoved every tab after it sideways and the close button was never in
  the same place twice. Now `flex: 0 1 114px`, min 64px (the same day: 176px first, far too wide; then "way smaller...
  around 60%", 106px; then "a bit wider like 20%", 127px; then "10% less wide", 114px): one width, and all of them shrink
  EQUALLY only when the strip runs out of room, as a browser does; the label truncates inside and
  the whole path is on the tooltip. Prism's strip does the same. `tabWidth` measures the boxes.
- **PITCH AND CINDER ARE THE APP ICON'S COLOURS** (owner, same day: "two themes that match the app
  icon colour scheme, one with orange and black, and one with orange and dark grey"; "change a
  couple is better"). Orange `#ec9448` for the cursor AND the chrome accent, on black (Pitch) and
  on the icon's own dark grey `#383c44` (Cinder). They were the two ORIGINALS whose names already
  fitted; the public schemes (Dracula, Nord, Gruvbox...) keep their real colours, since a scheme
  called Dracula that is not Dracula is a lie. Ids unchanged: they are saved-settings keys.
- **A CLICK PUTS THE CARET THERE** (owner, 2026-09-22: "click inside the text to put the caret
  there"). A plain click on the line being edited sends the Left or Right presses that walk the
  shell's cursor to the cell clicked (`core/renderer/lib/termClickCaret.ts`, pure and tested; wired in
  `TerminalPanel` `attachClickCaret`). Refused, so the click does what it always did: a drag or
  selection, a double click, a modified click, a link, a program that owns the mouse, a full-screen
  program, a view scrolled back, a hidden cursor (tracked from DECTCEM, since xterm keeps it
  private), anything printed below the line, and any row off the cursor's logical line. Wide
  characters count once; a click past the text goes to its end. Up and Down are never sent. The
  `clickCaret` e2e proves it in a real pwsh.
- **SETTINGS DESCRIPTIONS ARE PLAIN WORDS, AND THE ROWS KEEP ONE ORDER** (owner, 2026-09-22: "no
  symbols other than comma and dot, no mentioning of specific keys or tips"; "the terminal
  settings pages in Prism and Prism Terminal should be the same in terms of order"). Every hint,
  sub and note is checked by `core/shared/settingsCopy.ts` (a test in the core and one per app).
  `TERMINAL_OPTIONS` is in display order and the `options` e2e reads the page top to bottom against
  it; the Agent indicator lives in the core's appearance list, directly above its two colours.
- **THE RESTORE LOOKS UP CLAUDE SESSIONS OFF MAIN'S THREAD** (2026-09-22, the "soft lock on first
  launch"): `claudeSessionsAsync` stats sixteen at a time; a home folder holds thousands of
  transcripts. The theme wall caches each preset's resolved look, and its previews use installed
  monospace faces rather than Mac ones Windows must look up.
- **THE HELP POPUP BLURS THE WINDOW BEHIND IT AND CASTS NO SHADOW** (owner, 2026-09-22: "remove the
  shadow behind this and make the bg blurred when it's open"): `backdrop-blur` on a lighter scrim; the
  blur already lifts the panel off the page, and a shadow on top of it read as a dark halo.
- **COMMAND HELP IS A POPUP THAT SHOWS AND COPIES, AND NOTHING ELSE** (#12; owner, 2026-09-19: "an
  easy to use panel where you can find shell commands... searchable... metadata on each command so a
  natural-language search finds it... optional in settings", and 2026-09-20: "a pop up with copy
  icons for easy copying"). Built ONCE in `core/` for both apps: the catalogue and its search in
  `shared/help/`, `renderer/lib/helpPrefs.ts`, `renderer/components/HelpPanel.tsx` (props only),
  `renderer/settings/Help.tsx` + `helpOptions.ts`, and `writeClipboard` on the bridge. This app's
  part is the way in: `F1`, the ? in the title bar, "Command help" in the terminal's right-click
  menu, the row in Settings > General. The rules that must not regress:
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
- **A PAGE THAT WORKS IS NOT A PAGE THAT LOOKS RIGHT** (#20, 2026-09-19). Moving the settings into
  `core/` dropped every Tailwind class used only there (`core/` is outside the scanned root; the fix
  is the `@source` line at the top of `index.css`, do not remove it). All 14 e2e scenarios passed over
  a ruined page, because they asserted that rows EXIST. The `options` scenario now MEASURES the
  layout (card width, wall rows, row padding) and writes `.e2e-shots/settings-*.png`. After any change
  that moves UI between `src/` and `core/`, LOOK at those screenshots before calling it done.
- **MERGING TO MAIN SHIPS, IN BOTH APPS** (#23; owner, 2026-09-19: "that compiled copy needs to be auto
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
- **A terminal change goes in `core/`**, and is a change to Prism too: say so in the PR, and ask the
  owner when it would conflict with how Prism works. App-shell changes (tabs, start screen, window)
  stay in `src/`.
- **`core/` is lint-walled** (`eslint.config.js`): relative imports only (a consumer resolves
  `@shared` against ITS OWN tree, MEASURED, silently), never `window.prism` (use `termApi()`), never
  a host's `src/`, never `electron`, never `chromeTheme`. The app reaches the core through `@core`.
- **Carry the superset**: a capability only Prism uses (`cdTerm`, `decideFollow`, following the host
  style) lives in `core/` anyway; deleting it here takes it from Prism.
- Prism consumes `core/` as a DEV dependency pinned to a `core-v*` tag of the `core-dist` branch
  (`git subtree split --prefix=core`). Tags: `core-v*` for the core, `v*` for this app.

**History.** Made 2026-09-18 by COPYING Prism's terminal at Prism `4196c3a`, on the recommendation
"new repo, Prism untouched". That copy drifted within a day, which is what the core exists to end.
Prism's CLAUDE.md still holds the long history of WHY the terminal behaves as it does (search it for
the date in a copied comment).

Design spec and plan: `docs/superpowers/specs/2026-09-18-prism-terminal-design.md`,
`docs/superpowers/plans/2026-09-18-prism-terminal.md`. Owner decisions are marked `(owner)` there.

## Scope

In: tabs (a tab is ONE shell and its folder, nothing else), the agent indicator, themes + custom
theme + fonts + acrylic, tab restore with agent resume, the + with ask / fixed-folder modes and its
pinned + recent list, the start screen, find in scrollback, the paste and drop rules, close
confirmation, Explorer verbs, the update chip and its window, command help (#12), single instance.

Out, each a fresh owner decision and not a natural next step: split panes, several shells per tab,
per-shell profiles, a tray icon, multiple windows, SSH management, app styles separate from the
terminal theme, anything that reads or shows files.

## Rules that must not regress (all measured in Prism, not assumed)

- **Bundled ConPTY.** Shells spawn with `useConptyDll: true`; the inbox conhost fast-fails the whole
  app (0xc0000409) when a pty is killed mid-read. `node-pty` stays `asarUnpack`ed and
  `npmRebuild: false` (it ships N-API prebuilds; a rebuild dies in node-gyp).
- **`titleBarStyle: 'hidden'`, never `frame: false`**: DWM will not composite acrylic behind a
  frameless window.
- **Material before colour** (`material.ts`, measured on Electron 43): `setBackgroundMaterial('none')`
  rewrites the window background to white, so the colour is set AFTER the material.
- **ConPTY sends nothing on a resize**, so `fitKeepingCursorLine` carries the prompt line across by
  hand, and `windowsPty` is declared WITH a build number (without one xterm turns reflow off).
- **Typing is heard on `onKey`**, never `onData`: xterm answers the pty on its own (focus reports,
  device attributes) and those replies must not count as the user typing.
- **The indicator is the agent's own word.** Claude and Codex write their state into the terminal
  title (`lib/agentTitle.ts`); a titled session is never scored from its output. A spinner before the
  first idle title is the agent STARTING, not working. Output scoring (`termActivity`) is only the
  fallback, and an agent's startup paint is not work (`markBorn` / `startupOutput`). The rules live in
  `lib/useAgentIndicator.ts`; change them there, with Prism's reasoning in hand.
- **The indicator is MINIMAL by default and wears the THEME** (owner, 2026-09-18, #4; it was Full
  and a fixed orange in Prism and the first build). `termLook` stores the two colours as CHOICES,
  `''` meaning "follow the theme"; `lib/agentColors.ts` resolves what is in force: working = the
  chrome's own `--p-accent`, finished = the theme's green moved to the contrast floor (the fallback
  green when a palette's green IS its accent, since two states in one colour is no indicator).
  Picking a theme gives both back to the theme; a pick of your own shows a "Follow theme" button.
  Settings calls them "Agent working indicator" and "Agent finished indicator". The finished mark
  is Full's alone, so the e2e turns the volume up before it looks for one.
- **The process poll** (`agentPoll.ts`) asks only after a pty printed something and backs off 2.5s to
  20s. It reports CHANGES, so its first verdict on a shell is said once; the e2e waits for it.
- **The only command the app writes into a shell is the agent resume**, as the shell's STARTUP
  command, with the id shape-checked in main (`validResume`). Never type into a user's shell.
- **Closing the window QUITS; closing the last tab does not** (owner, 2026-09-18, after using the
  first build, which hid the window and stayed resident: "the app should actually close when you
  close it"). The last tab lands on the start screen (`EmptyState`, Tabby's shape by owner
  reference: mark, name, New terminal, the pinned + recent folders, Settings, version). Resume does
  NOT need a live process: it is `tabs.json` plus the agent's own session files at the next launch.
  So `tabs.flush()` and the window-state write both happen synchronously in `close`, and main
  ignores `tabs:changed` until the first restore has answered (a page that has not restored yet
  reports an empty list). Do not reintroduce the resident process without a fresh decision.
- **New tab is Ctrl+T and opens in the user's folder** (owner, 2026-09-18, reversing the first
  build's Ctrl+Shift+T and its "ask" default). `newTabPrefs`: mode `folder` is the default and a
  folder of `''` means the user's own, which main resolves (`homeDir()`); `ask` is the option.
  Ctrl+T is therefore taken from whatever runs in the shell (Claude Code's task list), knowingly.
  **Ctrl+W closes a tab, in BOTH apps** (owner, 2026-09-19, reversing the first build's
  Ctrl+Shift+W, which still works). Known cost, accepted: the shell loses delete-word on that chord;
  Ctrl+Backspace does the same job.
- **The window's edge is a faint hairline that follows the theme** (owner, same day;
  `windowEdge.ts` + Prism's `dwmHelper.ts`). DWM's border is always one physical pixel, so it cannot
  be thinner; what reads as thickness is contrast, so it is drawn a small step off the theme's own
  ground, and removed when maximized or fullscreen. Chromium rewrites the DWM attributes when the
  backdrop changes, so it is re-applied, debounced, after every material or ground change. Off
  under `--e2e` (the helper is a PowerShell that compiles a P/Invoke per launch). How BIG the step
  is now follows the Edges setting below (2026-09-19, #27): the hairline is the default and is the
  step it always was.
- **EDGES ARE A SETTING, AND THE DEFAULT IS THE WINDOW AS IT WAS** (owner, 2026-09-19, #27: "add
  the option to specify the edges that you have in the Terminal app, like we have in the main app,
  where you can choose like Hairline, Faint, or like Solid edges, or even No edges"). Settings >
  Appearance > Edges (`window-edges`, localStorage `prism.window.edges`, store `lib/edgesPrefs.ts`).
  The control runs WEAKEST TO STRONGEST (None, Faint, Hairline, Solid), the order of Prism's own
  Edges row: a segmented scale reads as one only in order, and the order the owner said the words
  in was a sentence, not a layout. THIS APP'S row, not the core's: the edges are the window's chrome, which in Prism belongs to the
  app style and has an Edges row of its own there, so it is in the `options` e2e's closed list of
  this app's rows and its key is not `prism.term.*`. EVERY edge in the window reads one of two
  tokens (`--p-divider`, the chrome's line; `--p-line`, the list's), core's components included, so
  the choice is applied ONCE, where `chromeTokens` derives those two, and no component knows the
  setting exists. The numbers are in `src/shared/windowEdges.ts` (shared because main reads them
  too): hairline is 7/10% and 9/12% (dark/light), EXACTLY what was hard-coded before, so nobody's
  window changed; faint (2.2/3.5%) and solid (16/18%) are Prism's `faint` and `strong`, the owner's
  word for the latter being Solid; none is alpha 00, still a colour, so a border keeps its width
  and nothing shifts (the e2e compares the layout across all four). Unlike Prism, `--p-line`
  follows too: the owner asked for every edge, and "no edges" with ruled settings rows is half a
  setting. The DWM border round the window follows as well (`window:edges` tells main, which
  validates it; `edgeFor` scales its step, and none is DWMWA_COLOR_NONE, what a maximized window
  already gets). That half is unit-tested only: the DWM helper is off under `--e2e`, so the e2e
  asserts what main HEARD, and how the border looks is on the hands-on list. The `edges` e2e
  measures real edges (a tab separator, the title bar's rule, the settings rail, a settings row),
  WAITING for each to arrive, since the strip's border colour transitions over 550ms.
- **THE ACCENT AND THE BACKGROUND ARE SETTINGS, AND UNSET IS THE THEME'S** (owner, 2026-09-22:
  "an accent colour option which would pick the accents you see, like the blue highlight effect
  and tab effect"; "let background colour be a setting ... move those settings, bg and accent, to
  the top of the list right under font and font size"). Settings > Appearance > Background colour
  and Accent colour (`window-background`, `window-accent`; localStorage `prism.window.background`
  / `.accent`; stores `lib/backgroundPrefs.ts` / `accentPrefs.ts`, both `lib/colourPref.ts`). Each
  shows the theme's own colour until one is picked, then a plain **Reset** word (the core's
  `RESET_LINK`, Prism's own style) forgets it. This app's rows, for the edges' reason (in Prism the
  window's colours are the app style's); they sit under Font size because the core lends the place
  (`TerminalAppearanceSettings`' `afterFont`; Prism passes nothing). Applied ONCE, in `paintChrome`:
  the background replaces the theme's before `chromeTokens` measures it, so the mode, every ink and
  the accent's floor follow; the terminal follows too because the panel paints its ground from the
  same token (`paintsGround`). Known gap: xterm's ANSI floor and the character under the block
  cursor are still measured against the theme's own background, which is the core's. A chosen
  accent is KEPT where the ground can show it and only MOVED to the 3:1 floor where it cannot. The
  agent working indicator still follows the THEME's accent (a core change and an owner decision).
  The `accent` e2e measures the active tab's rule, the row order and the ground.
- **SETTINGS CONTROLS ARE NEUTRAL; ONLY SAVE WEARS THE ACCENT** (#42; owner, 2026-09-23: "i dont
  want settings buttons to be affected by the accent colour... grey based on the bg colour ... same
  colours as the drop down menus"; "the only ones to keep accented are the save buttons"; both
  apps). This narrows the accent rule above: row buttons (`ROW_BUTTON`, the dropdown's look), the
  pressed segment (`SEGMENT_ON`), a switch that is on (`SWITCH_ON`, track in the soft ink, knob in
  the ground) and dictation's buttons are greys from the theme's own tokens, in `core/` so Prism
  follows. Save changes and Save as Custom keep the accent. Still accented, since they are not
  buttons: Reset links, the chosen theme card, the dropdown's chosen item, the rail's page, focus
  rings, progress, the hotkey capture while it listens. `neutralControls.test.ts` holds the
  source; the `accent` e2e asserts a picked accent moves none of the three controls.
- **PT DEFAULT IS THE DEFAULT THEME HERE, AND FIRST IN THE WALL** (owner, 2026-09-22, handing over the palette he had saved as
  Custom: "let this be the default theme ... for prism terminal"): Wombat's colours on #121212, the
  two blacks lifted, the icon's orange `#fe8f34` as the accent. A core preset like any other, and
  this host's `defaults.theme`, so anyone who never picked a theme moves to it with the update.
- **THE CLOSE QUESTION IS ONE RULE, NOT A SETTING** (owner, 2026-09-19, #15: "remove the setting but
  just have it on smart mode by default, so it won't ask if you're in a normal shell but if you're
  working with an agent it will ask"). `core/renderer/lib/agentClose.ts`, the same in Prism: a plain
  shell closes unasked; a tab whose shell HOSTS an agent asks, working or idle (an agent waiting at
  its own prompt is still a conversation the close ends), and names it and how long it has worked;
  closing the WINDOW is held only while one is mid-answer, since idle agents come back at the next
  launch. It replaced this app's on/off switch and Prism's three modes. Proved by the e2e `closeAsk`.
- **The title bar has a settings cog and NO menu** (owner, same day: a menu of Settings + Quit was
  cut to the cog). Nothing in the UI needs to quit the app any more; the X does.
- **The theme drives the chrome** through the real `--p-*` tokens (`lib/chromeTheme.ts`). Every ink is
  moved to a contrast floor, and light/dark is MEASURED from the ground, never read off a name.
  The `:root` fallbacks in `index.css` are `chromeTokens` output for the `prism` preset; recompute
  them if either changes.
- **The terminal panel paints the ground; xterm's canvas is CLEAR** (2026-09-19, #6, owner
  screenshot: a grey bar under a black terminal). xterm sizes itself in whole rows (MEASURED: 604px
  in a 611px box), so the strip under the last row is never its to paint; with the ground on the
  canvas and a transparent box round it, that strip showed the native window background. So
  `TerminalPanel`'s box is `bg-[var(--p-bg)]` and `currentTermTheme()` hands xterm
  `background: #00000000` plus a named `cursorAccent` (it defaults to the background, which would
  make the character under a block cursor a hole). Exactly ONE coat per pixel, which also matters
  on acrylic: two translucent coats are a visibly darker panel, so App's own container behind the
  panel stays unpainted. The e2e `theme` scenario measures the strip, and fails on the old code.
- **Links are PAINTED, not only underlined on hover** (owner, 2026-09-19, #10). xterm's link addon
  marks a link only under the pointer, so `lib/termLinkPaint.ts` lays a DECORATION on each row a
  link sits on: the link colour as its foreground, a faint underline as its element, never in the
  way of a click. `lib/termLinks.ts` is the pure half: `findLinks` (a sentence's full stop and a
  bracket the link never opened are given back) and `linkColor`, which is `LINK_BLUE` moved only as
  far as the ground needs to reach 4.5:1, so it adapts to every preset and to a custom background,
  and is tested for all of them. WHAT IS SCANNED is the design: scrollback is immutable, so its
  links are painted once and ride a marker; the LIVE screen is redrawn in place by TUIs, so every
  pass throws away what it painted from the last finished line down and paints that again (a
  decoration left on a rewritten row is a blue smear over words that were never a link). Rebuilt
  on a resize (reflow) and on a theme change; not on the alternate screen. Columns are counted in
  CELLS, since a wide character is one character and two cells. xterm splits a row into spans as
  it likes, so the e2e finds a link's span by POSITION, never by its text.
- **A file dropped on the terminal types its quoted path, and the terminal answers a right-click**
  (2026-09-19, #16). Both lived in Prism's `TermDock.tsx`, the split dock, and went with it when
  the dock was stripped, while the README, the spec and PR #3 went on listing the drop as shipped
  for a day: NOTHING IN A FEATURE LIST IS TRUE UNTIL A TEST HAS DONE IT. They are on App's terminal
  host now (`data-term-host`): the drop goes through `quotePaths` and `termInput`, never Enter, and
  only over a shell; the menu is Paste (the terminal's own paste rule, via `pasteInto`), Find in
  scrollback and Close tab, with no Copy row because xterm owns its selection. The e2e performs a
  REAL drop with Chromium's drag events (`Input.dispatchDragEvent` carrying a file path): a
  synthetic DataTransfer holds a File with no path and proves nothing about `getPathForFile`.
  When a Prism component is stripped, grep what ELSE it owned before calling a feature kept.
- **Opacity is a number read defensively** (`termOpacity`): `Number(null)` is 0, and never-set must
  read as opaque.
- **Explorer verbs**: HKCU, `reg.exe` with argv only, on `Directory` and `Directory\Background`, no
  `*`. On by default, put back at launch unless somebody said no (the off-marker is the one fact
  stored), never in dev and never under `--e2e`, and the Settings switch reports what the REGISTRY
  says. `shellVerbParity.test.ts` asserts the uninstaller deletes every key the app writes.
  **BOTH ENTRIES READ "Open terminal here" AND NEITHER NAMES THE APP** (owner, 2026-09-19, #27:
  "have it say Open Terminal here and don't have any of them mention Prism, you can see that by
  the logo"; they were "Open in Prism Terminal" and "Open Prism Terminal here"). An install that
  already had them is RELABELLED by `reconcile` at launch, under the narrowest rule that does it:
  no "no" on record, the key present AND pointing at this exe (each key judged on its own), its
  label readable and different, and then only the label value is written. It never turns on an
  entry somebody turned off (that case does not even query), and `allowed` still gates it like
  every other write. The label is read by matching `REG_SZ`, never the value's name, because
  reg.exe prints "(Default)" in the language of the Windows it runs on.
- **Renderer is sandboxed** (`sandbox: true`, context isolation on). The preload reaches the
  clipboard through main for that reason. `will-navigate` and window-open allow http(s) only.
- The preload global is `window.prism` and localStorage keys are `prism.term.*`, kept from Prism so
  copied code needs no renaming. The app has its own userData (`%APPDATA%\PrismTerminal`).

## Layout

`core/` (the terminal, shared with Prism: see above). `src/main` (index.ts is wiring only;
planRestore, tabsStore, windowState, material, windowEdge, dwmHelper, verbSwitch, shellVerb,
update, argv),
`src/preload`, `src/shared` (termCwd, types, windowEdges), `src/renderer/src` (App.tsx owns the tab list and the
keys; components/; lib/ is pure and tested). One responsibility per file; aliases `@shared`,
`@renderer`. No new runtime dependency without a reason; today there are eight.

## Build, test, release

- `npm run dev`, `npm test` (vitest), `npm run typecheck`, `npm run lint`.
- `npm run e2e` builds and drives the app through Playwright over CDP, PARKED offscreen and
  unfocusable (`--e2e`), each scenario in its own profile and reaping its processes (the app is
  single-instance, so a stray one takes every later launch's folder and exits it).
  `npm run e2e -- <name>` runs the scenarios whose name contains `<name>`. Under `--e2e`: no verb write, no updater
  (unless `--preview-update` asks for the fake one, or `PT_E2E_UPDATE_OFFER` hands over a
  real-shaped offer that cannot download), and `PT_E2E_PICK` answers the folder chooser. An app whose stand-in agent is "working" will hold
  `app.close()` on the close question; end scenarios idle.
- CI (`ci.yml`): typecheck + lint + unit on PR and push to main. The e2e is the local pre-push gate.
- Shipping follows the global rules: issue, branch, PR, squash-merge, never commit to main, never
  merge without the owner's explicit approval of that PR. Bump the version inside the PR.
- `release.yml` arrives with the icon PR (#2): no release is published with the placeholder icon
  (`build/icon.ico` is currently Prism's).
- **Installing is the last verification step.** `npm run package`, kill every `PrismTerminal` and
  `PrismTerminal-Setup*` process, run `dist/PrismTerminal-Setup-x64-<version>.exe /S`, then POLL
  `%LOCALAPPDATA%\Programs\PrismTerminal\PrismTerminal.exe` until its LastWriteTime moves (it goes
  missing mid-install). Launch only after setup has gone, and report the installed version.

## Style

No em-dashes anywhere. Match the comment density of the copied code: comments say WHY, with the
measurement when there was one.
