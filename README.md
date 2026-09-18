<div align="center">

# Prism Terminal

**A tabbed Windows terminal built for AI CLIs. Every tab tells you whether its agent is working.**

[![Version](https://img.shields.io/github/package-json/v/Maxaubert/PrismTerminal?color=5b5bd6&label=version)](https://github.com/Maxaubert/PrismTerminal/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/Maxaubert/PrismTerminal/ci.yml?branch=main&label=ci&color=5b5bd6)](https://github.com/Maxaubert/PrismTerminal/actions/workflows/ci.yml)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-5b5bd6)](#install)
[![License](https://img.shields.io/github/license/Maxaubert/PrismTerminal?color=5b5bd6)](LICENSE)

<img src="assets/terminal-dark.png" alt="Prism Terminal with two tabs, the second one lit orange because its agent is working" width="860">

</div>

Prism Terminal is the terminal from [Prism](https://github.com/Maxaubert/Prism), lifted out into an
app of its own. It is for people who keep Claude Code or Codex running in several folders at once
and want to know, at a glance, which one has finished.

## What it does

- **An agent indicator on every tab.** A tab lights while Claude Code or Codex is working and holds
  a "finished" colour until you visit it. It reads the agent's own word (the state each CLI writes
  into the terminal title), so it lights within milliseconds of Enter and clears the instant the
  answer lands, where a terminal that scores output is a second or two late at both ends. Two volumes: a quiet line under the tab,
  or the whole tab filled.
- **Tabs that come back.** Close the app and reopen it: every tab returns in the folder its shell
  was in, and a tab that hosted Claude or Codex resumes that conversation (`claude --resume <id>`,
  `codex resume --last`).
- **The theme is the window.** About forty terminal themes, a custom-theme editor, fifteen fonts.
  The title bar, tabs, menus and settings take their colours from the terminal theme you pick, and
  every colour is checked against a contrast floor, so no theme can make an unreadable window.
  Acrylic works with any of them, with an opacity slider.
- **Open a tab where you are.** "Open in Prism Terminal" on a folder and "Open Prism Terminal here"
  on empty space, in Explorer's right-click menu. If the app is running, the folder arrives as a new
  tab in its window.
- **New tabs your way.** The + asks for a folder each time, or always opens in one folder you
  choose. Right-click the + for pinned and recent folders.
- **Made for the way AI CLIs are used.** An image on the clipboard pastes into Claude Code, copied
  files paste as quoted paths, a file dropped on the window types its path, Shift+Enter is a
  newline, and Ctrl+C over a selection copies instead of interrupting.
- **It asks before it interrupts.** Closing a tab or the window while an agent is mid-answer asks
  first, and says which agent and how long it has been working. Off means off.

<div align="center">
<img src="assets/terminal-light.png" alt="The same window wearing a light theme: the whole chrome turns light with it" width="420">
<img src="assets/settings-appearance.png" alt="The Appearance settings page with its grid of terminal themes" width="420">
</div>

## Install

Download `PrismTerminal-Setup-x64-<version>.exe` from
[Releases](https://github.com/Maxaubert/PrismTerminal/releases) and run it. It installs per user,
with no administrator prompt.

> [!NOTE]
> The installer is **unsigned**, so Windows SmartScreen will warn on first run: choose
> "More info", then "Run anyway". Windows 10 1809 or newer, x64. Acrylic needs Windows 11.

Closing the window quits, and everything open comes back at the next launch. Closing the last tab
lands on a start screen with the folders you were last in, each one press from a shell.

## Keys

| Key | Does |
|---|---|
| `Ctrl+Shift+T` | New tab |
| `Ctrl+Shift+W` | Close tab |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / previous tab |
| `Ctrl+1` to `Ctrl+9` | Jump to a tab |
| `Ctrl+Shift+F` | Find in the scrollback |
| `Ctrl+,` | Settings |
| `Ctrl+scroll` | Zoom this tab's text |
| `F11` | Fullscreen |

Everything else belongs to the shell: plain `Ctrl+W` is still delete-word, `Escape` is still vim's.

## Shells

PowerShell 7, Windows PowerShell, Command Prompt and every installed WSL distro, whichever the
machine has. Pick the one new tabs use in Settings. PowerShell and cmd report their folder at every
prompt, which is what names the tab; a WSL tab keeps the folder it opened in.

## Build from source

```bash
npm install
npm run dev        # run it
npm test           # unit tests (vitest)
npm run e2e        # drives the built app, parked offscreen and unfocused
npm run package    # dist/PrismTerminal-Setup-x64-<version>.exe
```

Electron, React 19, TypeScript, Vite, Tailwind v4, [xterm.js](https://xtermjs.org) and
[node-pty](https://github.com/microsoft/node-pty). Design notes live in
[`docs/superpowers`](docs/superpowers).

## License

[MIT](LICENSE)
