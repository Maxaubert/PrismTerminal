# Prism Terminal code review, 2026-09-24

Five area reviewers, each finding then checked by an adversarial verifier. 39 confirmed, 1 refuted. Sorted by severity.

## 1. [high] Pasted text is not sanitised, so an embedded ESC[201~ escapes bracketed paste and runs commands

**Where:** `core/renderer/components/TerminalPanel.tsx:672` (Terminal renderer core)

**Scenario:** xterm 6's paste only replaces newlines and wraps the text in ESC[200~ ... ESC[201~. It does not strip ESC (checked in node_modules/@xterm/xterm/lib/xterm.js). A web page or chat can put this on the clipboard: `echo hi` + `\x1b[201~` + `rm -rf ~` + `\r`. The user presses Ctrl+V at a pwsh or bash prompt, or into Claude Code's input. The shell sees the paste end early, and everything after that is read as typed keys, CR included, so the command runs without the user pressing Enter. This breaks the guarantee that bracketed paste gives. The same unsanitised path is used by Ctrl+Shift+V (line 756) and by the right-click Paste through pasteHere.

**Fix:** Put a sanitiser in termPaste (pure and testable). Remove ESC (\x1b) and C1 CSI (\x9b), and optionally other C0 controls except \t and \n, from `decision.data` and `clip.text` before `term.paste`. Add a unit test in which a payload containing \x1b[201~ comes out with no ESC. Windows Terminal and other modern terminals filter paste the same way.

**Verifier:** Confirmed. @xterm/xterm 6.0.0's paste only replaces \r?\n with \r and wraps the text in ESC[200~...ESC[201~ (checked in lib/xterm.js). Main's clipboard:read returns clipboard.readText() raw, and nothing in termPaste, pasteHere or the Ctrl+Shift+V branch removes ESC or C1 controls. A clipboard payload containing \x1b[201~ ends the bracket early and its trailing CR runs the rest. This is a classic paste-injection hole.

## 2. [medium] The adopted warm shell's leftover onExit deletes a NEWER warm shell from the map, which leaks a hidden pty

**Where:** `core/main/terminal.ts:211` (Main process, IPC and security)

**Scenario:** prewarmShell subscribes p.onExit(() => { w.exited = true; warm.delete(key) }) and never keeps the disposable. On adoption only w.sub (onData) is disposed. App.tsx calls prewarm() right after every openTab, so the same folder is warmed again at once and there is a new warm entry under the same key. When the adopted tab later ends (Ctrl+W, since killTerm kills the pty and onExit fires, or `exit` typed in the shell), the stale handler runs warm.delete(key) and removes the NEW warm shell without killing it. That pwsh/conhost pair is now in neither `warm` nor `sessions`: it is never adopted, and killWarm/killAll never kill it. One hidden shell leaks per open-then-close cycle in the default folder for the life of the app.

**Fix:** Keep the onExit disposable on WarmShell (for example w.exitSub) and dispose it on adoption and in killWarm/eviction. Alternatively guard the handler: `if (warm.get(key) === w) warm.delete(key)`.

**Verifier:** Confirmed. prewarmShell's p.onExit (core/main/terminal.ts:211) runs warm.delete(key) without checking identity, and it is never disposed on adoption (only w.sub is). A reachable path: launch, which prewarms home (W1). Ctrl+T adopts W1. Then openRecent (App.tsx:469-474) calls prewarm() for home again and creates W2 under the same key. Ctrl+W on the home tab kills W1, and the stale handler deletes W2 from `warm` without killing it. After that neither killWarm nor killAll can reach it, so the hidden shell stays until the app quits.

## 3. [medium] System tools are started by bare name (powershell.exe, where, wsl.exe, reg.exe), so libuv searches the process's current directory first

**Where:** `src/main/dwmHelper.ts:29` (Main process, IPC and security)

**Scenario:** dwmHelper spawns 'powershell.exe' at launch (warmDwmHelper). agentPoll runs execFile('powershell.exe') (core/main/agentPoll.ts:26), shells.ts runs 'where' and 'wsl.exe' (lines 51 and 87), shellVerb runs 'reg.exe' (line 114), and update.ts spawns 'powershell' (line 163). On Windows, libuv's search_path looks in the current working directory before PATH. The app never calls chdir, and 'Open terminal here' on a folder background can start it with that folder as its working directory. A downloaded or extracted folder that contains powershell.exe or where.exe then gets that binary run by the app within seconds of launch. dictationStore.ts already guards against this for its unzip ('Found by its full path so a stray powershell.exe earlier on PATH is never run'), but the other callers do not.

**Fix:** Resolve every system tool to an absolute path under %SystemRoot%\System32 (powershell under WindowsPowerShell\v1.0), as expandArchive does. Also call process.chdir(homedir()) or chdir to the app folder early in main. For pwsh.exe, use the full path that `where` returned.

**Verifier:** Confirmed. dwmHelper spawns 'powershell.exe' by bare name, shells.ts runs 'where' and 'wsl.exe', update.ts runs 'powershell', and agentPoll does the same. libuv's search_path looks in the current directory before PATH for a bare filename. The app never chdirs, and Explorer's Directory\Background verb starts it with the viewed folder as its cwd, so warmDwmHelper at ready-to-show would run a planted powershell.exe from that folder. dictationStore already resolves by full path for this exact reason, so the pattern is known and was not applied everywhere.

## 4. [medium] A second hotkey hold during 'transcribing' re-runs finishStop on the same recording, so the clip is pasted twice

**Where:** `core/renderer/lib/dictation.ts:246` (Terminal renderer core)

**Scenario:** `rec` stays set to the finished recording until the final transcribe resolves (line 223), and the key reducer knows nothing about `rec`. The user dictates a sentence and releases the key. While the CPU model is still transcribing (often more than a second), they hold Right Alt again for the next sentence. `begin()` returns early because `rec` is set, so nothing records. On release the reducer emits 'stop', and `stop()` finds `rec === r` with `r.capture` set, so it calls `finishStop(r)` a second time. `snapshot()` still returns the stored chunks, so the first clip is transcribed again and `pasteTextInto` types it into the shell a second time. The same gap affects a cancel: Escape during that phantom listen, or switching dictation off during 'transcribing', runs `finishCancel(r)` and sets the view to idle, but the pending `finishStop` still pastes afterwards. So text lands in the shell after the user cancelled.

**Fix:** Mark a recording as finished when it stops. Set `r.ended = 'stop'` (or a `finishing` flag) at the start of finishStop, and have stop() and cancel() ignore a recording that is already finishing. For cancel during transcribing, set a `cancelled` flag that finishStop checks before `pasteTextInto`. Also make begin() and the reducer agree: while `view.phase === 'transcribing'`, report the refused start (say 'Still transcribing') or reset keyState, so no 'stop' follows a start that never began.

**Verifier:** Confirmed. finishStop clears `rec` only after the awaited transcribe, endCapture never nulls r.capture, and micCapture.snapshot() still returns the chunks after stop(). The reducer (dictationKey.ts) knows nothing about `rec`. A second hold during 'transcribing' therefore gives start (begin returns early because rec is set) and then stop, and stop() calls finishStop(r) again, so the same clip is transcribed and pasted twice. A cancel or dictation-off during transcribing runs finishCancel, but the pending finishStop still pastes. The paste never carries Enter, so the harm is duplicated or unwanted text, not execution. Medium rather than high.

## 5. [medium] quotePaths wraps paths in double quotes, so PowerShell expands $() and $var inside a file name

**Where:** `core/renderer/lib/termPaste.ts:22` (Terminal renderer core)

**Scenario:** Windows file names may contain `$`, `(`, `)` and backticks. A user drops, or pastes as a file, a downloaded file named `report$(Start-Process calc).pdf` into a pwsh tab. The tab receives `"C:\Users\me\Downloads\report$(Start-Process calc).pdf"`. When the user adds a command in front and presses Enter (for example `notepad <path>`), PowerShell evaluates the subexpression inside the double-quoted string and runs the embedded code. Even a harmless `$HOME` in a folder name changes the path. The same function serves clipboard files (decidePaste, line 28) and App's file drop.

**Fix:** Quote for the target shell. For pwsh and powershell, use single quotes and double any embedded ' (`'${p.replace(/'/g, "''")}'`), because single-quoted strings do no expansion. Keep double quotes for cmd, and use single quotes for bash/WSL. To do this, pass the session's shell kind (already known through shellId or the help shell map) into quotePaths and decidePaste.

**Verifier:** Confirmed. quotePaths wraps each path in plain double quotes (termPaste.ts:22). It serves clipboard files (decidePaste) and App.tsx:532's drop, which goes through termInput unbracketed. In pwsh and bash, double quotes expand $() and $var, and Windows file names may contain $ ( ) `. It needs a hostile file name and the user pressing Enter, so medium.

## 6. [medium] Ctrl+C copy and Ctrl+V paste check the layout-dependent e.key, so on non-Latin layouts Ctrl+C over a selection sends an interrupt

**Where:** `core/renderer/components/TerminalPanel.tsx:698` (Terminal renderer core)

**Scenario:** On a Russian, Greek or Ukrainian layout, the physical C key gives e.key 'с'. The copy branch (line 698) and both paste branches (lines 745 and 750) never match. xterm then maps the key by keyCode 67 to \x03 and sends it. The user selects text in a tab where Claude Code (or a build) is running and presses Ctrl+C to copy. Nothing is copied and the running program gets SIGINT, so the agent's answer is interrupted. Ctrl+V likewise sends a raw ^V instead of the image-aware, bracketed paste.

**Fix:** Match the physical key: `e.code === 'KeyC'` and `e.code === 'KeyV'`, optionally OR'd with the current e.key checks. Windows Terminal uses the same physical-key rule for its copy and paste chords.

**Verifier:** Confirmed. The copy branch and both paste branches test e.key === 'c'/'v'. On Cyrillic or Greek layouts Chromium reports the layout character, so the branches miss. xterm then maps Ctrl plus keyCode 67 to \x03, so Ctrl+C over a selection interrupts the running program instead of copying. Ctrl+V sends a raw ^V instead of the app's image-aware bracketed paste. The dictation hotkey already uses e.code for exactly this reason.

## 7. [medium] cdCommand escapes only ASCII ' for pwsh; typographic quotes break out of the literal

**Where:** `core/shared/termCwd.ts:54` (Shared settings, dictation, help and update data)

**Scenario:** PowerShell treats U+2018/U+2019/U+201A/U+201B as single-quote delimiters. Prism reroots to a folder named `x’; calc; ’y` (all legal Windows filename characters, e.g. from a cloned repo or an extracted zip). cdTerm writes `Set-Location -LiteralPath 'C:\...\x’; calc; ’y'\r`: the ’ closes the string, so `calc` runs in the user's shell. A harmless name like `Max’s notes` also produces a parse error, so the shell does not follow. The cmd branch has a similar weakness: `%NAME%` inside the quotes is expanded at an interactive prompt, so the shell can land in the wrong folder.

**Fix:** For pwsh/powershell, double every single-quote form: `path.replace(/['‘’‚‛]/g, '$&$&')`. For cmd, refuse (return null) a path containing `%` or `"`. Add unit cases for ’ and %.

**Verifier:** cdCommand escapes only ASCII ' (termCwd.ts:54). PowerShell's tokenizer also treats U+2018 to U+201B as single-quote delimiters, so a folder name containing ’ closes the literal. This app cannot reach it, because src/main/index.ts:412 has mayCd: () => false. Prism can: core/main/ipc.ts:108 calls cdTerm(id, path) whenever the host's mayCd allows it, and the core is shared. A name like "Max’s notes" also breaks the cd. The cmd % expansion inside quotes at an interactive prompt is real too.

## 8. [medium] Saving from the colour editor overwrites the Custom slot without its font/size/acrylic/agent colours

**Where:** `core/renderer/settings/TerminalAppearance.tsx:549` (Shared settings, dictation, help and update data)

**Scenario:** The user saved a Custom setup with Save changes (Cascadia, 120%, acrylic on, own agent colour). Later they click the pencil on Custom and change one colour. The editor seed is paletteOf('custom'), which holds only bg/fg/cursor/ansi, and onSave calls saveCustomTermTheme(t), replacing the whole slot. Save changes then lights up at once (the baseline falls back to defaults). If they pick another theme and come back to Custom, applyCustomExtras finds no font, fontPct, acrylic or opacity, so the saved setup is gone for good.

**Fix:** Keep the extras when the editor saves, the same way Save changes does: `saveCustomTermTheme({ ...t, ...extras })`. At minimum merge the previously saved non-palette fields: `{ ...(customTermTheme() ?? {}), ...t }`.

**Verifier:** Confirmed. The editor seed is paletteOf('custom') (bg/fg/cursor/ansi only), and onSave calls saveCustomTermTheme(t), which replaces the whole slot (line 550). The saved font/fontPct/acrylic/opacity/agent colours are dropped. The baseline then falls back to the defaults, so termDirty lights up. The next pick asks first, and Save there would recover the setup. Choosing Discard, or picking Custom again later, loses it for good (applyCustomExtras finds nothing).

## 9. [medium] Changing folder remounts the terminal and takes focus from the find bar, help popup or menu

**Where:** `src/renderer/src/App.tsx:545` (App shell renderer)

**Scenario:** App passes `root={activeShell.cwd}`, and `onCwd` -> `setCwd` rewrites that cwd each time the shell reports a new folder (OSC 9;9). `root` is a dependency of TerminalPanel's attach effect (core/renderer/components/TerminalPanel.tsx:836), so each folder change runs cleanup and attach again. That detaches and re-appends the xterm element, refits, and calls `s.term.focus()` with no conditions. Example: the user runs `cd app; npm test`, opens the find bar (Ctrl+F) or the command help popup (F1) while the command runs, and starts typing a search. When the command ends, the prompt reports the new folder and focus jumps to the shell. The rest of the search text is typed into the shell. This is the popup-over-a-focused-shell failure that CLAUDE.md says the help popup must never allow, and helpStale does not catch it because it only watches activeId and findFor.

**Fix:** Give TerminalPanel a root that does not change for the tab's life. Store the spawn folder on the tab when it is created (e.g. `spawnCwd` in addTab, or a `useRef(Map)` like shellIds) and pass that as `root`. `root` is only used by createSession, which has already run by then. Alternatively, have the core read `root` through a ref so it is not an effect dependency.

**Verifier:** Confirmed. App passes root={activeShell.cwd}. onCwd calls setCwd, which rewrites the tab's cwd whenever the injected prompt reports OSC 9;9 (core/main/termPrompt.ts puts that report into every prompt). TerminalPanel's attach effect depends on [sessionId, root, shellId] and calls s.term.focus() with no conditions (TerminalPanel.tsx ~802/836). So every folder change re-attaches the terminal and takes focus from the TermFind input or the HelpPanel search. helpStale only compares activeId and findFor, so the popup stays up over a focused shell. App's own refocus effect is guarded by !findOpen and !helpOpen, but the core's attach is not guarded.

## 10. [medium] Tab chords still work under the close question and the update window, and the new terminal takes the keyboard behind them

**Where:** `src/renderer/src/App.tsx:433` (App shell renderer)

**Scenario:** A close question is open (ask set, focus on 'Close tab') for agent tab A. The user presses Ctrl+Tab, Ctrl+2 or Ctrl+T. App's capture keydown handler does not check `ask` or `update.state.open`, so it switches or opens a tab. The newly mounted TerminalPanel calls `s.term.focus()` on attach (TerminalPanel.tsx:802), so focus moves into shell B behind the modal. The Dialog only re-focuses its primary button when `title` changes. The user then presses Enter, meaning to answer the question that is still on screen, and the Enter goes into shell B: it submits the prompt to the agent there or runs the command line. The UpdateDialog behaves the same way: its Tab trap lets Ctrl+Tab through, so the press switches tabs and leaves the keyboard in a hidden shell under a modal window.

**Fix:** In onKey, while `live.current.blocked` is true (ask or update window up), swallow the tab-switching and new-tab chords (Tab, 1-9, t, ',' and f) with preventDefault and stopPropagation, and do nothing else. Ctrl+W and Alt+F4 can keep their documented behaviour. If switching tabs under the update window is meant to work, return focus to the modal after the switch instead, for example by having Dialog and UpdateDialog re-focus their primary control on a `focusin` outside themselves.

**Verifier:** Confirmed. App's capture-phase onKey never checks ask or update.state.open (live.current.blocked is used only by toggleHelp), so Ctrl+Tab, Ctrl+1-9 and Ctrl+T run while the close question is up. UpdateDialog deliberately lets Ctrl+Tab through. A newly mounted TerminalPanel calls term.focus() unconditionally. Dialog re-focuses its primary button only when title changes, so focus stays in a shell hidden behind the modal and the next Enter goes there. CLAUDE.md allows the chords to work, but its 'one question at a time' rule is about exactly this kind of hidden-focus hazard, and nothing documents it as accepted.

## 11. [medium] Release tag is created at main's HEAD at publish time, not at the commit that was built

**Where:** `.github/workflows/release.yml:162` (Build, release, CI and test harness)

**Scenario:** PR A (version 0.19.0) merges and release.yml starts a build that takes 20-40 min. PR B merges meanwhile, and its release run waits in the release-main queue. When A's run reaches `gh release create "v0.19.0" ... --generate-notes` with no --target, gh creates the tag server-side at the default branch's CURRENT head, which is B's commit. The installer shipped as v0.19.0 was built from A. The tag, the source archive and the generated notes (which now list B's PR) describe B. B's own run then sees v0.19.0 as released, or publishes 0.19.1 over the wrong base.

**Fix:** Pin the tag to the built commit with `gh release create "v$v" $exe --target "${{ github.sha }}" --title ... --generate-notes --latest`. Also refuse to publish if a `v$v` tag already exists pointing at a different commit.

**Verifier:** Confirmed, but the cited line is wrong: release.yml has only 94 lines, and the call is at line 93: `gh release create "v$v" $exe --title ... --generate-notes --latest`. It has no --target, so GitHub creates the tag at the default branch's HEAD when the release is published. checkout builds github.sha. The release-main concurrency group queues later pushes rather than blocking merges, so a merge during the build of up to 40 minutes leaves the tag, the source archive and the generated notes on a later commit than the installer was built from. Back-to-back merges happen in this workflow. The installer itself is correct, which keeps this at medium.

## 12. [low] A spawn in flight survives the kill of its tab (and duplicate ids race), leaving an orphaned shell or agent running

**Where:** `core/main/terminal.ts:277` (Main process, IPC and security)

**Scenario:** spawnTerm checks sessions.has(id), then awaits detectShells() (a cold `where` plus `wsl -l -q`, which can take seconds) and the node-pty import. Only then does it call sessions.set (line 328). At launch every restored tab spawns at once, and each can carry `claude --resume <id>`. If the user closes a tab meanwhile, term:kill arrives, killTerm finds no session and returns, and the spawn then completes and registers a shell for a tab that no longer exists. That shell, possibly a resumed Claude session, runs hidden until quit, and the agent poll still counts it. Two term:spawn calls for the same id both pass the has() check, the second overwrites the first in the map, and the first pty is never killed.

**Fix:** Keep a `pending` Set of ids: add the id before the first await, and refuse when it is already pending. In killTerm, also add the id to a `killed` set when it is pending. After the awaits in spawnTerm, if the id was killed, kill the new pty (or skip the spawn) and return false.

**Verifier:** Confirmed in code. spawnTerm checks sessions.has before `await detectShells()` and `await import('node-pty')`. killTerm returns when there is no session yet. The renderer's termSpawn .then (TerminalPanel.tsx:769) never kills a spawn that finishes after its tab is gone. detectShells is cached, though, so the window is only the cold first call at launch (a `where` plus `wsl -l -q`), and a user has to close a restored tab within that time. Real, but narrow.

## 13. [low] Nothing listens for errors on the DWM helper's stdin, so a write to a dead helper crashes main with an uncaught EPIPE

**Where:** `src/main/dwmHelper.ts:55` (Main process, IPC and security)

**Scenario:** send() writes to proc.stdin whenever proc.exitCode is still null. If the PowerShell helper dies (killed in Task Manager, crashed, or blocked by AppLocker/policy so that spawn fails asynchronously), the next edge.apply() writes before the 'exit' or 'error' event has cleared `proc`. The stream then emits 'error' (EPIPE or ERR_STREAM_DESTROYED) asynchronously. With no listener it becomes an uncaught exception in the main process, and Electron shows its JavaScript error dialog. The try/catch around write() does not catch it. core/main/mediaPause.ts handles exactly this case, with a comment explaining why.

**Fix:** Right after the spawn, add `proc.stdin?.on('error', () => { proc = null })`, as mediaPause.ts does.

**Verifier:** Confirmed. proc.stdin gets no 'error' listener (src/main/dwmHelper.ts:28-40), and the try/catch around write() cannot catch the asynchronous EPIPE / ERR_STREAM_DESTROYED. core/main/mediaPause.ts:205-207 guards exactly this case and says why. It only triggers when a write lands between the helper dying and its 'exit' event, or on an async spawn failure, so it is rare. Low, not medium.

## 14. [low] closeAgreed is set when the download STARTS, so every close during a long download skips the agent question

**Where:** `src/main/index.ts:533` (Main process, IPC and security)

**Scenario:** update:install sets closeAgreed = true before installUpdate starts fetching and clears it only on failure. The installer is about 100 MB, and on a slow link it takes minutes. App's install guard asked (or did not need to ask) at the moment of the click. If an agent starts working during the download and the user then presses Alt+F4, Ctrl+W on the last tab or the X, the close handler sees closeAgreed and closes at once. killAll ends the working agent with no question, which is the exact thing the close rule exists to prevent.

**Fix:** Pre-answer the close only at the moment of the quit. Pass a callback into installUpdate that sets closeAgreed right before its setTimeout(app.quit), or return from installUpdate and do the quit in index.ts. Leave closeAgreed false for the whole download.

**Verifier:** Confirmed. closeAgreed = true is set before the download (index.ts:533) and cleared only on failure, so an Alt+F4 during a long download with a newly working agent closes without asking. It is narrow, though: the agent has to START working during the download, since one that was working at the click already went through the install guard. The planned install quit at the end kills such an agent without asking anyway. Moving the flag to quit time only closes the Alt+F4 window.

## 15. [low] The updater downloads and silently runs whatever release-asset URL the page sends, not the offer main made

**Where:** `src/main/index.ts:534` (Main process, IPC and security)

**Scenario:** For a real offer, update:install uses the renderer's `url`. isReleaseAssetUrl only checks https://github.com/Maxaubert/PrismTerminal/releases/download/*.exe, and pendingUpdate is not required to exist. A compromised or buggy renderer (anything that can reach window.prism, see the file:// navigation finding) can pass the URL of ANY historical release installer. Main then downloads it, runs it with /S and quits: a silent downgrade to an older, possibly vulnerable, build. It works even when no update is on offer. The comment says 'WHAT IS ON OFFER decides, never what the page sent', but that is enforced only for the preview.

**Fix:** Ignore the argument. Install pendingUpdate.url, and only when pendingUpdate exists and is not a mock (still run isReleaseAssetUrl on it). Return false when there is no real offer.

**Verifier:** Accurate. For a non-mock offer, update:install uses the renderer's url, which only has to pass isReleaseAssetUrl, and it does not require pendingUpdate to exist. That allows a downgrade to any past release asset. Exploiting it needs a compromised renderer, and such a renderer already has termSpawn/termInput and so arbitrary command execution. The comment claims main's offer decides, but that is only enforced for previews. This is defence in depth, low.

## 16. [low] Relative paths from the command line resolve against the wrong folder, and are stored relative in tabs.json

**Where:** `src/main/argv.ts:53` (Main process, IPC and security)

**Scenario:** The second-instance handler (src/main/index.ts:618) ignores Electron's workingDirectory argument. pathsFromArgv then runs existsSync/statSync on the raw argument in the FIRST instance's cwd. `PrismTerminal .` or `PrismTerminal src` typed in C:\proj while the app is already running opens a tab in the running app's own cwd (or in nothing). Even on a first launch the folder is pushed unresolved ('.'), is saved to tabs.json as '.', and at the next launch from the Start menu it restores to a different folder.

**Fix:** Give foldersFromArgv a base directory. Use workingDirectory in second-instance and process.cwd() at first launch, then resolve(base, a) before the checks, and return absolute paths only.

**Verifier:** Confirmed. pathsFromArgv/foldersFromArgv return the raw argument without resolve(), second-instance (index.ts:618) ignores workingDirectory, and a first-launch '.' is pushed into the plan and saved as '.'. The installed exe is not on PATH, though, and both Explorer verbs pass absolute %1/%V, so this only affects hand-typed command lines. Low, not medium.

## 17. [low] "%V" in the command line breaks on a drive root: `"C:\"` reaches the app as `C:"`

**Where:** `src/main/shellVerb.ts:61` (Main process, IPC and security)

**Scenario:** The background verb's command is `"<exe>" "%V"`. For a right-click in the empty space of a drive root, %V is `C:\`, so the command line holds `"C:\"`. CommandLineToArgvW reads the backslash before the quote as an escaped quote, so argv gets `C:"`. existsSync fails, and 'Open terminal here' in C:\ (or any drive root) opens no tab.

**Fix:** In pathsFromArgv, normalise an argument that ends in a stray '"' (for example /^[A-Za-z]:"$/ becomes `X:\\`, and a general trailing '"' is stripped to '\\'). Alternatively register the command as `"%V."` (or `"%V\\."`) so the root never ends in a backslash.

**Verifier:** Confirmed. The background verb's command is `"<exe>" "%V"` (shellVerb.ts:61, verbSpec :46). At a drive root %V is `C:\`, and Chromium's CommandLineToArgvW parsing turns `"C:\"` into `C:"`, so existsSync fails and no tab opens. Nothing in argv.ts normalises it.

## 18. [low] tabs.json is rewritten in place (truncate then write), so a crash or power cut can wipe every saved tab

**Where:** `src/main/tabsStore.ts:63` (Main process, IPC and security)

**Scenario:** writeFileSync truncates tabs.json and then writes it. The flush runs on 'session-end' (Windows shutdown or logoff), on close and on will-quit, the moments when the process is most likely to be killed or the machine to lose power. On NTFS a truncated or zero-length file is the classic result. parseTabs then returns none(), and every tab and every agent resume is gone at the next launch. window.json (windowState.ts:361) has the same pattern, though with a harmless fallback.

**Fix:** Write atomically: writeFileSync(file + '.tmp', data), then renameSync(tmp, file). Rename replaces the target on Windows. Optionally keep the previous file as tabs.json.bak and fall back to it when the parse fails.

**Verifier:** Confirmed. writeFileSync goes straight to tabs.json (tabsStore.ts:63), with no temp file and rename, and flushes run on session-end/close. A torn write makes parseTabs return none(), and every saved tab and resume is lost. It is rare, because the file is small.

## 19. [low] Installer handoff: a failed spawn is an uncaught error and the app quits anyway, and a successful update leaves ~100 MB in %TEMP%

**Where:** `src/main/update.ts:162` (Main process, IPC and security)

**Scenario:** spawn('powershell', ...) has no 'error' listener. If PowerShell cannot be started (policy, missing, or a planted binary), the ChildProcess 'error' event is unhandled and becomes an uncaught exception in main. installUpdate has already returned true and setTimeout(app.quit, 400) still fires, so the app closes and nothing is installed or relaunched. On success, the prismterminal-update-* folder that holds the installer is never removed, so every update leaves its installer in temp for good.

**Fix:** Attach child.once('error', ...) and wait for the 'spawn' event before scheduling the quit. On error, return false and remove the temp dir. Append `; Remove-Item -LiteralPath <dir> -Recurse -Force` to the PowerShell command after the installer finishes, so the temp folder is removed.

**Verifier:** Confirmed. spawn('powershell', ...) in installUpdate (update.ts:162) has no 'error' listener, so an ENOENT/policy failure becomes an unhandled 'error' event in main, while setTimeout(app.quit) still fires and nothing is installed. On success the prismterminal-update-* temp folder with the installer is never removed. Both are rare or cosmetic. Low.

## 20. [low] fitKeepingCursorLine mixes cell offsets with UTF-16 string lengths, so the cursor is misplaced after a resize

**Where:** `core/renderer/components/TerminalPanel.tsx:169` (Terminal renderer core)

**Scenario:** `offset` counts cells ((y-first)*oldCols + cursorX), while `back = text.length - min(offset, text.length)` counts UTF-16 units of a string whose last row was right-trimmed. Case 1, the ordinary pwsh prompt `PS C:\> ` with the cursor after the trailing space: text is `PS C:\>` (7), offset is 8, so back is 0. The cursor goes to column 7 while ConPTY's cursor is at column 8, so after every width change xterm's cursor is one cell left of the shell's. Case 2, a CJK folder name before the cursor (`PS C:\日本> ` with the caret moved left): each wide character is 1 unit but 2 cells, so the cursor lands 1 cell off per wide character. Case 3, an emoji is 2 UTF-16 units but one character, which errs the other way. Keystrokes that ConPTY echoes relative to its own cursor then appear in the wrong column, which is the kind of corruption this function exists to prevent.

**Fix:** Stay in cells throughout. Record `offset` in cells as now, and after the write place the cursor at row `firstNewRow + Math.floor(offset / term.cols)`, column `offset % term.cols`. Compute `firstNewRow` as the row the write started on, adjusted by how far the buffer scrolled (end row minus the rows the text took). Do not derive the position from `text.length`. Alternatively, write the text with its trailing spaces up to the cursor (translateToString(false) sliced to the cursor's cell) so no cells are lost.

**Verifier:** Partly confirmed. `offset` counts cells, while `back` uses text.length. translateToString skips the spacer cell of a wide character, so a CJK character is 1 unit but 2 cells, and an astral non-wide character is 2 units. With the caret moved left past wide characters, the cursor lands off by the difference. The error only appears when the cursor is not at the end of the text, since back=0 whenever offset >= text.length. Case 1 (the trailing space of a pwsh prompt) is uncertain: translateToString(true) trims only cells with no content, and a written space has content 0x20. It depends on whether ConPTY emits the space or a cursor move. Real but an edge case.

## 21. [low] Shift+Enter sends backslash + CR to every shell, which runs the line with a trailing backslash at a plain prompt

**Where:** `core/renderer/components/TerminalPanel.tsx:734` (Terminal renderer core)

**Scenario:** The Shift+Enter branch applies whether or not an agent is present. At a plain pwsh or cmd prompt, the user types `Remove-Item .\build` and presses Shift+Enter expecting a newline, as PSReadLine's AddLine gives in Windows Terminal. The app types `\` and Enter into the shell, which runs `Remove-Item .\build\`, or `git commit -m "msg\` in cmd. That runs a command the user did not write. The backslash-continuation convention holds only in Claude Code and bash.

**Fix:** Send `\\\r` only when the session hosts an agent (the agent indicator's agentKinds, or a title-detected Claude). Otherwise return true so xterm sends its normal Enter, or send PSReadLine's AddLine sequence for pwsh. At least, never append \r when no agent is detected.

**Verifier:** Confirmed that Shift+Enter always sends '\\\r' with no agent check. But xterm's default for Shift+Enter is a plain \r, so the line would run anyway without this branch. The only difference at a plain pwsh or cmd prompt is a trailing backslash, which is mostly harmless (Remove-Item .\build\ acts the same as .\build). The comment shows the branch is a deliberate choice for Claude Code. It is a minor shell-side wart, not a command the user did not write.

## 22. [low] ThemeSwitchAsk re-registers its Escape listener and re-focuses Save on every render (keyed on an inline onCancel)

**Where:** `core/renderer/components/ThemeSwitchAsk.tsx:26` (Terminal renderer core)

**Scenario:** TerminalAppearance passes inline arrows (TerminalAppearance.tsx:516 on), so `[onCancel]` changes on every parent render. Each re-render tears down and re-adds the capture keydown listener and calls `save.current.focus()` again. So (a) the user Tabs to Discard, the settings page re-renders from any store notify, and focus jumps back to Save, and Enter then saves instead of discarding; (b) the teardown/re-add race documented in UpdateDialog.tsx ("Escape then does nothing", MEASURED) applies here too.

**Fix:** Use the same pattern as UpdateDialog and HelpPanel: keep onCancel in a ref updated by an effect without deps, register the listener and focus Save once in an effect with `[]`.

**Verifier:** The pattern is confirmed: TerminalAppearance passes an inline onCancel (line 516 on), and the effect keyed on [onCancel] re-focuses Save and re-adds the listener on every parent render. No routine re-render trigger while the modal is up was found, though. Stores do not change behind a modal, and only something like a window resize (wallHeight) would do it. The focus jump is possible but rare.

## 23. [low] The mount effect depends on `root`, the live cwd, so every cd detaches and re-attaches the terminal and takes focus

**Where:** `core/renderer/components/TerminalPanel.tsx:836` (Terminal renderer core)

**Scenario:** App passes `root={activeShell.cwd}` (App.tsx:545), which changes on each OSC 9;9 prompt report after a `cd`. `root` is only used when the session is created, yet the effect re-runs: it removes the xterm element, appends it again, rebuilds the ResizeObserver and calls `s.term.focus()`. Example: `cd src; Start-Sleep 2`, then Ctrl+F. When the prompt comes back, focus is taken from the find bar's input and the next characters typed go into the shell. The same happens for any overlay that relies on focus while a command that changes directory is still finishing.

**Fix:** Read `root` and `shellId` from refs (or pass them only to ensureTermSession) and key the effect on `[sessionId]` alone.

**Verifier:** Confirmed. App passes root={activeShell.cwd}, which onCwd/setCwd updates on each OSC 9;9. The effect deps are [sessionId, root, shellId], so each cd re-runs it. The xterm element is detached and re-attached, refit runs, and s.term.focus() takes focus from an open find bar input. `root` is only used by createSession for a session that does not exist yet. The effect is real, but it needs a find bar or overlay open while a directory change completes.

## 24. [low] The resume spinner never stops when the spawn fails, and keeps writing over the error

**Where:** `core/renderer/components/TerminalPanel.tsx:770` (Terminal renderer core)

**Scenario:** A restored tab with a Claude resume id starts the 120ms spinner interval (line 645). If `termSpawn` resolves false, the code writes 'Could not start the shell.' but never calls stopSpin. No pty data ever arrives, so the interval keeps writing `\r ⠋ Resuming Claude session…` onto the line below the error indefinitely, until the tab is closed. The tab looks as if it is still resuming, and the timer runs for the tab's whole life.

**Fix:** Call `stopSpin()` before writing the failure line in the `!ok` branch (and in a `.catch` on termSpawn).

**Verifier:** Confirmed. The !ok branch after termSpawn writes the error without calling stopSpin. With no pty data, onTermData never stops the interval, so the spinner keeps rewriting its line until the session is disposed (stopSpin is in unsub). It is reachable only when a resumed tab's spawn fails, which is rare.

## 25. [low] Link hit-testing counts cells but indexes a UTF-16 string, so link edges are off by one after an emoji or other astral character

**Where:** `core/renderer/components/TerminalPanel.tsx:244` (Terminal renderer core)

**Scenario:** `charAt` is the number of non-spacer cells before the click. It is compared with `findLinks(text)` spans, which are UTF-16 indices into `translateToString` output. After an astral character such as 😀 (2 UTF-16 units, 1 character) or a combining sequence, the two drift apart. On the line `😀 https://a.io/x more`, a click on the space right after the link gives charAt = link.end-1. That click is treated as on the link, so click-to-caret is refused and the right-click menu offers 'Copy link'. A click on the link's first 'h' is not recognised as a link. The same applies in termContextAt (line 375).

**Fix:** Build `text` cell by cell as termLinkPaint does (a per-UTF-16-unit cell map), then map the clicked cell to the string index through that map instead of counting cells.

**Verifier:** Confirmed. charAt counts cells of non-zero width, one per displayed character. findLinks spans are UTF-16 indices into translateToString(false), where an astral emoji is 2 units in 1 counted cell and a combining sequence is more than 1 unit in 1 cell. Link edges therefore drift by one per such character before the link, in the click gate and in termContextAt. CJK characters are unaffected, since xterm skips the spacer cell. The effect is small: a one-cell edge error.

## 26. [low] HexSwatch commits on every blur, so tabbing through a 'follow the theme' colour pins it

**Where:** `core/renderer/settings/fields.tsx:91` (Shared settings, dictation, help and update data)

**Scenario:** The Agent working indicator is unset ('' means follow the theme accent), and the field shows the in-force colour. A keyboard user tabs into the hex field and out again without typing. onBlur calls commit(text) with draft === null, so text is the value and onChange(inForce.working) runs. setAgentColor stores the hex, so the row switches to 'Uses your own colour', Reset appears, Save changes lights up, and the next theme pick opens the unsaved-changes prompt. The same happens in the host's Background colour and Accent colour rows (src Settings.tsx passes `chosen ?? fromTheme`), where focusing the field pins the theme's colour as a user choice.

**Fix:** Commit only when there is a draft that differs from the value. For example, `onBlur={() => draft !== null && commit(draft)}`, and the same for Enter. Alternatively, skip onChange when parseHexInput(raw) equals parseHexInput(value).

**Verifier:** Confirmed. With draft null, text is value, and onBlur={() => commit(text)} calls onChange(value) (fields.tsx:91). setAgentColor stores any valid hex, and colourPref.set does the same, so just focusing and blurring the field pins the in-force colour: the row flips to 'Uses your own colour' and Save changes lights up. The colour itself does not change, and the next theme pick clears the pin (resetTermExtras / onThemePicked). I rated it low, not medium.

## 27. [low] Hotkey capture accepts any plain key (letters, Enter, Space, Ctrl+C) as the dictation key

**Where:** `core/renderer/settings/Dictation.tsx:87` (Shared settings, dictation, help and update data)

**Scenario:** The user clicks the Key button, and the capture listener stays armed even if they click elsewhere on the page. They then press 'A' or Enter by accident, or on purpose. parseHotkeyFromEvent refuses only Escape, so {code:'KeyA'} is stored, and dictationHotkey() accepts any code. From then on, with dictation on, the reducer swallows every 'a' or Enter typed into every shell and starts a recording instead. The terminal can no longer type that key until the user finds Settings > Dictation > Reset. Ctrl+C or Ctrl+V can be taken the same way.

**Fix:** In HotkeyField, and again in dictationHotkey() on read, reject a non-modifier key with no modifier unless it is F1-F24 or another non-typing key (Pause, ScrollLock and similar). Also reject Enter, Tab, Backspace, Space and the Ctrl+C/V/W/T chords the terminal owns. Stop listening on a pointerdown outside the button.

**Verifier:** parseHotkeyFromEvent refuses only Escape and Unidentified, and dictationHotkey() accepts any code, so a plain letter, Enter or Space can be bound. The reducer acts on a plain key's down and swallows it. The capture ends only on a key, window blur or a second click. Binding needs the user to enter capture mode and press the key. The result shows on the button and Reset undoes it, so I rated it low, not medium. It is still a missing guard, because the design only means non-typing keys like F9 or chords.

## 28. [low] Theme editor popup takes no focus and has no focus trap, so Escape does nothing after opening it by keyboard

**Where:** `core/renderer/settings/TerminalAppearance.tsx:193` (Shared settings, dictation, help and update data)

**Scenario:** A keyboard user focuses the pencil on the selected card and presses Enter. The editor renders as a sibling of the card grid, but focus stays on the pencil behind the backdrop. The Escape handler sits on the dialog's own onKeyDown, so Escape does nothing. Tab walks the theme cards behind the modal, and Enter on one picks a theme under the open editor. The dialog also has no aria-modal. Separately, the pencil is a role=button span nested inside the card <button> (line 119), and assistive tech flattens the children of a button, so 'Edit' cannot be reached as its own control.

**Fix:** On mount, focus the first field (or the Save button). Handle Escape with a window capture listener, as ThemeSwitchAsk does. Trap Tab inside the dialog, add aria-modal="true", and return focus to the pencil on close. Render the pencil as a sibling button outside the card button (overlay it with absolute positioning) rather than nesting it.

**Verifier:** Confirmed. TermThemeEditor never moves focus. Escape is handled only by the dialog's own onKeyDown, and the editor is a sibling of the card grid, so a key event from the pencil never bubbles to it. There is no aria-modal and no Tab trap. The pencil is a role=button span nested inside the card <button> (around line 119), which is invalid nesting of interactive content.

## 29. [low] Editor 'Save as Custom' switches the theme without calling onThemePicked, so the edited background never shows

**Where:** `core/renderer/settings/TerminalAppearance.tsx:549` (Shared settings, dictation, help and update data)

**Scenario:** In Prism Terminal the user has a Background colour picked. They open the colour editor, change Background and click Save as Custom. The theme becomes 'custom', but the host's onThemePicked (which forgets the window background/accent) is not called. paintChrome keeps the picked background, and the terminal panel paints its ground from the same --p-bg, so the edited background appears nowhere. A card pick, Custom included, does clear it.

**Fix:** In the editor's onSave, call onThemePicked?.() after setTermThemeId('custom'), the same way land() does. Ask the unsaved-changes question first if termDirty, or save the extras with it (see the separate finding).

**Verifier:** Confirmed. The editor's onSave (lines 549-553) calls setTermThemeId('custom') without onThemePicked. land() does call it, and the host uses it to clear the window background and accent (Settings.tsx:290-293). A picked Background colour therefore stays over the newly edited Custom background. That is inconsistent with the #60 rule that a theme switch takes the window colours.

## 30. [low] First-download auto-select reads stale status/model from the click's render

**Where:** `core/renderer/settings/Dictation.tsx:372` (Shared settings, dictation, help and update data)

**Scenario:** With no model installed, the user clicks Download on Base and then on Small. Base finishes, and `!installed(model)` is true, so Base becomes the model. Small finishes later, but its .then closure still holds the `status` and `model` from the render at click time (nothing installed, model ''). It calls setDictationModel('small') and silently replaces the model the user already had working. The same stale read happens if the user picks a model with Use while a download is running.

**Fix:** Read fresh state when the download resolves. For example, call dictationModel() from the prefs store and api.dictationStatus() (or a ref updated each render) instead of the closed-over `installed(model)`.

**Verifier:** Confirmed. The .then closure in download() reads the installed() and model captured in the click's render. If two first downloads overlap, the second to finish still sees nothing installed and model '', so it calls setDictationModel and replaces the model the first download set. Reachable but narrow: two first-time downloads have to overlap.

## 31. [low] Under StrictMode (npm run dev) restore runs twice, doubling every tab and then tabs.json

**Where:** `src/renderer/src/App.tsx:208` (App shell renderer)

**Scenario:** main.tsx renders <App/> inside <StrictMode>. In development React mounts, runs the mount effect, cleans it up and runs it again. The effect calls `restore()` both times, and the cleanup does not cancel the pending `restoreTabs()` promise. Main answers both calls with the same saved list, since firstRestore only affects argv folders. Every saved tab is opened twice, spawning two shells and resuming each agent twice. The doubled list is then persisted through tabs:changed. Dev uses the real `%APPDATA%\PrismTerminal` userData (src/main/index.ts:65), so each `npm run dev` doubles the user's tabs.json, and the installed app restores the doubled strip too.

**Fix:** Make restore run once. Guard it with a module-level or ref flag (`if (restored.current) return; restored.current = true`), or use a `let cancelled = false` in the effect, set it in cleanup, and check it in the `.then` before opening tabs.

**Verifier:** Confirmed. main.tsx wraps App in StrictMode, and the mount effect calls restore() with no guard and no cancellation. In React 19 dev the effect runs twice, so restoreTabs is invoked twice. Main's handler returns the saved plan both times (firstRestore only gates the argv folders), and openTab has no dedupe, so every tab and every agent resume is doubled. The doubled list is then saved through tabs:changed. Dev keeps the real %APPDATA%\PrismTerminal userData unless --user-data-dir is passed. The finding is real, but only in dev: production builds do not double-invoke effects and the e2e runs a build, so shipped users are unaffected. That is why I rate it low rather than medium.

## 32. [low] The terminal's right-click menu state survives a tab change: it acts on the wrong shell or reappears later

**Where:** `src/renderer/src/App.tsx:576` (App shell renderer)

**Scenario:** The user right-clicks shell A with a selection. `termMenu` holds that selection and A's link, while the Paste and Find rows read `activeShell.id` at render time. Pressing Ctrl+Tab does not dismiss the menu, because ContextMenu only closes on Escape, pointerdown and blur. The menu stays up and Paste now pastes into shell B, while Copy still offers A's selection. If the user presses Ctrl+, instead, the menu unmounts (activeShell becomes null) but `termMenu` stays set. Clicking back to any shell tab later makes the stale menu reappear at the old position, and it now acts on that shell.

**Fix:** Store the session id in `termMenu` when it opens and render only while `termMenu.id === activeShell?.id`, using that stored id for Paste and Find. Clear `termMenu` when the active id changes, e.g. `useEffect(() => setTermMenu(null), [activeId])`.

**Verifier:** Confirmed. ContextMenu closes only on Escape keydown, pointerdown outside it, and window blur. App's Ctrl+Tab handler switches tabs without clearing termMenu, and the Paste and Find rows read activeShell.id at render time, so they act on the new shell while Copy still offers the old selection. With Ctrl+, the menu unmounts (activeShell is null) but termMenu stays set, so the menu reappears when any shell becomes active again. Minor and low severity.

## 33. [low] A drag that leaves the window or ends outside a drop target leaves the tab strip permanently non-draggable

**Where:** `src/renderer/src/components/TabStrip.tsx:113` (App shell renderer)

**Scenario:** `dragInFlight` is set on window `dragenter` and cleared only on `dragend` or `drop`. The user drags a file from Explorer over the window and then back out, or releases it over the Settings page, the start screen or a dialog, where nothing cancels dragover and so no `drop` fires. `dragend` fires on the source in Explorer, not in this document. The flag stays true, so the strip keeps the `no-drag` class and its empty area after the + no longer moves the window, until some later drag ends in a drop inside the app.

**Fix:** Also clear the flag on a window `dragleave` whose `relatedTarget` is null, meaning the drag left the document. As a fallback, clear it on the next `pointermove` or `pointerdown` after a drag, since pointer events do not fire during a drag.

**Verifier:** Confirmed. dragInFlight is set on dragstart and dragenter and cleared only on dragend and drop, and there is no dragleave handler. An external file drag that leaves the window never delivers dragend to this document. A release over an area that does not cancel dragover (Settings, the start screen, a dialog) delivers no drop. Either way the strip keeps no-drag until a later drop inside the app. The effect is small: the title bar still moves the window, and only the empty strip area stops working as a drag handle.

## 34. [low] workflow_dispatch from any branch force-pushes core-dist, tags it and can auto-merge the bump into Prism

**Where:** `.github/workflows/core-release.yml:37` (Build, release, CI and test harness)

**Scenario:** The comment presents workflow_dispatch as the way to resume a held bump, but GitHub lets the person running it pick any branch. If it is dispatched on a feature branch whose core/package.json already carries the next version, the release job splits the UNMERGED core, runs `git push -f origin core-dist-new:core-dist` (line 78), pushes a permanent `core-v<version>` tag (tags are never moved), and bump-prism opens the Prism PR. With PRISM_AUTO_MERGE=true that PR merges and Prism releases code that never passed review or merged here. This breaks the CLAUDE.md rule "Never split, tag or push core-dist by hand on main" (release candidates only as -rc tags).

**Fix:** Add `if: github.ref == 'refs/heads/main'` to the release job, or fail its first step when GITHUB_REF is not refs/heads/main. Keep dispatch only for resuming on main.

**Verifier:** Confirmed: workflow_dispatch has no branch guard. The release job splits whatever ref it checked out, force-pushes core-dist and pushes a permanent tag, and bump-prism runs on any dispatch. It is only reachable by someone with write access (the owner or an agent acting for them) who picks a non-main branch whose core version is not yet tagged. That makes it a missing safety rail against operator error rather than an exposed hole, so low, not medium.

## 35. [low] No per-scenario timeout: one hung await stalls the whole suite, and strays are never reaped

**Where:** `tools/e2e/run.mjs:2927` (Build, release, CI and test harness)

**Scenario:** `await run(ok)` has no time limit, and several awaits inside scenarios never time out. `await new Promise((r) => child.on('exit', r))` for second instances (handoff, lines 874 and 879; updateQuiet, line 2653) waits forever if the child does not get the single-instance hand-off (a stray holding a different lock, or a regression in argv handling) and opens its own window. `app.close()` never returns when the app holds the window on the close question (CLAUDE.md: a 'working' stand-in agent holds app.close()). In either case the run hangs with no FAIL line, and the reapStrays() after the scenario never runs, so the process tree stays behind.

**Fix:** Wrap each scenario as `await Promise.race([run(ok), sleep(LIMIT).then(() => { throw new Error('scenario timed out') })])` (for example 180 s, longer for dictation), then always reapStrays(). Give the child-exit waits their own race against about 15 s that kills the child and fails the check. Wrap app.close() in a helper that races about 10 s and falls back to app.process().kill().

**Verifier:** Confirmed: `await run(ok)` has no time limit (line ~2926). The child-exit waits at 874, 879 and 2653 are bare `child.on('exit')` promises, and app.close() has no timeout. A single-instance regression would hang the suite with no FAIL line and skip reapStrays. Most other awaits go through Playwright's default timeouts or until(), and the close-question hang is a documented rule ('end scenarios idle'). The suite is a local gate, so a hang is visible to whoever runs it. Robustness issue, low.

## 36. [low] Every scenario's temp profile is left in %TEMP% forever, including a 75 MB model copy per dictation run

**Where:** `tools/e2e/run.mjs:79` (Build, release, CI and test harness)

**Scenario:** world() calls mkdtempSync(join(tmpdir(), 'pt-e2e-profile-')) and never removes it; the file does not even import rmSync. Each scenario leaves a full Chromium user-data dir (caches, GPU cache, local storage, tabs.json) behind. The dictation scenario also copies ggml-tiny.bin (75 MB) into the profile (line 2675), and dictationPage creates a sparse file sized like the Base model. A full `npm run e2e` therefore leaves many profiles and at least 75 MB on the owner's disk on every run, and this grows without bound.

**Fix:** After each scenario's reapStrays() (the processes must be dead first, or Windows refuses to delete locked files), run rmSync(base, { recursive: true, force: true }) inside a try. Have world() return or record `base` so the runner can clean it up, or record every base and remove them all in a final cleanup step.

**Verifier:** Confirmed: world() calls mkdtempSync under tmpdir() and nothing removes the folder; rmSync is not even imported (line 19). The dictation scenario copies the 75 MB tiny model into join(w.profile,'dictation','models') (line 2675), and dictationPage truncateSync-extends a file to the Base model's size (line 2804). %TEMP% therefore grows on every run. It only affects the developer's disk and Storage Sense can clear it, so low rather than medium.

## 37. [low] Fixed 6 s sleep stands in for the agent poll's first verdict (indicator, closeAsk)

**Where:** `tools/e2e/run.mjs:238` (Build, release, CI and test harness)

**Scenario:** indicator (line 238) and closeAsk (line 924) sleep 6000 ms and assume the process poll's single 'no agent here' verdict has landed. That poll spawns a Windows PowerShell running Get-CimInstance Win32_Process (core/main/agentPoll.ts), which on a loaded or cold machine (Defender scanning, the first PowerShell start) can take longer than 6 s after the first output. The verdict then arrives AFTER the test has set the Claude title and clears the claim, so 'an idle Claude title is the agent being present' or 'closing its tab asks' fails at random. On a fast machine the 6 s are wasted.

**Fix:** Wait for an observable signal instead of sleeping: have main expose an e2e counter of completed polls per session (like e2eUpdateCalls), or set a data attribute when the first verdict is applied. Use until(() => polled >= 1, 20000).

**Verifier:** The sleeps are there: 6 s fixed at lines 238 and 924, and also at 2495 in updateGuard. The poll's first verdict (has=false sent once, since agentState starts empty) is what the sleep waits for. The first query is kicked 300 ms after spawn (pollAgentsSoon), and its timeout is 30 s, so a cold WMI or a loaded machine can take longer than the prompt time plus 6 s. The race is plausible but unobserved, and the code's own comments acknowledge the dependency. Low.

## 38. [low] The auto-merge gate counts any three checks instead of requiring terminal-gate by name

**Where:** `.github/workflows/core-release.yml:204` (Build, release, CI and test harness)

**Scenario:** The wait loop breaks once `gh pr checks` reports 3 or more checks, and `--watch` then waits only for the checks that exist. Today Prism has exactly ci/check, ci/bundled-indexer and terminal-gate/gate, so a count of 3 happens to mean the gate is there. If Prism adds one more check (a third ci job, CodeQL, a Vercel or labeler check), 3 can be reached before terminal-gate's run is registered. Its paths filter or its concurrency queue can also delay it. `--watch` then finishes green without it, and with PRISM_AUTO_MERGE=true a core bump merges without the terminal gate the ratchet relies on.

**Fix:** Wait until a check named `gate` from the terminal-gate workflow is present, for example `gh pr checks "$URL" --json name,workflow --jq '[.[] | select(.workflow=="terminal-gate")] | length'` >= 1. Before merging, also confirm that its state is SUCCESS, not skipped.

**Verifier:** Confirmed at lines 202-214: the loop breaks at 3 checks of any name, and `gh pr checks --watch` only waits for checks that are already registered. A skipped check also counts as passing. Whether it bites depends on Prism's check set and on whether Prism's branch protection requires terminal-gate, and neither can be verified from this repo. Reachable only if Prism adds checks or delays the gate. Low.

## 39. [low] The core-version check passes for two open PRs that bump core to the same new version

**Where:** `.github/workflows/ci.yml:59` (Build, release, CI and test harness)

**Scenario:** PR X and PR Y both change core/ and both set core/package.json to 0.16.0. On each PR, core-v0.16.0 does not exist yet, so both pass. X merges and core-release tags core-v0.16.0. Y then merges (the check is not re-run against the new main), and core-release on main fails at line 75 ('already exists with different contents'). Y's core change is on main but is never released to Prism until someone opens another bump PR. This is exactly the post-merge failure the job's comment says it prevents.

**Fix:** Require PR branches to be up to date with main (branch protection 'require branches to be up to date', which re-runs core-version on the merge result), or run core-version on merge_group as well. Alternatively, have core-release open an issue or fail loudly with a pointer, so a missing release is not silent.

**Verifier:** Confirmed: core-version checks only whether core-v<version> exists at PR time and is not re-run after another PR merges, so two PRs bumping to the same version both pass. The consequence is not silent, though: core-release fails red on main with an explicit ::error:: telling you to bump the version (line 75), which is the 'fail loudly' mitigation the fix proposes. The unreleased core change needs a follow-up bump PR. Low.

