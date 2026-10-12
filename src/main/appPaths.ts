import { homedir } from 'node:os'
import { join } from 'node:path'

/** %LOCALAPPDATA%, or where Windows keeps it when the variable is missing: one
 *  fallback for every path under it (audit 2026-10-12: the update's installed
 *  folder fell back to a relative path, the dictation folder to the real one). */
export function localAppData(): string {
  return process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
}
