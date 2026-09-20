/**
 * THE HELP PANEL'S CATALOGUE, its shape (#12).
 *
 * Owner, 2026-09-19: "make the shell more user friendly and the learning curve
 * less harsh: an easy to use panel where you can find shell commands", with
 * "metadata on each command so a natural-language search finds it ('how do I
 * find big files', not only the command's name)". And on 2026-09-20: "a pop up
 * with copy icons for easy copying, searchable, natural language".
 *
 * So an entry is written TASK FIRST: what someone wants to do, in the words
 * they would use, and only then the command that does it. The catalogue is
 * CURATED and ships with the app: it works offline, needs no model and no
 * network, and can be reviewed line by line. Nothing in it is ever run or typed
 * by the app (owner, 2026-09-19: picking a command does NOT insert it into the
 * shell). The panel shows, and copies on request.
 */

/** Which command language an entry is written in. 'any' is the same text in
 *  every shell (git, the agents' own CLIs, winget). */
export type HelpShell = 'powershell' | 'cmd' | 'bash' | 'any'

export type HelpCategory =
  | 'files' // find, list, copy, move, delete, read, search inside
  | 'folders' // move around, make, size, tree
  | 'text' // search, filter, count, compare, replace
  | 'processes' // what is running, stop it, ports
  | 'network' // connectivity, downloads, ports, DNS
  | 'system' // disk, memory, environment, versions, services
  | 'packages' // winget, apt, npm, pip
  | 'git'
  | 'shell' // history, aliases, variables, the prompt, help itself
  | 'agents' // Claude Code and Codex

export interface HelpEntry {
  /** Stable, unique, kebab-case, prefixed by its shell: 'ps-biggest-files'. */
  id: string
  shell: HelpShell
  category: HelpCategory
  /** What the person wants to do, as they would say it, sentence case, no full
   *  stop: "Find the biggest files in a folder". Under about 60 characters. */
  task: string
  /** One plain sentence on what the command does and when to reach for it. */
  summary: string
  /** THE command, copied as is. Placeholders are UPPER_SNAKE words the reader
   *  replaces (FOLDER, NAME, PORT): never angle brackets, which a shell reads
   *  as redirection. One line where the shell allows it. */
  command: string
  /** Optional: further ready-to-copy variations, each with what it changes. */
  variants?: ReadonlyArray<{ label: string; command: string }>
  /** What each placeholder stands for, when the command has any. */
  placeholders?: Readonly<Record<string, string>>
  /**
   * WORDS SOMEONE MIGHT TYPE WHO DOES NOT KNOW THE COMMAND: synonyms, the
   * everyday phrasing, the name of the same thing in another shell ("ls",
   * "dir", "grep"), the symptom ("port already in use"). Lower case. This is
   * what makes "how do I find big files" land, so be generous: 6 to 16.
   */
  keywords: ReadonlyArray<string>
  /** Set on anything that deletes, overwrites, kills or cannot be undone: one
   *  short sentence saying what is lost. The panel shows it as a warning. */
  danger?: string
}
