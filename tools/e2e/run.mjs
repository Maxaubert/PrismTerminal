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
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'fs'
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

  /** `exit` closes the tab it was typed in. */
  async exitClosesTab(ok) {
    const w = world()
    const { app, page } = await launch(w, { args: [w.alpha, w.beta] })
    await until(async () => (await tabLabels(page)).length === 2)
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
