// The end-to-end suite: drives the BUILT app through Playwright over CDP.
//
//   npm run e2e            every scenario
//   npm run e2e -- theme   only the scenarios whose name contains "theme"
//   PT_E2E_PACKAGED=1      drive dist/win-unpacked (after `npm run package`) instead of out/:
//                          what proves the INSTALLER's layout, e.g. that the speech engine is
//                          where the packaged app looks for it
//
// OFFSCREEN and UNFOCUSED, as Prism's is. Electron has no headless mode and a
// truly hidden window stops answering clicks, so each window is PARKED
// (opacity 0, -4000,-4000), and --e2e makes main create it unfocusable and
// show it inactive, so a run never takes the caret out of what you are typing.
// Every scenario has its OWN try/catch and its own throwaway profile, and
// REAPS what it leaves behind: the app is resident by design, so a scenario
// that "closed" its window has left a process holding the single-instance lock.
import { _electron as electron } from 'playwright-core'
import { execFileSync, spawn } from 'child_process'
import { createHash } from 'crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, truncateSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const MAIN = resolve(process.cwd(), 'out/main/index.js')
const PACKAGED = process.env.PT_E2E_PACKAGED === '1' ? resolve(process.cwd(), 'dist/win-unpacked/PrismTerminal.exe') : null
const PROFILE_NAME = 'pt-e2e-profile'
const only = process.argv.slice(2).filter((a) => !a.startsWith('-'))

if (PACKAGED && !existsSync(PACKAGED)) {
  console.error('dist/win-unpacked/PrismTerminal.exe is missing: run "npm run package" first.')
  process.exit(1)
}
if (!existsSync(MAIN)) {
  console.error('out/main/index.js is missing: run "npm run build" first (npm run e2e does).')
  process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const park = ({ BrowserWindow }) => {
  for (const w of BrowserWindow.getAllWindows()) {
    w.setOpacity(0)
    w.setPosition(-4000, -4000)
  }
}

/** Kill every electron this suite started and nothing else: only the profile
 *  path is matched, so the machine's own Prism Terminal is never touched. */
function reapStrays() {
  try {
    const out = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'electron.exe' -or $_.Name -eq 'PrismTerminal.exe' } | ` +
          `Where-Object { $_.CommandLine -like '*${PROFILE_NAME}*' } | ` +
          'ForEach-Object { $_.ProcessId }'
      ],
      { encoding: 'utf8', windowsHide: true }
    )
    const pids = out.split(/\s+/).filter(Boolean)
    for (const pid of pids) {
      try {
        execFileSync('taskkill', ['/PID', pid, '/T', '/F'], { stdio: 'ignore' })
      } catch {
        /* already gone */
      }
    }
    return pids.length
  } catch {
    return 0
  }
}

/** A fresh world for one scenario: a profile and a few folders. */
function world() {
  const base = mkdtempSync(join(tmpdir(), `${PROFILE_NAME}-`))
  const dirs = { profile: join(base, 'profile'), alpha: join(base, 'alpha'), beta: join(base, 'beta') }
  for (const d of Object.values(dirs)) mkdirSync(d)
  return dirs
}

async function launch(w, { args = [], pick, env = {} } = {}) {
  const app = await electron.launch({
    ...(PACKAGED ? { executablePath: PACKAGED } : {}),
    args: [...(PACKAGED ? [] : [MAIN]), `--user-data-dir=${w.profile}`, '--e2e', ...args],
    env: { ...process.env, ...(pick ? { PT_E2E_PICK: pick } : {}), ...env }
  })
  const page = await app.firstWindow()
  await app.evaluate(park)
  await page.waitForFunction(() => !!window.prism)
  return { app, page }
}

const termText = (page) =>
  page.evaluate(() => document.querySelector('.xterm .xterm-rows')?.textContent ?? '')
const tabTitles = (page) =>
  page.evaluate(() => [...document.querySelectorAll('[data-tab]')].map(
      // The tooltip sits on the label inside the tab, not on the tab's own box.
      (t) => t.getAttribute('title') ?? t.querySelector('[title]:not([data-tab-close])')?.getAttribute('title') ?? ''
    )
  )
const tabLabels = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-tab]')].map((t) => (t.textContent ?? '').trim())
  )

/** Wait for a prompt, then type a line into the shell in front. */
async function typeLine(page, line) {
  await page.waitForFunction(
    () => /PS [^>]*>\s*$/.test((document.querySelector('.xterm .xterm-rows')?.textContent ?? '').trimEnd()),
    null,
    { timeout: 45000 }
  )
  await page.locator('.xterm').first().click({ force: true })
  await page.keyboard.type(line)
  await page.keyboard.press('Enter')
}

async function until(fn, ms = 20000, step = 150) {
  const end = Date.now() + ms
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() > end) return v
    await sleep(step)
  }
}

/**
 * What the dictation scenario speaks with and listens through (#13), fetched
 * ONCE into .e2e-cache and checked against a SHA-256 every run: the Tiny model
 * (75 MB; its url, size and checksum are read out of the core's own catalog,
 * so the e2e downloads exactly what the app would) and whisper.cpp's sample
 * clip of a known sentence.
 */
const CACHE = resolve(process.cwd(), '.e2e-cache')
const JFK = {
  url: 'https://raw.githubusercontent.com/ggml-org/whisper.cpp/b0a11594aec50892a02cd8d129eee2dfe93a8bb8/samples/jfk.wav',
  sha256: '59dfb9a4acb36fe2a2affc14bacbee2920ff435cb13cc314a08c13f66ba7860e'
}
const sha256File = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
async function cached(name, url, sha256) {
  mkdirSync(CACHE, { recursive: true })
  const file = join(CACHE, name)
  if (existsSync(file) && sha256File(file) === sha256) return file
  console.log(`  (fetching ${name} into .e2e-cache, once)`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${name}: download failed (${res.status})`)
  writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  const got = sha256File(file)
  if (got !== sha256) throw new Error(`${name}: SHA-256 mismatch (${got})`)
  return file
}
function tinyModel() {
  // The catalog builds its model urls from ONE pinned Hugging Face commit, so
  // that is what is read here: the same commit, the same file, the same sha.
  const src = readFileSync(resolve(process.cwd(), 'core/shared/dictationCatalog.ts'), 'utf8')
  const commit = src.match(/const MODELS_COMMIT = '([0-9a-f]{40})'/)?.[1]
  const block = src.slice(src.indexOf("id: 'tiny'"))
  const file = block.match(/url:\s*model\('([^']+)'\)/)?.[1]
  const sha256 = block.match(/sha256:\s*'([0-9a-f]{64})'/)?.[1]
  if (!commit || !file || !sha256) throw new Error('the catalog no longer spells the tiny model the way the e2e reads it')
  return { url: `https://huggingface.co/ggerganov/whisper.cpp/resolve/${commit}/${file}`, sha256 }
}
/** Speech servers started out of THIS checkout's engine folder, and no others:
 *  the owner's own dictation tool runs a whisper-server of its own. */
