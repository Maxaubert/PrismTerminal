import { win32 } from 'node:path'

// Windows paths on every host the tests run on.
const { basename, dirname, join } = win32

/**
 * WHAT RUNS AFTER THE APP QUITS FOR AN UPDATE: the PowerShell command the
 * handoff starts (#104). Pure, so the one piece of an update that cannot be
 * driven end to end is at least read, line by line, by a test.
 *
 * Two things it used to get wrong (owner, 2026-09-30: "i click the update
 * available icon in pt stable it updates then i reopen it and its the same
 * icon there"):
 *  - The restart dropped `--user-data-dir`. A copy started on its own profile
 *    (the owner's stable copy) came back on the regular app's.
 *  - The NSIS installer updates the INSTALLED app, in Programs. The stable copy
 *    is a plain copy in a folder of its own (tools/install-stable.ps1), so it
 *    was never updated and went on offering the same release. Run from the
 *    stable copy, the handoff now does what that script does: it waits for this
 *    process to be gone, mirrors the freshly installed app into the copy's
 *    folder, and renames the exe back.
 */
export interface HandoffInput {
  /** The downloaded installer. */
  installer: string
  /** Its temp folder, removed at the end. */
  tempDir: string
  /** The running exe, which is started again. */
  execPath: string
  /** This process, waited out before its files are replaced. */
  pid: number
  /** The profile this copy was started with, if one was named. */
  userDataDir: string | null
  /** Where the per-user installer puts the app. */
  installedDir: string
}

/** The stable copy's exe name (tools/install-stable.ps1). */
export const STABLE_EXE = 'PrismTerminalStable.exe'

/** Is this the stable copy, and one that is NOT the installed app itself? */
export function isStableCopy(execPath: string, installedDir: string): boolean {
  return (
    basename(execPath).toLowerCase() === STABLE_EXE.toLowerCase() &&
    dirname(execPath).toLowerCase() !== installedDir.toLowerCase()
  )
}

/** PowerShell's own quoting: single quotes, a quote doubled. */
const q = (s: string): string => `'${s.replace(/'/g, "''")}'`

export function handoffCommand(i: HandoffInput): string {
  const args = i.userDataDir ? ` -ArgumentList ${q(`--user-data-dir="${i.userDataDir}"`)}` : ''
  const steps = [`Start-Process -Wait -FilePath ${q(i.installer)} -ArgumentList '/S'`]
  if (isStableCopy(i.execPath, i.installedDir)) {
    const dir = dirname(i.execPath)
    steps.push(
      `Wait-Process -Id ${Math.trunc(i.pid)} -Timeout 30 -ErrorAction SilentlyContinue`,
      // Exit codes below 8 are success; /MIR makes the copy exactly the install.
      `robocopy ${q(i.installedDir)} ${q(dir)} /MIR /NFL /NDL /NJH /NJS /NP | Out-Null`,
      `Move-Item -Force -LiteralPath ${q(join(dir, 'PrismTerminal.exe'))} -Destination ${q(i.execPath)}`,
      // The uninstaller belongs to the installed app; one in the copy would remove it.
      `Get-ChildItem -LiteralPath ${q(dir)} -Filter 'Uninstall*.exe' | Remove-Item -Force`
    )
  }
  steps.push(
    `Start-Process -FilePath ${q(i.execPath)}${args}`,
    `Remove-Item -LiteralPath ${q(i.tempDir)} -Recurse -Force -ErrorAction SilentlyContinue`
  )
  return steps.join('; ')
}
