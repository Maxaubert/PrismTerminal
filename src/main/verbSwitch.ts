import { rm, stat, writeFile } from 'fs/promises'
import {
  installVerb,
  relabelVerb,
  removeVerb,
  shouldWriteVerb,
  staleLabelKeys,
  verbInstalled
} from './shellVerb'

/**
 * The Explorer verb's switch: the launch-time default, the Settings toggle,
 * and the one rule over both - a build that is not the INSTALLED app never
 * touches the registry.
 *
 * Not in dev and not under --e2e. `app.getPath('exe')` is the built electron
 * binary in both, and writing HKCU keys pointing at it would repoint the real
 * installed app's verb at a throwaway build - thirty e2e launches doing that
 * is its own kind of broken. So `allowed` gates every write, the toggle's as
 * well as the default's, and `writes()` counts the ones that got through: the
 * e2e asserts it is still 0 after pressing the switch.
 */
export interface VerbSwitchOpts {
  /** Packaged and not under --e2e. */
  allowed: boolean
  /** The executable the verb should point at. */
  exe: () => string
  /** Written only when someone turns the verb OFF in Settings. Its ABSENCE is
   *  what licenses a repair; see reconcile. */
  offMarker: () => string
}

export interface VerbSwitch {
  reconcile(): Promise<void>
  status(): Promise<boolean>
  set(on: boolean): Promise<boolean>
  /** Registry writes ATTEMPTED this session (adds and removes alike). */
  writes(): number
}

export function createVerbSwitch(opts: VerbSwitchOpts): VerbSwitch {
  let writes = 0
  return {
    /**
     * The verb is ON by default, and STAYS on across upgrades.
     *
     * electron-builder's NSIS uninstalls the old version before installing the
     * new one, and the uninstall macro deletes the verb keys - correctly, for a
     * real uninstall. userData survives an upgrade, so a marker saying "the
     * default was applied" would count itself as done and nothing would ever
     * put the keys back. What has to be remembered is the only thing that
     * cannot be read back from the registry - that somebody said NO. So an
     * explicit off writes a marker and is honoured forever, and everything else
     * is a repair: if nobody has said no and Explorer does not have the verb,
     * put it back.
     */
    reconcile: async () => {
      if (!opts.allowed) return
      try {
        const saidNo = !!(await stat(opts.offMarker()).catch(() => null))
        const exe = opts.exe()
        // The registry rather than a marker: it is the thing that is actually
        // wrong after an upgrade, and `verbInstalled` already checks the command
        // points at THIS build, so a moved install repoints itself too.
        if (shouldWriteVerb(saidNo, saidNo ? true : await verbInstalled(exe))) {
          writes += 1
          await installVerb(exe)
          return
        }
        // AN ENTRY THAT IS ON KEEPS UP WITH ITS LABEL (owner, 2026-09-19, #27:
        // the entries stopped naming the app, and "installs that already have
        // the entry switched on must be relabelled, not left with the old
        // text"). A present verb is otherwise left alone, so without this an
        // existing user would read "Open in Prism Terminal" for ever while a
        // fresh install read "Open terminal here". The rule is as narrow as it
        // can be made: only with no "no" on record, only a key that is there
        // and points at THIS build, only when its label reads as something
        // else, and then only the label is written. It can never turn ON an
        // entry somebody turned off: that case leaves on the next line, without
        // asking the registry anything.
        if (saidNo) return
        const stale = await staleLabelKeys(exe)
        if (stale.length === 0) return
        writes += 1
        await relabelVerb(stale)
      } catch {
        /* no userData, no registry: the switch in Settings still works */
      }
    },
    // What the REGISTRY says, not what was clicked: a verb pointing at some
    // other copy reads as off, so turning it on repoints it here.
    status: () => verbInstalled(opts.exe()),
    set: async (on) => {
      if (typeof on !== 'boolean' || !opts.allowed) return false
      // The off-marker is the record that survives an upgrade. Written when the
      // answer is no, removed when it is yes - so the reconcile on the next
      // launch repairs a wiped verb but never argues with a deliberate off.
      await (
        on
          ? rm(opts.offMarker(), { force: true })
          : writeFile(opts.offMarker(), new Date().toISOString())
      ).catch(() => undefined)
      writes += 1
      return on ? installVerb(opts.exe()) : removeVerb()
    },
    writes: () => writes
  }
}
