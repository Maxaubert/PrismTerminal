// SETTINGS DESCRIPTIONS ARE PLAIN WORDS (owner, 2026-09-22: "make them normal
// like typical subtexts, no symbols other than comma and dot. No mentioning of
// specific keys or tips. Just a simple text description of what it does").
//
// Pure and shared by both apps' tests: each app scans its own settings source
// with `settingsDescriptions` and asserts `copyProblems` finds nothing, so a
// description that names a key or reaches for a colon fails the unit run
// rather than waiting for somebody to notice it on the page.

const ALLOWED = /^[A-Za-z0-9 ,.]*$/
const KEYS = /\b(Ctrl|Control|Shift|Alt|Enter|Escape|Esc|Tab|Backspace|Win|F\d{1,2})\b/

/** What is wrong with one description, or null when it follows the rule. */
export function copyProblem(text: string): string | null {
  if (!ALLOWED.test(text)) {
    const bad = [...new Set([...text].filter((c) => !/[A-Za-z0-9 ,.]/.test(c)))].join(' ')
    return `uses symbols other than comma and full stop: ${bad}`
  }
  const key = KEYS.exec(text)
  if (key) return `names a key: ${key[1]}`
  return null
}

/**
 * Every description a settings source file declares: the string literals of
 * `hint=`, `sub=`, `what=` and `warn=` attributes (a ternary's variants each
 * count; `${...}` holes are dropped), and `note:` fields.
 */
export function settingsDescriptions(source: string): string[] {
  const out: string[] = []
  const attr = /\b(hint|sub|what|warn)=/g
  let m: RegExpExecArray | null
  while ((m = attr.exec(source))) {
    let i = m.index + m[0].length
    const first = source[i]
    if (first === '"') {
      const end = source.indexOf('"', i + 1)
      out.push(source.slice(i + 1, end))
      continue
    }
    if (first !== '{') continue
    let depth = 0
    const start = i
    for (; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1
      else if (source[i] === '}' && (depth -= 1) === 0) break
    }
    out.push(...literals(source.slice(start + 1, i)))
  }
  const note = /\bnote:\s*(['"`])((?:\\.|(?!\1).)*)\1/g
  while ((m = note.exec(source))) out.push(m[2])
  return out.filter((s) => s.trim().length > 0)
}

function literals(expr: string): string[] {
  const out: string[] = []
  const lit = /(['"`])((?:\\.|(?!\1)[\s\S])*)\1/g
  let m: RegExpExecArray | null
  while ((m = lit.exec(expr))) {
    // A literal that is a key into something (null, a class name) is not
    // copy; copy has a space or ends a sentence.
    const text = m[2].replace(/\$\{[^}]*\}/g, '').trim()
    if (/\s/.test(text) || /\.$/.test(text)) out.push(text)
  }
  return out
}
