<div align="center">
  <img src="assets/prism-terminal-icon.svg" alt="Prism Terminal" width="128">

  # Prism Terminal

  Clean, customizable, made for working with agents.

  [![Windows](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?style=flat-square)](https://github.com/Maxaubert/PrismTerminal/releases/latest)
  [![Version](https://img.shields.io/github/package-json/v/Maxaubert/PrismTerminal?style=flat-square&color=fe8f34&label=version)](https://github.com/Maxaubert/PrismTerminal/releases)
  [![Built with](https://img.shields.io/badge/Electron%20·%20React%20·%20TypeScript-2b2e3a?style=flat-square)](#build-from-source)
  [![License: MIT](https://img.shields.io/badge/License-MIT-22b364?style=flat-square)](LICENSE)

  [Download](https://github.com/Maxaubert/PrismTerminal/releases/latest) · [Build from source](#build-from-source)
</div>

---

https://github.com/user-attachments/assets/c8cf96ec-566f-4339-a09a-5ea298bdb50a

Running AI agents in several folders at once? Every tab shows whether its agent is still working, and every
session comes back when you reopen the app.

## Features

| | |
|---|---|
| **Agent indicator on every tab** | A tab lights the moment Claude Code or Codex starts working and shows when the answer has landed. |
| **Sessions that come back** | Close the app and reopen it: every tab returns in its folder, and agent conversations resume on their own. |
| **Local dictation** | Hold `Right Alt` and speak. [whisper.cpp](https://github.com/ggml-org/whisper.cpp) runs on your PC, offline, and never presses Enter. |
| **Command help** | Press `F1`, describe a task in plain words and copy the command. Works offline. |
| **Themes that dress the window** | About forty themes, a theme editor, fifteen fonts and acrylic. The whole window follows the theme. |
| **Made for AI CLIs** | Images paste into Claude Code, dropped files type their path, and `Shift+Enter` is a newline. |
| **Asks before it interrupts** | Closing a tab with a running agent asks first. A plain shell just closes. |
| **Open terminal here** | Right-click any folder in Explorer to open it in a new tab. |
| **Updates with release notes** | See what changed, then install in one click. |

## Install

Download `PrismTerminal-Setup-x64-<version>.exe` from [Releases](https://github.com/Maxaubert/PrismTerminal/releases/latest)
and run it. It installs per user, without an administrator prompt.

> [!NOTE]
> The installer is not code-signed yet, so Windows SmartScreen may warn on first run: choose
> **More info**, then **Run anyway**.

**Requirements:** Windows 10 (1809 or newer) or Windows 11, x64. Acrylic needs Windows 11.
Works with PowerShell 7, Windows PowerShell, Command Prompt and any installed WSL distro.

## Keys

| Key | Action |
|---|---|
| `Ctrl+T` / `Ctrl+W` | New tab / close tab |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / previous tab |
| `Ctrl+1` to `Ctrl+9` | Jump to a tab |
| `Ctrl+F` | Find in the scrollback (`Ctrl+Shift+F` too; in vim or less, `Ctrl+F` stays page down) |
| `Ctrl+,` | Settings |
| `Ctrl+scroll` | Zoom the current tab |
| `F11` | Fullscreen |
| `F1` | Command help |
| Hold `Right Alt` | Dictate |

## Build from source

```bash
npm install
npm run fetch:bin  # the speech engine, once (pinned by SHA-256)
npm run dev        # run it
npm test           # unit tests
npm run e2e        # end-to-end tests against the built app
npm run package    # dist/PrismTerminal-Setup-x64-<version>.exe
```

Electron, React 19, TypeScript, Vite, Tailwind v4, [xterm.js](https://xtermjs.org) and
[node-pty](https://github.com/microsoft/node-pty).

## License

[MIT](LICENSE)
