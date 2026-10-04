# Privacy

Prism Terminal has no accounts, no analytics, no telemetry and no crash reporting. It keeps your
settings and open tabs on your own PC (`%APPDATA%\PrismTerminal`), and nothing about you or what
you do in it is sent anywhere.

## What reaches the network

Prism Terminal makes **one request on its own**:

- **The update check.** The installed app asks GitHub for the latest release of this repository
  (`api.github.com/repos/Maxaubert/PrismTerminal/releases/latest`) when it starts and every four
  hours after. The request carries only what any HTTPS request carries (your IP address, and a
  user agent naming the app); GitHub's own privacy statement covers what GitHub does with it.
  Development and test builds never make it.

Everything else happens **only when you ask for it**:

- **Installing an update:** clicking Install downloads that release's installer from GitHub.
- **Dictation** (off by default): turning it on and choosing a model downloads the speech engine
  from whisper.cpp's GitHub releases and the model from Hugging Face; the optional NVIDIA
  acceleration pack is a separate download you choose. Each file is checked against a fixed
  SHA-256 before use. Your voice never leaves the PC: it goes to a speech engine running on your
  own machine (127.0.0.1, or straight into the engine's input for the Parakeet model) and is never
  written to disk.
- **Links:** clicking a link printed in the terminal opens it in your browser.
- **What you run:** the terminal runs your own shell, and whatever you run in it reaches the
  network as you tell it to.

## What it adds to Claude Code

Prism Terminal adds a small local plugin to the Claude Code sessions started in its tabs, so the tab
can show what the agent is doing: working, waiting on you, finished or failed. The plugin's hooks
print one fixed line into that tab's own terminal; they send nothing over the network, read
nothing, and write no file. It is passed through an environment variable of the tab's shell, never
written into your Claude Code settings. Settings > Appearance > "Exact status from Claude Code"
turns it off for every terminal opened afterwards.

This file is the privacy statement the [code signing policy](README.md#code-signing-policy) refers
to. If the app ever gains a request that is not listed here, this file changes in the same pull
request.
