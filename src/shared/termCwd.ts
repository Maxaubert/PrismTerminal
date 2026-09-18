/**
 * Where the shell is (Prism 2026-09-04, #99). Pure. In Prism this file also
 * held the sidebar's half, the inside/outside-root decision and the
 * Set-Location line main wrote on a reroot; Prism Terminal has no tree and no
 * root to follow, so only the READING survives: a tab's title and its saved
 * cwd come from the shell's own report.
 *
 * The shell tells Prism where it is the way it tells Windows Terminal: its
 * PROMPT prints `ESC ] 9 ; 9 ; <path> ESC \` (OSC 9;9). That is the only
 * source: pwsh's process cwd does not follow Set-Location, so asking the
 * process is wrong on Windows, and a report from the prompt is by definition
 * current only at an idle prompt - which is exactly when it is safe to act on.
 */

/** A drive path (`C:\x`) or a UNC path (`\\srv\share`), nothing else. */
const ABS = /^(?:[A-Za-z]:[\\/]|\\\\[^\\/])/

/**
 * The path out of an OSC 9 payload as xterm hands it over: everything after
 * the `9;` selector, so a Windows Terminal report arrives as `9;C:\path`.
 * Null for any other OSC 9 (ConEmu's progress bar rides the same number).
 */
export function parseOsc9(data: string): string | null {
  if (!data.startsWith('9;')) return null
  let p = data.slice(2).trim()
  // pwsh's prompt may quote the path; a folder cannot contain a quote.
  if (p.length > 1 && p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1)
  return ABS.test(p) ? p : null
}
