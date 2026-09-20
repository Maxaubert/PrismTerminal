import { execFile } from 'child_process'

/**
 * "Open terminal here" in File Explorer's context menu.
 *
 * THE LABEL DOES NOT NAME THE APP (owner, 2026-09-19, #27: "have it say Open
 * Terminal here and don't have any of them mention Prism, you can see that by
 * the logo"). Both entries carry the app's icon, which already says whose
 * terminal it is, and both open a terminal in the folder you pointed at, so
 * they read the same. They were "Open in Prism Terminal" and "Open Prism
 * Terminal here"; an install that already had them is RELABELLED at launch
 * (`staleLabelKeys`, and verbSwitch's reconcile), not left with the old text.
 *
 * Written to HKCU only - per user, no elevation, nothing machine-wide - as a
 * classic shell verb under `Directory` (any folder) and `Directory\Background`
 * (the empty space inside one). NO verb under `*`: a terminal opens folders,
 * and a row on every file's menu would be a row nobody asked for. The key name
 * is `PrismTerminal`, distinct from Prism's own `OpenWithPrism`, so the two
 * apps installed side by side never write over each other's verb.
 *
 * WINDOWS 11 CAVEAT, stated rather than papered over: the short menu that
 * appears on right-click is built from IExplorerCommand handlers, which need a
 * registered COM DLL. A classic verb like this one appears under "Show more
 * options" (Shift+F10 opens that menu directly). Every app that has not
 * shipped a shell extension DLL is in the same position.
 *
 * Registry writes go through reg.exe with arguments only - never a command
 * line - the same enumerated-exe rule the rest of Prism follows.
 */

const DIR_KEY = 'HKCU\\Software\\Classes\\Directory\\shell\\PrismTerminal'
/** Right-click on the folder's BACKGROUND - Explorer's empty space, nothing
 *  selected. A different key with a different substitution: %V is the folder
 *  being viewed and %1 is empty there, which is why one verb cannot serve
 *  both. */
const BG_KEY = 'HKCU\\Software\\Classes\\Directory\\Background\\shell\\PrismTerminal'

export const verbKeys = (): string[] => [DIR_KEY, BG_KEY]

/** What both entries are called in the menu. One label: see the header. */
export const VERB_LABEL = 'Open terminal here'

/** What each key is called in the menu, and what Explorer substitutes for it. */
export function verbSpec(key: string): { label: string; arg: string } {
  // A background click has no %1: the folder you are IN arrives as %V.
  return { label: VERB_LABEL, arg: key === BG_KEY ? '%V' : '%1' }
}

/** The complete `reg` argument lists that create the verb - verb included,
 *  so a caller cannot forget it (one did, and the switch read as off after a
 *  successful write). */
export function addArgs(exe: string): string[][] {
  const out: string[][] = []
  for (const key of verbKeys()) {
    const { label, arg } = verbSpec(key)
    // The label Explorer shows, and the icon beside it.
    out.push(['add', key, '/ve', '/t', 'REG_SZ', '/d', label, '/f'])
    out.push(['add', key, '/v', 'Icon', '/t', 'REG_SZ', '/d', `${exe},0`, '/f'])
    // The substitution is quoted inside the value: a path with spaces is one
    // argument.
    out.push(['add', `${key}\\command`, '/ve', '/t', 'REG_SZ', '/d', `"${exe}" "${arg}"`, '/f'])
  }
  return out
}

/** The `reg delete` argument lists that remove it. */
export function removeArgs(): string[][] {
  return verbKeys().map((key) => ['delete', key, '/f'])
}

/** The `reg query` argument list that asks whether it is there: the folder
 *  verb's command, unless another of the keys is named. */
export function queryArgs(key: string = DIR_KEY): string[] {
  return ['query', `${key}\\command`, '/ve']
}

/** The `reg query` argument list that reads a key's LABEL, its default value. */
export function labelQueryArgs(key: string): string[] {
  return ['query', key, '/ve']
}

/** The one `reg add` that rewrites a key's label and nothing else. */
export function labelArgs(key: string): string[] {
  return ['add', key, '/ve', '/t', 'REG_SZ', '/d', verbSpec(key).label, '/f']
}

