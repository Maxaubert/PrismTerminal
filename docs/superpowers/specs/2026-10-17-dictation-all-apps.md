# Every app's sessions in the dictation list, grouped by app (spec + plan)

Owner, 2026-10-17: "I just tried opening a cloud session in Prism and tried dictating, but the session
from Prism didn't show up. So that should be fixed. I think the sessions should be divided. Like for
example, if it's a session from Prism, it should have the header Prism above it, and then I see all
the sessions from that. If it's another Prism terminal session or instance I mean, it should be called
Prism terminal, and then maybe parentheses two or something, just to know that it's a different
instance." Then, asked to build it: "Yes, plan and build it".

Builds on `2026-10-17-one-dictation.md` (the service, the link between copies, PR #246).

## What the owner gets

- The list after dictating holds the Claude sessions of EVERY app that is open: Prism Terminal, its
  stable copy, other copies, and Prism.
- Grouped under a header per app: **Prism**, **Prism Terminal**, **Prism Terminal (2)**, ...
  The stable copy is **Prism Terminal (Stable)**. A header shows only when more than one app has
  sessions. The numbers 1 to 9 run on across the groups.
- With a Prism window in front at the press, the words are typed at the cursor of Prism's front tab,
  the same as in Prism Terminal.
- Prism stops reading the key itself while a Prism Terminal runs the dictation (one key path, one
  engine), and reads it as today when none does.

## Design

1. **The link moves into the core** (`core/main/dictationLink.ts`): the messages, the key, the
   handshake, the client and the service, and the copy's name. Prism Terminal imports it from there.
2. **A client in a box** (`core/main/dictationClient.ts`): what a host needs to join, given three
   callbacks: its Claude tabs, a checked send into one (Windows' process check, decided again before
   typing and before Enter: the rules of `orchestratorSend.ts`, moved to the core with it), and a
   paste into its front tab. Prism Terminal's client role uses the same box.
3. **Which app is in front**: the hook names the foreground window's process id on every binding key
   down (not only for Prism Terminal's windows), and the service matches it against the copies on the
   link. A window of an app that is not on the link counts as "another app".
4. **The names**: each copy says its app ("Prism" or "Prism Terminal") and its kind ("Stable", "Dev",
   or none). The service numbers duplicates: "Prism Terminal (2)".
5. **The widget** draws a header row per app before its sessions (`OverlayRow` gains `group`).
6. **Prism**: after it pins this core, its main starts the client with its tabs and its paste, and its
   page turns its own key reading off while connected (`setDictationPageKeys`). That change is made in
   the Prism repo, in its own PR, by its own session, from a handoff note.

## Plan

1. Move `dictationLink` and the send rules (`orchestratorSend`'s checks) into the core; Prism
   Terminal imports them. Tests move with them.
2. `dictationClient` in the core; Prism Terminal's client role uses it.
3. The hook reports the front process id on every down; the service's routing uses the link's
   copies.
4. App names and numbering; the widget's group headers; tests (`mergeTabs`, `pickRows`, the names).
5. e2e: two copies, the list grouped under two headers.
6. Docs: two-apps (the new core contract), the core README, PRIVACY (Prism on the link).
7. Handoff to the Prism session: what to wire after pinning the new core.
