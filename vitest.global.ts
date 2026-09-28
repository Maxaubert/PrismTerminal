import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * ONE TEMP FOLDER PER TEST RUN, REMOVED AFTER IT (2026-09-28). Tests that make
 * a scratch folder with mkdtemp did not all remove it, and %TEMP% had
 * collected hundreds of `pt-*`, `pt-home-*` and `pt-atomic-*` folders (Prism's
 * suite, with the same habit, had left over forty thousand; with Temp open in
 * Prism's tree that was 47,816 rows and a stall on every click). Rather than
 * trust every test to clean up, the whole run's TEMP points into one folder
 * that goes when the run ends, passed or failed. Workers are started after
 * this runs, so they inherit it.
 */
export default function setup(): () => void {
  const run = mkdtempSync(join(tmpdir(), 'pt-vitest-'))
  process.env.TEMP = run
  process.env.TMP = run
  process.env.TMPDIR = run
  return () => {
    try {
      rmSync(run, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    } catch {
      /* a file still held open; the next run's folder is a fresh one anyway */
    }
  }
}
