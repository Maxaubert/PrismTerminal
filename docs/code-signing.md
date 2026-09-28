# Code signing (SignPath Foundation)

Status, 2026-09-28: **prepared, not enrolled.** Releases are unsigned until the steps below are
done. The release workflow already carries the signing steps; they are skipped until the secret
`SIGNPATH_API_TOKEN` exists, so nothing breaks in the meantime.

Why SignPath Foundation: it issues a free code signing certificate to open source projects and
keeps the key in its own HSM. The owner's standing rule is "code signing via the free
open-source cert (SignPath Foundation) once a repo is enrolled; until then releases stay
unsigned". Conditions checked 2026-09-28 against <https://signpath.org/terms.html>.

## Eligibility, checked

| Condition | Prism Terminal |
|---|---|
| OSI licence, no commercial dual licence | MIT |
| No proprietary component | Electron, React, xterm.js, node-pty (MIT). The dictation engine is whisper.cpp's official binaries (MIT), bundled unmodified; SignPath allows unsigned upstream OSS binaries inside an installer. The Microsoft C++ runtime DLLs beside it are redistributable system libraries, which the terms permit. |
| Actively maintained, already released | Yes, releases on every merge (GitHub Releases) |
| Functionality described on the download page | README, Features |
| Built from source in a verifiable way | GitHub Actions, `.github/workflows/release.yml`, on GitHub-hosted runners |
| Code signing policy on the project page | README, "Code signing policy" |
| Privacy statement | [PRIVACY.md](../PRIVACY.md) (the app checks for updates, so it links a policy rather than using the "transfers nothing" sentence) |
| MFA for everyone on GitHub and SignPath | Owner to confirm on both accounts |

Prism (the viewer) is NOT eligible as it stands: it bundles the Everything search engine
(freeware, not open source) and 7-Zip's unRAR code (not an OSI licence). **Owner decision,
2026-09-28: Prism stays unsigned** ("keep unsigned"), rather than replacing those components or
buying a commercial certificate.

## What the owner does (once)

1. Make sure two-factor authentication is on for the GitHub account.
2. Apply at <https://signpath.org/apply> with the answers below.
3. When approved, SignPath sets up an organization. In it:
   - add the predefined **GitHub.com** trusted build system and link it to the project;
   - install the **SignPath GitHub App** on `Maxaubert/PrismTerminal`;
   - create the project (slug suggestion: `PrismTerminal`) with a **release-signing** policy
     that requires manual approval, and the artifact configuration below;
   - turn on two-factor authentication for the SignPath account;
   - create an API token for a CI user that may submit to that policy.
4. In the GitHub repository settings:
   - secret `SIGNPATH_API_TOKEN` = that token;
   - variables `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG`, `SIGNPATH_SIGNING_POLICY_SLUG`.
5. The next release waits in SignPath for the owner's approval, then publishes signed. Remove the
   "not code-signed yet" note under Install in the README in that release's PR.

## Application answers (to paste)

- **Project name:** Prism Terminal
- **Repository:** https://github.com/Maxaubert/PrismTerminal
- **Homepage / download page:** https://github.com/Maxaubert/PrismTerminal (releases at
  https://github.com/Maxaubert/PrismTerminal/releases)
- **Licence:** MIT
- **Description:** A tabbed Windows terminal for AI command line tools such as Claude Code and
  Codex: one shell per tab, an indicator on each tab showing whether its agent is working or
  finished, 40 colour themes that colour the whole window, tab restore that resumes agent
  sessions, searchable command help, and optional local speech-to-text dictation that runs
  entirely on the user's PC.
- **What is signed:** the Windows installer `PrismTerminal-Setup-x64-<version>.exe` (NSIS,
  built by electron-builder), one per release.
- **Build system:** GitHub Actions on GitHub-hosted Windows runners; a release is built and
  published by `.github/workflows/release.yml` on each merge to `main` that raises the version.
- **Third-party binaries in the installer:** Electron (MIT), node-pty with its bundled ConPTY
  (MIT), whisper.cpp release binaries (MIT, unmodified), Microsoft Visual C++ runtime DLLs
  (redistributable system libraries).
- **Team:** Max (@Maxaubert), author, reviewer and approver.

## Artifact configuration (SignPath project)

The installer is signed as one PE file:

```xml
<?xml version="1.0" encoding="utf-8"?>
<artifact-configuration xmlns="http://signpath.io/artifact-configuration/v1">
  <pe-file>
    <authenticode-sign />
  </pe-file>
</artifact-configuration>
```

The workflow uploads the installer with `actions/upload-artifact@v4`, submits it with
`signpath/github-action-submit-signing-request@v3`, waits, and writes the signed file over the
unsigned one before `gh release create` publishes it. The in-app updater downloads the same
asset, so updates arrive signed too.
