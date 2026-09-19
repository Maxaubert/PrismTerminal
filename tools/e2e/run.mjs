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
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, truncateSync, writeFileSync } from 'fs'
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
    // The right-click menu: Paste, Find, Close tab.
    await page.locator('[data-term-region]').click({ button: 'right', position: { x: 200, y: 120 } })
    const rows = await until(
      async () => {
        const t = await page.locator('[role="menu"] [role="menuitem"]').allTextContents()
        return t.length ? t : null
      },
      4000
    )
    ok(!!rows && ['Paste', 'Find in scrollback', 'Close tab'].every((l) => rows.some((r) => r.includes(l))), `the terminal answers a right-click (${JSON.stringify(rows)})`)
    await page.locator('[role="menu"] [role="menuitem"]', { hasText: 'Find in scrollback' }).click()
    ok(await until(async () => (await page.locator('[data-term-find], input[placeholder*="ind"]').count()) > 0, 4000), 'and its Find row opens the find bar')
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
      ...ids('core/renderer/settings/dictationOptions.ts', (row) => !row.includes('onlyWhere'))
    ].sort()
    ok(wanted.length >= 17, `the core lists the terminal and dictation options (${wanted.length})`)
    await page.locator('[data-title-settings]').click()
    const shown = new Set()
    for (const tab of ['general', 'appearance', 'dictation']) {
      await page.locator(`[data-settings-tab="${tab}"]`).click()
      await sleep(400)
      for (const id of await page.evaluate(() => [...document.querySelectorAll('[data-pref]')].map((e) => e.getAttribute('data-pref')))) shown.add(id)
    }
    const missing = wanted.filter((id) => !shown.has(id))
    ok(missing.length === 0, `every terminal option is on the page (missing: ${JSON.stringify(missing)})`)
    // What is left must be THIS APP's rows, a closed list: a terminal-looking
    // row outside the core's list is a fork.
    // 'window-edges' (#27) is the window's chrome, which in Prism belongs to
    // the app style and has a row of its own there: this app's, not the core's.
    const own = ['newtab-mode', 'explorer-verb', 'app-version', 'window-edges']
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
    const settled = (pg, also = () => true) =>
      until(async () => {
        const p = await probe(pg)
        const chrome = [p.tab, p.title, ...(p.rail === null ? [] : [p.rail])]
        const arrived = chrome.every((a) => near(a, p.divider)) && (p.row === null || near(p.row, p.line))
        return arrived && also(p) ? p : null
      }, 15000)

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
    const gone = new Promise((r) => app.process().on('exit', r))
    await page.evaluate(() => window.prism.quitApp()).catch(() => {})
    await Promise.race([gone, sleep(10000)])
    ;({ app, page } = await launch(w))
    ok(await until(async () => (await tabLabels(page)).length === 2), 'a relaunch brings the tabs back')
    const back = await settled(page, (q) => q.stored === 'solid' && near(q.tab, 0.18))
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