function ourSpeechServers() {
  try {
    const out = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process -Filter "Name='whisper-server.exe'" | Where-Object { $_.ExecutablePath -like '*\\vendor\\whisper\\*' -or $_.ExecutablePath -like '*\\win-unpacked\\resources\\bin\\whisper\\*' } | Measure-Object).Count`],
      { encoding: 'utf8', windowsHide: true }
    )
    return Number(out.trim()) || 0
  } catch {
    return -1
  }
}

const scenarios = {
  /** New terminal opens in the user's own folder with nothing asked (the
   *  default), Ctrl+T does the same from inside a shell, and "ask" asks. */
  async spawn(ok) {
    const w = world()
    const { app, page } = await launch(w, { pick: w.alpha })
    const home = await page.evaluate(() => window.prism.homeDir())
    ok((await page.locator('[data-empty-state]').count()) === 1, 'an empty launch lands on the start screen')
    await page.locator('[data-start-new]').click()
    ok(await until(async () => (await tabLabels(page)).length === 1), 'New terminal opens a tab with nothing asked')
    ok((await tabTitles(page))[0].toLowerCase() === home.toLowerCase(), 'in the user\'s own folder, and the tooltip is the full path')
    await typeLine(page, 'echo pt-$(20+22)-ok')
    ok(await until(async () => (await termText(page)).includes('pt-42-ok')), 'echo round-trips through the pty')
    // From INSIDE the shell: xterm has to yield the chord for App to hear it.
    await page.locator('.xterm').first().click({ force: true })
    await page.keyboard.press('Control+t')
    ok(await until(async () => (await tabLabels(page)).length === 2), 'Ctrl+T opens a tab over a focused shell')
    await page.evaluate(() => localStorage.setItem('prism.newtab.mode', 'ask'))
    await page.locator('[aria-label="New tab"]').click()
    ok(
      await until(async () => (await tabTitles(page)).some((t) => t.endsWith('alpha'))),
      'in ask mode the + opens the folder the chooser answered'
    )
    ok((await page.evaluate(() => window.prism.e2eRegWrites())) === 0, 'no registry write was attempted under --e2e')
    await app.close().catch(() => {})
  },

  /** The label follows the shell's own folder report. */
  async cwdLabel(ok) {
    const w = world()
    const { app, page } = await launch(w, { args: [w.alpha] })
    ok(await until(async () => (await tabLabels(page))[0]?.includes('alpha')), 'a launch folder opens as a tab named for it')
    await typeLine(page, 'mkdir sub | Out-Null; cd sub')
    ok(await until(async () => (await tabLabels(page))[0]?.includes('sub')), 'cd renames the tab')
    ok((await tabTitles(page))[0].endsWith('\\sub'), 'and the tooltip follows')
    await app.close().catch(() => {})
  },

  /** The agent's own word, through the title: lights, clears, and leaves a
   *  finished mark on a tab nobody is looking at. */
  async indicator(ok) {
    const w = world()
    const { app, page } = await launch(w, { args: [w.alpha, w.beta] })
    ok(await until(async () => (await tabLabels(page)).length === 2), 'two launch folders, two tabs')
    // The last launch folder is in front: beta, index 1. Never a raw
    // [Console]::Write of the sequence: that re-encodes the glyph to "?".
    // A shell stands in for Claude, so the process poll's verdict on it is "no
    // agent here", and that verdict clears a title's claim when it lands. It
    // is said once (the poll only reports changes), so let it land first.
    await page.waitForFunction(
      () => /PS [^>]*>\s*$/.test((document.querySelector('.xterm .xterm-rows')?.textContent ?? '').trimEnd()),
      null,
      { timeout: 45000 }
    )
    await sleep(6000)
    // Idle FIRST: a spinner before the agent's first rest is it starting up,
    // which is present and not working.
    await typeLine(page, "$Host.UI.RawUI.WindowTitle = [char]0x2733 + ' Claude Code'")
    ok(
      await until(() => page.evaluate(() => !!document.querySelector('[data-agent-present]')), 8000, 50),
      'an idle Claude title is the agent being present'
    )
    await typeLine(page, "$Host.UI.RawUI.WindowTitle = [char]0x25D0 + ' Claude Code'")
    const lit = await until(() => page.evaluate(() => !!document.querySelector('[data-agent-state="working"]')), 8000, 50)
    ok(lit, 'a working title lights the tab')
    // MINIMAL is the default, and its line wears the THEME'S accent: measured
    // off the computed styles, since a colour is only right on the glass.
    const mark = await page.evaluate(() => {
      const rgb = (c) => (c.match(/\d+/g) ?? []).slice(0, 3).join(',')
      const probe = document.createElement('span')
      probe.style.color = getComputedStyle(document.documentElement).getPropertyValue('--p-accent')
      document.body.appendChild(probe)
      const accent = rgb(getComputedStyle(probe).color)
      probe.remove()
      const bar = document.querySelector('.p-agent-run')
      return {
        mode: document.querySelector('[data-agent-state="working"]')?.getAttribute('data-agent'),
        bar: bar ? rgb(getComputedStyle(bar).backgroundColor) : null,
        accent
      }
    })
    ok(mark.mode === 'minimal', `the indicator is minimal out of the box (${mark.mode})`)
    ok(!!mark.bar && mark.bar === mark.accent, `and its line is the theme's accent (${mark.bar} vs ${mark.accent})`)
    // The finished mark is Full's alone: turn it up, the way a user would.
    await page.locator('[data-title-settings]').click()
    // On Appearance, beside its two colours (2026-09-22).
    await page.locator('[data-settings-tab="appearance"]').click()
    await page.locator('[data-pref="agent-indicator"] [data-seg="full"]').click()
    await page.locator('[data-tab]').nth(1).click()
    ok(
      await until(() => page.evaluate(() => document.querySelector('[data-agent-state="working"]')?.getAttribute('data-agent') === 'full')),
      'Full fills the tab instead'
    )
    // Walk away, then let it finish behind our back.
    await page.locator('[data-tab]').nth(0).click()
    await sleep(300)
    await page.locator('[data-tab]').nth(1).click()
    await typeLine(page, "Start-Sleep -Milliseconds 1500; $Host.UI.RawUI.WindowTitle = [char]0x2733 + ' Claude Code'")
    await page.locator('[data-tab]').nth(0).click()
    const done = await until(() => page.evaluate(() => !!document.querySelector('[data-agent-state="done"]')), 10000, 50)
    ok(done, 'an answer that lands on a background tab leaves the finished mark')
    ok(!(await page.evaluate(() => !!document.querySelector('[data-agent-state="working"]'))), 'and the working mark is gone')
    await page.locator('[data-tab]').nth(1).click()
    const cleared = await until(() => page.evaluate(() => !document.querySelector('[data-agent-state="done"]')), 5000, 50)
    ok(cleared, 'visiting the tab clears it')
    await app.close().catch(() => {})
  },

  /** A light theme makes a light window: measured, never read off a name. */
  async theme(ok) {
    const w = world()
    const { app, page } = await launch(w, { args: [w.alpha] })
    await until(async () => (await tabLabels(page)).length === 1)
    const mode = () => page.evaluate(() => document.documentElement.dataset.mode)
    ok((await mode()) === 'dark', 'the default theme is dark')
    // The panel is ONE surface in the theme's ground, down to its last pixel.
    // xterm sizes itself in whole rows, so a strip under the last row is never
    // its to paint; left transparent, that strip showed the native window
    // background (owner screenshot: a grey bar under a black terminal).
    const ground = () =>
      page.evaluate(() => {
        const rgb = (c) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).join(',')
        const probe = document.createElement('span')
        probe.style.color = getComputedStyle(document.documentElement).getPropertyValue('--p-bg-solid')
        document.body.appendChild(probe)
        const want = rgb(getComputedStyle(probe).color)
        probe.remove()
        const box = document.querySelector('[data-term-region]').getBoundingClientRect()
        const rows = document.querySelector('.xterm-screen').getBoundingClientRect()
        // The first painted ground under a point, walking up from what is there.
        const under = (x, y) => {
          let el = document.elementFromPoint(x, y)
          while (el) {
            const c = getComputedStyle(el).backgroundColor
            const alpha = Number((c.match(/[\d.]+/g) ?? [])[3] ?? 1)
            if (c.startsWith('rgb') && alpha > 0) return rgb(c)
            el = el.parentElement
          }
          return 'none'
        }
        const x = box.left + box.width / 2
        return {
          want,
          strip: Math.round(box.bottom - rows.bottom),
          underLastRow: under(x, box.bottom - 2),
          frame: under(box.left + 1, box.top + box.height / 2),
          rows: under(x, rows.top + rows.height / 2)
        }
      })
    const g = await ground()
    ok(g.strip > 0, `there IS a strip under the last row to get wrong (${g.strip}px)`)
    ok(g.underLastRow === g.want, `and it is the theme's ground (${g.underLastRow} vs ${g.want})`)
    ok(g.frame === g.want && g.rows === g.want, 'as are the frame round the rows and the rows themselves')
    await page.keyboard.press('Control+,')
    await page.locator('[data-settings-tab="appearance"]').click()
    await page.locator('[data-term-card="github"]').first().click()
    ok(await until(async () => (await mode()) === 'light'), 'picking a light preset turns the chrome light')
    const lum = await page.evaluate(() => {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--p-bg-solid').trim()
      const n = parseInt(v.slice(1, 7), 16)
      const lin = (c) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4)
      return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
    })
    ok(lum > 0.4, `the ground really is light (luminance ${lum.toFixed(2)})`)
    await page.locator('[data-tab]').first().click()
    const g2 = await ground()
    ok(g2.underLastRow === g2.want && g2.want !== g.want, `the strip follows the theme (${g2.underLastRow})`)
    const bg = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBackgroundColor())
    ok(/^#f/i.test(bg), `main was told the window's ground (${bg})`)
    await app.close().catch(() => {})
  },

  /** A chosen folder replaces the user's own, and can be given back. */
  async newTabFolder(ok) {
    const w = world()
    // The chooser answers alpha for the Settings picker; the + must not ask it.
    const { app, page } = await launch(w, { args: [w.beta], pick: w.alpha })
    await until(async () => (await tabLabels(page)).length === 1)
    // The title bar's cog is the way into Settings (there is no menu).
    await page.locator('[data-title-settings]').click()
    ok((await page.locator('[data-title-menu]').count()) === 0, 'the title bar has a settings cog and no menu')
    ok(
      (await page.locator('[data-pref="newtab-mode"] [data-seg="folder"]').getAttribute('aria-pressed')) === 'true',
      'opening in a folder is the default'
    )
    await page.locator('[data-choose-folder]').click()
    ok(
      await until(() => page.evaluate(() => (localStorage.getItem('prism.newtab.folder') ?? '').endsWith('alpha'))),
      'Choose folder remembers the folder'
    )
    const before = (await tabLabels(page)).length
    await page.locator('[aria-label="New tab"]').click()
    ok(await until(async () => (await tabLabels(page)).length === before + 1), 'the + opens a tab at once')
    ok((await tabTitles(page)).some((t) => t.endsWith('alpha')), 'in the chosen folder')
    await page.locator('[data-title-settings]').click()
    await page.locator('[data-use-home]').click()
    ok(
      await until(() => page.evaluate(() => localStorage.getItem('prism.newtab.folder') === '')),
      'and "Use my user folder" gives the default back'
    )
    await app.close().catch(() => {})
  },

  /** Tabs come back in their folders; a folder that has gone is dropped. */
  /**
   * ONE CTRL+V IS ONE PASTE (owner, 2026-09-22: "found a bug in the terminals.
   * when I copy text and paste it pastes twice", with a screenshot of every
   * word arriving doubled). What is counted is what reached the SHELL, read off
   * the terminal, for a plain Ctrl+V, for the Ctrl+Shift+V text-only escape
   * hatch, and for the right-click Paste. The clipboard is the owner's: it is
   * saved first and put back at the end.
   */
  /**
   * CLICK TO PUT THE CARET THERE (owner, 2026-09-22). In a real pwsh: type a
   * command, click between two of its letters, type a letter, run it, and the
   * letter came out where the click was. Then the refusals that matter most:
   * a click on old output above the prompt moves nothing.
   */
  async clickCaret(ok) {
    const w = world()
    const { app, page } = await launch(w, { args: [w.alpha] })
    try {
      await page.waitForFunction(() => /PS [^>]*>\s*$/.test((document.querySelector('.xterm .xterm-rows')?.textContent ?? '').trimEnd()), null, { timeout: 45000 })
      await page.locator('.xterm').first().click()
      await page.keyboard.type('echo ab1cdef')
      await sleep(400)
      // The cell of 'c' on the prompt row: rows are the xterm-rows children,
      // and plain ASCII is one cell per character.
      // Where a character sits on screen, exactly: a Range over the row's text
      // gives that character's own box (rows are trimmed, so the row's width
      // says nothing about a cell's). The x is a little into the character,
      // which places the caret just before it.
      const cell = (needle, offset) =>
        page.evaluate(
          ([n, off]) => {
            const rows = [...document.querySelectorAll('.xterm-rows > div')]
            for (let i = rows.length - 1; i >= 0; i -= 1) {
              const at = rows[i].textContent.lastIndexOf(n)
              if (at < 0) continue
              const walker = document.createTreeWalker(rows[i], NodeFilter.SHOW_TEXT)
              let left = at + off
              for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                if (left < node.textContent.length) {
                  const range = document.createRange()
                  range.setStart(node, left)
                  range.setEnd(node, left + 1)
                  const box = range.getBoundingClientRect()
                  return { x: box.left + box.width * 0.2, y: box.top + box.height / 2 }
                }
                left -= node.textContent.length
              }
            }
            return null
          },
          [needle, offset]
        )
      const at = await cell('ab1cdef', 3) // the boundary before 'c'
      ok(!!at, 'the typed line is on screen')
      await page.mouse.click(at.x, at.y)
      await sleep(300)
      await page.keyboard.type('X')
      await page.keyboard.press('Enter')
      ok(
        !!(await until(async () => (await termText(page)).includes('ab1Xcdef'), 8000)),
        'a click between two letters puts the caret there: the letter typed lands at the click'
      )
      // Old output is not the line being edited: a click there moves nothing.
      await page.waitForFunction(() => /PS [^>]*>\s*$/.test((document.querySelector('.xterm .xterm-rows')?.textContent ?? '').trimEnd()), null, { timeout: 15000 })
      await page.keyboard.type('echo zz')
      const old = await cell('ab1Xcdef', 1)
      await page.mouse.click(old.x, old.y)
      await sleep(300)
      await page.keyboard.type('Q')
      await page.keyboard.press('Enter')
      ok(
        !!(await until(async () => (await termText(page)).includes('zzQ'), 8000)),
        'a click on old output above the prompt moves nothing'
      )
    } finally {
      await app.close().catch(() => {})
    }
  },

  /**
   * THE RIGHT-CLICK MENU FITS, AND BACKSPACE DELETES A SELECTION (owner,
   * 2026-09-23: "if i click it on a link it shows copy link, if i click it with
   * text marked it says copy. i should also be able to highlight text and use
   * backspace to delete the selected text"). In a real pwsh, with a real drag
   * and real keys; the clipboard is read back in main and put back after.
   */
  async selectionEdit(ok) {
    const w = world()
    const { app, page } = await launch(w, { args: [w.alpha] })
    const clip = () => app.evaluate(({ clipboard }) => clipboard.readText())
    const held = await clip()
    const prompt = () =>
      page.waitForFunction(() => /PS [^>]*>\s*$/.test((document.querySelector('.xterm .xterm-rows')?.textContent ?? '').trimEnd()), null, { timeout: 45000 })
    // A character's own box on screen, from the LAST row holding `needle`.
    const box = (needle, offset) =>
      page.evaluate(
        ([n, off]) => {
          const rows = [...document.querySelectorAll('.xterm-rows > div')]
          for (let i = rows.length - 1; i >= 0; i -= 1) {
            const at = rows[i].textContent.lastIndexOf(n)
            if (at < 0) continue
            const walker = document.createTreeWalker(rows[i], NodeFilter.SHOW_TEXT)
            let left = at + off
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
              if (left < node.textContent.length) {
                const range = document.createRange()
                range.setStart(node, left)
                range.setEnd(node, left + 1)
                const b = range.getBoundingClientRect()
                return { left: b.left, right: b.right, y: b.top + b.height / 2 }
              }
              left -= node.textContent.length
            }
          }
          return null
        },
        [needle, offset]
      )
    // Drag from the start of one character to the end of another.
    const select = async (needle, from, to) => {
      const a = await box(needle, from)
      const b = await box(needle, to)
      await page.mouse.move(a.left + 1, a.y)
      await page.mouse.down()
      await page.mouse.move(b.right - 1, b.y, { steps: 6 })
      await page.mouse.up()
      await sleep(250)
    }
    const menuRows = async () =>
      until(async () => {
        const t = await page.locator('[role="menu"] [role="menuitem"]').allTextContents()
        return t.length ? t : null
      }, 4000)
    try {
      await prompt()
      await page.locator('.xterm').first().click()
      // Backspace over a selection at the END of the line deletes just it.
      await page.keyboard.type('echo hello world')
      await sleep(400)
      await select('hello world', 6, 10) // "world"
      await page.keyboard.press('Backspace')
      await page.keyboard.type('there')
      await page.keyboard.press('Enter')
      ok(
        !!(await until(async () => (await termText(page)).includes('echo hello there'), 8000)),
        'Backspace over a selected word deletes it, and typing goes on from there'
      )
      // And in the MIDDLE: the caret walks to the selection's end first.
      await prompt()
      await page.keyboard.type('echo abcdef')
      await sleep(400)
      await select('abcdef', 2, 3) // "cd"
      await page.keyboard.press('Backspace')
      await page.keyboard.press('Enter')
      ok(
        !!(await until(async () => (await termText(page)).includes('echo abef'), 8000)),
        'Backspace over a selection in the middle of the line deletes exactly it'
      )
      // Old output is not the line being edited: Backspace there is the shell's.
      await prompt()
      // A fresh token, so no history prediction can dress the line up. The rows
      // are read joined, so the command and its output run together.
      const token = `k${Date.now() % 100000}`
      await page.keyboard.type(`echo ${token}xy`)
      await sleep(300)
      await select('abef', 0, 1)
      await page.keyboard.press('Backspace')
      await page.keyboard.press('Enter')
      ok(
        !!(await until(async () => {
          const t = await termText(page)
          return new RegExp(`echo ${token}x\\s*${token}x`).test(t) && !t.includes(`${token}xy`)
        }, 8000)),
        'a selection in old output leaves Backspace to the shell: it deletes one character, as ever'
      )

      // A LINK: right-click on it offers Copy link, which copies all of it.
      await prompt()
      const url = 'https://example.com/some/path?q=1'
      await page.keyboard.type(`echo ${url}`)
      await page.keyboard.press('Enter')
      await prompt()
      const onLink = await box(url, 12)
      await page.mouse.click(onLink.left + 2, onLink.y, { button: 'right' })
      let rows = await menuRows()
      ok(!!rows && rows[0].includes('Copy link') && !rows.some((r) => r.includes('Close tab')), `right-click on a link: Copy link first, no Close tab (${JSON.stringify(rows)})`)
      await page.locator('[role="menu"] [role="menuitem"]', { hasText: 'Copy link' }).click()
      ok((await until(async () => (await clip()) === url, 4000)) === true, 'and it copies the whole link')
      // Off a link with nothing selected: neither Copy row.
      const plain = await box('abef', 1)
      await page.mouse.click(plain.left + 2, plain.y, { button: 'right' })
      rows = await menuRows()
      ok(!!rows && !rows.some((r) => r.startsWith('Copy')), `right-click on plain text offers no Copy (${JSON.stringify(rows)})`)
      await page.keyboard.press('Escape')
      await sleep(200)
      // TEXT MARKED: right-click offers Copy, which copies exactly the selection.
      await select('example.com', 0, 6) // "example"
      const mark = await box('example.com', 2)
      await page.mouse.click(mark.left + 2, mark.y, { button: 'right' })
      rows = await menuRows()
      ok(!!rows && rows.some((r) => r.startsWith('Copy') && !r.startsWith('Copy link')), `right-click with text marked offers Copy (${JSON.stringify(rows)})`)
      await page.locator('[role="menu"] [role="menuitem"]', { hasText: /^Copy(?! link)/ }).first().click()
      ok((await until(async () => (await clip()) === 'example', 4000)) === true, `and it copies the selection exactly (${JSON.stringify(await clip())})`)
      await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/term-menu.png') }).catch(() => {})
    } finally {
      await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), held).catch(() => {})
      await app.close().catch(() => {})
    }
  },

  /**
   * FIND IS CTRL+F (#50; owner, 2026-09-23: "can the find hotkey be ctrl f"),
   * except in a full-screen program, whose page down it is. In a real pwsh:
   * Ctrl+F at the prompt opens find and closes it again; switched onto the
   * alternate screen (what vim and less do), Ctrl+F opens nothing and reaches
   * the program; Ctrl+Shift+F still finds there.
   */
  async findKey(ok) {
    const w = world()
    const { app, page } = await launch(w, { args: [w.alpha] })
    const find = () => page.locator('[data-term-find]').count()
    try {
      await page.waitForFunction(() => /PS [^>]*>\s*$/.test((document.querySelector('.xterm .xterm-rows')?.textContent ?? '').trimEnd()), null, { timeout: 45000 })
      await page.locator('.xterm').first().click()
      await page.keyboard.press('Control+f')
      ok(!!(await until(async () => (await find()) === 1, 4000, 50)), 'Ctrl+F at the prompt opens find')
      await page.keyboard.press('Escape')
      ok(!!(await until(async () => (await find()) === 0, 4000, 50)), 'and Escape closes it')
      // The alternate screen, as vim and less switch to it.
      await page.locator('.xterm').first().click()
      await page.keyboard.type('Write-Host -NoNewline "$([char]27)[?1049h"')
      await page.keyboard.press('Enter')
      await sleep(800)
      await page.keyboard.press('Control+f')
      await sleep(600)
      ok((await find()) === 0, 'in a full-screen program Ctrl+F opens nothing: it is the program\'s')
      await page.keyboard.press('Control+Shift+f')
      ok(!!(await until(async () => (await find()) === 1, 4000, 50)), 'while Ctrl+Shift+F still finds there')
      await page.keyboard.press('Escape')
      await page.locator('.xterm').first().click()
      await page.keyboard.type('Write-Host -NoNewline "$([char]27)[?1049l"')
      await page.keyboard.press('Enter')
    } finally {
      await app.close().catch(() => {})
    }
  },

  async paste(ok) {
    const w = world()
    const { app, page } = await launch(w, { args: [w.alpha] })
    await until(async () => (await tabLabels(page)).length === 1)
    const held = await app.evaluate(({ clipboard }) => ({
      text: clipboard.readText(),
      html: clipboard.readHTML(),
      rtf: clipboard.readRTF(),
      image: clipboard.readImage().isEmpty() ? null : clipboard.readImage().toDataURL(),
      formats: clipboard.availableFormats()
    }))
    try {
      await page.waitForFunction(() => /PS [^>]*>\s*$/.test((document.querySelector('.xterm .xterm-rows')?.textContent ?? '').trimEnd()), null, { timeout: 45000 })
      const count = async (word) => ((await termText(page)).match(new RegExp(word, 'g')) ?? []).length
      const clear = async () => {
        // Esc clears PSReadLine's line, so each paste is counted on its own.
        await page.keyboard.press('Escape')
        await sleep(300)
      }
      await page.locator('.xterm').first().click()

      await app.evaluate(({ clipboard }) => clipboard.writeText('PASTEONCEA'))
      await page.keyboard.press('Control+v')
      await sleep(900)
      ok((await count('PASTEONCEA')) === 1, `Ctrl+V pastes the text ONCE (${await count('PASTEONCEA')} copies arrived)`)
      await clear()

      await app.evaluate(({ clipboard }) => clipboard.writeText('PASTEONCEB'))
      await page.keyboard.press('Control+Shift+v')
      await sleep(900)
      ok((await count('PASTEONCEB')) === 1, `Ctrl+Shift+V pastes the text ONCE (${await count('PASTEONCEB')} copies arrived)`)
      await clear()

      // The right-click menu's Paste reaches the same one paste, by another door.
      await app.evaluate(({ clipboard }) => clipboard.writeText('PASTEONCEC'))
      await page.locator('.xterm').first().click({ button: 'right' })
      await page.locator('[role="menuitem"]:has-text("Paste")').first().click()
      await sleep(900)
      ok((await count('PASTEONCEC')) === 1, `the right-click Paste pastes ONCE (${await count('PASTEONCEC')} copies arrived)`)
      await clear()
    } finally {
      await app
        .evaluate(({ clipboard, nativeImage }, was) => {
          const data = {}
          if (was.text) data.text = was.text
          if (was.html) data.html = was.html
          if (was.rtf) data.rtf = was.rtf
          if (was.image) data.image = nativeImage.createFromDataURL(was.image)
          if (Object.keys(data).length) clipboard.write(data)
          else clipboard.clear()
        }, held)
        .catch(() => {})
      if (held.formats.some((f) => /FileName|uri-list/i.test(f))) console.log('  (the clipboard held copied FILES, which cannot be put back; it is empty now)')
      await app.close().catch(() => {})
    }
  },

  /**
   * EVERY TAB IS ONE WIDTH (owner, 2026-09-21: "make tabs in both apps have a
   * fixed size, and not dynamically adjust based on the content"). Three
   * folders with names of very different lengths open side by side; what is
   * measured is each tab's box, not the class that sets it, because a class
   * that loses to a longer label is exactly what this replaced.
   */
  async tabWidth(ok) {
    const w = world()
    const long = join(w.alpha, '..', 'a-folder-with-a-name-far-too-long-to-fit-on-any-tab')
    mkdirSync(long)
    const { app, page } = await launch(w, { args: [w.alpha, long, w.beta] })
    ok(await until(async () => (await tabLabels(page)).length === 3), 'three tabs open, one of them with a very long name')
    const boxes = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('[data-tab]')].map((el) => {
          const label = el.querySelector('[role="tab"]')
          return { w: Math.round(el.getBoundingClientRect().width * 10) / 10, cut: label ? label.scrollWidth > label.clientWidth : false }
        })
      )
    const three = await boxes()
    const widths = [...new Set(three.map((b) => b.w))]
    ok(widths.length === 1, `every tab is the same width, whatever its name (${three.map((b) => b.w).join(' / ')})`)
    ok(widths[0] >= 104 && widths[0] <= 124, `a fixed width, not a content one (${widths[0]}px)`)
    ok(three[1].cut && !three[0].cut, 'the long name is truncated inside the tab, the short one is whole')
    // Selecting a tab must not move anything either: the active one used to be
    // no wider, but it is the case that shows it if a mark ever takes room.
    const before = (await boxes()).map((b) => b.w).join('|')
    await page.locator('[data-tab]').nth(2).click()
    await sleep(200)
    ok((await boxes()).map((b) => b.w).join('|') === before, 'picking another tab moves no tab')
    await app.close().catch(() => {})
  },

  async restore(ok) {
    const w = world()
    let { app, page } = await launch(w, { args: [w.alpha, w.beta] })
    ok(await until(async () => (await tabLabels(page)).length === 2), 'two tabs open')
    await sleep(900) // past the 400ms save debounce
    const gone = new Promise((r) => app.process().on('exit', r))
    await page.evaluate(() => window.prism.quitApp()).catch(() => {})
    await Promise.race([gone, sleep(10000)])
    const saved = JSON.parse(readFileSync(join(w.profile, 'tabs.json'), 'utf8'))
    ok(saved.tabs.length === 2, `tabs.json holds both (${saved.tabs.map((t) => t.cwd.split('\\').pop())})`)
    ;({ app, page } = await launch(w))
    ok(await until(async () => (await tabLabels(page)).length === 2), 'a relaunch brings both back')
    const titles = await tabTitles(page)
    ok(titles[0].endsWith('alpha') && titles[1].endsWith('beta'), 'in their folders, in order')
    await app.close().catch(() => {})
  },

  /** A second launch hands its folder to the running window and exits. */
  async handoff(ok) {
    const w = world()
    const { app, page } = await launch(w, { args: [w.alpha] })
    await until(async () => (await tabLabels(page)).length === 1)
    const child = spawn(electronPath, [MAIN, `--user-data-dir=${w.profile}`, '--e2e', w.beta], { stdio: 'ignore' })
    const code = await new Promise((r) => child.on('exit', r))
    ok(code === 0, 'the second instance exits')
    ok(await until(async () => (await tabLabels(page)).length === 2), 'and its folder is a new tab in the first')
    // The same folder again is STILL a new tab: two shells in one folder is normal.
    const child2 = spawn(electronPath, [MAIN, `--user-data-dir=${w.profile}`, '--e2e', w.beta], { stdio: 'ignore' })
    await new Promise((r) => child2.on('exit', r))
    ok(await until(async () => (await tabLabels(page)).length === 3), 'a folder some tab already holds still gets its own tab')
    await app.close().catch(() => {})
  },

  /** Closing the last tab lands on the start screen; the X is what quits, and
   *  what was open when it quit is what comes back. */
  async lastTab(ok) {
    const w = world()
    let { app, page } = await launch(w, { args: [w.alpha, w.beta] })
    await until(async () => (await tabLabels(page)).length === 2)
    await page.locator('[data-tab-close]').first().click({ force: true })
    await until(async () => (await tabLabels(page)).length === 1)
    await page.locator('[data-tab-close]').first().click({ force: true })
    ok(await until(async () => (await page.locator('[data-empty-state]').count()) === 1), 'closing the last tab lands on the start screen')
    const visible = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((x) => x.isVisible()))
    ok((await visible())[0] === true, 'and the window stays')
    ok(
      await until(async () => /^Version \d+\.\d+\.\d+/.test((await page.locator('[data-start-version]').textContent()) ?? '')),
      'the start screen says which version this is'
    )
    const folders = await page.locator('[data-start-folder]').count()
    ok(folders === 2, `and offers the folders you were just in (${folders})`)
    await page.locator('[data-start-folder]').first().click()
    ok(await until(async () => (await tabLabels(page)).length === 1), 'one press opens a shell in one of them')
    await sleep(900) // past the save debounce
    // The X really quits: no resident process is left holding the lock.
    const gone = new Promise((r) => app.process().on('exit', r))
    await page.locator('[data-window-close]').click().catch(() => {})
    ok((await Promise.race([gone.then(() => 'exit'), sleep(10000).then(() => 'timeout')])) === 'exit', 'the X ends the process')
    ;({ app, page } = await launch(w))
    ok(await until(async () => (await tabLabels(page)).length === 1), 'and the tab that was open when it quit comes back')
    await app.close().catch(() => {})
  },

  /** Closing a tab that HOSTS an agent asks first, working or idle; a plain
   *  shell closes unasked; and Off means off. */
  async closeAsk(ok) {
    const w = world()
    const { app, page } = await launch(w, { args: [w.alpha, w.beta] })
    await until(async () => (await tabLabels(page)).length === 2)
    const dialog = () => page.locator('[role="dialog"]')
    // A shell stands in for Claude, so the process poll's verdict on it is "no
    // agent here", said once; let it land before the title claims otherwise.
    await typeLine(page, 'echo ready')
    await sleep(6000)
    await typeLine(page, "$Host.UI.RawUI.WindowTitle = [char]0x2733 + ' Claude Code'")
    ok(
      await until(() => page.evaluate(() => !!document.querySelector('[data-agent-present]')), 8000, 50),
      'an agent is present and IDLE in the tab'
    )
    await page.locator('[data-tab-close]').nth(1).click({ force: true })
    ok(await until(async () => (await dialog().count()) === 1, 4000), 'closing its tab asks, though the agent is only idle')
    ok(/Claude/.test((await dialog().textContent()) ?? ''), 'and the question names the agent')
    await page.keyboard.press('Escape')
    ok((await tabLabels(page)).length === 2, 'Cancel keeps the tab')
    // Mid-answer, the question says how long it has been at it.
    await page.locator('.xterm').first().click({ force: true })
    await typeLine(page, "$Host.UI.RawUI.WindowTitle = [char]0x25D0 + ' Claude Code'")
    await until(() => page.evaluate(() => !!document.querySelector('[data-agent-state="working"]')), 8000, 50)
    await sleep(1200)
    await page.locator('[data-tab-close]').nth(1).click({ force: true })
    ok(await until(async () => (await dialog().count()) === 1, 4000), 'a working agent asks too')
    ok(/working for/.test((await dialog().textContent()) ?? ''), 'and says how long it has been working')
    await dialog().locator('[data-primary="true"]').click()
    ok(await until(async () => (await tabLabels(page)).length === 1), 'confirming closes the tab')
    // A plain shell has nothing to lose: no question.
    await page.locator('[data-tab-close]').first().click({ force: true })
    ok(
      await until(async () => (await page.locator('[data-empty-state]').count()) === 1, 4000),
      'a tab with no agent closes unasked'
    )
    await app.close().catch(() => {})
  },

  /** A printed link is painted as one, in a colour that follows the theme. */
  async links(ok) {
    const w = world()
    const { app, page } = await launch(w, { args: [w.alpha] })
    await until(async () => (await tabLabels(page)).length === 1)
    // Every run of cells in the rows that wears `rgb`, as text, row by row.
    const inked = (rgb) =>
      page.evaluate((want) => {
        const norm = (c) => (c.match(/\d+/g) ?? []).slice(0, 3).join(',')
        return [...document.querySelectorAll('.xterm .xterm-rows > div')]
          .map((row) =>
            [...row.querySelectorAll('span')]
              .filter((sp) => norm(getComputedStyle(sp).color) === want)
              .map((sp) => sp.textContent ?? '')
              .join('')
          )
          .filter((t) => t.length)
      }, rgb)
    const BLUE = '78,161,255' // LINK_BLUE, which reads as it is on the default theme
    const url = 'https://go.microsoft.com/fwlink/?LinkID=108518'
    // Write-Host, so the OUTPUT row holds the sentence exactly as typed here.
    await typeLine(page, `cls; Write-Host 'online at ${url}. Then more.'`)
    ok(await until(async () => (await inked(BLUE)).includes(url), 8000), 'a printed link wears the link blue')
    const runs = await inked(BLUE)
    ok(runs.every((t) => !t.endsWith('.')), `and the sentence's full stop is not part of it (${JSON.stringify(runs)})`)
    // A link longer than the window is wide wraps; every row of it is the link.
    const long = 'https://example.com/' + 'a'.repeat(260)
    await typeLine(page, `cls; Write-Host '${long}'`)
    ok(
      await until(async () => (await inked(BLUE)).join('').includes(long), 8000),
      'a link that wraps over rows is painted on every one of them'
    )
    ok((await inked(BLUE)).length >= 2, 'and it really did wrap')
    // A light theme: the same blue would be unreadable, so it moves.
    await typeLine(page, `cls; Write-Host 'see ${url}'`)
    await until(async () => (await inked(BLUE)).includes(url), 8000)
    await page.locator('[data-title-settings]').click()
    await page.locator('[data-settings-tab="appearance"]').click()
    await page.locator('[data-term-card="github"]').first().click()
    await page.locator('[data-tab]').first().click()
    // The colour of the cell the link STARTS on: xterm splits a row into runs
    // of spans as it likes, so the span is found by position, not by its text.
    const light = await until(
      () =>
        page.evaluate(() => {
          const lin = (c) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4)
          const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
          const nums = (c) => (c.match(/\d+/g) ?? []).slice(0, 3).map(Number)
          let ink = null
          for (const row of document.querySelectorAll('.xterm .xterm-rows > div')) {
            const at = (row.textContent ?? '').indexOf('https://')
            if (at < 0) continue
            let seen = 0
            for (const sp of row.querySelectorAll('span')) {
              const len = (sp.textContent ?? '').length
              if (at < seen + len) {
                ink = nums(getComputedStyle(sp).color)
                break
              }
              seen += len
            }
            if (ink) break
          }
          if (!ink) return null
          const probe = document.createElement('span')
          probe.style.color = getComputedStyle(document.documentElement).getPropertyValue('--p-bg-solid')
          document.body.appendChild(probe)
          const ground = nums(getComputedStyle(probe).color)
          probe.remove()
          const hi = Math.max(lum(...ink), lum(...ground))
          const lo = Math.min(lum(...ink), lum(...ground))
          const ratio = (hi + 0.05) / (lo + 0.05)
          // Wait for the DECORATED colour. After a theme switch there is a frame or
          // two where the row is repainted and the link's decoration is not back yet:
          // the span then wears the plain text ink, which reads fine and is not a
          // link colour at all (MEASURED: 62,62,62 accepted two runs in three).
          return ink.join(',') === '78,161,255' || ratio < 4.5 || !(ink[2] > ink[0])
            ? null
            : { rgb: ink.join(','), ratio, blue: ink[2] > ink[0] }
        }),
      8000
    )
    ok(!!light, 'on a light theme the link takes another colour that reads there')
    ok(!!light && light.blue, `and it is still a blue (${light ? light.rgb + ' at ' + light.ratio.toFixed(1) + ':1' : 'none'})`)
    await app.close().catch(() => {})
  },

  /** A file dropped on the terminal types its quoted path and never sends it;
   *  the terminal answers a right-click. */
  async dropAndMenu(ok) {
    const w = world()
    const file = join(w.alpha, 'my notes.txt') // a space, so the quoting is visible
    writeFileSync(file, 'x')
    const { app, page } = await launch(w, { args: [w.alpha] })
    await until(async () => (await tabLabels(page)).length === 1)
    await typeLine(page, 'cls')
    await sleep(600)
    // A REAL drop: Chromium's own drag events carrying a file path, which is
    // what Explorer hands over. A synthetic DataTransfer would carry a File
    // with no path, and prove nothing about getPathForFile.
    const box = await page.locator('[data-term-region]').boundingBox()
    const x = Math.round(box.x + box.width / 2)
    const y = Math.round(box.y + box.height / 2)
    const cdp = await page.context().newCDPSession(page)
    const data = { items: [], files: [file], dragOperationsMask: 1 }
    for (const type of ['dragEnter', 'dragOver', 'drop']) {
      await cdp.send('Input.dispatchDragEvent', { type, x, y, data })
    }
    const typed = await until(async () => (await termText(page)).includes('my notes.txt'), 8000)
    ok(typed, 'a file dropped on the terminal types its path')
    const text = (await termText(page)).replace(/\s+/g, ' ')
    ok(/["']?[A-Z]:\\[^"']*my notes\.txt["']/.test(text), `and the path is quoted, since it holds a space (${text.slice(-90)})`)
    ok(!/is not recognized|CommandNotFound|ObjectNotFound/.test(text), 'and it was NOT sent: nothing ran')
    // Clear what the drop typed, so the shell is at a clean prompt again.
    await page.keyboard.press('Escape')
    // The right-click menu: Paste and Find, and no Close tab (owner,
    // 2026-09-23: "remove close tab from the right click menu").
    await page.locator('[data-term-region]').click({ button: 'right', position: { x: 200, y: 120 } })
    const rows = await until(
      async () => {
        const t = await page.locator('[role="menu"] [role="menuitem"]').allTextContents()
        return t.length ? t : null
      },
      4000
    )
    ok(!!rows && ['Paste', 'Find in scrollback'].every((l) => rows.some((r) => r.includes(l))), `the terminal answers a right-click (${JSON.stringify(rows)})`)
    ok(!!rows && !rows.some((r) => r.includes('Close tab')), 'and Close tab is not in it')
    await page.locator('[role="menu"] [role="menuitem"]', { hasText: 'Find in scrollback' }).click()
    ok(await until(async () => (await page.locator('[data-term-find], input[placeholder*="ind"]').count()) > 0, 4000), 'and its Find row opens the find bar')
    await app.close().catch(() => {})
  },

  /**
   * COMMAND HELP (#12; owner, 2026-09-20: "a pop up with copy icons for easy
   * copying. searchable, natural language"). The popup is the core's; the ways
   * in (the ? in the title bar, F1, the terminal's menu) are this app's.
   *
   * What must never regress, and so is asserted rather than trusted:
   *  - NOTHING IS TYPED INTO THE SHELL (owner, 2026-09-19: picking a command
   *    does NOT insert it). The terminal's text is read before the popup is
   *    touched and again after every search, copy and Enter in it.
   *  - COPY IS EXACT: what lands on the clipboard is read back through
   *    Electron's clipboard in MAIN and compared with the text on screen,
   *    character for character. Whatever text the clipboard held is put back.
   *  - "Copied" moves nothing: the entry's height is measured with and without.
   *  - Escape hands the keyboard back to the shell, F1 is heard from INSIDE a
   *    focused shell (xterm has to yield it), and with the setting off both the
   *    button and the key are gone.
   *  - A close question never sits underneath it.
   * And it is LOOKED AT: the layout is measured and screenshots go to
   * .e2e-shots/help-*.png, dark and light, browsing and with results.
   */
  async helpPanel(ok) {
    const w = world()
    const { app, page } = await launch(w, { args: [w.alpha] })
    await until(async () => (await tabLabels(page)).length === 1)
    const t0 = Date.now()
    const shot = (name) => page.screenshot({ path: resolve(process.cwd(), `.e2e-shots/${name}.png`) }).catch(() => {})
    const panel = page.locator('[data-help-panel]')
    const opened = () => until(async () => (await panel.count()) === 1, 6000, 50)
    const closed = () => until(async () => (await panel.count()) === 0, 4000, 50)
    const firstId = () => page.evaluate(() => document.querySelector('[data-help-list] [data-help-id]')?.getAttribute('data-help-id') ?? null)
    const focusIsSearch = () => page.evaluate(() => document.activeElement?.hasAttribute('data-help-search') === true)
    const clip = () => app.evaluate(({ clipboard }) => clipboard.readText())
    const setQuery = async (q) => {
      await page.locator('[data-help-search]').fill(q)
    }

    // The clipboard is the owner's: what it held is put back at the end. Text
    // (with its html and rtf forms) is what can be restored faithfully; an
    // image is restored too, and copied FILES cannot be, so a run says so.
    const held = await app.evaluate(({ clipboard }) => {
      const img = clipboard.readImage()
      return {
        formats: clipboard.availableFormats(),
        text: clipboard.readText(),
        html: clipboard.readHTML(),
        rtf: clipboard.readRTF(),
        image: img.isEmpty() ? '' : img.toDataURL()
      }
    })

    try {
      await typeLine(page, 'echo help-$(40+2)-ready')
      ok(await until(async () => (await termText(page)).includes('help-42-ready')), 'a shell is running in front')
      // The prompt has to be back before the text is taken as the baseline.
      await page.waitForFunction(
        () => /PS [^>]*>\s*$/.test((document.querySelector('.xterm .xterm-rows')?.textContent ?? '').trimEnd()),
        null,
        { timeout: 20000 }
      )
      const termBefore = await termText(page)

      /* ----- the button ----- */
      ok((await page.locator('[data-title-help]').count()) === 1, 'the ? is in the title bar (the setting is on by default)')
      await page.locator('[data-title-help]').click()
      ok(await opened(), 'a click on it opens the popup')
      // The window behind is BLURRED and the panel casts no shadow (owner,
      // 2026-09-22: "remove the shadow behind this and make the bg blurred").
      const scrimLook = await page.evaluate(() => ({
        blur: getComputedStyle(document.querySelector('[data-help-scrim]')).backdropFilter,
        shadow: getComputedStyle(document.querySelector('[data-help-panel]')).boxShadow
      }))
      ok(
        /blur\(/.test(scrimLook.blur) && scrimLook.shadow === 'none',
        `the window behind is blurred and the panel has no shadow (${JSON.stringify(scrimLook)})`
      )
      ok(await until(focusIsSearch, 3000, 50), 'and the search field has the focus')
      ok((await page.locator('[data-help-shell="powershell"]').getAttribute('aria-pressed')) === 'true', 'the chip is the shell of the tab in front (PowerShell)')
      const browse = await page.evaluate(() => ({
        headers: [...document.querySelectorAll('[data-help-category]')].map((h) => h.getAttribute('data-help-category')),
        entries: document.querySelectorAll('[data-help-id]').length,
        count: document.querySelector('[data-help-count]')?.textContent ?? '',
        placeholder: document.querySelector('[data-help-search]')?.getAttribute('placeholder') ?? ''
      }))
      ok(browse.headers[0] === 'folders' && browse.headers.length >= 2, `with no question it browses by category (${JSON.stringify(browse.headers)})`)
      ok(browse.entries >= 20 && browse.entries <= 200, `and draws a first page, not the whole catalogue (${browse.entries} rows; "${browse.count}")`)
      ok(/find big files/.test(browse.placeholder) && /port 3000/.test(browse.placeholder), 'the placeholder teaches by example')
      await shot('help-browse-dark')
      // The rest of the list arrives as it is scrolled to: Git is far down.
      await page.locator('[data-help-list]').evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
      ok(
        await until(() => page.evaluate((n) => document.querySelectorAll('[data-help-id]').length > n, browse.entries), 6000, 50),
        'scrolling to the end draws more of it'
      )
      await page.keyboard.press('Escape')
      ok(await closed(), 'Escape closes it')

      /* ----- F1, from inside a focused shell ----- */
      await page.locator('.xterm').first().click({ force: true })
      await page.keyboard.press('F1')
      ok(await opened(), 'F1 opens it over a FOCUSED shell (xterm yields the key)')
      ok(await until(focusIsSearch, 3000, 50), 'and the search field has the focus again')
      await page.keyboard.type('how do I find big files')
      ok(await until(async () => (await firstId()) === 'ps-biggest-files', 4000, 50), `a plain question finds the PowerShell answer first (${await firstId()})`)
      await shot('help-results-dark')
      await page.locator('[data-help-shell="bash"]').click()
      ok(await until(async () => (await firstId()) === 'sh-biggest-files', 4000, 50), `the Bash chip changes the first answer to the bash one (${await firstId()})`)
      await page.locator('[data-help-shell="powershell"]').click()
      await until(async () => (await firstId()) === 'ps-biggest-files', 4000, 50)

      /* ----- the layout, measured ----- */
      const look = await page.evaluate(() => {
        const el = document.querySelector('[data-help-panel]')
        const entry = document.querySelector('[data-help-id="ps-biggest-files"][data-help-variant="0"]')
        const copy = document.querySelector('[data-help-copy="ps-biggest-files#0"]')
        const code = entry.querySelector('[data-help-command]')
        const alpha = (c) => Number((c.match(/[\d.]+/g) ?? [])[3] ?? 1)
        const box = el.getBoundingClientRect()
        const b = copy.getBoundingClientRect()
        const rows = [...document.querySelectorAll('[data-help-row]')]
        const header = document.querySelector('[data-help-header]')
        // A TABLE: every row one height, the columns starting at the same x as
        // the header's, and the rows alternating in colour (owner, 2026-09-20).
        const heights = [...new Set(rows.slice(0, 12).map((r) => Math.round(r.getBoundingClientRect().height)))]
        const nameX = [...new Set(rows.slice(0, 12).map((r) => Math.round(r.querySelector('[data-help-task]').getBoundingClientRect().left)))]
        const cmdX = [...new Set(rows.slice(0, 12).filter((r) => r.querySelector('[data-help-command]')).map((r) => Math.round(r.querySelector('[data-help-command]').getBoundingClientRect().left)))]
        const fills = rows.slice(0, 6).map((r) => getComputedStyle(r).backgroundColor)
        const anyMarked = document.querySelectorAll('[data-help-active]').length
        const transparent = (c) => Number((c.match(/[\d.]+/g) ?? [])[3] ?? 1) === 0
        return {
          w: Math.round(box.width),
          h: Math.round(box.height),
          inside: box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth,
          alpha: alpha(getComputedStyle(el).backgroundColor),
          padX: parseFloat(getComputedStyle(entry).paddingLeft),
          padY: parseFloat(getComputedStyle(entry).paddingTop),
          copyW: Math.round(b.width),
          copyH: Math.round(b.height),
          copyAtRightEdge: Math.abs(b.right - (entry.getBoundingClientRect().right - 16)) <= 2,
          heights,
          nameX,
          cmdX,
          // Row 0 is the plain ground, row 1 the stripe: Prism's own pick.
          zebra: transparent(fills[0]) && !transparent(fills[1]) && transparent(fills[2]) && fills[1] === fills[3],
          anyMarked,
          headerCols: header ? [...header.children].map((c) => Math.round(c.getBoundingClientRect().left)) : [],
          // NO SUB TEXT (owner, 2026-09-20): a row is a name and a command.
          subText: document.querySelectorAll('[data-help-placeholders], [data-help-summary], [data-help-command-box]').length,
          mono: getComputedStyle(code).fontFamily,
          termFont: getComputedStyle(document.querySelector('.xterm-rows') ?? document.body).fontFamily,
          listScrolls: getComputedStyle(document.querySelector('[data-help-list]')).overflowY,
          rule: document.querySelectorAll('[data-help-rule]').length,
        }
      })
      ok(look.w >= 560 && look.w <= 780 && look.h >= 380, `the popup is a popup-sized box (${look.w}x${look.h})`)
      ok(look.inside, 'wholly on screen')
      ok(look.alpha === 1, `on the opaque surface (alpha ${look.alpha})`)
      ok(look.padX >= 12, `a row has its padding (${look.padX}px)`)
      ok(look.copyW >= 26 && look.copyH >= 26, `the copy button is big enough to hit (${look.copyW}x${look.copyH})`)
      ok(look.copyAtRightEdge, 'and sits at the right edge of the row')
      ok(look.heights.length === 1 && look.heights[0] >= 28, `IT IS A TABLE: every row is the same height (${look.heights.join(', ')}px)`)
      ok(look.nameX.length === 1 && look.cmdX.length === 1, `its two columns start at one x each (${look.nameX.join(',')} / ${look.cmdX.join(',')})`)
      ok(look.headerCols[0] === look.nameX[0] && look.headerCols[1] === look.cmdX[0], `and the header sits over them (${look.headerCols.join(', ')})`)
      ok(look.zebra, 'the rows alternate in colour, the first row plain')
      ok(look.anyMarked === 0, `and NOTHING is marked until somebody points at it or walks the list (${look.anyMarked} marked)`)
      ok(look.subText === 0, `no sub text and no boxed commands: a row is a name and a command (${look.subText} found)`)
      ok(look.mono.split(',')[0].trim() === look.termFont.split(',')[0].trim(), `the command wears the terminal's face (${look.mono.split(',')[0]})`)
      ok(look.listScrolls === 'auto', 'the list scrolls, the popup does not')
      // The sentence under the list is GONE (owner, 2026-09-20: "remove this
      // line"). What it said is still true and still proved, by the check
      // below that the terminal is untouched by everything this scenario does.
      ok(look.rule === 0, 'no sentence under the list: the keys are all the footer says')

      /* ----- the width is the user's (owner, 2026-09-20) ----- */
      // "you also need to be able to adjust the width of this since some text
      // can be seen": a row is one line and truncates, so the width is how a
      // long command is read in place. DRAGGED, and the drag is measured
      // rather than the stylesheet read: the popup is centred, so a pixel of
      // pointer has to be two of width or the edge runs away from the hand.
      const panelBox = () => page.locator('[data-help-panel]').evaluate((el) => el.getBoundingClientRect().width)
      const wide0 = await panelBox()
      const gripBox = await page.locator('[data-help-grip="right"]').evaluate((el) => {
        const b = el.getBoundingClientRect()
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
      })
      await page.mouse.move(gripBox.x, gripBox.y)
      await page.mouse.down()
      await page.mouse.move(gripBox.x + 100, gripBox.y, { steps: 8 })
      await page.mouse.up()
      const wide1 = await panelBox()
      ok(Math.abs(wide1 - (wide0 + 200)) <= 6, `dragging the right edge 100px widens it by 200 (${wide0} -> ${wide1})`)
      const cmdWidth = () => page.locator('[data-help-row] [data-help-command]').first().evaluate((el) => el.getBoundingClientRect().width)
      ok((await cmdWidth()) > 0, 'and the command column grew with it')
      // It is REMEMBERED: the popup closes, opens again, and is still that wide.
      await page.keyboard.press('Escape')
      await closed()
      await page.keyboard.press('F1')
      await opened()
      ok(Math.abs((await panelBox()) - wide1) <= 2, `and it comes back that wide (${await panelBox()})`)
      // The keyboard can do it too, on the grip itself.
      await page.locator('[data-help-grip="right"]').focus()
      await page.keyboard.press('ArrowLeft')
      ok(await until(async () => Math.abs((await panelBox()) - (wide1 - 20)) <= 2, 3000, 50), `Left on the grip narrows it a step (${await panelBox()})`)
      // Back to where it started, so the rest of the scenario measures what it
      // always did and the next scenario inherits nothing.
      await page.evaluate(() => localStorage.removeItem('prism.help.width'))
      await page.keyboard.press('Escape')
      await closed()
      await page.keyboard.press('F1')
      await opened()
      ok(Math.abs((await panelBox()) - wide0) <= 2, `and clearing the setting is the default width again (${await panelBox()})`)
      // Put the question back: the popup was closed and reopened above, and
      // everything below measures the answers to this one.
      await page.locator('[data-help-search]').focus()
      await page.keyboard.type('how do I find big files')
      await until(async () => (await firstId()) === 'ps-biggest-files', 4000, 50)

      /* ----- copy ----- */
      const mainRow = page.locator('[data-help-id="ps-biggest-files"][data-help-variant="0"]')
      const wantMain = await mainRow.locator('[data-help-command]').textContent()
      const heightBefore = await mainRow.evaluate((el) => el.getBoundingClientRect().height)
      await page.locator('[data-help-copy="ps-biggest-files#0"]').click()
      ok(
        await until(async () => (await page.locator('[data-help-copy="ps-biggest-files#0"]').getAttribute('title')) === 'Copied', 3000, 25),
        'the copy button answers in place, in the button itself'
      )
      const heightDuring = await mainRow.evaluate((el) => el.getBoundingClientRect().height)
      ok(heightDuring === heightBefore, `and the row does not change height (${heightBefore} -> ${heightDuring})`)
      ok(!!wantMain && /Sort-Object/.test(wantMain) && (await clip()) === wantMain, `the clipboard holds the EXACT command ("${await clip()}")`)
      ok(/^Copied: /.test((await page.locator('[data-help-said]').textContent()) ?? ''), 'and a screen reader is told')
      ok(
        await until(async () => (await page.locator('[data-help-copy="ps-biggest-files#0"]').getAttribute('title')) === 'Copy', 4000, 50),
        'the answer leaves by itself'
      )
      const heightAfter = await mainRow.evaluate((el) => el.getBoundingClientRect().height)
      ok(heightAfter === heightBefore, 'still without moving anything')
      // A VARIANT IS A ROW OF ITS OWN, named by what was its label, and copies
      // its own text (owner, 2026-09-20: one command per row).
      const variantRow = page.locator('[data-help-id="ps-biggest-files"][data-help-variant="1"]')
      ok((await variantRow.count()) === 1 && ((await variantRow.locator('[data-help-task]').textContent()) ?? '').trim().length > 3, `a variant is a row of its own, with a name ("${((await variantRow.locator('[data-help-task]').textContent()) ?? '').trim()}")`)
      const wantVariant = await variantRow.locator('[data-help-command]').textContent()
      await page.locator('[data-help-copy="ps-biggest-files#1"]').click()
      ok(!!wantVariant && wantVariant !== wantMain && (await until(async () => (await clip()) === wantVariant, 3000, 50)), "a variant's own button copies the variant")

      /* ----- the keyboard ----- */
      await page.locator('[data-help-search]').focus()
      const markedAt = () => page.evaluate(() => Number(document.querySelector('[data-help-active]')?.getAttribute('data-help-index') ?? -1))
      const from = await markedAt()
      await page.keyboard.press('ArrowDown')
      const to = await until(async () => {
        const n = await markedAt()
        return n >= 0 && n !== from ? n : null
      }, 3000, 50)
      ok(to === from + 1 || (from === -1 && to === 0), `Down moves the mark one row (${from} -> ${to})`)
      const wantSecond = await page.locator(`[data-help-index="${to}"] [data-help-command]`).textContent()
      await page.keyboard.press('Enter')
      ok(!!wantSecond && (await until(async () => (await clip()) === wantSecond, 3000, 50)), "Enter copies the marked row's command")
      await page.keyboard.press('ArrowUp')
      // Tab stays inside the popup: behind it is a shell, and a Tab that got out
      // would be typed into it.
      let escaped = 0
      for (let i = 0; i < 8; i += 1) {
        await page.keyboard.press('Tab')
        if (!(await page.evaluate(() => !!document.activeElement?.closest('[data-help-panel]')))) escaped += 1
      }
      ok(escaped === 0, 'Tab cycles inside the popup')

      /* ----- a warning, and a key that is not a command ----- */
      await setQuery('delete a folder')
      ok(await until(async () => (await firstId()) === 'ps-delete-folder', 4000, 50), `"delete a folder" finds it (${await firstId()})`)
      // The warning is a MARK on the row now, its sentence still there for the
      // pointer and for a screen reader.
      const dangerMark = page.locator('[data-help-id="ps-delete-folder"][data-help-variant="0"] [data-help-danger]')
      const danger = ((await dangerMark.textContent()) ?? '').trim()
      ok(danger.length > 25 && /^Careful\./.test(danger), `and it carries its warning ("${danger.slice(0, 70)}...")`)
      ok(/^Careful\./.test((await dangerMark.getAttribute('title')) ?? ''), 'said on hover as well as to a screen reader')
      ok((await dangerMark.locator('svg').count()) === 1, 'and drawn as a mark, not a paragraph')
      await shot('help-danger-dark')
      await setQuery('stop a running command')
      const keys = await until(
        () => page.evaluate(() => {
          const v = document.querySelector('[data-help-id="ps-cancel-command"][data-help-variant="0"]')
          if (!v) return null
          return { caps: v.querySelectorAll('kbd').length, copy: v.querySelectorAll('[data-help-copy]').length }
        }),
        4000,
        50
      )
      ok(!!keys && keys.caps >= 2 && keys.copy === 0, `a key to press is drawn as keys and has no copy button (${JSON.stringify(keys)})`)
      await setQuery('zzzz qqqq xxxx')
      ok(await until(async () => (await page.locator('[data-help-empty]').count()) === 1, 3000, 50), 'a question nothing answers says so')

      /* ----- nothing was typed into the shell ----- */
      ok((await termText(page)) === termBefore, 'the terminal is EXACTLY as it was: nothing was typed or run')
      await page.keyboard.press('Escape')
      ok(await closed(), 'Escape closes it')
      // No click: the keyboard has to be back in the shell by itself.
      await page.keyboard.type('echo landed-$(1+1)')
      await page.keyboard.press('Enter')
      ok(await until(async () => (await termText(page)).includes('landed-2'), 10000), 'and the next keystroke lands in the shell')

      /* ----- a chord that changes what is in front puts it away ----- */
      // The app's chords work over the popup, and a new tab's terminal takes the
      // focus as it attaches. Left up, the popup sat over a focused shell and the
      // next "search" was typed into that shell.
      const focusIsShell = () => page.evaluate(() => document.activeElement?.classList.contains('xterm-helper-textarea') === true)
      await page.keyboard.press('F1')
      ok(await opened(), 'the popup is up again')
      await page.keyboard.press('Control+t')
      ok(await until(async () => (await tabLabels(page)).length === 2), 'Ctrl+T opens a tab over the popup')
      ok(await closed(), 'and the popup leaves with the tab it was opened over')
      ok(await until(focusIsShell, 4000, 50), 'the new shell has the keyboard, with nothing over it')
      await page.keyboard.press('Control+w')
      ok(await until(async () => (await tabLabels(page)).length === 1), 'the extra tab closes again')
      await page.keyboard.press('F1')
      ok(await opened(), 'up once more')
      await page.keyboard.press('Control+Shift+f')
      ok(await until(async () => (await page.locator('[data-term-find]').count()) === 1, 4000, 50), 'Ctrl+Shift+F opens find over the popup')
      ok(await closed(), 'and the popup leaves, so the find bar is never typed into from underneath it')
      await page.keyboard.press('Escape')
      ok(await until(async () => (await page.locator('[data-term-find]').count()) === 0, 4000, 50), 'Escape closes find')

      /* ----- the terminal's own menu ----- */
      await page.locator('[data-term-region]').click({ button: 'right', position: { x: 200, y: 120 } })
      const row = page.locator('[role="menu"] [role="menuitem"]', { hasText: 'Command help' })
      ok(await until(async () => (await row.count()) === 1, 4000, 50), 'the right-click menu has a Command help row')
      await row.click()
      ok(await opened(), 'which opens it')
      await page.locator('[data-help-close]').click()
      ok(await closed(), 'and its own X closes it')

      /* ----- a light theme, looked at ----- */
      await page.keyboard.press('Control+,')
      await page.locator('[data-settings-tab="appearance"]').click()
      await page.locator('[data-term-card="github"]').first().click()
      await until(() => page.evaluate(() => document.documentElement.dataset.mode === 'light'), 6000, 50)
      await page.keyboard.press('F1')
      ok(await opened(), 'F1 opens it over Settings too')
      await shot('help-browse-light')
      await page.keyboard.type('delete a folder')
      await until(async () => (await firstId()) === 'ps-delete-folder', 4000, 50)
      await page.locator('[data-help-copy="ps-delete-folder#0"]').click()
      await until(async () => (await page.locator('[data-help-copied]').count()) === 1, 3000, 25)
      await shot('help-results-light')
      const lightInk = await page.evaluate(() => {
        const lum = (c) => {
          const [r, g, b] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map((v) => {
            const s = Number(v) / 255
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
          })
          return 0.2126 * r + 0.7152 * g + 0.0722 * b
        }
        const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
        const row = document.querySelector('[data-help-id="ps-delete-folder"][data-help-variant="0"]')
        const code = row.querySelector('[data-help-command]')
        // The row's own fill is a stripe over the panel, so the ground is the
        // panel's: what the ink is actually read against.
        const ground = getComputedStyle(document.querySelector('[data-help-panel]')).backgroundColor
        return { command: ratio(lum(getComputedStyle(code).color), lum(ground)) }
      })
      ok(lightInk.command >= 4.5, `on a light theme the command still reads (${lightInk.command.toFixed(1)}:1)`)
      await page.keyboard.press('Escape')
      await closed()

      /* ----- off means off ----- */
      await page.locator('[data-settings-tab="general"]').click()
      const sw = page.locator('[data-pref="help-enabled"] [role="switch"]')
      ok((await sw.getAttribute('aria-checked')) === 'true', 'Settings > General has the Command help switch, on by default')
      await sw.click()
      ok(await until(async () => (await page.locator('[data-title-help]').count()) === 0, 4000, 50), 'switched off, the ? leaves the title bar')
      await page.keyboard.press('Control+1')
      await page.locator('.xterm').first().click({ force: true })
      await page.keyboard.press('F1')
      ok(!(await until(async () => (await panel.count()) === 1, 1500, 50)), 'and F1 opens nothing')
      await page.locator('[data-term-region]').click({ button: 'right', position: { x: 200, y: 120 } })
      await until(async () => (await page.locator('[role="menu"] [role="menuitem"]').count()) > 0, 4000, 50)
      ok((await page.locator('[role="menu"] [role="menuitem"]', { hasText: 'Command help' }).count()) === 0, 'nor does the menu offer it')
      await page.keyboard.press('Escape')
      await page.keyboard.press('Control+,')
      await page.locator('[data-settings-tab="general"]').click()
      await sw.click()
      ok(await until(async () => (await page.locator('[data-title-help]').count()) === 1, 4000, 50), 'switched back on, it returns')
      await page.keyboard.press('Control+1')

      /* ----- one question at a time ----- */
      // A shell stands in for Claude through the title. The process poll's own
      // verdict on a shell ("no agent here") is said ONCE and clears a title's
      // claim when it lands, and nothing on the page shows that it has; by now
      // this shell has been printing for far longer than the poll's first look
      // takes, and the wait below only makes that certain on a fast run.
      await until(() => Date.now() - t0 > 12000, 15000, 100)
      await page.locator('.xterm').first().click({ force: true })
      await typeLine(page, "$Host.UI.RawUI.WindowTitle = [char]0x2733 + ' Claude Code'")
      ok(
        await until(() => page.evaluate(() => !!document.querySelector('[data-agent-present]')), 8000, 50),
        'an agent is present in the tab, so closing it would ask'
      )
      await page.keyboard.press('F1')
      ok(await opened(), 'the popup is up')
      await page.keyboard.press('Control+w')
      const question = page.locator('[role="dialog"]:not([data-help-panel])')
      ok(await until(async () => (await question.count()) === 1, 4000, 50), 'Ctrl+W over it raises the close question')
      ok(await closed(), 'and the popup is put away, so the question is never underneath it')
      ok(
        await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]:not([data-help-panel])')),
        'the focus is on the question, where it can be seen'
      )
      await page.keyboard.press('F1')
      ok(!(await until(async () => (await panel.count()) === 1, 1200, 50)), 'and F1 does not open it over a question')
      await page.keyboard.press('Escape')
      ok(await until(async () => (await question.count()) === 0, 4000, 50), 'Cancel keeps the tab')
      ok((await tabLabels(page)).some((l) => l.includes('alpha')), 'which is still there')
    } finally {
      // Put back what the clipboard held.
      await app
        .evaluate(({ clipboard, nativeImage }, was) => {
          const data = {}
          if (was.text) data.text = was.text
          if (was.html) data.html = was.html
          if (was.rtf) data.rtf = was.rtf
          if (was.image) data.image = nativeImage.createFromDataURL(was.image)
          if (Object.keys(data).length) clipboard.write(data)
          else clipboard.clear()
        }, held)
        .catch(() => {})
      if (held.formats.some((f) => /FileName|uri-list/i.test(f))) console.log('  (the clipboard held copied FILES, which cannot be put back; it is empty now)')
    }
    await app.close().catch(() => {})
  },

  /** THE SETTINGS PARITY CHECK (#15): this app shows every terminal option the
   *  core lists, by id, and nothing terminal-looking of its own. Prism runs the
   *  same check against the same list, which is what keeps the two apps'
   *  terminal settings the same settings. */
  async options(ok) {
    const w = world()
    // No NVIDIA card, as far as this run is concerned: the GPU row is offered only
    // where one is found, and the parity list has to be the same on every PC.
    const { app, page } = await launch(w, { args: [w.alpha], env: { PT_E2E_NVIDIA: '0', PT_DICTATION_ROOT: join(w.profile, 'dictation') } })
    await until(async () => (await tabLabels(page)).length === 1)
    const ids = (file, keep = () => true) =>
      [...readFileSync(resolve(process.cwd(), file), 'utf8').matchAll(/\{\s*id: '([a-z-]+)'[^}]*\}/g)].filter((m) => keep(m[0])).map((m) => m[1])
    const wanted = [
      ...ids('core/renderer/settings/options.ts'),
      ...ids('core/renderer/settings/dictationOptions.ts', (row) => !row.includes('onlyWhere')),
      // Command help (#12) keeps a list of its own, as dictation does.
      ...ids('core/renderer/settings/helpOptions.ts')
    ].sort()
    ok(wanted.length >= 18 && wanted.includes('help-enabled'), `the core lists the terminal, dictation and help options (${wanted.length})`)
    await page.locator('[data-title-settings]').click()
    const shown = new Set()
    const seenInOrder = []
    for (const tab of ['general', 'appearance', 'dictation']) {
      await page.locator(`[data-settings-tab="${tab}"]`).click()
      await sleep(400)
      for (const id of await page.evaluate(() => [...document.querySelectorAll('[data-pref]')].map((e) => e.getAttribute('data-pref')))) {
        shown.add(id)
        seenInOrder.push(id)
      }
    }
    const missing = wanted.filter((id) => !shown.has(id))
    ok(missing.length === 0, `every terminal option is on the page (missing: ${JSON.stringify(missing)})`)
    // ONE ORDER IN BOTH APPS (owner, 2026-09-22): read top to bottom, General
    // then Appearance, the core's terminal rows come in the list's own order,
    // whatever of this app's own sits between them. Prism's e2e asserts the same.
    const termOrder = ids('core/renderer/settings/options.ts').filter((id) => shown.has(id))
    const pageOrder = seenInOrder.filter((id) => termOrder.includes(id))
    ok(
      JSON.stringify(pageOrder) === JSON.stringify(termOrder),
      `the terminal rows come in the shared order (${pageOrder.join(' > ')})`
    )
    // What is left must be THIS APP's rows, a closed list: a terminal-looking
    // row outside the core's list is a fork.
    // 'window-edges' (#27) is the window's chrome, which in Prism belongs to
    // the app style and has a row of its own there: this app's, not the core's.
    // 'window-accent' is the same: the accent is the app style's in Prism.
    const own = ['newtab-mode', 'explorer-verb', 'app-version', 'window-edges', 'window-accent', 'window-background']
    const extra = [...shown].filter((id) => !wanted.includes(id) && !own.includes(id))
    ok(extra.length === 0, `and nothing else claims to be a setting (extra: ${JSON.stringify(extra)})`)
    ok((await page.locator('[data-pref="confirm-close"]').count()) === 0, 'the close question is not a setting any more')
    // AND IT IS LAID OUT (#20). The rows above all existed and all worked while
    // the page was a ruin: core/ sits outside the folder Tailwind scans, so
    // every utility used only by the shared sections was never generated, and
    // a check that a row EXISTS cannot see that. Measured, so it can: a theme
    // card has a card's width and the wall wraps into rows, a row has its
    // padding, and the options of a segmented control do not overlap.
    await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/settings-dictation.png') }).catch(() => {})
    ok((await page.locator('[data-pref="dictation-gpu"]').count()) === 0, 'the GPU row is not offered without an NVIDIA card')
    const dictRow = await page.evaluate(() => {
      const r = document.querySelector('[data-dictation-item="base"]')
      return r ? { pad: parseFloat(getComputedStyle(r).paddingTop), w: Math.round(r.getBoundingClientRect().width) } : null
    })
    ok(!!dictRow && dictRow.pad >= 8 && dictRow.w > 400, `the model manager is laid out (${JSON.stringify(dictRow)})`)
    await page.locator('[data-settings-tab="appearance"]').click()
    await sleep(400)
    const look = await page.evaluate(() => {
      const box = (e) => e.getBoundingClientRect()
      const cards = [...document.querySelectorAll('[data-term-card]')].map(box)
      const row = document.querySelector('[data-pref="term-font"]')
      return {
        cardWidth: Math.round(cards[0]?.width ?? 0),
        cardRows: new Set(cards.map((c) => Math.round(c.top))).size,
        rowPad: row ? parseFloat(getComputedStyle(row).paddingTop) : 0
      }
    })
    await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/settings-appearance.png') }).catch(() => {})
    ok(look.cardWidth >= 150, `a theme card is a card, not a sliver (${look.cardWidth}px wide)`)
    ok(look.cardRows >= 2, `and the wall wraps into rows (${look.cardRows})`)
    ok(look.rowPad >= 8, `a settings row has its padding (${look.rowPad}px)`)
    await page.locator('[data-settings-tab="general"]').click()
    await sleep(300)
    const overlaps = await page.evaluate(() => {
      let n = 0
      for (const row of document.querySelectorAll('[data-pref]')) {
        const b = [...row.querySelectorAll('button')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0)
        for (let i = 0; i < b.length; i += 1)
          for (let j = i + 1; j < b.length; j += 1)
            if (b[i].left < b[j].right - 1 && b[j].left < b[i].right - 1 && b[i].top < b[j].bottom - 1 && b[j].top < b[i].bottom - 1) n += 1
      }
      return n
    })
    ok(overlaps === 0, `no two controls in a row overlap (${overlaps} do)`)
    await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/settings-general.png') }).catch(() => {})
    await app.close().catch(() => {})
  },

  /**
   * THE WINDOW'S EDGES (#27; owner, 2026-09-19: "Hairline, Faint, or like Solid
   * edges, or even No edges"). Every edge in the window reads one of two
   * tokens, so what is MEASURED is real edges, not the tokens: the line
   * between two tabs, the rule under the title bar, the settings rail's edge
   * (all the chrome's line) and the rule under a settings row (the list's).
   * Each pick must reach all of them, in the right order of strength, with
   * "none" transparent; the default must be the window exactly as it was; and
   * the choice must survive a relaunch. A screenshot per option goes into
   * .e2e-shots/, because a page that works is not a page that looks right.
   *
   * Nothing here sleeps and reads: the strip's border colour TRANSITIONS
   * (550ms), so every measurement waits until the edge has arrived at the
   * token it should be wearing.
   */
  async themeCards(ok) {
    // PICKING A THEME MOVES NOTHING (owner, 2026-09-22: "when I click a theme
    // ... the ui shifts a bit, it's not every theme but some"). Only the
    // selected card wears the pencil, which used to make it - and its row of
    // the wall - taller, so a pick in ANOTHER row shifted everything below.
    const w = world()
    const { app, page } = await launch(w, { args: [w.alpha] })
    await page.locator('[data-title-settings]').click()
    await page.locator('[data-settings-tab="appearance"]').click()
    await page.locator('[data-term-card]').first().waitFor({ timeout: 10000 })
    const measure = () =>
      page.evaluate(() => {
        const cards = [...document.querySelectorAll('[data-term-card]')].map((c) => {
          const r = c.getBoundingClientRect()
          return { id: c.getAttribute('data-term-card'), top: Math.round(r.top), h: Math.round(r.height * 10) / 10 }
        })
        const below = document.querySelector('[data-pref="term-font"]')?.getBoundingClientRect().top ?? -1
        return { cards, below: Math.round(below * 10) / 10 }
      })
    const first = await measure()
    const rowTops = [...new Set(first.cards.map((c) => c.top))]
    ok(rowTops.length >= 2, `the wall has two rows to pick across (${rowTops.length})`)
    const inRow = (top) => first.cards.find((c) => c.top === top)?.id
    const picks = [inRow(rowTops[0]), inRow(rowTops[1])]
    const seen = []
    for (const id of picks) {
      await page.locator(`[data-term-card="${id}"]`).first().click()
      await sleep(500)
      seen.push(await measure())
    }
    const heights = new Set(seen.flatMap((m) => m.cards.map((c) => c.h)))
    ok(heights.size === 1, `every card is one height, selected or not (${[...heights].join(' / ')})`)
    // The shift the owner saw is the SECOND row moving: the tall card is
    // always somewhere, so the wall's total height never changed.
    const row2 = (m) => m.cards.find((c) => c.id === picks[1])?.top
    ok(
      row2(seen[0]) === row2(seen[1]),
      `the second row stays put when the pick moves between rows (${row2(seen[0])} -> ${row2(seen[1])})`
    )
    ok(
      seen[0].below === seen[1].below,
      `and nothing below the wall moves (${seen[0].below} -> ${seen[1].below})`
    )
    // A colour put back to the theme's is a plain RESET word, as in Prism
    // (owner, same day: "just a simple reset text you can click"), not a
    // bordered button.
    const well = page.locator('[data-pref="agent-color"] input:not([type])')
    const themed = (await well.inputValue()).toLowerCase()
    await well.fill('#e07a2f')
    await well.press('Enter')
    const reset = page.locator('[data-follow-theme="working"]')
    await reset.waitFor({ timeout: 5000 })
    const look = await reset.evaluate((el) => ({
      text: el.textContent?.trim(),
      border: parseFloat(getComputedStyle(el).borderTopWidth) || 0,
      bg: getComputedStyle(el).backgroundColor
    }))
    ok(
      look.text === 'Reset' && look.border === 0 && /rgba\(0, 0, 0, 0\)|transparent/.test(look.bg),
      `a picked colour offers a plain "Reset" word (${JSON.stringify(look)})`
    )
    await reset.click()
    ok(
      await until(async () => (await well.inputValue()).toLowerCase() === themed && !(await reset.count()), 5000),
      'and Reset puts the theme\'s colour back and goes away'
    )
    await app.close().catch(() => {})
  },

  async edges(ok) {
    const w = world()
    // Two tabs, so there IS a line between tabs to measure.
    let { app, page } = await launch(w, { args: [w.alpha, w.beta] })
    ok(await until(async () => (await tabLabels(page)).length === 2), 'two tabs open, so a tab separator exists')
    const probe = (pg) =>
      pg.evaluate(() => {
        const parts = (c) => (c.match(/[\d.]+/g) ?? []).map(Number)
        const alpha = (c) => (parts(c).length >= 4 ? parts(c)[3] : 1)
        const rgb = (c) => parts(c).slice(0, 3).join(',')
        // A token as the engine resolves it, so a token and an edge are
        // compared in the same words (rgba(), alpha to two or three places).
        const token = (name) => {
          const span = document.createElement('span')
          span.style.color = getComputedStyle(document.documentElement).getPropertyValue(name)
          document.body.appendChild(span)
          const c = getComputedStyle(span).color
          span.remove()
          return c
        }
        const tab = document.querySelector('[data-tab]')
        const title = document.querySelector('[data-title-bar]')
        const rail = document.querySelector('[data-settings-page] aside')
        const row = document.querySelector('[data-pref="window-edges"]')
        const css = (el, prop) => (el ? getComputedStyle(el)[prop] : null)
        const edges = {
          tab: css(tab, 'borderRightColor'),
          title: css(title, 'borderBottomColor'),
          rail: css(rail, 'borderRightColor'),
          row: css(row, 'borderBottomColor')
        }
        return {
          divider: alpha(token('--p-divider')),
          line: alpha(token('--p-line')),
          ink: rgb(token('--p-divider')),
          raw: {
            divider: getComputedStyle(document.documentElement).getPropertyValue('--p-divider').trim(),
            line: getComputedStyle(document.documentElement).getPropertyValue('--p-line').trim()
          },
          tab: edges.tab === null ? null : alpha(edges.tab),
          tabInk: edges.tab === null ? null : rgb(edges.tab),
          title: edges.title === null ? null : alpha(edges.title),
          rail: edges.rail === null ? null : alpha(edges.rail),
          row: edges.row === null ? null : alpha(edges.row),
          // A border keeps its pixel whatever its colour: nothing may move.
          tabWidth: tab ? tab.getBoundingClientRect().width : 0,
          titleHeight: title ? title.getBoundingClientRect().height : 0,
          tabBorder: css(tab, 'borderRightWidth'),
          pressed: document.querySelector('[data-pref="window-edges"] [aria-pressed="true"]')?.getAttribute('data-seg') ?? null,
          stored: localStorage.getItem('prism.window.edges')
        }
      })
    const near = (a, b) => a !== null && Math.abs(a - b) < 0.004
    /** Wait until every edge on screen wears its token (transitions done) AND
     *  the state asked for is the one in force; the probe that satisfied both. */
    const settled = (pg, also = () => true, ms = 15000) =>
      until(async () => {
        const p = await probe(pg)
        const chrome = [p.tab, p.title, ...(p.rail === null ? [] : [p.rail])]
        const arrived = chrome.every((a) => near(a, p.divider)) && (p.row === null || near(p.row, p.line))
        return arrived && also(p) ? p : null
      }, ms)

    // THE DEFAULT IS THE WINDOW AS IT WAS: the numbers chromeTheme hard-coded
    // before there was a choice, on the default theme, with nothing stored.
    const first = await settled(page)
    ok(!!first, 'at launch every edge wears its token')
    ok(first?.stored === null, 'nothing is stored until somebody chooses')
    ok(
      first?.raw.divider === '#ffffff12' && first?.raw.line === '#ffffff17',
      `the default is exactly the look before the setting existed (${first?.raw.divider}, ${first?.raw.line})`
    )
    ok(near(first?.tab ?? null, 0.07), `the line between tabs is the 7% hairline it always was (${first?.tab})`)
    ok((await page.evaluate(() => window.prism.e2eWindowEdges())) === 'hairline', 'main holds a hairline for the window border')

    await page.locator('[data-title-settings]').click()
    await page.locator('[data-settings-tab="appearance"]').click()
    const row = page.locator('[data-pref="window-edges"]')
    await row.waitFor({ state: 'visible', timeout: 10000 })
    await row.scrollIntoViewIfNeeded()
    ok(
      (await page.locator('[data-pref="window-edges"] [data-seg]').allTextContents()).join('|') === 'None|Faint|Hairline|Solid',
      'Settings > Appearance has an Edges row, weakest to strongest as in Prism: None, Faint, Hairline, Solid'
    )
    ok((await settled(page))?.pressed === 'hairline', 'with Hairline pressed, since that is what is in force')
    ok(near((await probe(page)).row, 0.09), 'a settings row wears the 9% list line it always did')

    // Each option in turn, ending on one that is NOT the default, so the
    // relaunch below proves something.
    const seen = {}
    for (const id of ['faint', 'none', 'hairline', 'solid']) {
      await page.locator(`[data-pref="window-edges"] [data-seg="${id}"]`).click()
      const p = await settled(page, (q) => q.pressed === id && q.stored === id)
      ok(!!p, `${id}: picked, stored, and every edge has arrived at its token`)
      if (!p) continue
      seen[id] = p
      ok(
        (await until(async () => (await page.evaluate(() => window.prism.e2eWindowEdges())) === id, 5000)) === true,
        `${id}: main was told, for the border round the window`
      )
      await row.scrollIntoViewIfNeeded()
      await page.screenshot({ path: resolve(process.cwd(), `.e2e-shots/edges-${id}.png`) }).catch(() => {})
    }
    const all = ['none', 'faint', 'hairline', 'solid'].every((id) => !!seen[id])
    ok(all, 'all four options were measured')
    if (all) {
      const { none, faint, hairline, solid } = seen
      for (const edge of ['tab', 'title', 'rail', 'row']) {
        ok(none[edge] === 0, `none: the ${edge} edge is transparent (alpha ${none[edge]})`)
        ok(
          faint[edge] > 0 && faint[edge] < hairline[edge] && hairline[edge] < solid[edge],
          `${edge}: faint < hairline < solid (${faint[edge]} < ${hairline[edge]} < ${solid[edge]})`
        )
      }
      ok(near(hairline.tab, 0.07) && near(hairline.row, 0.09), 'going back to Hairline is going back to the old look')
      ok(solid.tabInk === '255,255,255', `on a dark ground the line is white ink (${solid.tabInk})`)
      // Transparent, not absent: the border keeps its width, so nothing shifts.
      // The width is whatever one CSS pixel snaps to on this display (MEASURED
      // 0.888889px at 225% scaling), so it is compared, never assumed to be 1px.
      const widths = new Set(Object.values(seen).map((p) => `${p.tabWidth}|${p.titleHeight}|${p.tabBorder}`))
      ok(
        widths.size === 1 && parseFloat(none.tabBorder) > 0,
        `no option moves the layout, and "none" keeps its border's width (${[...widths].join(' ; ')})`
      )
    }

    // A light theme: the same choice, in black ink at the light ground's alpha.
    await page.locator('[data-term-card="github"]').first().click()
    const lightSolid = await settled(page, (q) => q.ink === '0,0,0' && q.pressed === 'solid')
    ok(!!lightSolid && near(lightSolid.tab, 0.18), `on a light theme Solid is black ink at 18% (${lightSolid?.tabInk} @ ${lightSolid?.tab})`)

    // AND IT SURVIVES A RELAUNCH: quit properly (localStorage is flushed on the
    // way out), come back, and measure before Settings is even opened.
    // THE OLD PROCESS MUST BE GONE FIRST, and that is waited for rather than
    // slept through (it flaked once in a full run, 2026-09-20: the relaunched
    // window never settled and read "stored undefined"). This app takes the
    // single-instance lock, so launching while the old one is still shutting
    // down hands the arguments to a window that is on its way out; and
    // localStorage, which is what this assertion is about, is flushed on the
    // way out. Ten seconds is plenty on a quiet machine and not always enough
    // under a whole suite, which is exactly the shape of check the ratchet rule
    // says to fix rather than re-run.
    const gone = new Promise((r) => app.process().on('exit', r))
    await page.evaluate(() => window.prism.quitApp()).catch(() => {})
    const exited = await Promise.race([gone.then(() => true), sleep(45000).then(() => false)])
    ok(exited, 'the app quits when it is asked to, before anything relaunches it')
    ;({ app, page } = await launch(w))
    ok(await until(async () => (await tabLabels(page)).length === 2, 20000), 'a relaunch brings the tabs back')
    const back = await settled(page, (q) => q.stored === 'solid' && near(q.tab, 0.18), 30000)
    ok(!!back, `the relaunched window draws Solid edges before Settings is opened (tab ${back?.tab}, stored ${back?.stored})`)
    ok(
      (await until(async () => (await page.evaluate(() => window.prism.e2eWindowEdges())) === 'solid', 5000)) === true,
      'and main was told again at launch'
    )
    await page.locator('[data-title-settings]').click()
    await page.locator('[data-settings-tab="appearance"]').click()
    ok(
      (await until(async () => (await probe(page)).pressed === 'solid', 10000)) === true,
      'and the row shows Solid pressed'
    )
    ok((await page.evaluate(() => window.prism.e2eRegWrites())) === 0, 'no registry write was attempted under --e2e')
    await app.close().catch(() => {})
  },

  /**
   * THE WINDOW'S ACCENT (owner, 2026-09-22: "add an accent colour option which
   * would pick the accents you see, like the blue highlight effect and tab
   * effect"). Measured on the ACTIVE TAB'S RULE, which is the tab effect the
   * owner pointed at, as well as on the token: a token that moved while the
   * rule stayed blue would be the setting lying. Then Reset must put
   * back exactly the colour that was there before.
   */
  async accent(ok) {
    const w = world()
    const { app, page } = await launch(w, { args: [w.alpha, w.beta] })
    ok(await until(async () => (await tabLabels(page)).length === 2), 'two tabs open, so one is the active tab')
    const probe = () =>
      page.evaluate(() => {
        const root = getComputedStyle(document.documentElement)
        const colour = (css) => {
          const span = document.createElement('span')
          span.style.color = css
          document.body.appendChild(span)
          const c = getComputedStyle(span).color
          span.remove()
          return c
        }
        const rule = [...document.querySelectorAll('[data-tab] span[aria-hidden]')].find(
          (s) => s.className.includes('top-0') && s.className.includes('h-0.5')
        )
        return {
          accent: root.getPropertyValue('--p-accent').trim().toLowerCase(),
          hi: colour(root.getPropertyValue('--p-accent-hi').trim()),
          rule: rule ? getComputedStyle(rule).backgroundColor : null,
          stored: localStorage.getItem('prism.window.accent'),
          follow: document.querySelectorAll('[data-follow-theme="accent"]').length,
          field: document.querySelector('[data-pref="window-accent"] input:not([type])')?.value?.toLowerCase() ?? null
        }
      })
    const before = await probe()
    ok(!!before.rule && before.rule === before.hi, `the active tab wears the accent rule (${before.rule})`)
    await page.locator('[data-title-settings]').click()
    // SETTINGS CONTROLS DO NOT WEAR THE ACCENT (owner, 2026-09-23: "i dont want
    // settings buttons to be affected by the accent colour"; only Save is).
    // Sampled here with the theme's accent, and again after a pick: a row
    // button, a pressed segment and a switch that is on must not move.
    const controls = () =>
      page.evaluate(() => {
        const look = (el) => {
          if (!el) return null
          const s = getComputedStyle(el)
          return `${s.backgroundColor}|${s.color}|${s.borderTopColor}`
        }
        return {
          button: look(document.querySelector('[data-choose-folder]')),
          segment: look(document.querySelector('[data-pref="newtab-mode"] [aria-pressed="true"]')),
          switch: look(document.querySelector('[role="switch"][aria-checked="true"]'))
        }
      })
    await page.locator('[data-choose-folder]').waitFor({ state: 'visible', timeout: 10000 })
    await sleep(700)
    const plain = await controls()
    ok(!!plain.button && !!plain.segment && !!plain.switch, 'a row button, a pressed segment and an on switch are on the General page')
    await page.locator('[data-settings-tab="appearance"]').click()
    const row = page.locator('[data-pref="window-accent"]')
    await row.waitFor({ state: 'visible', timeout: 10000 })
    await row.scrollIntoViewIfNeeded()
    const idle = await probe()
    ok(idle.stored === null && idle.follow === 0, 'nothing is chosen at first, so there is nothing to follow back to')
    ok(idle.field === before.accent, `the swatch shows the theme's own accent (${idle.field} vs ${before.accent})`)

    const field = page.locator('[data-pref="window-accent"] input:not([type])')
    await field.fill('#E07A2F')
    await field.press('Enter')
    const picked = await until(async () => {
      const p = await probe()
      return p.accent === '#e07a2f' && p.rule === p.hi && p.rule !== before.rule ? p : null
    }, 10000)
    ok(!!picked, `a picked colour is the accent, and the tab's rule follows it (${picked?.rule})`)
    ok(picked?.stored === '#e07a2f' && picked?.follow === 1, 'it is stored, and Reset is offered')
    await sleep(800)
    await row.scrollIntoViewIfNeeded()
    await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/accent-picked.png') }).catch(() => {})
    // The accent reached the tab (above); the settings controls stay as they
    // were, and none of them is the accent.
    await page.locator('[data-settings-tab="general"]').click()
    await page.locator('[data-choose-folder]').waitFor({ state: 'visible', timeout: 10000 })
    await sleep(700)
    const after = await controls()
    const accentRgb = await page.evaluate(() => {
      const span = document.createElement('span')
      span.style.color = getComputedStyle(document.documentElement).getPropertyValue('--p-accent').trim()
      document.body.appendChild(span)
      const c = getComputedStyle(span).color
      span.remove()
      return c
    })
    for (const k of ['button', 'segment', 'switch']) {
      ok(after[k] === plain[k], `the ${k} is unchanged by the picked accent (${after[k]})`)
      ok(!after[k].split('|').includes(accentRgb), `and the ${k} wears no accent`)
    }
    await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/settings-neutral-controls.png') }).catch(() => {})
    await page.locator('[data-settings-tab="appearance"]').click()
    await row.waitFor({ state: 'visible', timeout: 10000 })
    await row.scrollIntoViewIfNeeded()

    await page.locator('[data-follow-theme="accent"]').click()
    const back = await until(async () => {
      const p = await probe()
      return p.accent === before.accent && p.rule === before.rule ? p : null
    }, 10000)
    ok(!!back, `Reset puts back exactly the theme's accent (${back?.accent})`)
    ok(back?.stored === null && back?.follow === 0, 'and forgets the choice')

    // THE DEFAULT THEME IS EMBER here (owner, 2026-09-22: "let this be the
    // default theme ... for prism terminal"): a fresh profile has it selected.
    ok(
      (await page.locator('[data-term-card="pt-default"]').first().getAttribute('aria-pressed')) === 'true',
      'a fresh profile wears PT Default, the default theme'
    )
    ok(
      (await page.locator('[data-term-card]').first().getAttribute('data-term-card')) === 'pt-default',
      'and it is the first card in the wall'
    )

    // BACKGROUND AND ACCENT SIT RIGHT UNDER FONT SIZE (owner, same day).
    const order = await page.evaluate(() => [...document.querySelectorAll('[data-pref]')].map((e) => e.getAttribute('data-pref')))
    const at = order.indexOf('term-font')
    ok(
      at >= 0 && order[at + 1] === 'window-background' && order[at + 2] === 'window-accent',
      `Background and Accent come right after Font size (${order.slice(Math.max(0, at - 1), at + 4).join(' > ')})`
    )

    // THE BACKGROUND (owner: "let background colour be a setting"): the
    // window's ground and the terminal's, one colour, and Reset puts it back.
    const ground = () =>
      page.evaluate(() => ({
        bg: getComputedStyle(document.documentElement).getPropertyValue('--p-bg-solid').trim().toLowerCase(),
        stored: localStorage.getItem('prism.window.background'),
        reset: document.querySelectorAll('[data-follow-theme="background"]').length
      }))
    const themeGround = (await ground()).bg
    const bgField = page.locator('[data-pref="window-background"] input:not([type])')
    ok((await bgField.inputValue()).toLowerCase() === themeGround, `the background swatch shows the theme's own (${themeGround})`)
    await bgField.fill('#1c2330')
    await bgField.press('Enter')
    const painted = await until(async () => {
      const g = await ground()
      return g.bg === '#1c2330' && g.stored === '#1c2330' && g.reset === 1 ? g : null
    }, 8000)
    ok(!!painted, 'a picked background is the window ground, stored, with Reset offered')
    await sleep(900) // the strip's colour transitions over 550ms
    await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/background-picked.png') }).catch(() => {})
    await page.locator('[data-follow-theme="background"]').click()
    ok(
      !!(await until(async () => {
        const g = await ground()
        return g.bg === themeGround && g.stored === null && g.reset === 0 ? g : null
      }, 8000)),
      "Reset puts the theme's background back"
    )
    await app.close().catch(() => {})
  },

  /**
   * THE UPDATE WINDOW (#28; owner, 2026-09-19: "when you click the Update badge,
   * it opens like a pop window, which shows the change log or like patch notes
   * for the new update, and then you can choose cancel or install", and "make
   * like a fake update"). Driven through `--preview-update`, which is the
   * owner's own way in, so the scenario proves the preview and the window at
   * once: the chip is in the title bar, a click opens the window and installs
   * NOTHING, the notes are plain text (no anchor, no author tail, no url), every
   * way out closes it, and Install runs the fake progress in the chip, ends on
   * the preview line, and leaves the network, the disk and the process list
   * exactly as they were.
   *
   * THE WINDOW STAYS FOR THE INSTALL AND DRAWS THE BAR (#32; owner, 2026-09-20:
   * "keep me with the panel open and have the progress bar straight there, kind
   * of like the way extract works for zip files in Prism"). So what is sampled
   * the whole way through the install, every 25ms rather than once per state, is
   * the WINDOW: that it never left, that its box never changed size (the track
   * is always in the layout and only fades in, the archive panel's own rule),
   * that the percentage only rose, and which of its buttons could be pressed
   * when. The chip is sampled beside it: accent-filled, one label, one width.
   * Cancel mid-download is driven too, and must leave nothing said. Screenshots
   * go to .e2e-shots/, on a dark theme and on a light one.
   */
  async updateWindow(ok) {
    const w = world()
    const { app, page } = await launch(w, { args: ['--preview-update', w.alpha] })
    await until(async () => (await tabLabels(page)).length === 1)
    const current = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')).version
    const [major, minor] = current.split('.').map(Number)
    const next = `${major}.${minor + 1}.0`
    const shot = (name) => page.screenshot({ path: resolve(process.cwd(), `.e2e-shots/${name}.png`) }).catch(() => {})
    const chip = page.locator('[data-title-bar] [data-update-chip]')
    const dialog = page.locator('[data-update-dialog]')
    const shownLabel = () => page.evaluate(() => document.querySelector('[data-update-chip] [data-update-label="shown"]')?.textContent ?? '')
    const closed = () => until(async () => (await dialog.count()) === 0, 4000, 50)
    const opened = () => until(async () => (await dialog.count()) === 1, 4000, 50)

    ok(await until(async () => (await chip.count()) === 1, 8000), 'with --preview-update the chip is in the title bar, under --e2e too')
    ok((await shownLabel()) === `Update ${next}`, `it offers the next minor after ${current} ("${await shownLabel()}")`)
    ok((await dialog.count()) === 0, 'and nothing opens by itself')
    const width0 = await chip.evaluate((el) => el.getBoundingClientRect().width)
    const left0 = await chip.evaluate((el) => el.getBoundingClientRect().left)
    // FILLED IN THE ACCENT (#32), and read off the pixels' own colours: the
    // fill is the theme's accent family and not a grey, and the label on it
    // clears the floor for small text.
    const chipInk = () =>
      chip.evaluate((el) => {
        const rgb = (c) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
        const lum = (c) => {
          const lin = (v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4)
          const [r, g, b] = rgb(c)
          return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
        }
        const resolve = (token, prop) => {
          const probe = document.createElement('span')
          probe.style[prop] = `var(${token})`
          document.body.appendChild(probe)
          const c = getComputedStyle(probe)[prop]
          probe.remove()
          return c
        }
        const bg = getComputedStyle(el).backgroundColor
        const fg = getComputedStyle(el.querySelector('[data-update-label]')).color
        const [r, g, b] = rgb(bg)
        const [la, lb] = [lum(bg), lum(fg)]
        return {
          bg,
          fg,
          selBg: resolve('--p-sel-bg', 'backgroundColor'),
          onAccent: resolve('--p-on-accent', 'color'),
          // A grey has no spread between its channels; an accent does.
          chroma: Math.max(r, g, b) - Math.min(r, g, b),
          contrast: (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
        }
      })
    const inkDark = await chipInk()
    ok(inkDark.bg === inkDark.selBg && inkDark.fg === inkDark.onAccent, `the chip is filled in the accent, its label in the accent's ink (${inkDark.bg})`)
    ok(inkDark.chroma >= 40, `which is a colour and not the grey pill it was (channel spread ${inkDark.chroma})`)
    ok(inkDark.contrast >= 4.5, `and the label reads on it (${inkDark.contrast.toFixed(1)}:1)`)
    ok(
      await page.evaluate(() => {
        const c = document.querySelector('[data-update-chip]')
        const r = c.getBoundingClientRect()
        const group = [...document.querySelectorAll('[data-title-bar] button')].filter((b) => b !== c && b.getBoundingClientRect().left > innerWidth / 2)
        return group.length > 0 && group.every((b) => b.getBoundingClientRect().left >= r.right - 0.5)
      }),
      'it is the LEFTMOST of the controls at the right of the title bar'
    )
    await shot('update-chip-dark')

    // What an install would leave behind, read BEFORE anything is clicked.
    const updateDirs = () => readdirSync(tmpdir()).filter((n) => n.startsWith('prismterminal-update-')).sort().join('|')
    // The hand-off a real install spawns names that temp folder on its command
    // line. The query's own PowerShell names it too, so it leaves itself out.
    const installers = () => {
      try {
        return execFileSync(
          'powershell.exe',
          ['-NoProfile', '-Command', "@(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*prismterminal-update-*' }).Count"],
          { encoding: 'utf8', windowsHide: true }
        ).trim()
      } catch {
        return 'unknown'
      }
    }
    const dirsBefore = updateDirs()
    const installersBefore = installers()

    await chip.click()
    ok(await opened(), 'a click on the chip opens the window')
    ok((await page.evaluate(() => window.prism.e2eUpdateCalls())).installs === 0, 'and installs nothing: the click used to download and quit')
    ok(((await dialog.locator('h2').textContent()) ?? '') === `Update to ${next}`, 'its title names the version')
    ok(((await dialog.locator('[data-update-current]').textContent()) ?? '').trim() === `You have ${current}`, `and a quiet line says what is running (${current})`)
    const entries = await dialog.locator('[data-update-entry]').allTextContents()
    ok(entries.length >= 5, `the sample notes are listed (${entries.length} entries)`)
    ok(entries[0].startsWith('The update button opens a window'), `as the pull requests' titles ("${entries[0]}")`)
    // SORTED UNDER HEADINGS, worded for a reader (owner, 2026-09-20: "headers
    // bug fixes, new features, so on... not like a git commit").
    const sections = await dialog.locator('[data-update-section]').evaluateAll((els) =>
      els.map((el) => ({ heading: el.querySelector('h3')?.textContent?.trim() ?? '', lines: [...el.querySelectorAll('[data-update-entry]')].map((li) => (li.textContent ?? '').trim()) }))
    )
    ok(sections.map((x) => x.heading).join('|') === 'New features|Bug fixes|Under the hood', `the notes are sorted under headings (${sections.map((x) => `${x.heading}: ${x.lines.length}`).join(', ')})`)
    ok(sections[1]?.lines[0] === 'A prompt survives the window getting narrower and wider again', `a fix reads as a sentence, its "fix(terminal):" gone ("${sections[1]?.lines[0]}")`)
    ok(entries.every((e) => !/\(#\d+\)\s*$/.test(e) && !/^[a-z]+(\([^)]*\))?!?:/.test(e) && e[0] === e[0].toUpperCase()), 'no line ends in a pull request number or starts with a commit type, and each starts with a capital')
    const text = (await dialog.textContent()) ?? ''
    ok(!/by @/.test(text), 'no author tail ("by @") reaches the window')
    ok(!/https?:|github\.com/.test(text), 'and no url does')
    ok(!/Full Changelog|New Contributors|first contribution|What's Changed/.test(text), 'nor the boilerplate round the list')
    ok((await dialog.locator('a').count()) === 0, 'there is no <a> element in it')
    ok(
      (await dialog.locator('[data-update-notes]').evaluate((el) => [...el.querySelectorAll('*')].every((n) => ['SECTION', 'H3', 'UL', 'LI', 'SPAN', 'P'].includes(n.tagName)))) === true,
      'the notes are text in plain elements, nothing a body could have brought with it'
    )
    ok(!/This is a preview/.test(text) && (await dialog.locator('[data-update-preview]').count()) === 0, 'a preview is not announced up front: the window is shown as it will be')
    const bare = await dialog.locator('[data-update-notes]').evaluate((el) => {
      const cs = getComputedStyle(el)
      const alpha = Number((cs.backgroundColor.match(/[\d.]+/g) ?? [])[3] ?? 1)
      return { alpha, border: ['Top', 'Right', 'Bottom', 'Left'].map((side) => parseFloat(cs[`border${side}Width`])).reduce((a, b) => a + b, 0) }
    })
    ok(bare.alpha === 0 && bare.border === 0, `the notes sit on the window's own ground: no fill, no border (alpha ${bare.alpha}, border ${bare.border}px)`)
    const look = await dialog.evaluate((el) => {
      const notes = el.querySelector('[data-update-notes]')
      const alpha = (c) => Number((c.match(/[\d.]+/g) ?? [])[3] ?? 1)
      const box = el.getBoundingClientRect()
      const buttons = [...el.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim())
      return {
        alpha: alpha(getComputedStyle(el).backgroundColor),
        overflow: getComputedStyle(notes).overflowY,
        maxHeight: getComputedStyle(notes).maxHeight,
        inside: box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth,
        buttons,
        focused: (document.activeElement?.textContent ?? '').trim()
      }
    })
    ok(look.alpha === 1, `the window is on the opaque surface (alpha ${look.alpha})`)
    ok(look.overflow === 'auto' && look.maxHeight !== 'none', `the list scrolls inside a capped height (${look.overflow}, ${look.maxHeight})`)
    ok(look.inside, 'the whole window is on screen')
    ok(look.buttons.join('|') === 'Cancel|Install', `the choices are Cancel and Install, in that order (${look.buttons.join('|')})`)
    ok(look.focused === 'Install', 'Install is the primary, and holds the focus')
    await shot('update-dialog-dark')

    await page.keyboard.press('Escape')
    ok(await closed(), 'Escape closes it')
    ok((await chip.count()) === 1 && (await shownLabel()) === `Update ${next}`, 'and the offer is still there')
    await chip.click()
    await opened()
    await dialog.locator('[data-update-cancel]').click()
    ok(await closed(), 'Cancel closes it')
    await chip.click()
    await opened()
    await page.mouse.click(8, 300)
    ok(await closed(), 'and so does a press outside it')
    ok((await page.evaluate(() => window.prism.e2eUpdateCalls())).installs === 0, 'none of which installed anything')

    // Install (#32): THE WINDOW STAYS, and is sampled the whole way, so a box
    // that changed size for one frame is caught as surely as one that stayed
    // changed.
    await chip.click()
    await opened()
    const slot = await dialog.locator('[data-update-progress]').evaluate((el) => ({ active: el.dataset.active, opacity: getComputedStyle(el).opacity, h: el.getBoundingClientRect().height }))
    ok(slot.active === 'false' && slot.opacity === '0' && slot.h > 10, `before Install the progress track is already in the layout, unseen (${slot.h.toFixed(1)}px at opacity ${slot.opacity})`)
    const startSampling = () =>
      page.evaluate(() => {
        window.__upd = []
        window.__updTimer = setInterval(() => {
          const c = document.querySelector('[data-update-chip]')
          const d = document.querySelector('[data-update-dialog]')
          const box = d?.getBoundingClientRect()
          const cancel = d?.querySelector('[data-update-cancel]')
          window.__upd.push({
            chipW: c?.getBoundingClientRect().width ?? -1,
            chipLeft: c?.getBoundingClientRect().left ?? -1,
            chipLabel: c?.querySelector('[data-update-label]')?.textContent ?? '',
            up: !!d,
            w: box?.width ?? -1,
            h: box?.height ?? -1,
            top: box?.top ?? -1,
            phase: d?.dataset.phase ?? 'gone',
            title: d?.querySelector('h2')?.textContent ?? '',
            pct: Number(d?.querySelector('[data-update-track]')?.getAttribute('aria-valuenow') ?? -1),
            shownPct: d?.querySelector('[data-update-pct]')?.textContent ?? '',
            status: (d?.querySelector('[data-update-status]')?.textContent ?? '').trim(),
            cancel: (cancel?.textContent ?? '').trim(),
            cancelOff: !!cancel?.disabled,
            installOff: !!d?.querySelector('[data-update-install]')?.disabled,
            underChip: !!document.querySelector('[data-update-notice]')
          })
        }, 25)
      })
    const stopSampling = () =>
      page.evaluate(() => {
        clearInterval(window.__updTimer)
        return window.__upd
      })
    const phaseIs = (want) => until(() => page.evaluate((p) => document.querySelector('[data-update-dialog]')?.dataset.phase === p, want), 6000, 25)
    const pctAtLeast = (n) => until(() => page.evaluate((min) => Number(document.querySelector('[data-update-track]')?.getAttribute('aria-valuenow') ?? 0) >= min, n), 6000, 25)
    await startSampling()
    await dialog.locator('[data-update-install]').click()
    ok(await phaseIs('downloading'), 'Install starts the download')
    ok((await dialog.count()) === 1, 'and THE WINDOW STAYS UP: the progress is straight there')
    // Not dismissable while it runs.
    await page.keyboard.press('Escape')
    await page.mouse.click(8, 300)
    await sleep(150)
    ok((await dialog.count()) === 1 && (await dialog.getAttribute('data-phase')) !== 'idle', 'Escape and a press outside do NOT put a running install away')
    await pctAtLeast(35)
    await shot('update-progress-dark')
    const status = dialog.locator('[data-update-status]')
    ok(
      await until(async () => (await dialog.getAttribute('data-phase')) === 'idle' && ((await status.textContent()) ?? '').trim() === 'Preview only: nothing was installed', 10000, 50),
      'the fake install ends by saying so IN the window'
    )
    await shot('update-ended-dark')
    const samples = await stopSampling()
    ok(samples.length > 40 && samples.every((x) => x.up), `the window was up in every one of ${samples.length} samples`)
    const phases = [...new Set(samples.map((x) => x.phase))]
    ok(['idle', 'downloading', 'installing'].every((ph) => phases.includes(ph)), `it went through every phase (${phases.join(', ')})`)
    const running = samples.filter((x) => x.phase !== 'idle')
    const pcts = running.map((x) => x.pct)
    ok(pcts.length > 5 && pcts.every((v, i) => v >= 0 && (i === 0 || v >= pcts[i - 1])) && pcts.at(-1) === 100, `the bar only rises, to 100 (${pcts[0]}% to ${pcts.at(-1)}%)`)
    ok(running.every((x) => x.shownPct === `${x.pct}%`), 'and the number beside it is the same number')
    ok(running.every((x) => x.title === `Updating to ${next}`), 'the title says what is happening while it runs')
    ok(samples.some((x) => x.phase === 'downloading' && x.status === 'Downloading the update'), 'the status line says it is downloading')
    ok(samples.some((x) => x.phase === 'installing' && /^Installing/.test(x.status)), 'and then that it is installing')
    ok(running.every((x) => x.installOff), 'Install cannot be pressed twice')
    ok(samples.filter((x) => x.phase === 'downloading').every((x) => x.cancel === 'Cancel' && !x.cancelOff), 'Cancel can be pressed for as long as it is DOWNLOADING')
    ok(samples.filter((x) => x.phase === 'installing').every((x) => x.cancelOff), 'and not once the installer has the file')
    const boxes = [...new Set(samples.map((x) => `${x.w.toFixed(2)}x${x.h.toFixed(2)}@${x.top.toFixed(2)}`))]
    ok(boxes.length === 1, `THE WINDOW NEVER CHANGED SIZE OR MOVED, from the notes to the bar to the ending (${boxes.join(', ')})`)
    const chipWidths = [...new Set(samples.map((x) => x.chipW.toFixed(3)))]
    const chipLefts = [...new Set(samples.map((x) => x.chipLeft.toFixed(3)))]
    ok(chipWidths.length === 1 && Math.abs(Number(chipWidths[0]) - width0) < 0.01, `the chip's width is identical throughout (${chipWidths.join(', ')}px; idle ${width0.toFixed(3)}px)`)
    ok(chipLefts.length === 1 && Math.abs(Number(chipLefts[0]) - left0) < 0.01, `and its left edge never moved (${chipLefts.join(', ')})`)
    ok(samples.every((x) => x.chipLabel.trim() === `Update ${next}`), 'its label never changes: the bar is the window\'s, not the chip\'s')
    ok(samples.every((x) => !x.underChip), 'and nothing is hung under the chip while the window is there to say it')
    const ended = await dialog.evaluate((el) => ({
      buttons: [...el.querySelectorAll('button')].map((b) => `${(b.textContent ?? '').trim()}${b.disabled ? ' (off)' : ''}`).join('|'),
      track: getComputedStyle(el.querySelector('[data-update-track]')).visibility
    }))
    ok(ended.buttons === 'Close|Install', `afterwards the choices are Close and Install again (${ended.buttons})`)
    ok(ended.track === 'hidden', 'with the bar gone: it does not drain back to nothing')
    await page.keyboard.press('Escape')
    ok(await closed(), 'it can be closed again now, with Escape')
    await sleep(300)
    ok((await page.locator('[data-update-notice]').count()) === 0, 'and having been read there, the line is not repeated under the chip')
    ok((await chip.getAttribute('data-phase')) === 'idle' && (await shownLabel()) === `Update ${next}`, 'the chip offers the same update')

    // CANCEL, mid-download. It is not a failure and is not reported as one.
    await chip.click()
    await opened()
    await startSampling()
    await dialog.locator('[data-update-install]').click()
    await pctAtLeast(20)
    await dialog.locator('[data-update-cancel]').click()
    ok(await closed(), 'Cancel during the download stops it and the window goes')
    await sleep(1200)
    const cancelled = await stopSampling()
    ok(!cancelled.some((x) => x.phase === 'installing') && Math.max(...cancelled.map((x) => x.pct)) < 100, `it never reached the installer (stopped at ${Math.max(...cancelled.map((x) => x.pct))}%)`)
    ok((await page.locator('[data-update-notice]').count()) === 0 && (await dialog.count()) === 0, 'nothing is said about it: the user knows what they pressed')
    ok((await chip.getAttribute('data-phase')) === 'idle', 'and the chip offers the update again')

    // What a preview must not have done.
    const calls = await page.evaluate(() => window.prism.e2eUpdateCalls())
    ok(calls.checks === 0, `GitHub was never asked (${calls.checks} release checks)`)
    ok(calls.installs === 0, `no download was started (${calls.installs} installs)`)
    ok(updateDirs() === dirsBefore, 'no installer was downloaded: no update folder appeared in temp')
    ok(installers() === installersBefore, `no installer process was spawned (${installersBefore} before, ${installers()} after)`)
    // A real install quits the app 400ms after the download, so an app that is
    // still answering now is an app the preview did not quit.
    ok((await app.windows()).length === 1 && (await page.evaluate(() => 1 + 1)) === 2, 'and the app never quit')
    ok((await tabLabels(page)).length === 1 && /PS [^>]*>/.test(await termText(page)), 'with its shell still running')

    // The same, on a light theme.
    await page.keyboard.press('Control+,')
    await page.locator('[data-settings-tab="appearance"]').click()
    await page.locator('[data-term-card="github"]').first().click()
    ok(await until(() => page.evaluate(() => document.documentElement.dataset.mode === 'light')), 'on a light theme')
    const widthLight = await chip.evaluate((el) => el.getBoundingClientRect().width)
    ok(Math.abs(widthLight - width0) < 0.01, `the chip is the same width (${widthLight.toFixed(3)}px)`)
    await shot('update-chip-light')
    await chip.click()
    ok(await opened(), 'the window opens over Settings too')
    const lightLook = await dialog.evaluate((el) => {
      const lum = (c) => {
        const [r, g, b] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
        const lin = (v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4)
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
      }
      const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      // The notes have no ground of their own: they are on the dialog's.
      const ground = lum(getComputedStyle(el).backgroundColor)
      const entry = lum(getComputedStyle(el.querySelector('[data-update-entry]')).color)
      return { box: lum(getComputedStyle(el).backgroundColor), contrast: ratio(ground, entry) }
    })
    ok(lightLook.box > 0.4, `its surface is light (luminance ${lightLook.box.toFixed(2)})`)
    ok(lightLook.contrast >= 4.5, `and the notes read on it (${lightLook.contrast.toFixed(1)}:1)`)
    await shot('update-dialog-light')
    const inkLight = await chipInk()
    ok(inkLight.bg === inkLight.selBg && inkLight.contrast >= 4.5, `the chip's label reads on a light theme's accent too (${inkLight.contrast.toFixed(1)}:1 on ${inkLight.bg})`)
    await dialog.locator('[data-update-install]').click()
    await pctAtLeast(35)
    await shot('update-progress-light')
    const bar = await dialog.evaluate((el) => {
      const lum = (c) => {
        const [r, g, b] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
        const lin = (v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4)
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
      }
      const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      const track = el.querySelector('[data-update-track]').getBoundingClientRect()
      const fill = el.querySelector('[data-update-fill]').getBoundingClientRect()
      return {
        share: fill.width / track.width,
        status: ratio(lum(getComputedStyle(el.querySelector('[data-update-status]')).color), lum(getComputedStyle(el).backgroundColor))
      }
    })
    ok(bar.share > 0.2 && bar.share <= 1, `on the light theme the bar is drawn, and filled to the percentage (${Math.round(bar.share * 100)}%)`)
    ok(bar.status >= 4.5, `and the status line reads (${bar.status.toFixed(1)}:1)`)
    ok(
      await until(async () => (await dialog.getAttribute('data-phase')) === 'idle' && /Preview only/.test((await status.textContent()) ?? ''), 10000, 50),
      'a second preview install runs to its end as well'
    )
    await dialog.locator('[data-update-cancel]').click()
    ok(await closed(), 'and Close closes it')
    await app.close().catch(() => {})
  },

  /**
   * INSTALL ENDS IN A QUIT, SO A WORKING AGENT IS ASKED ABOUT FIRST (#28). Main
   * pre-answers the close question for an install, and until this change
   * nothing in this app asked it: Install would have killed an agent mid-answer
   * without a word. A preview asks nothing (it quits nothing), so this scenario
   * is handed a real-shaped offer whose url the installer refuses before it
   * sends a byte: the question, Cancel, the go-ahead and the line a FAILED
   * install leaves are all driven with no network and no download. It also
   * shows what the window says for a release with no notes at all.
   */
  async updateGuard(ok) {
    const w = world()
    const { app, page } = await launch(w, {
      args: [w.alpha],
      env: { PT_E2E_UPDATE_OFFER: 'https://example.invalid/PrismTerminal-Setup-x64-99.0.0.exe' }
    })
    await until(async () => (await tabLabels(page)).length === 1)
    const chip = page.locator('[data-update-chip]')
    const updateDialog = page.locator('[data-update-dialog]')
    const question = page.locator('[role="dialog"]:not([data-update-dialog])')
    const installs = async () => (await page.evaluate(() => window.prism.e2eUpdateCalls())).installs
    ok(await until(async () => (await chip.count()) === 1, 8000), 'a real-shaped offer shows the chip')
    // As closeAsk does: let the process poll say "no agent" once, then have a
    // shell stand in for Claude through the title, idle first and then working.
    await typeLine(page, 'echo ready')
    await sleep(6000)
    await typeLine(page, "$Host.UI.RawUI.WindowTitle = [char]0x2733 + ' Claude Code'")
    await until(() => page.evaluate(() => !!document.querySelector('[data-agent-present]')), 8000, 50)

    await chip.click()
    ok(await until(async () => (await updateDialog.count()) === 1, 4000, 50), 'the chip opens the window')
    ok((await updateDialog.locator('[data-update-entry]').count()) === 0, 'a release with no notes lists nothing')
    ok(/No notes were published/.test((await updateDialog.locator('[data-update-notes]').textContent()) ?? ''), 'and says so in one line')
    ok((await updateDialog.locator('[data-update-preview]').count()) === 0, 'a real offer is not called a preview')
    await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/update-dialog-empty.png') }).catch(() => {})
    // ONE QUESTION AT A TIME. The app's chords still work over the update
    // window, and this tab hosts an agent, so Ctrl+W asks. The question used to
    // mount UNDER the update window with the focus on "Close tab": Enter, aimed
    // at Install, ended the agent. The window must give way to the question.
    await page.keyboard.press('Control+w')
    ok(await until(async () => (await question.count()) === 1, 4000, 50), 'Ctrl+W over the update window still asks about the agent')
    ok(await until(async () => (await updateDialog.count()) === 0, 4000, 50), 'and the update window gives way, so the question is not hidden under it')
    ok(await until(() => page.evaluate(() => (document.activeElement?.textContent ?? '').trim() === 'Close tab' && !!document.activeElement.closest('[role="dialog"]')), 4000, 50), 'the focus is on the question that can be seen')
    await page.keyboard.press('Escape')
    ok(await until(async () => (await question.count()) === 0, 4000, 50), 'Escape backs out of it')
    ok((await tabLabels(page)).length === 1 && (await installs()) === 0, 'with the tab still open and nothing installed')

    await page.locator('.xterm').first().click({ force: true })
    await typeLine(page, "$Host.UI.RawUI.WindowTitle = [char]0x25D0 + ' Claude Code'")
    ok(await until(() => page.evaluate(() => !!document.querySelector('[data-agent-state="working"]')), 8000, 50), 'an agent is mid-answer')
    await chip.click()
    await until(async () => (await updateDialog.count()) === 1, 4000, 50)
    await updateDialog.locator('[data-update-install]').click()
    ok(await until(async () => (await question.count()) === 1, 4000, 50), 'Install asks before it does anything')
    ok((await updateDialog.count()) === 0, 'from in front of the update window, not from behind it')
    const asked = (await question.textContent()) ?? ''
    ok(asked.includes('Stop the agent and install the update?'), `in its own words ("${asked.slice(0, 40)}")`)
    ok(/Claude/.test(asked) && /working for/.test(asked) && /Install and restart/.test(asked), 'naming the agent, how long it has worked, and what yes means')
    await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/update-agent-question.png') }).catch(() => {})
    await page.keyboard.press('Escape')
    ok(await until(async () => (await question.count()) === 0, 4000, 50), 'Cancel backs out')
    ok((await installs()) === 0 && (await chip.getAttribute('data-phase')) === 'idle', 'and nothing was started')

    await chip.click()
    await until(async () => (await updateDialog.count()) === 1, 4000, 50)
    await updateDialog.locator('[data-update-install]').click()
    await until(async () => (await question.count()) === 1, 4000, 50)
    await question.locator('[data-primary="true"]').click()
    ok(await until(async () => (await installs()) === 1, 6000, 50), 'the go-ahead starts the install')
    // The window had stepped aside for the question; after a yes it is back, as
    // the progress window, and that is where a failure is said (#32).
    const failed = updateDialog.locator('[data-update-status]')
    ok(await until(async () => (await updateDialog.count()) === 1 && /could not be downloaded/.test((await failed.textContent()) ?? ''), 8000, 50), 'an install that fails says so IN the update window, which came back after the question')
    ok((await page.locator('[data-update-notice]').count()) === 0, 'and not a second time under the chip')
    ok(await until(async () => (await chip.getAttribute('data-phase')) === 'idle', 4000, 50), 'the chip offers the update again')
    await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/update-failed.png') }).catch(() => {})
    ok(((await updateDialog.locator('[data-update-cancel]').textContent()) ?? '').trim() === 'Close', 'the way out is called Close')
    await updateDialog.locator('[data-update-cancel]').click()
    ok(await until(async () => (await updateDialog.count()) === 0, 4000, 50), 'and closes it')
    // A failed install must not leave the close question pre-answered: the
    // agent is still working, so closing the window still asks.
    await page.locator('[data-window-close]').click()
    ok(await until(async () => (await question.count()) === 1, 4000, 50), 'closing the window still asks about the agent afterwards')
    ok(/close the window/.test((await question.textContent()) ?? ''), 'with the window question, not the install one')
    await page.keyboard.press('Escape')
    // End idle, or the close below is held on the question.
    await page.locator('.xterm').first().click({ force: true })
    await typeLine(page, "$Host.UI.RawUI.WindowTitle = [char]0x2733 + ' Claude Code'")
    await until(() => page.evaluate(() => !document.querySelector('[data-agent-state="working"]')), 8000, 50)
    await app.close().catch(() => {})
  },

  /**
   * THE NOTES ARE TEXT OFF THE NETWORK (#28), so the rule is proved in the real
   * page and not only in the parser's unit tests: a hostile, over-long body is
   * handed to the window, and what is asserted is the DOM it produced. No
   * element the body asked for exists (no anchor, no image, no script), its
   * handler never ran, the list is capped with a count of the rest, it scrolls
   * inside the window, and Cancel and Install are still on screen under it.
   */
  async updateNotes(ok) {
    const w = world()
    const hostile = [
      "## What's Changed",
      '* <img src=x onerror="window.__pwned = 1"> an image tag by @a in https://github.com/o/r/pull/1',
      '* [a link](https://evil.example/login) and <a href="https://evil.example">an anchor</a> by @a in https://github.com/o/r/pull/2',
      '* <script>window.__pwned = 2</script> a script by @a in https://github.com/o/r/pull/3',
      '* <iframe src="https://evil.example"></iframe> a frame by @a in https://github.com/o/r/pull/4',
      ...Array.from({ length: 26 }, (_, i) => `* Change number ${i + 5} with a title long enough to wrap onto a second line in the window by @a in https://github.com/o/r/pull/${i + 5}`),
      '',
      '**Full Changelog**: https://github.com/o/r/compare/v1...v2'
    ].join('\n')
    const { app, page } = await launch(w, {
      args: [w.alpha],
      env: { PT_E2E_UPDATE_OFFER: 'https://example.invalid/x.exe', PT_E2E_UPDATE_NOTES: hostile }
    })
    await until(async () => (await tabLabels(page)).length === 1)
    const chip = page.locator('[data-update-chip]')
    const dialog = page.locator('[data-update-dialog]')
    await until(async () => (await chip.count()) === 1, 8000)
    await chip.click()
    ok(await until(async () => (await dialog.count()) === 1, 4000, 50), 'the window opens on a hostile body')
    const dom = await dialog.evaluate((el) => {
      const notes = el.querySelector('[data-update-notes]')
      const install = el.querySelector('[data-update-install]').getBoundingClientRect()
      return {
        forbidden: [...el.querySelectorAll('a, img, script, iframe, [onerror], [href], [src]')].length,
        entries: el.querySelectorAll('[data-update-entry]').length,
        more: el.querySelector('[data-update-more]')?.textContent ?? '',
        text: el.textContent ?? '',
        scrolls: notes.scrollHeight > notes.clientHeight + 1,
        installOnScreen: install.bottom <= innerHeight && install.top >= 0,
        boxBottom: el.getBoundingClientRect().bottom,
        pwned: window.__pwned ?? null
      }
    })
    ok(dom.forbidden === 0, `nothing the body asked for is an element (${dom.forbidden} anchors, images, scripts or frames)`)
    ok(dom.pwned === null, 'and its handler never ran')
    ok(!/evil\.example|https?:|by @/.test(dom.text), 'no url or author is printed either')
    ok(/An image tag/.test(dom.text) && /A link and an anchor/.test(dom.text), 'what is left of each line is its words')
    ok(dom.entries === 20 && dom.more === '+ 10 more', `the list is capped and counts the rest (${dom.entries} shown, "${dom.more}")`)
    ok(dom.scrolls, 'the list scrolls inside the window')
    ok(dom.installOnScreen, 'and Cancel and Install stay on screen under it')
    await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/update-dialog-long.png') }).catch(() => {})
    // A small window: the list gives way, the buttons do not.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(560, 400))
    ok(
      await until(
        () =>
          page.evaluate(() => {
            const el = document.querySelector('[data-update-dialog]')
            const b = el.querySelector('[data-update-install]').getBoundingClientRect()
            const box = el.getBoundingClientRect()
            return innerHeight <= 420 && box.top >= 0 && box.bottom <= innerHeight && b.bottom <= box.bottom
          }),
        6000,
        100
      ),
      'at the smallest window the whole dialog still fits, buttons included'
    )
    await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/update-dialog-small.png') }).catch(() => {})
    await page.keyboard.press('Escape')
    await app.close().catch(() => {})
  },

  /** Without the flag there is NO chip under --e2e, and nothing asks GitHub:
   *  the suite measures a title bar with no chip in it. */
  async updateQuiet(ok) {
    const w = world()
    const { app, page } = await launch(w, { args: [w.alpha] })
    await until(async () => (await tabLabels(page)).length === 1)
    await typeLine(page, 'echo settled')
    await until(async () => (await termText(page)).includes('settled'))
    ok((await page.locator('[data-update-chip]').count()) === 0, 'no flag, no chip')
    const calls = await page.evaluate(() => window.prism.e2eUpdateCalls())
    ok(calls.checks === 0 && calls.installs === 0, `and the real watcher stayed off (${JSON.stringify(calls)})`)
    // THE APP IS USUALLY ALREADY RUNNING when somebody tries the flag, and it is
    // single-instance: that launch hands its command line over and ends. The
    // running app has to honour the flag, or `--preview-update` on the installed
    // app would do nothing anyone could see. (Not under PT_E2E_PACKAGED: the
    // second launch here is the unpackaged entry script.)
    if (!PACKAGED) {
      const child = spawn(electronPath, [MAIN, `--user-data-dir=${w.profile}`, '--e2e', '--preview-update'], { stdio: 'ignore' })
      const code = await new Promise((r) => child.on('exit', r))
      ok(code === 0, 'a second launch with --preview-update exits, as every second launch does')
      ok(await until(async () => (await page.locator('[data-update-chip]').count()) === 1, 8000), 'and the RUNNING app shows the preview chip')
      ok((await tabLabels(page)).length === 1, 'without opening a tab for it')
      const after = await page.evaluate(() => window.prism.e2eUpdateCalls())
      ok(after.checks === 0, 'still without asking GitHub')
    }
    await app.close().catch(() => {})
  },

  /**
   * DICTATION, REALLY (#13): a fake microphone plays a known sentence, the real
   * bundled engine hears it with the Tiny model, and the words must arrive on
   * the prompt line with no Enter. Nothing here is stubbed except the person.
   */
  async dictation(ok) {
    const w = world()
    const tiny = tinyModel()
    const model = await cached('ggml-tiny.bin', tiny.url, tiny.sha256)
    const clip = await cached('jfk.wav', JFK.url, JFK.sha256)
    const root = join(w.profile, 'dictation')
    mkdirSync(join(root, 'models'), { recursive: true })
    copyFileSync(model, join(root, 'models', 'tiny.bin'))
    // Unpackaged, the engine is the fetched folder. PACKAGED, the app is told
    // nothing: it has to find the engine where the installer put it.
    const engine = PACKAGED ? resolve(process.cwd(), 'dist/win-unpacked/resources/bin/whisper') : resolve(process.cwd(), 'vendor/whisper')
    ok(existsSync(join(engine, 'whisper-server.exe')), `the speech engine is in ${PACKAGED ? 'the packaged app' : 'vendor/whisper'}`)
    ok(existsSync(join(engine, 'vcomp140.dll')) && existsSync(join(engine, 'LICENSE-whisper.cpp.txt')), 'with the C++ runtime and the MIT notice beside it')
    const { app, page } = await launch(w, {
      args: [w.alpha],
      env: { PT_E2E_MIC: clip, PT_DICTATION_ROOT: root, PT_E2E_NVIDIA: '0', ...(PACKAGED ? {} : { PT_WHISPER_DIR: engine }) }
    })
    await until(async () => (await tabLabels(page)).length === 1)
    await page.waitForFunction(
      () => /PS [^>]*>\s*$/.test((document.querySelector('.xterm .xterm-rows')?.textContent ?? '').trimEnd()),
      null,
      { timeout: 45000 }
    )
    const pill = () => page.locator('[data-dictation-pill]')
    const hold = async (ms) => {
      await page.keyboard.down('AltRight')
      await sleep(ms)
    }

    // OFF MEANS OFF: the key does nothing, and nothing is running.
    await page.locator('.xterm').first().click({ force: true })
    await hold(700)
    ok((await pill().count()) === 0, 'with dictation off, the key does nothing')
    await page.keyboard.up('AltRight')
    ok(ourSpeechServers() === 0, 'and no speech server exists')

    // On, from the Settings page, with the e2e's model as the active one.
    await page.evaluate(() => {
      localStorage.setItem('prism.dictation.model', 'tiny')
      localStorage.setItem('prism.dictation.sounds', '0')
    })
    await page.locator('[data-title-settings]').click()
    await page.locator('[data-settings-tab="dictation"]').click()
    await page.locator('[data-pref="dictation-enabled"] [role="switch"]').click()
    ok(
      (await page.locator('[data-pref="dictation-enabled"] [role="switch"]').getAttribute('aria-checked')) === 'true',
      'the Dictation page switches it on'
    )
    await page.locator('[data-tab]').first().click()
    await page.locator('.xterm').first().click({ force: true })
    const rowsTop = () => page.evaluate(() => Math.round(document.querySelector('.xterm .xterm-rows')?.getBoundingClientRect().top ?? -1))
    const topBefore = await rowsTop()

    // AltGr TYPING IS NOT DICTATION: Ctrl+RightAlt with a key, as a Norwegian
    // keyboard sends for "@", must never open the microphone.
    await page.keyboard.down('ControlLeft')
    await page.keyboard.down('AltRight')
    await sleep(60)
    await page.keyboard.down('Digit2')
    await page.keyboard.up('Digit2')
    await sleep(400)
    ok((await pill().count()) === 0, 'AltGr typing does not start a dictation')
    await page.keyboard.up('AltRight')
    await page.keyboard.up('ControlLeft')
    await page.keyboard.press('Escape') // drop whatever the chord left on the prompt line

    // Hold, speak (the fake microphone does), release.
    await hold(300)
    ok(await until(async () => (await pill().getAttribute('data-dictation-pill').catch(() => null)) === 'listening', 8000), 'holding Right Alt opens the pill: Listening')
    ok((await page.locator('[data-tab] [data-dictation-mark]').count()) === 1, 'and the tab wears the mic mark')
    ok((await rowsTop()) === topBefore, 'the pill does not move the terminal')
    const moved = await until(
      async () =>
        page.evaluate(() =>
          [...document.querySelectorAll('[data-dictation-bar]')].some((b) => parseFloat(b.style.transform.replace(/[^0-9.]/g, '')) > 0.2)
        ),
      8000
    )
    ok(moved, 'the level meter moves while the clip plays: a live mic is visible at once')
    const live = await until(async () => ((await page.locator('[data-dictation-live]').textContent().catch(() => '')) ?? '').trim(), 15000)
    ok(!!live, `live text appears while still listening ("${live}")`)
    await sleep(4000)
    await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/dictation-listening.png') }).catch(() => {})
    await sleep(5000) // let the whole sentence play
    const before = await termText(page)
    await page.keyboard.up('AltRight')
    ok(await until(async () => (await pill().getAttribute('data-dictation-pill').catch(() => null)) === 'transcribing', 4000), 'releasing says Transcribing')
    const heard = await until(async () => /ask not what your country/i.test((await termText(page)).replace(/\s+/g, ' ')), 30000)
    ok(heard, 'the spoken sentence arrives on the prompt line')
    ok(await until(async () => (await pill().count()) === 0, 5000), 'and the pill goes away')
    const after = await termText(page)
    ok(
      (after.match(/PS [^>]*>/g) ?? []).length === (before.match(/PS [^>]*>/g) ?? []).length,
      'NO ENTER was sent: there is no new prompt, the text is still being edited'
    )
    ok(ourSpeechServers() === 1, 'one speech server is resident while dictation is on')

    // Escape cancels and pastes nothing.
    await page.keyboard.press('Escape')
    await sleep(300)
    const clean = await termText(page)
    await hold(300)
    await until(async () => (await pill().count()) === 1, 8000)
    await sleep(2500)
    await page.keyboard.press('Escape')
    await page.keyboard.up('AltRight')
    ok(await until(async () => (await pill().count()) === 0, 4000), 'Escape cancels a dictation')
    await sleep(1500)
    ok((await termText(page)) === clean, 'and nothing is pasted')

    // Off again: the server goes with the switch.
    await page.locator('[data-title-settings]').click()
    await page.locator('[data-settings-tab="dictation"]').click()
    await page.locator('[data-pref="dictation-enabled"] [role="switch"]').click()
    ok(await until(() => ourSpeechServers() === 0, 8000), 'switching dictation off kills the speech server')
    await app.close().catch(() => {})
    ok(await until(() => ourSpeechServers() === 0, 8000), 'and none outlives the app')
  },

  /**
   * THE MODEL MANAGER, WITH THINGS IN IT (#13, owner's notes of 2026-09-19): a
   * model and the GPU engine are STAGED as installed (a sparse file of the
   * catalogued size, a pack folder with its marker), so the rows can be read
   * in the states a user actually lives in, without a gigabyte of downloads.
   */
  async dictationPage(ok) {
    const w = world()
    const src = readFileSync(resolve(process.cwd(), 'core/shared/dictationCatalog.ts'), 'utf8')
    const entry = (id) => {
      const block = src.slice(src.indexOf(`id: '${id}'`))
      return { bytes: Number(block.match(/bytes:\s*(\d+)/)[1]), sha256: block.match(/sha256:\s*\n?\s*'([0-9a-f]{64})'/)[1] }
    }
    const root = join(w.profile, 'dictation')
    mkdirSync(join(root, 'models'), { recursive: true })
    const base = join(root, 'models', 'base.bin')
    writeFileSync(base, '')
    truncateSync(base, entry('base').bytes)
    const gpu = entry('gpu-pack')
    const pack = join(root, 'engines', `gpu-pack-${gpu.sha256.slice(0, 12)}`)
    mkdirSync(join(pack, 'Release'), { recursive: true })
    writeFileSync(join(pack, 'Release', 'whisper-server.exe'), '')
    writeFileSync(join(pack, 'prism-installed.json'), JSON.stringify({ id: 'gpu-pack', bytes: gpu.bytes, sha256: gpu.sha256 }))

    const { app, page } = await launch(w, { args: [w.alpha], env: { PT_E2E_NVIDIA: '1', PT_DICTATION_ROOT: root } })
    await until(async () => (await tabLabels(page)).length === 1)
    await page.evaluate(() => {
      localStorage.setItem('prism.dictation.enabled', '1')
      localStorage.setItem('prism.dictation.model', 'base')
    })
    await page.locator('[data-title-settings]').click()
    await page.locator('[data-settings-tab="dictation"]').click()
    await page.waitForSelector('[data-dictation-item="gpu-pack"][data-state="installed"]', { timeout: 8000 })
    ok((await page.locator('[data-settings-tab="dictation"]').getAttribute('aria-current')) === 'page' && (await page.locator('[data-settings-tab="general"]').getAttribute('aria-current')) === null, 'the rail marks Dictation as the page in front')
    await page.mouse.move(900, 300)
    await sleep(400)

    const names = await page.evaluate(() => [...document.querySelectorAll('[data-dictation-item] [data-item-name]')].map((e) => e.textContent.trim()))
    ok(names.length === 5 && names.slice(0, 4).every((n) => n.startsWith('Whisper ')), `models carry their full names (${JSON.stringify(names)})`)
    const marks = await page.evaluate(() => [...document.querySelectorAll('[data-dictation-item] [data-vendor]')].map((e) => e.getAttribute('data-vendor')))
    ok(marks.filter((m) => m === 'openai').length === 4 && marks.filter((m) => m === 'nvidia').length === 1, `every row leads with its vendor's mark (${marks.join(',')})`)
    const mark = await page.evaluate(() => {
      const row = document.querySelector('[data-dictation-item="base"]').getBoundingClientRect()
      const m = document.querySelector('[data-dictation-item="base"] [data-vendor]').getBoundingClientRect()
      const name = document.querySelector('[data-dictation-item="base"] [data-item-name]').getBoundingClientRect()
      return { left: m.left < name.left, centred: Math.abs(m.top + m.height / 2 - (row.top + row.height / 2)) < 2, size: Math.round(m.width) }
    })
    ok(mark.left && mark.centred && mark.size >= 28, `the mark sits left of the name, centred on the row (${JSON.stringify(mark)})`)

    const row = (id) => page.locator(`[data-dictation-item="${id}"]`)
    ok(((await row('base').locator('[data-item-badge]').textContent()) ?? '').trim() === 'Active', 'the model in use says Active')
    ok((await row('base').locator('[data-uninstall]').count()) === 1, 'an installed model offers Uninstall')
    const same = await page.evaluate(() => {
      const cs = (el) => { const s = getComputedStyle(el); return [s.backgroundColor, s.borderTopWidth, s.borderTopColor, s.borderRadius, s.color].join('|') }
      return cs(document.querySelector('[data-dictation-item="base"] [data-uninstall]')) === cs(document.querySelector('[data-dictation-item="small"] button'))
    })
    ok(same, 'and it is a button like Download: same fill, border, radius and ink')
    const words = ((await page.locator('[data-dictation-settings]').textContent()) ?? '')
    ok(!/\bDelete\b|\bRemove\b/.test(words), 'and nothing on the page says Delete or Remove')

    ok(((await row('gpu-pack').locator('[data-item-badge]').textContent()) ?? '').trim() === 'Enabled', 'the GPU engine says Enabled')
    ok(((await row('gpu-pack').locator('[data-gpu-toggle]').textContent()) ?? '').trim() === 'Disable', 'and offers Disable')
    ok((await row('large-v3-turbo').locator('text=Recommended').count()) === 1, 'with the GPU on, Turbo is the recommended model')
    const fills = await page.evaluate(() => ['small', 'large-v3-turbo', 'large-v3'].map((id) => getComputedStyle(document.querySelector(`[data-dictation-item="${id}"] button`)).backgroundColor))
    ok(new Set(fills).size === 1, `and its Download button is the same as every other (${fills.join(' | ')})`)
    await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/dictation-models.png') }).catch(() => {})

    // DISABLE UNINSTALLS IT, ENABLE DOWNLOADS IT (owner, 2026-09-19): one control.
    ok((await row('gpu-pack').locator('[data-uninstall]').count()) === 0, 'the GPU row has no second control beside Disable')
    await row('gpu-pack').locator('[data-gpu-toggle]').click()
    ok(await until(async () => (await row('gpu-pack').getAttribute('data-state')) === 'absent', 8000), 'Disable takes the engine off the disk')
    ok(!existsSync(pack), 'for real')
    ok((await row('gpu-pack').locator('[data-item-badge]').count()) === 0, 'the Enabled badge goes')
    ok(((await row('gpu-pack').locator('button').textContent()) ?? '').trim() === 'Enable', 'and the button offers Enable again')
    ok((await row('base').locator('text=Recommended').count()) === 1, 'with the GPU off, Base is the recommended model again')
    await app.close().catch(() => {})
  },

  /** `exit` closes the tab it was typed in. */
  async exitClosesTab(ok) {
    const w = world()
    const { app, page } = await launch(w, { args: [w.alpha, w.beta] })
    await until(async () => (await tabLabels(page)).length === 2)
    // Ctrl+W closes a tab from INSIDE a focused shell (owner, 2026-09-19): xterm
    // has to yield the chord, or it is delete-word to the pty and nothing closes.
    await page.locator('[aria-label="New tab"]').click()
    await until(async () => (await tabLabels(page)).length === 3)
    await typeLine(page, 'echo third')
    await page.locator('.xterm').first().click({ force: true })
    await page.keyboard.press('Control+w')
    ok(await until(async () => (await tabLabels(page)).length === 2, 6000), 'Ctrl+W closes the tab over a focused shell')
    await page.locator('[data-tab]').nth(1).click()
    await typeLine(page, 'exit')
    ok(await until(async () => (await tabLabels(page)).length === 1), 'the shell ending takes its tab')
    ok((await tabTitles(page))[0].endsWith('alpha'), 'and the other tab comes to the front')
    await app.close().catch(() => {})
  },

  /** A prompt survives the window getting narrower and wider again
   *  (ConPTY sends nothing on a resize; see fitKeepingCursorLine). */
  async promptLayout(ok) {
    const w = world()
    const { app, page } = await launch(w, { args: [w.alpha] })
    await until(async () => (await tabLabels(page)).length === 1)
    await typeLine(page, 'echo ready')
    await until(async () => (await termText(page)).includes('ready'))
    const size = (width) =>
      app.evaluate(({ BrowserWindow }, wd) => BrowserWindow.getAllWindows()[0].setSize(wd, 600), width)
    await size(620)
    await sleep(600)
    await size(1200)
    await sleep(600)
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('.xterm .xterm-rows > div')].map((r) => r.textContent ?? '').filter((t) => t.trim())
    )
    const last = rows.at(-1) ?? ''
    ok(/^PS .*alpha>\s*$/.test(last.trimEnd()), `the prompt is whole after a narrow-then-wide resize ("${last.trim()}")`)
    await typeLine(page, 'echo after-$(1+1)')
    ok(await until(async () => (await termText(page)).includes('after-2')), 'and typing lands where the prompt is')
    await app.close().catch(() => {})
  }
}

const table = []
reapStrays()
for (const [name, run] of Object.entries(scenarios)) {
  if (only.length && !only.some((o) => name.toLowerCase().includes(o.toLowerCase()))) continue
  const t0 = Date.now()
  let fails = 0
  let checks = 0
  const ok = (cond, msg) => {
    checks += 1
    if (!cond) fails += 1
    console.log(`  ${cond ? 'pass' : 'FAIL'}  ${msg}`)
  }
  console.log(`\n${name}`)
  try {
    await run(ok)
  } catch (e) {
    fails += 1
    console.log(`  FAIL  threw: ${e?.stack ?? e}`)
  }
  const strays = reapStrays()
  table.push({ name, checks, fails, secs: ((Date.now() - t0) / 1000).toFixed(1), strays })
}

console.log('\nscenario          checks  fails  secs')
for (const r of table) {
  console.log(`${r.name.padEnd(18)}${String(r.checks).padStart(6)}${String(r.fails).padStart(7)}${r.secs.padStart(6)}`)
}
const failed = table.filter((r) => r.fails > 0)
console.log(failed.length ? `\n${failed.length} scenario(s) FAILED` : '\nall scenarios passed')
process.exit(failed.length ? 1 : 0)
