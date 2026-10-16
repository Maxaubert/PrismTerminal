# Dictate from anywhere, and send it to a session (spec + plan)

Owner, 2026-10-16: "you can start the dictation while not having the app in focus. And you should be
able to set the key bind for the dictation ... when you start the dictation outside the app you
should still see like a sort of widget ... on the screen in whatever window you're in just to know
that you're like actually dictating ... if you don't have an orchestrator after you speak ... the
widget will show like a list of sessions and you essentially just click or pick the session ...
if you have the orchestrator the widget will just show something like completed with a check mark
and sent ... that's only if the orchestrator is actually active not just that you have the setting
turned on." Then: "there will just be one dictation key, but we'll change it from right Alt to
Control plus the Windows key", the session list also takes number keys ("an excellent idea").

Builds on PR #244 (the orchestrator: the ledger's live tabs, the app typing into a tab's Claude
prompt with its checks). Stacked on its branch; it merges after #244. Voice wake phrase and the rest
of #179 stay out.

## What the owner gets

- **One dictation key, Ctrl+Windows by default** (was right Alt, which is AltGr on the owner's
  Norwegian keyboard). Still settable in Settings > Dictation, hold-to-talk or press-to-toggle as
  today. A saved right Alt choice is kept for a user who set it; only the DEFAULT changes.
- **With Prism Terminal in front**: exactly as today (the text is pasted at the cursor of the tab in
  front, never Enter).
- **With any other app in front**: the same key starts dictation, and a small widget appears on the
  screen the pointer is on, above every window, never taking focus: a listening state with the
  live words, then the outcome.
- **When the speaking ends**:
  - **Orchestrator ACTIVE** (a tab is promoted, Claude is running in it per Windows' process list,
    and it is not waiting on a question): the text is sent to the orchestrator; the widget shows a
    check mark, "Sent to <orchestrator tab>", and fades after 2 s.
  - **Otherwise**: the widget lists the tabs where Claude is running, numbered 1 to 9 (label, folder
    and state). A click or the number key sends the text there; the widget shows the check mark and
    "Sent to <tab>". Esc, or 30 s with no pick, drops it ("Not sent"). A tab waiting on a question
    is listed but disabled ("answer its question first").
  - Nothing heard: "Nothing heard", no list.
- Settings > Dictation gets **"Dictate from any app"** (on by default when dictation is on).

## Design

### 1. The key, everywhere (a global key listener)

Windows' own global shortcuts (`RegisterHotKey`, Electron's `globalShortcut`) cannot see a chord made
only of modifiers, nor a key being HELD and released, both of which hold-to-talk on Ctrl+Win needs.
So a low-level keyboard hook (`WH_KEYBOARD_LL`) runs while the setting is on:

- It reports ONLY the configured chord's down and up, and, while the picker is open, the digits
  1 to 9 and Esc. Every other key passes untouched and is never read, logged or kept.
- While the picker is open it SWALLOWS the digits and Esc (they must not also type into the app in
  front), and nothing else, ever.
- **The Start menu**: releasing Win after a Win chord can open Start. The hook masks it the way
  AutoHotkey does: a harmless unassigned key event (VK 0xE8) just before Win's up.
- When Prism Terminal is focused the hook stays silent: the page's own key handling (today's
  `reduceKey`) keeps the in-app behaviour exactly.

**Where the hook lives, decided by a measured spike (plan step 1)**:
- (a) a long-lived Windows PowerShell helper with an `Add-Type` C# hook and a message loop, like the
  existing DWM helper (`src/main/dwmHelper.ts`): no new dependency;
- (b) `uiohook-napi`, an in-process native addon: a new runtime dependency and a native module.

Measured for each: key-to-event latency (target under 30 ms), CPU at rest, whether Windows Defender
flags or slows it (a PowerShell keyboard hook can look like a keylogger to antivirus; that would
rule (a) out for a product for others), startup cost. The owner hears the result before step 2.

### 2. The widget (an overlay window)

