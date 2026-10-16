import { renameSync, writeFileSync } from 'fs'
import { rename, rm, writeFile } from 'fs/promises'

/**
 * WRITE A FILE ALL AT ONCE OR NOT AT ALL (code review 2026-09-24, #18).
 * `writeFileSync` truncates and then writes, and the app flushes tabs.json at
 * the moments it is most likely to be killed: on close, on quit, at Windows'
 * session end. A power cut between the two left a short or empty file, and
 * every tab and every agent resume with it. So the data goes to a sibling
 * `.tmp` first and is renamed over the real file, which Windows does in one
 * step: the file is always the old one or the new one, never half of either.
 */
export function writeAtomic(file: string, data: string): void {
  const tmp = `${file}.tmp`
  writeFileSync(tmp, data)
  renameSync(tmp, file)
}

/**
 * THE SAME, OFF THE MAIN THREAD, for the saves made while the app runs
 * (owner, 2026-10-15: "heavy stalls ... up to 5-10 seconds"). MEASURED in
 * Stable's diag log that morning: with the disk starved machine-wide (the
 * fs canary 1 to 7 s), main stalled 3 to 6 s with no IPC around it, and the
 * page with it, while Prism, writing less, barely did. `writeFileSync` on
 * main waits for the disk; here the data goes to the `.tmp` on the
 * threadpool, and so (since the 2026-10-16 perf review) does the rename.
 *
 * `save` is debounce-friendly: one write at a time, and a save made while one
 * is on its way replaces any other waiting, so only the newest is written
 * next. `saveNow` is the synchronous write for the close and the quit (rule
 * 7: they are the moments the process ends). Every write has a number, and a
 * rename happens only when nothing newer has landed: a slow async write that
 * finishes after `saveNow` leaves the newer file alone.
 */
export interface AtomicWriter {
  save(data: string): void
  saveNow(data: string): void
  /** For tests: settles when the async writes have. */
  idle(): Promise<void>
}

export function createAtomicWriter(file: string): AtomicWriter {
  const tmp = `${file}.tmp`
  const nowTmp = `${file}.now.tmp`
  let seq = 0
  let landed = 0
  let next: { data: string; n: number } | null = null
  let running: Promise<void> | null = null
  /**
   * THE RENAME IS OFF MAIN TOO (perf review 2026-10-16): on a starved volume a
   * metadata op waits like the write it follows, and `renameSync` held main
   * for it on every debounced save. A rename on the threadpool can land AFTER
   * a `saveNow` made while it was on its way, putting the older data over the
   * close's: so a `saveNow` made then is remembered (`redo`) and written
   * again, synchronously, the moment the rename has landed.
   */
  let renaming = false
  let redo: string | null = null
  const run = async (): Promise<void> => {
    while (next) {
      const job = next
      next = null
      try {
        await writeFile(tmp, job.data)
        if (job.n > landed) {
          landed = job.n
          renaming = true
          try {
            await rename(tmp, file)
          } finally {
            renaming = false
            const again = redo
            redo = null
            if (again !== null) {
              writeFileSync(nowTmp, again)
              renameSync(nowTmp, file)
            }
          }
        } else await rm(tmp, { force: true })
      } catch {
        /* a lost save is the one before it staying; the next save tries again */
      }
    }
  }
  return {
    save: (data) => {
      next = { data, n: (seq += 1) }
      running ??= run().finally(() => {
        running = null
      })
    },
    saveNow: (data) => {
      const n = (seq += 1)
      next = null
      writeFileSync(nowTmp, data)
      renameSync(nowTmp, file)
      landed = n
      if (renaming) redo = data
    },
    idle: async () => {
      while (running) await running
    }
  }
}