/**
 * The label out of what `reg query <key> /ve` printed, or null when there is
 * none to read.
 *
 * Matched on `REG_SZ`, never on the value's NAME: reg.exe prints the default
 * value as "(Default)" on an English Windows and as something else on every
 * other ("(Standard)" on a Norwegian one), and this is a product for other
 * people. MEASURED on this machine, 2026-09-19: the line is four spaces, the
 * name, four spaces, REG_SZ, four spaces, the label, CRLF.
 */
export function readLabel(regOutput: string): string | null {
  const m = /^[ \t]+.*?[ \t]+REG_SZ(?:[ \t]{1,4}(.*?))?[ \t]*\r?$/m.exec(regOutput)
  return m ? (m[1] ?? '') : null
}

/**
 * Does the value reg.exe printed point at THIS build?
 *
 * An installer that moved, or a second copy run from a build folder, would
 * otherwise leave a verb pointing somewhere the user did not mean.
 */
export function pointsAt(regOutput: string, exe: string): boolean {
  return regOutput.toLowerCase().includes(exe.toLowerCase())
}

function reg(args: string[]): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    execFile('reg.exe', args, { windowsHide: true, timeout: 10000 }, (err, stdout) =>
      resolve({ ok: !err, out: stdout ?? '' })
    )
  })
}

/**
 * Should the verb be (re)written on this launch?
 *
 * THE ONE FACT WORTH STORING IS THE NO. Everything else can be read back from
 * the registry, and a marker saying "the default has been applied" recorded the
 * wrong thing: every upgrade runs the old uninstaller, which deletes the verb
 * keys, while userData survives - so the marker said done, the keys were gone,
 * and the verb had to be switched on by hand after every build.
 *
 * `saidNo` is honoured forever, which is the rule that stops a default
 * reapplying itself and making the switch a lie. Without it, an absent verb is
 * simply a verb to put back: a user who never touched the switch cannot tell an
 * upgrade from a fresh install and should not have to.
 */
export function shouldWriteVerb(saidNo: boolean, installed: boolean): boolean {
  return !saidNo && !installed
}

/** Is the verb registered, and pointing at this executable? */
export async function verbInstalled(exe: string): Promise<boolean> {
  const r = await reg(queryArgs())
  return r.ok && pointsAt(r.out, exe)
}

/**
 * The keys whose entry is ON, points at THIS build, and says something other
 * than today's label: an install made before the label changed (#27).
 *
 * Each key is judged on its OWN command and its OWN label. A key that is
 * absent, or that points at some other copy, is never in the answer: writing
 * a label under it would create half an entry (a name with no command), or
 * rename a row that belongs to a different install. A key whose label cannot
 * be read is left alone as well, since "could not read" is not "stale".
 */
export async function staleLabelKeys(exe: string): Promise<string[]> {
  const out: string[] = []
  for (const key of verbKeys()) {
    const cmd = await reg(queryArgs(key))
    if (!cmd.ok || !pointsAt(cmd.out, exe)) continue
    const label = await reg(labelQueryArgs(key))
    const said = label.ok ? readLabel(label.out) : null
    if (said !== null && said !== verbSpec(key).label) out.push(key)
  }
  return out
}

/** Rewrite the label of the keys named, and only the label: the icon and the
 *  command were judged correct by whoever chose the keys. True when every
 *  write went through. */
export async function relabelVerb(keys: string[]): Promise<boolean> {
  for (const key of keys) {
    // Only ever one of OUR keys: the list comes from staleLabelKeys, but a
    // registry path is not something to take on trust from a caller.
    if (!verbKeys().includes(key)) return false
    const r = await reg(labelArgs(key))
    if (!r.ok) return false
  }
  return true
}

/** Add the verb (or repoint it at this build). True when Explorer has it. */
export async function installVerb(exe: string): Promise<boolean> {
  for (const args of addArgs(exe)) {
    const r = await reg(args)
    if (!r.ok) return false
  }
  return true
}

/** Remove the verb. True when it is gone (including when it never existed). */
export async function removeVerb(): Promise<boolean> {
  for (const args of removeArgs()) {
    await reg(args)
  }
  return true
}