A second BrowserWindow: frameless, transparent, `focusable: false`, `skipTaskbar`, always on top at
the screen-saver level, shown inactive (`showInactive`) on the display under the pointer, bottom
centre above the taskbar. Sandboxed like the main window (rule 4), its own small page, no node.
Sized for the owner at 225% zoom: large type, high-contrast inks from the theme (rule 15's floor).
States: listening (a level meter and the live words), working ("Transcribing"), picking (the
numbered list), sent (check mark), not sent / nothing heard / error. A click on a list row works
without the window taking focus. It closes itself after the outcome.

### 3. Recording while the app is in the background

The capture stays in the main window's page (it already runs with `backgroundThrottling: false`),
started by main on the global key; the page streams level and live words to main, which forwards
them to the widget. Measured in step 1 that capture starts within the same time as in front.
Media pause (Sonara and the system media key) behaves as today.

### 4. Sending

The same path as the orchestrator's sends (`orchestratorSend.ts` checks, Windows' process check,
decided again right before typing and before Enter), with the widget as the caller instead of the
orchestrator tab's script. Recorded as part of the owner's exception to rule 2: dictated text goes
only into a tab whose Claude is running, never a shell, never into an open question. Dictation never
pressed Enter before; it does here, because the owner asked for "sent", and only in this route
(outside the app). Inside the app nothing changes.

The orchestrator is ACTIVE when: the Orchestrator switch is on, a tab is promoted, Windows says
Claude runs under it, and it is not asking. Anything less falls back to the picker.

## Decisions (mine, defaults; the owner can change them)

- Default key Ctrl+Win, hold-to-talk (today's default mode).
- "Dictate from any app" on by default whenever dictation is on.
- The picker lists only tabs with a running Claude; the orchestrator tab is listed first when
  present but not active.
- The widget shows the transcribed text before it is sent, so a wrong pick can be seen.

## Edge cases

| Case | Behaviour |
|---|---|
| Win+L, Win+D, Ctrl+Win+arrows while held | The chord is Ctrl+Win alone: another key pressed with it cancels the dictation and passes through, so desktop switching still works. |
| Start menu opening on release | Masked (VK 0xE8 before Win up); measured in step 1. |
| Prism Terminal minimised or closed to tray | There is no tray (scope); minimised still works. App not running: nothing (no resident process, rule 7). |
| Two monitors | The widget opens on the display under the pointer. |
| Full-screen game or video | Above it at the screen-saver level; never takes focus. |
| A tab closes between the list and the pick | The send is decided again at the pick: "Not sent: that tab has closed". |
| The orchestrator is mid-question | Not active: the picker shows, its row disabled. |
| No Claude running anywhere | "No Claude session to send to", the text kept in the widget for 10 s. |
| Antivirus flags the hook | Measured in the spike; if Defender flags (a), (b) is used. |
| Digits pressed while the picker is NOT open | Never swallowed. |
| Elevated (admin) app in front | A low-level hook does not see keys sent to elevated windows unless the app is elevated: the key does nothing there. Said in Settings' tooltip. |
| Privacy | Only the chord, digits and Esc while picking are read; nothing is written anywhere. PRIVACY.md says so. |

## Plan

1. **Spike, measured**: both hook options (latency, CPU, Defender, Start masking, startup); capture
   started from the background. Report to the owner, pick one.
2. **Core: the key**: `DEFAULT_HOTKEY` to Ctrl+Win (`MetaLeft` with ctrl), the settings key picker
   records a modifier-only chord, a stored right Alt kept; `reduceKey` tests for the chord.
3. **App: the hook** (the chosen option) behind a small module with a pure event reducer
   (`globalDictKey.ts`: chord down/up, digits, Esc, cancel on another key), started and stopped by
   the setting, never when the app is focused.
4. **App: the widget** window and page (impeccable), its states, sizes for 225% zoom; IPC
   main <-> widget <-> page.
5. **The route**: orchestrator active? send : picker; the shared send path; the outcomes.
6. **Settings + docs**: "Dictate from any app", the key's sub-text, PRIVACY.md, the rule 2
   exception's entry, docs/two-apps.md (the key default is core, so Prism gets Ctrl+Win too).
7. **Verify**: unit (reducer, route, picker), e2e (a simulated global key event through the
   module's test seam: widget opens unfocused, picker numbers, sent), a real run on this PC with
   Notepad in front, screenshots of every widget state, full e2e.
8. Versions: core minor (the key default), app minor.
