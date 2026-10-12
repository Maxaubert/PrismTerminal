/**
 * WHAT A SIDEBAR ROW SAYS UNDER ITS NAME, AND WHICH ROWS A FIND KEEPS (#162;
 * owner, 2026-10-12, of the sidebar looks mockup: "Second line: Folder path",
 * "Top: Find a tab"). Pure, so a test holds them.
 */

/** The folder a tab's folder sits in, the user's own folder as `~`: what tells
 *  two tabs with one name apart. A drive's root says the drive. */
export function folderLine(cwd: string, home: string): string {
  const path = cwd.replace(/[\\/]+$/, '')
  const cut = path.search(/[\\/][^\\/]*$/)
  if (cut <= 0) return path
  let parent = path.slice(0, cut)
  if (/^[a-z]:$/i.test(parent)) return parent.toUpperCase()
  const h = home.replace(/[\\/]+$/, '')
  if (
    h &&
    (parent.toLowerCase() === h.toLowerCase() ||
      parent.toLowerCase().startsWith(h.toLowerCase() + '\\'))
  )
    parent = '~' + parent.slice(h.length)
  return parent
}

/** Whether a row stays while finding: every word of the query, in any order,
 *  somewhere in its name or its folder; case does not matter. */
export function findKeeps(query: string, name: string, cwd: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = `${name}\n${cwd}`.toLowerCase()
  return words.every((w) => hay.includes(w))
}
