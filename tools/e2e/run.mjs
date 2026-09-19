// The end-to-end suite: drives the BUILT app through Playwright over CDP.
//
//   npm run e2e            every scenario
//   npm run e2e -- theme   only the scenarios whose name contains "theme"
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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const MAIN = resolve(process.cwd(), 'out/main/index.js')
const PROFILE_NAME = 'pt-e2e-profile'
const only = process.argv.slice(2).filter((a) => !a.startsWith('-'))

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
        `Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | ` +
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

async function launch(w, { args = [], pick } = {}) {
  const app = await electron.launch({
    args: [MAIN, `--user-data-dir=${w.profile}`, '--e2e', ...args],
    env: { ...process.env, ...(pick ? { PT_E2E_PICK: pick } : {}) }
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
          return ink.join(',') === '78,161,255' || ratio < 4.5
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
    const { app, page } = await launch(w, { args: [w.alpha] })
    await until(async () => (await tabLabels(page)).length === 1)
    const src = readFileSync(resolve(process.cwd(), 'core/renderer/settings/options.ts'), 'utf8')
    const wanted = [...src.matchAll(/\{\s*id: '([a-z-]+)'/g)].map((m) => m[1]).sort()
    ok(wanted.length >= 9, `the core lists the terminal options (${wanted.length})`)
    await page.locator('[data-title-settings]').click()
    const shown = new Set()
    for (const tab of ['general', 'appearance']) {
      await page.locator(`[data-settings-tab="${tab}"]`).click()
      await sleep(400)
      for (const id of await page.evaluate(() => [...document.querySelectorAll('[data-pref]')].map((e) => e.getAttribute('data-pref')))) shown.add(id)
    }
    const missing = wanted.filter((id) => !shown.has(id))
    ok(missing.length === 0, `every terminal option is on the page (missing: ${JSON.stringify(missing)})`)
    // What is left must be THIS APP's rows, a closed list: a terminal-looking
    // row outside the core's list is a fork.
    const own = ['newtab-mode', 'explorer-verb', 'app-version']
    const extra = [...shown].filter((id) => !wanted.includes(id) && !own.includes(id))
    ok(extra.length === 0, `and nothing else claims to be a setting (extra: ${JSON.stringify(extra)})`)
    ok((await page.locator('[data-pref="confirm-close"]').count()) === 0, 'the close question is not a setting any more')
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
