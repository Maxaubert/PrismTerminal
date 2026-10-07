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
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join, resolve } from 'path'
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

/** Every world made during the scenario running now, removed after it (code
 *  review 2026-09-24, #36): each held a whole Chromium profile, and the
 *  dictation one a 75 MB model, left in %TEMP% on every run. */
const worlds = []
function removeWorlds() {
  for (const base of worlds.splice(0)) {
    try {
      rmSync(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    } catch {
      /* a file still held open; the next run's reap and removal try again */
    }
  }
}

/** A fresh world for one scenario: a profile and a few folders. */
function world() {
  const base = mkdtempSync(join(tmpdir(), `${PROFILE_NAME}-`))
  worlds.push(base)
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
  // Every verdict of the process poll, by session, for `polled` below.
  await page.evaluate(() => {
    window.__ptVerdicts = new Set()
    window.prism.onTermAgent((id) => window.__ptVerdicts.add(id))
  })
  return { app, page }
}

/**
 * The process poll has said its first word on every open shell (code review
 * 2026-09-24, #37). It is said ONCE ("no agent here" for a plain shell), and a
 * Claude title set before it lands is cleared by it, so a scenario that stands
 * a shell in for Claude waits for it. It used to sleep 6 s: wasted on a fast
 * machine, too short on a cold one.
 */
async function polled(page) {
  const want = (await tabLabels(page)).length
  return until(() => page.evaluate((n) => (window.__ptVerdicts?.size ?? 0) >= n, want), 30000, 100)
}

/**
 * Close the app, or kill it (#35): an app holding its window on a question
 * never answers app.close(), and the suite hung there with no FAIL line.
 */
async function closeApp(app) {
  const closed = await Promise.race([
    app.close().then(() => true, () => true),
    sleep(15000).then(() => false)
  ])
  if (!closed) {
    console.log('  note  app.close() did not return in 15 s; the app was killed')
    try {
      app.process().kill()
    } catch {
      /* already gone */
    }
  }
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

/**
 * WHERE EACH SETTINGS ROW LIVES (2026-10-05, the grouped cards redesign): the
 * page of the rail that holds it, as `components/settings/settingsIndex.ts`
 * places it. Scenarios reach a row through `gotoPref`, never a fixed tab id,
 * so a row moving between pages is one line here.
 */
const PREF_PAGE = {
  'tab-width': 'appearance', 'title-bar': 'appearance', 'window-edges': 'appearance', 'term-theme': 'appearance',
  'window-background': 'appearance', 'window-accent': 'appearance', 'term-acrylic': 'appearance',
  'term-shell': 'terminal', 'newtab-mode': 'terminal', 'explorer-verb': 'terminal', 'term-font-family': 'terminal',
  'term-font': 'terminal', 'help-enabled': 'terminal',
  'agent-indicator': 'agents', 'agent-done-on': 'agents', 'agent-question-on': 'agents', 'agent-failed-on': 'agents',
  'taskbar-badge': 'agents', 'agent-hooks': 'agents', 'agent-color': 'agents', 'agent-done-color': 'agents',
  'agent-question-color': 'agents',
  'dictation-enabled': 'dictation', 'dictation-mode': 'dictation', 'dictation-hotkey': 'dictation', 'dictation-mic': 'dictation',
  'dictation-language': 'dictation', 'dictation-pause-media': 'dictation', 'dictation-sounds': 'dictation',
  'dictation-model': 'dictation', 'dictation-gpu': 'dictation',
  'diag-verbose': 'diagnostics', 'diag-folder': 'diagnostics', 'diag-mark': 'diagnostics',
  'app-version': 'about'
}

/** Open Settings if it is not in front, go to the page that holds a row, and
 *  wait for the row. Returns its locator. */
async function gotoPref(page, id) {
  if (!PREF_PAGE[id]) throw new Error(`gotoPref: no page known for ${id}`)
  if ((await page.locator('[data-settings-page]').count()) === 0) await page.locator('[data-title-settings]').click()
  await page.locator(`[data-settings-tab="${PREF_PAGE[id]}"]`).click()
  const row = page.locator(`[data-pref="${id}"]`).first()
  await row.waitFor({ timeout: 10000 })
  return row
}

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
/** The e2e's Parakeet v3 file (#121): the smallest official one, read out of
 *  the catalog the way Tiny is, from the same pinned commit the app uses. */
function parakeetE2eModel() {
  const src = readFileSync(resolve(process.cwd(), 'core/shared/dictationCatalog.ts'), 'utf8')
  const commit = src.match(/const PARAKEET_COMMIT = '([0-9a-f]{40})'/)?.[1]
  const block = src.slice(src.indexOf("id: 'parakeet-v3-q4'"))
  const file = block.match(/url:\s*parakeet\('([^']+)'\)/)?.[1]
  const sha256 = block.match(/sha256:\s*'([0-9a-f]{64})'/)?.[1]
  if (!commit || !file || !sha256) throw new Error('the catalog no longer spells the e2e Parakeet model the way the e2e reads it')
  return { url: `https://huggingface.co/ggml-org/parakeet-GGUF/resolve/${commit}/${file}`, sha256 }
}
/** parakeet-cli passes running out of THIS checkout's engine folder. */
function ourParakeetPasses() {
  try {
    const out = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process -Filter "Name='parakeet-cli.exe'" | Where-Object { $_.ExecutablePath -like '*\\vendor\\whisper\\*' -or $_.ExecutablePath -like '*\\win-unpacked\\resources\\bin\\whisper\\*' } | Measure-Object).Count`],
      { encoding: 'utf8', windowsHide: true }
    )
    return Number(out.trim()) || 0
  } catch {
    return -1
  }
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
    await closeApp(app)
  },

  /** The label follows the shell's own folder report. */
  async cwdLabel(ok) {
    const w = world()
    const { app, page } = await launch(w, { args: [w.alpha] })
    ok(await until(async () => (await tabLabels(page))[0]?.includes('alpha')), 'a launch folder opens as a tab named for it')
    await typeLine(page, 'mkdir sub | Out-Null; cd sub')
    ok(await until(async () => (await tabLabels(page))[0]?.includes('sub')), 'cd renames the tab')
    ok((await tabTitles(page))[0].endsWith('\\sub'), 'and the tooltip follows')
    await closeApp(app)
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
    await polled(page)
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
    // On Agents, with the marks and their colours (2026-10-05).
    await gotoPref(page, 'agent-indicator')
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
    await closeApp(app)
  },

  /**
   * ATTENTION MARKS, ONE BAR FOR A RUN, THE TASKBAR BADGE, TAB LABELS
   * (2026-09-28, the owner's requests of the day). Shells stand in for Claude
   * through its titles, as in `indicator`; a question is Claude's footer on
   * the screen while the title is idle (MEASURED: that is all Claude gives).
   */
  async attention(ok) {
    const w = world()
    const gamma = join(dirname(w.alpha), 'gamma')
    const one = join(dirname(w.alpha), 'x')
    mkdirSync(gamma)
    mkdirSync(one)
    const { app, page } = await launch(w, { args: [w.alpha, w.beta, gamma, one] })
    try {
      await until(async () => (await tabLabels(page)).length === 4)
      const tab = (i) => page.locator('[data-tab]').nth(i)
      const at = (i, cmd) => tab(i).click().then(() => typeLine(page, cmd))
      const state = (i) => tab(i).getAttribute('data-agent-state')
      const badge = () => page.evaluate(() => window.prism.e2eTaskbarBadge())
      const IDLE = "$Host.UI.RawUI.WindowTitle = [char]0x2733 + ' Claude Code'"
      const WORK = "$Host.UI.RawUI.WindowTitle = [char]0x25D0 + ' Claude Code'"

      // TAB LABELS: centred, and a one-letter folder is not a sliver.
      const label = await page.evaluate(() => {
        const tabs = [...document.querySelectorAll('[data-tab]')]
        const x = tabs.find((t) => (t.textContent ?? '').trim().startsWith('x'))
        const btn = x?.querySelector('[role="tab"]')
        const probe = document.createElement('span')
        probe.textContent = '0000'
        probe.style.font = btn ? getComputedStyle(btn).font : ''
        probe.style.position = 'absolute'
        document.body.appendChild(probe)
        const four = probe.getBoundingClientRect().width
        probe.remove()
        return { align: btn ? getComputedStyle(btn).textAlign : '', width: btn?.getBoundingClientRect().width ?? 0, four }
      })
      ok(label.align === 'center', `tab names are centred (${label.align})`)
      ok(label.width >= label.four - 1, `a one-letter tab is at least four characters wide (${label.width.toFixed(1)} vs ${label.four.toFixed(1)})`)

      // Three Claudes side by side, all working.
      for (const i of [0, 1, 2]) {
        await tab(i).click()
        await polled(page)
        await typeLine(page, IDLE)
      }
      for (const i of [0, 1, 2]) await at(i, WORK)
      await until(async () => (await state(0)) === 'working' && (await state(1)) === 'working' && (await state(2)) === 'working', 8000, 50)
      // ONE BAR PER TAB (owner, 2026-10-03: "if multiple tabs in a row are
      // working they share one working indicator ... i want that to be one for
      // each tab, like it was before"): three working neighbours, three bars.
      const bars = await page.evaluate(() => [...document.querySelectorAll('[data-tab]')].slice(0, 3).map((t) => t.querySelectorAll('.p-agent-run').length))
      ok(bars.join(',') === '1,1,1', `three working neighbours each draw their own bar (${bars.join(',')})`)
      ok(await page.evaluate(() => document.querySelectorAll('[data-working-run]').length === 0), 'and no shared bar across them')
      await page.locator('[data-tab-strip]').screenshot({ path: resolve(process.cwd(), '.e2e-shots/attention-run.png') }).catch(() => {})
      await at(1, IDLE)
      ok(
        !!(await until(() => page.evaluate(() => document.querySelectorAll('[data-tab] .p-agent-run').length === 2), 5000, 50)),
        'with the middle one idle, the other two keep theirs'
      )

      // A QUESTION on a background tab: Claude's footer on screen, title idle.
      await at(0, "Start-Sleep -Milliseconds 1500; Write-Host 'Enter to select, Esc to cancel'; " + IDLE)
      await tab(1).click()
      ok(!!(await until(async () => (await state(0)) === 'question', 10000, 50)), 'a question asked on a background tab marks it')
      const q = await page.evaluate(() => {
        const line = document.querySelectorAll('[data-tab]')[0].querySelector('[data-attention]')
        return { kind: line?.getAttribute('data-attention'), height: line ? Math.round(line.getBoundingClientRect().height) : 0 }
      })
      ok(q.kind === 'question' && q.height === 3, `as a line along the bottom (${JSON.stringify(q)})`)
      await page.locator('[data-tab-strip]').screenshot({ path: resolve(process.cwd(), '.e2e-shots/attention-question.png') }).catch(() => {})
      ok(!!(await until(async () => (await badge()) === '1 tab needs a look', 4000, 50)), `and the taskbar badge counts it (${await badge()})`)
      // AS CRISP AS THE OTHER APPS' (#108; owner, 2026-10-01, beside
      // ChatGPT's): drawn at the display's physical size and handed over as
      // that scale's picture, so Windows never stretches it.
      const pic = await page.evaluate(async () => ({ img: await window.prism.e2eTaskbarBadgeImage(), dpr: window.devicePixelRatio }))
      const want = Math.round(16 * Math.min(Math.max(pic.dpr || 1, 1), 4))
      ok(
        !!pic.img && pic.img.width === want && Math.abs(pic.img.scale - (pic.dpr || 1)) < 0.01,
        `the badge is ${want}px at scale ${pic.dpr}, not a stretched small image (${pic.img ? `${pic.img.width}px at ${pic.img.scale}` : 'none'})`
      )
      if (pic.img) writeFileSync(resolve(process.cwd(), '.e2e-shots/taskbar-badge.png'), Buffer.from(pic.img.png.split(',')[1], 'base64'))
      await page.evaluate(() => window.dispatchEvent(new Event('focus')))
      await tab(0).click()
      ok(!!(await until(async () => (await state(0)) === null, 4000, 50)), 'opening the tab clears it')
      ok(!!(await until(async () => (await badge()) === '', 4000, 50)), 'and the badge with it')

      // FINISHED on a background tab: the green line, until the tab is opened.
      await at(2, "Start-Sleep -Milliseconds 1500; " + IDLE)
      await tab(1).click()
      ok(!!(await until(async () => (await state(2)) === 'done', 10000, 50)), 'an agent that finishes on a background tab marks it')
      ok(!!(await until(async () => (await badge()) === '1 tab needs a look', 4000, 50)), 'and is counted on the taskbar')
      // Switched off, the finished mark goes, and the badge has nothing to count.
      await page.evaluate(() => localStorage.setItem('prism.term.agentDoneOn', '0'))
      await page.locator('[data-title-settings]').click()
      await gotoPref(page, 'agent-done-on')
      const sw = page.locator('[data-pref="agent-done-on"] [role="switch"]')
      if ((await sw.getAttribute('aria-checked')) === 'true') await sw.click()
      ok(!!(await until(async () => (await badge()) === '', 4000, 50)), 'with the Finished indicator off, nothing is counted')
      ok((await page.locator('[data-tab] [data-attention="done"]').count()) === 0, 'and no finished line is drawn')
      await page.locator('[data-pref="agent-done-on"] [role="switch"]').click()
      await at(0, "$Host.UI.RawUI.WindowTitle = 'pwsh'")
    } finally {
      await closeApp(app)
    }
  },

  /**
   * CLAUDE CODE'S HOOKS (#131). A real pwsh stands in for Claude and prints the
   * bundled plugin's OSC 777 lines itself, exactly the bytes Claude writes for
   * a hook's terminalSequence (the plugin's own output is held to them by the
   * unit test). What is proved: the plugin rides a new shell's environment and
   * the switch takes it away; Working, Question, Done and Failed with its kind
   * in the tooltip; the badge counts them; an idle title after Working with no
   * Stop (an Esc) leaves no Finished line; the Failed switch; another OSC 777
   * is ignored; and a hooked session's screen is not read for a question.
   */
  async agentHooks(ok) {
    const w = world()
    const { app, page } = await launch(w, { args: [w.alpha, w.beta] })
    try {
      await until(async () => (await tabLabels(page)).length === 2)
      const tab = (i) => page.locator('[data-tab]').nth(i)
      const state = (i) => tab(i).getAttribute('data-agent-state')
      const line = (i) => tab(i).locator('[data-attention]').getAttribute('data-attention').catch(() => null)
      const badge = () => page.evaluate(() => window.prism.e2eTaskbarBadge())
      // The sequence as Claude writes it: ESC ] 777 ; payload BEL.
      const osc = (payload) => `[Console]::Write([char]27 + ']777;${payload}' + [char]7)`
      const say = (state) => osc(`prism-agent;state=${state}`)
      const at = (i, cmd) => tab(i).click().then(() => typeLine(page, cmd))
      const later = (cmd) => `Start-Sleep -Milliseconds 1500; ${cmd}`
      const IDLE = "$Host.UI.RawUI.WindowTitle = [char]0x2733 + ' Claude Code'"
      // Opening a tab only counts as looking with the window focused, and the
      // parked e2e window never is: say it is, as `attention` does.
      const look = async (i) => {
        await page.evaluate(() => window.dispatchEvent(new Event('focus')))
        await tab(i).click()
      }
      const PLUG =
        "Write-Host ('PLUG-' + @($env:CLAUDE_CODE_PLUGIN_DIRS -split ';' | Where-Object { $_ -and (Test-Path (Join-Path $_ '.claude-plugin\\plugin.json')) }).Count)"

      // THE PLUGIN RIDES THE SHELL'S ENVIRONMENT, and it is real files.
      await at(0, PLUG)
      ok(!!(await until(async () => (await termText(page)).includes('PLUG-1'), 10000)), 'a new shell is handed the Claude Code plugin')
      await polled(page)

      // WORKING, by the hook alone: no title, no output scoring.
      await at(0, say('working'))
      ok(!!(await until(async () => (await state(0)) === 'working', 8000, 50)), 'a working hook lights the tab')

      // A QUESTION on a background tab: the Question line and the badge.
      await at(0, later(say('question')))
      await tab(1).click()
      ok(!!(await until(async () => (await state(0)) === 'question', 10000, 50)), 'a question hook on a background tab marks it')
      ok((await line(0)) === 'question', 'with the Question line')
      ok(!!(await until(async () => (await badge()) === '1 tab needs a look', 4000, 50)), `and the taskbar badge counts it (${await badge()})`)
      await look(0)
      ok(!!(await until(async () => (await state(0)) === null, 4000, 50)), 'opening the tab clears it')

      // DONE on a background tab: the Finished line.
      await at(0, say('working'))
      await at(0, later(say('done')))
      await tab(1).click()
      ok(!!(await until(async () => (await state(0)) === 'done', 10000, 50)), 'a Stop hook on a background tab leaves the Finished line')
      await look(0)
      await until(async () => (await state(0)) === null, 4000, 50)

      // FAILED, with its kind: the two hooks of one failure, the kind's first.
      await at(0, say('working'))
      await at(0, later(`${osc('prism-agent;state=failed;kind=rate_limit')}; ${say('failed')}`))
      await tab(1).click()
      ok(!!(await until(async () => (await state(0)) === 'failed', 10000, 50)), 'a StopFailure hook on a background tab marks it Failed')
      ok((await line(0)) === 'failed', 'with the Failed line')
      const failedTip = (await tabTitles(page))[0]
      ok(/\nFailed: rate limit$/.test(failedTip), `and the tooltip says what failed (${JSON.stringify(failedTip)})`)
      ok(!!(await until(async () => (await badge()) === '1 tab needs a look', 4000, 50)), 'the badge counts a failed tab')
      const colourOf = (i) => tab(i).locator('[data-attention]').evaluate((e) => getComputedStyle(e).backgroundColor)
      const failedColour = await colourOf(0)
      await page.locator('[data-tab-strip]').screenshot({ path: resolve(process.cwd(), '.e2e-shots/agent-hooks-failed.png') }).catch(() => {})

      // THE FAILED SWITCH: off, the line goes and the turn reads as finished.
      await page.locator('[data-title-settings]').click()
      await gotoPref(page, 'agent-failed-on')
      const failedSwitch = page.locator('[data-pref="agent-failed-on"] [role="switch"]')
      ok((await failedSwitch.getAttribute('aria-checked')) === 'true', 'the Failed indicator is on by default')
      await failedSwitch.click()
      ok(!!(await until(async () => (await line(0)) === 'done', 4000, 50)), 'switched off, no Failed line: the Finished one shows instead')
      const doneColour = await colourOf(0)
      ok(failedColour !== doneColour, `the Failed line is a colour of its own (${failedColour} vs ${doneColour})`)
      await failedSwitch.click()
      ok(!!(await until(async () => (await line(0)) === 'failed', 4000, 50)), 'and back on, it is Failed again')
      ok((await page.locator('[data-pref="agent-hooks"] [role="switch"]').getAttribute('aria-checked')) === 'true', 'Exact status from Claude Code is on by default')

      // AN ESC: working, then the idle title with no Stop. Not a finish.
      await look(0)
      await until(async () => (await state(0)) === null, 4000, 50)
      await at(0, say('working'))
      await until(async () => (await state(0)) === 'working', 8000, 50)
      await at(0, later(IDLE))
      await tab(1).click()
      ok(!!(await until(async () => (await state(0)) !== 'working', 10000, 50)), 'an idle title after a working hook stops the work')
      await sleep(1000)
      ok((await state(0)) === null && (await line(0)) === null, `and leaves no Finished line, an Esc is not a finish (${await state(0)})`)
      ok((await badge()) === '', 'nor anything for the badge')

      // ANOTHER OSC 777, and our prefix with a state we do not know: nothing.
      await at(0, later(`${osc('notify;Build;done')}; ${osc('prism-agent;state=sleeping')}; ${osc('prism-agentx;state=failed')}`))
      await tab(1).click()
      await sleep(2500)
      ok((await state(0)) === null, `another OSC 777 payload changes nothing (${await state(0)})`)

      // A HOOKED SESSION'S SCREEN IS NOT READ FOR A QUESTION: Claude's footer on
      // screen with the title idle used to mark it; the hooks say it now.
      await at(0, later(`Write-Host 'Enter to select, Esc to cancel'; ${IDLE}`))
      await tab(1).click()
      await sleep(2500)
      ok((await state(0)) === null, `the question footer on screen does not mark a hooked session (${await state(0)})`)

      // OFF MEANS OFF: a shell opened with the setting off gets no plugin.
      const before = (await tabLabels(page)).length
      await page.evaluate(() => localStorage.setItem('prism.term.agentHooks', '0'))
      await tab(1).click()
      await page.locator('.xterm').first().click({ force: true })
      await page.keyboard.press('Control+t')
      await until(async () => (await tabLabels(page)).length === before + 1)
      await typeLine(page, PLUG)
      ok(!!(await until(async () => (await termText(page)).includes('PLUG-0'), 10000)), 'with the setting off, a new shell has no plugin')
      // End idle, so closing asks nothing.
      await at(0, "$Host.UI.RawUI.WindowTitle = 'pwsh'")
    } finally {
      await closeApp(app)
    }
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
    await page.locator('[data-term-card="paper"]').first().click()
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
    await closeApp(app)
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
    await gotoPref(page, 'newtab-mode')
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
    await closeApp(app)
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
  // THE CARET FOLLOWS TYPING, NOT A STREAMING AGENT (#101). Magnifiers and
  // screen readers follow xterm's helper textarea, which xterm puts on the
  // cursor at the end of every write. MEASURED: Claude Code's inline view ends
  // every streaming frame with the cursor on the output row, ABOVE the input
  // row. This stands-in for it: an input line at the bottom, echoed there, and
  // a "stream" line eight rows up rewritten every 150 ms, leaving the cursor
  // on it. The textarea must stay on the input line; at a plain prompt it
  // follows xterm's cursor as before.
  async caretHold(ok) {
    const w = world()
    const probe = join(w.alpha, 'inline-agent.cjs')
    writeFileSync(
      probe,
      [
        'process.stdin.setRawMode(true)',
        'process.stdin.resume()',
        "let text = ''",
        'let parked = false',
        'let n = 0',
        "process.stdout.write('\\r\\n'.repeat(9) + 'INPUT> ')",
        "const input = () => { if (parked) { process.stdout.write('\\x1b[8B'); parked = false } process.stdout.write('\\rINPUT> ' + text + '\\x1b[K') }",
        "const frame = () => { if (!parked) { process.stdout.write('\\x1b[8A'); parked = true } process.stdout.write('\\rstream ' + (n += 1) + '\\x1b[K') }",
        'const t = setInterval(frame, 150)',
        "process.stdin.on('data', (b) => { const s = b.toString(); if (s === 'q') { clearInterval(t); input(); process.stdout.write('\\r\\n'); process.exit(0) } text += s; input() })"
      ].join('\n')
    )
    const { app, page } = await launch(w, { args: [w.alpha] })
    // Where the textarea is, and which row holds `needle` (the LAST such row).
    const where = (needle) =>
      page.evaluate((n) => {
        const ta = document.querySelector('.xterm-helper-textarea').getBoundingClientRect()
        const rows = [...document.querySelectorAll('.xterm-rows > div')]
        let row = null
        for (let i = rows.length - 1; i >= 0; i -= 1)
          if ((rows[i].textContent ?? '').includes(n)) {
            row = rows[i].getBoundingClientRect()
            break
          }
        return { ta: Math.round(ta.top), row: row ? Math.round(row.top) : null }
      }, needle)
    try {
      await typeLine(page, `& '${process.execPath}' '${probe}'`)
      ok(!!(await until(async () => (await termText(page)).includes('stream 3'), 15000)), 'the stand-in agent is streaming above its input line')
      for (const ch of 'abc d') {
        await page.keyboard.type(ch)
        await sleep(220)
      }
      await sleep(600) // several frames, each parking the cursor eight rows up
      const held = await where('INPUT> abc d')
      const parkedRow = await where('stream ')
      ok(held.row !== null && parkedRow.row !== null && parkedRow.row < held.row, `the program parks the cursor above the input line (${parkedRow.row} < ${held.row})`)
      ok(Math.abs(held.ta - held.row) <= 2, `the textarea stays on the input line while it streams (textarea ${held.ta}, input ${held.row}, parked ${parkedRow.row})`)
      await page.keyboard.type('e')
      await sleep(400)
      const again = await where('INPUT> abc de')
      ok(Math.abs(again.ta - again.row) <= 2, `and after the next key, still there (textarea ${again.ta}, input ${again.row})`)
      await page.keyboard.type('q')
      await typeLine(page, 'echo caret-follows')
      ok(!!(await until(async () => (await termText(page)).includes('caret-follows'), 8000)), 'back at a plain prompt')
      await sleep(400)
      await page.keyboard.type('xyz')
      await sleep(400)
      const plain = await page.evaluate(() => {
        const ta = document.querySelector('.xterm-helper-textarea').getBoundingClientRect()
        const rows = [...document.querySelectorAll('.xterm-rows > div')]
        const row = rows.findLast((r) => /PS [^>]*> ?xyz/.test(r.textContent ?? ''))
        return { ta: Math.round(ta.top), row: row ? Math.round(row.getBoundingClientRect().top) : null }
      })
      ok(plain.row !== null && Math.abs(plain.ta - plain.row) <= 2, `at a plain prompt the textarea is on xterm's cursor, as before (textarea ${plain.ta}, prompt ${plain.row})`)
      await page.keyboard.press('Control+c')
    } finally {
      await closeApp(app)
    }
  },

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
      await closeApp(app)
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
      const opened = async () => ((await app.evaluate(() => globalThis.__e2eOpenedLinks)) ?? []).filter((u) => u === url).length
      await page.mouse.click(onLink.left + 2, onLink.y, { button: 'right' })
      let rows = await menuRows()
      // A RIGHT-CLICK ON A LINK OPENS NOTHING (owner, 2026-09-28: "right
      // clicking a link opens the link instead of showing the right click
      // menu"): xterm's link addon hands over ANY button's click.
      await sleep(400)
      ok((await opened()) === 0, 'a right-click on a link does not open it')
      ok(!!rows && rows[0].includes('Copy link') && !rows.some((r) => r.includes('Close tab')), `right-click on a link: Copy link first, no Close tab (${JSON.stringify(rows)})`)
      ok(!!rows && rows[1]?.includes('Open link'), `and Open link beside it (${JSON.stringify(rows)})`)
      // A GLYPH ON EVERY ROW, as in Prism's Explorer (owner, 2026-09-28).
      const glyphs = await page.evaluate(() =>
        [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((r) => r.querySelector('[data-menu-icon]')?.getAttribute('data-menu-icon') ?? null)
      )
      ok(glyphs.length > 0 && glyphs.every(Boolean), `every row of the menu has its icon (${JSON.stringify(glyphs)})`)
      await sleep(250) // past the menu's fade-in, for the picture
      await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/term-menu-link.png') }).catch(() => {})
      await page.locator('[role="menu"] [role="menuitem"]', { hasText: 'Copy link' }).click()
      ok((await until(async () => (await clip()) === url, 4000)) === true, 'and it copies the whole link')
      // A CLICKED LINK NEVER REACHES THE OWNER'S BROWSER UNDER --e2e (#64;
      // owner, 2026-09-24: "make sure that future runs don't do that in my real
      // browser"). Clicked for real: main records it and opens nothing.
      await page.keyboard.press('Escape')
      const linkAgain = await box(url, 12)
      await page.mouse.click(linkAgain.left + 2, linkAgain.y, { button: 'right' })
      await page.locator('[role="menu"] [role="menuitem"]', { hasText: 'Open link' }).click()
      ok(!!(await until(async () => (await opened()) === 1, 4000)), 'Open link opens it (recorded under --e2e)')
      // The menu took the pointer away; xterm finds a link only when the
      // pointer comes onto it and rests, as a real hand's does.
      await page.mouse.move(linkAgain.left + 40, linkAgain.y + 40)
      await sleep(200)
      await page.mouse.move(linkAgain.left + 2, linkAgain.y)
      await sleep(300)
      await page.mouse.click(linkAgain.left + 2, linkAgain.y)
      ok(
        !!(await until(async () => (await opened()) === 2, 4000)),
        'a clicked link is recorded under --e2e, and no browser is opened'
      )
      // THE "COPIED" BADGE (owner, 2026-09-23): at the bottom centre, then gone.
      const badge = () =>
        page.evaluate(() => {
          const el = document.querySelector('[data-copied-badge]')
          // Not in the page at all when idle (#58): that is "hidden" too.
          if (!el) return { state: 'hidden', gone: true }
          const r = el.getBoundingClientRect()
          return { state: el.getAttribute('data-copied-badge'), cx: r.left + r.width / 2, bottom: r.bottom, w: innerWidth, h: innerHeight, text: el.textContent }
        })
      const shownBadge = await until(async () => {
        const b = await badge()
        return b.state === 'shown' ? b : null
      }, 3000, 25)
      await sleep(250) // past its 200ms fade-in, for the picture
      await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/copied-badge.png') }).catch(() => {})
      ok(!!shownBadge && shownBadge.text === 'Copied', 'a copy shows the "Copied" badge')
      ok(!!shownBadge && Math.abs(shownBadge.cx - shownBadge.w / 2) <= 2 && shownBadge.h - shownBadge.bottom < 60, `at the bottom centre of the window (${shownBadge?.cx} of ${shownBadge?.w}, ${shownBadge ? shownBadge.h - shownBadge.bottom : '?'}px up)`)
      ok(!!(await until(async () => (await badge()).state === 'hidden', 3000, 50)), 'and it leaves by itself')
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
      // Ctrl+C over a selection raises the badge too.
      await until(async () => (await badge()).state === 'hidden', 3000, 50)
      await select('example.com', 8, 10) // "com"
      await page.keyboard.press('Control+c')
      ok(!!(await until(async () => (await badge()).state === 'shown', 3000, 25)), 'Ctrl+C over a selection shows the badge as well')
      ok((await until(async () => (await clip()) === 'com', 3000)) === true, 'and copied it')
      await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/term-menu.png') }).catch(() => {})
    } finally {
      await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), held).catch(() => {})
      await closeApp(app)
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
      const shadow = await page.locator('[data-term-find]').evaluate((el) => getComputedStyle(el).boxShadow)
      ok(shadow === 'none', `and the find box casts no shadow (${shadow})`)
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
      await closeApp(app)
    }
  },

  /**
   * THE SCROLLBAR IS THIN AND WEARS THE THEME (#52; owner, 2026-09-23). With a
   * scrollback to scroll: the terminal's bar is 6px, with no steppers, and its
   * thumb is the theme's text ink, sampled off a screenshot. Pictures of it go
   * to .e2e-shots/scrollbar-*.png to be looked at.
   */
  async scrollbar(ok) {
    const w = world()
    const { app, page } = await launch(w, { args: [w.alpha] })
    try {
      await page.waitForFunction(() => /PS [^>]*>\s*$/.test((document.querySelector('.xterm .xterm-rows')?.textContent ?? '').trimEnd()), null, { timeout: 45000 })
      await page.locator('.xterm').first().click()
      await page.keyboard.type('1..300')
      await page.keyboard.press('Enter')
      await sleep(1500)
      // One pixel of the screen, read back off a screenshot.
      const pixel = async (x, y) => {
        const shot = await page.screenshot({ clip: { x, y, width: 1, height: 1 } })
        return page.evaluate(async (b64) => {
          const img = new Image()
          img.src = `data:image/png;base64,${b64}`
          await img.decode()
          const c = document.createElement('canvas')
          c.width = c.height = 1
          const g = c.getContext('2d')
          g.drawImage(img, 0, 0)
          const [r, gg, b] = g.getImageData(0, 0, 1, 1).data
          return 0.2126 * r + 0.7152 * gg + 0.0722 * b
        }, shot.toString('base64'))
      }
      // xterm 6's own slider fades when idle, as VS Code's does, so it is woken
      // with a scroll up and back. It is the text ink over the ground: lighter
      // than the ground on a dark theme, darker on a light one. That is
      // "follows the theme".
      const measure = async (name) => {
        await page.mouse.move(400, 400)
        await page.mouse.wheel(0, -300)
        await sleep(250)
        await page.mouse.wheel(0, 600)
        await sleep(400)
        const bar = await page.evaluate(() => {
          const v = document.querySelector('.xterm .xterm-viewport')
          const s = document.querySelector('.xterm .xterm-scrollable-element > .scrollbar.vertical > .slider')
          const r = s?.getBoundingClientRect()
          return { gutter: v.offsetWidth - v.clientWidth, slider: r ? { w: Math.round(r.width), x: r.left + r.width / 2, y: r.top + r.height / 2 } : null }
        })
        await page.screenshot({ path: resolve(process.cwd(), `.e2e-shots/scrollbar-${name}.png`) }).catch(() => {})
        if (!bar.slider) return { ...bar, thumb: 0, ground: 0 }
        return { ...bar, thumb: await pixel(Math.floor(bar.slider.x), bar.slider.y), ground: await pixel(Math.floor(bar.slider.x - 40), bar.slider.y) }
      }
      const dark = await measure('dark')
      ok(dark.gutter === 0, `no native gutter or steppers beside it (${dark.gutter}px)`)
      ok(dark.slider?.w === 6, `the slider is 6px wide (${dark.slider?.w})`)
      ok(dark.thumb - dark.ground > 25, `on a dark theme it is lighter than the ground (${dark.thumb.toFixed(0)} over ${dark.ground.toFixed(0)})`)
      // A light theme, picked in Settings as a user would, then back to the shell.
      await page.locator('[data-title-settings]').click()
      await page.locator('[data-settings-tab="appearance"]').click()
      await page.locator('[data-term-card="fawn"]').first().click()
      await page.locator('[data-tab]').first().click()
      await sleep(900)
      const light = await measure('light')
      ok(light.slider?.w === 6, `still 6px on a light theme (${light.slider?.w})`)
      ok(light.ground - light.thumb > 25, `on a light theme it is darker than the ground (${light.thumb.toFixed(0)} under ${light.ground.toFixed(0)})`)
    } finally {
      await closeApp(app)
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
      // The paste injection fix (code review 2026-09-24, #1) is proved in
      // termPaste.test.ts, not here: PSReadLine never turns bracketed paste
      // on, so a pwsh prompt runs a pasted CR either way and cannot tell a
      // sanitised paste from an unsanitised one (MEASURED: an e2e check here
      // passed with the sanitiser switched off). It matters in bash, WSL and
      // an agent's input, which is where bracketed paste is on.
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
      await closeApp(app)
    }
  },

  /**
   * TAB WIDTH (owner, 2026-09-21, then a setting on 2026-09-23). Was: EVERY TAB IS ONE WIDTH ("make tabs in both apps have a
   * fixed size, and not dynamically adjust based on the content"). Three
   * folders with names of very different lengths open side by side; what is
   * measured is each tab's box, not the class that sets it, because a class
   * that loses to a longer label is exactly what this replaced.
   */
  // A TAB REACHES FIRST PLACE (#125; owner, 2026-10-04: "i cant drag that
  // github tab to the left of the prism tab to make it first"). The second
  // tab is the WIDER one (Dynamic, a longer name), which is what could never
  // get there: its centre was clamped short of the first tab's centre.
  async tabDragFirst(ok) {
    const w = world()
    const wide = join(w.alpha, '..', 'a-much-longer-folder-name')
    mkdirSync(wide)
    const { app, page } = await launch(w, { args: [w.alpha, wide] })
    ok(await until(async () => (await tabLabels(page)).length === 2), 'two tabs open')
    const boxes = await page.locator('[data-tab]').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()))
    ok(boxes[1].width > boxes[0].width, `the second tab is the wider (${Math.round(boxes[1].width)} > ${Math.round(boxes[0].width)})`)
    const y = boxes[1].top + boxes[1].height / 2
    await page.mouse.move(boxes[1].left + boxes[1].width / 2, y)
    await page.mouse.down()
    for (let x = boxes[1].left + boxes[1].width / 2; x > 0; x -= 20) await page.mouse.move(x, y)
    await page.mouse.move(0, y)
    await page.mouse.up()
    ok(
      await until(async () => (await tabLabels(page))[0]?.includes('a-much-longer-folder-name')),
      `dragged all the way left it is first (${JSON.stringify(await tabLabels(page))})`
    )
    const back = await page.locator('[data-tab]').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()))
    await page.mouse.move(back[0].left + back[0].width / 2, y)
    await page.mouse.down()
    for (let x = back[0].left + back[0].width / 2; x < back[1].right + 40; x += 20) await page.mouse.move(x, y)
    await page.mouse.up()
    ok(
      await until(async () => (await tabLabels(page))[1]?.includes('a-much-longer-folder-name')),
      `and dragged right it is last again (${JSON.stringify(await tabLabels(page))})`
    )
    await closeApp(app)
  },

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
    // DYNAMIC IS THE DEFAULT (owner, 2026-09-23: "call it dynamic ... have
    // dynamic be the default"): each tab as wide as its name, the long one
    // capped and truncated.
    const dyn = (await boxes()).slice(0, 3)
    ok(dyn[1].w > dyn[0].w + 40, `by default a long name makes a wider tab than a short one (${dyn.map((b) => b.w).join(' / ')})`)
    ok(dyn[1].w <= 14 * 16 + 80 && dyn[1].cut, `and the long one stops at the cap, truncated (${dyn[1].w}px)`)
    await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/tabs-dynamic.png') }).catch(() => {})
    // FIXED, picked on the Settings page at the TOP of Appearance ("put the
    // option closer to the top of appearance"): every tab one width.
    await page.locator('[data-title-settings]').click()
    await page.locator('[data-settings-tab="appearance"]').click()
    const row = page.locator('[data-pref="tab-width"]')
    await row.waitFor({ timeout: 8000 })
    const firstRow = await page.evaluate(() => document.querySelector('[data-pref]')?.getAttribute('data-pref'))
    ok(firstRow === 'tab-width', `Tab width is the first row of Appearance (${firstRow})`)
    await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/settings-tab-width.png') }).catch(() => {})
    await row.locator('[data-seg="fixed"]').click()
    ok((await page.evaluate(() => localStorage.getItem('prism.window.tabWidth'))) === 'fixed', 'Fixed is stored')
    await page.locator('[data-tab]').first().click()
    await sleep(300)
    const three = (await boxes()).slice(0, 3)
    const widths = [...new Set(three.map((b) => b.w))]
    ok(widths.length === 1, `with Fixed every tab is the same width, whatever its name (${three.map((b) => b.w).join(' / ')})`)
    ok(widths[0] >= 104 && widths[0] <= 124, `a fixed width, not a content one (${widths[0]}px)`)
    ok(three[1].cut && !three[0].cut, 'the long name is truncated inside the tab, the short one is whole')
    // Selecting a tab must not move anything either: the active one used to be
    // no wider, but it is the case that shows it if a mark ever takes room.
    const before = (await boxes()).map((b) => b.w).join('|')
    await page.locator('[data-tab]').nth(2).click()
    await sleep(200)
    ok((await boxes()).map((b) => b.w).join('|') === before, 'picking another tab moves no tab')
    await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/tabs-fixed.png') }).catch(() => {})
    await closeApp(app)
  },

  // NO TITLE BAR (#91; owner, 2026-09-28, "tabs in the top row"): Hidden
  // puts the tabs in the title bar's row with its buttons at the end, one row
  // where there were two. Shown, the default, is the window as it was.
  async titleBar(ok) {
    const w = world()
    const { app, page } = await launch(w, { args: [w.alpha, w.beta] })
    ok(await until(async () => (await tabLabels(page)).length === 2), 'two tabs open')
    const layout = () =>
      page.evaluate(() => {
        const bar = document.querySelector('[data-title-bar]')
        const strip = document.querySelector('[data-tab-strip]')
        const host = document.querySelector('[data-term-host]')
        const inBar = (sel) => !!bar?.querySelector(sel)
        return {
          mode: bar?.getAttribute('data-title-bar') ?? null,
          name: (bar?.textContent ?? '').includes('Prism Terminal'),
          stripInBar: !!(bar && strip && bar.contains(strip)),
          buttons: inBar('[data-title-settings]') && inBar('[data-window-close]') && inBar('[aria-label="Minimize"]'),
          hostTop: Math.round(host?.getBoundingClientRect().top ?? -1),
          stripTop: Math.round(strip?.getBoundingClientRect().top ?? -1),
          stripDrag: strip ? getComputedStyle(strip).getPropertyValue('-webkit-app-region') || getComputedStyle(strip).getPropertyValue('app-region') : '',
          closeRight: Math.round(innerWidth - (document.querySelector('[data-window-close]')?.getBoundingClientRect().right ?? 0))
        }
      })
    const shown = await layout()
    ok(shown.mode !== 'tabs' && shown.name && !shown.stripInBar && shown.buttons, `by default the title bar is its own row, with the name (${JSON.stringify(shown)})`)
    ok(shown.hostTop >= 64, `two rows above the terminal (${shown.hostTop}px)`)
    await page.locator('[data-title-settings]').click()
    await page.locator('[data-settings-tab="appearance"]').click()
    const row = page.locator('[data-pref="title-bar"]')
    await row.waitFor({ timeout: 8000 })
    // A switch since the grouped cards (2026-10-05): on is Shown, the default.
    const flip = row.locator('[role="switch"]')
    ok((await flip.getAttribute('aria-checked')) === 'true', 'Show title bar is on by default')
    await flip.click()
    ok((await page.evaluate(() => localStorage.getItem('prism.window.titleBar'))) === 'hidden', 'switched off, Hidden is stored')
    await page.locator('[data-tab]').first().click()
    await sleep(300)
    const hidden = await layout()
    ok(hidden.mode === 'tabs' && hidden.stripInBar && !hidden.name, `hidden: the tabs are in the top row, no name (${JSON.stringify(hidden)})`)
    ok(hidden.buttons && hidden.closeRight <= 12, `and the settings, minimise and close buttons sit at its right end (${hidden.closeRight}px from the edge)`)
    ok(hidden.stripTop === 0 && hidden.hostTop > 20 && hidden.hostTop <= 40, `one row above the terminal (${hidden.hostTop}px, was ${shown.hostTop}px)`)
    ok(hidden.stripDrag === 'drag', `the strip's empty space still moves the window (${hidden.stripDrag})`)
    await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/title-bar-hidden.png') }).catch(() => {})
    // The start screen: no tabs, and the buttons are still there to reach.
    for (let i = 0; i < 6 && (await tabLabels(page)).length; i += 1) {
      await page.keyboard.press('Control+w')
      await sleep(300)
    }
    ok(await until(async () => (await tabLabels(page)).length === 0), 'every tab closed')
    const empty = await layout()
    ok(empty.mode === 'tabs' && empty.buttons, 'with no tabs the top row still holds the buttons')
    await page.locator('[data-title-settings]').click()
    await page.locator('[data-settings-tab="appearance"]').click()
    await flip.click()
    await sleep(200)
    const back = await layout()
    ok(back.mode !== 'tabs' && back.name, 'Shown brings the title bar back')
    await closeApp(app)
  },

  // SETTINGS KEEPS ITS PAGE WHILE ITS TAB STAYS OPEN (#123; owner,
  // 2026-10-04): another tab in front and back finds the page that was left;
  // closing the Settings tab and opening it again starts on Appearance.
  async settingsPage(ok) {
    const w = world()
    const { app, page } = await launch(w, { args: [w.alpha] })
    ok(await until(async () => (await tabLabels(page)).length === 1), 'one tab open')
    const current = () =>
      page.evaluate(() => document.querySelector('[data-settings-tab][aria-current="page"]')?.getAttribute('data-settings-tab') ?? null)
    const settingsTab = page.locator('[data-tab]', { hasText: 'Settings' })
    await page.locator('[data-title-settings]').click()
    ok(await until(async () => (await current()) === 'appearance'), 'Settings opens on Appearance')
    await page.locator('[data-settings-tab="dictation"]').click()
    ok(await until(async () => (await current()) === 'dictation'), 'Dictation picked')
    await page.locator('[data-tab]').first().click()
    ok(await until(async () => (await current()) === null), 'the shell is in front, Settings unmounted')
    await settingsTab.click()
    ok(await until(async () => (await current()) === 'dictation'), `back on Settings it is still Dictation (${await current()})`)
    await settingsTab.locator('[data-tab-close]').click({ force: true })
    ok(await until(async () => (await settingsTab.count()) === 0), 'the Settings tab closed')
    await page.locator('[data-title-settings]').click()
    ok(await until(async () => (await current()) === 'appearance'), `opened again it starts on Appearance (${await current()})`)
    await closeApp(app)
  },

  // LAUNCH WITH RESTORED AGENT TABS (#106; spec
  // docs/superpowers/specs/2026-09-30-launch-skeleton-design.md; owner,
  // 2026-09-30: "you see the no tab screen (false, there are three tabs
  // actually) -> ... then you see the path in the terminal then it
  // disappears"). Three saved claude tabs, a HOME of our own holding a
  // transcript for each (never the owner's), and a stand-in `claude` first on
  // PATH that titles the console `claude`, waits, then titles it the way
  // Claude does and prints a banner.
  async launchSkeleton(ok) {
    const w = world()
    const gamma = join(w.alpha, '..', 'gamma')
    mkdirSync(gamma)
    const home = join(w.alpha, '..', 'home')
    const bin = join(w.alpha, '..', 'bin')
    mkdirSync(bin)
    for (const cwd of [w.alpha, w.beta, gamma]) {
      const dir = join(home, '.claude', 'projects', cwd.replace(/[^A-Za-z0-9]/g, '-'))
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, '5a1d0c2e-1111-4222-8333-94445555a666.jsonl'), '{"type":"user","entrypoint":"cli"}\n')
    }
    writeFileSync(
      join(bin, 'fake-claude.cjs'),
      [
        "process.stdout.write('\\x1b]0;claude\\x07~\\\\agent-banner-path\\r\\n')",
        "setTimeout(() => process.stdout.write('\\x1b]0;\\u2733 Claude Code\\x07FAKE CLAUDE READY ' + process.argv.slice(2).join(' ') + '\\r\\n'), 1500)",
        'setInterval(() => {}, 1000)'
      ].join('\n')
    )
    // Words before the agent takes the console, as a shell's prompt would be:
    // the clear must wipe them. Then the agent, whose own banner line may show.
    writeFileSync(join(bin, 'claude.cmd'), `@echo NOISE-BEFORE C:\\noise\r\n@"${process.execPath}" "%~dp0fake-claude.cjs" %*\r\n`)
    writeFileSync(
      join(w.profile, 'tabs.json'),
      JSON.stringify({ tabs: [w.alpha, w.beta, gamma].map((cwd) => ({ cwd, agent: 'claude' })), active: 0 })
    )
    const env = { USERPROFILE: home, HOME: home, PATH: `${bin};${process.env.PATH}` }
    const app = await electron.launch({
      ...(PACKAGED ? { executablePath: PACKAGED } : {}),
      args: [...(PACKAGED ? [] : [MAIN]), `--user-data-dir=${w.profile}`, '--e2e'],
      env: { ...process.env, ...env }
    })
    try {
      const page = await app.firstWindow()
      // From the first frame the page draws: what did it show FIRST, tabs or
      // the start screen? Polled as fast as the page answers.
      let first = null
      const t0 = Date.now()
      while (!first && Date.now() - t0 < 15000) {
        first = await page
          .evaluate(() => {
            const tabs = document.querySelectorAll('[data-tab]').length
            if (document.querySelector('[data-empty-state]')) return { empty: true, tabs }
            return tabs ? { empty: false, tabs } : null
          })
          .catch(() => null)
        if (!first) await sleep(10)
      }
      await app.evaluate(park)
      ok(!!first && !first.empty && first.tabs === 3, `the first frame already holds the three tabs, and no start screen (${JSON.stringify(first)})`)
      // While it comes back: the skeleton, a ring on every tab, and never the
      // shell's own words showing uncovered.
      const look = () =>
        page.evaluate(() => {
          const rows = [...document.querySelectorAll('.xterm-rows')].map((r) => r.textContent ?? '').join('\n')
          return {
            skeleton: !!document.querySelector('[data-resume-skeleton="shown"]'),
            rings: document.querySelectorAll('[data-tab-loading]').length,
            prompt: rows.includes('NOISE-BEFORE'),
            ready: rows.includes('FAKE CLAUDE READY')
          }
        })
      const early = await look()
      await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/launch-skeleton.png') }).catch(() => {})
      ok(early.skeleton, 'the tab in front wears the skeleton while its conversation comes back')
      ok(early.rings === 3, `every tab shows the loading ring (${early.rings})`)
      let bare = false
      const settle = await until(async () => {
        const l = await look()
        if (l.prompt && !l.skeleton) bare = true
        return l.ready && !l.skeleton && l.rings === 0 ? l : null
      }, 30000, 40)
      ok(!!settle, `the agent appears, and the skeleton and every ring go (${JSON.stringify(await look())})`)
      ok(!bare, 'what the shell said before the agent was never shown uncovered')
      ok(!(await look()).prompt, 'and it is not left in the terminal above the agent')
      await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/launch-ready.png') }).catch(() => {})
      // A tab behind, clicked after its own agent was ready: no skeleton.
      await page.locator('[data-tab]').nth(2).locator('[role="tab"]').click()
      await sleep(300)
      const behind = await look()
      ok(!behind.skeleton && behind.ready, 'a tab behind, opened after it was ready, shows its agent at once')
    } finally {
      await closeApp(app)
    }
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
    await closeApp(app)
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
    await closeApp(app)
  },

  /** Closing the last tab lands on the start screen; the X is what quits, and
   *  what was open when it quit is what comes back. */
  // QUITTING WITH MANY SHELLS IS CLEAN (#127; owner, 2026-10-04, a screenshot
  // of "Assertion failed! conpty.node ... remove_pty_baton(baton->id)" as the
  // stable copy closed for an update). node-pty 1.1.0's exit threads erased
  // from one vector with no lock, so shells dying together raced, and its
  // prebuild asserts: a modal dialog that holds the process open. Ten live
  // shells, quit, three times: the process must exit by itself, quickly, 0.
  async quitManyShells(ok) {
    for (let round = 1; round <= 3; round += 1) {
      // A profile per round: the same one would restore the last round's tabs.
      const w = world()
      const { app, page } = await launch(w, { args: [w.alpha] })
      await until(async () => (await tabLabels(page)).length === 1)
      for (let i = 1; i < 10; i += 1) {
        await page.keyboard.press('Control+t')
        await until(async () => (await tabLabels(page)).length === i + 1, 8000, 50)
        await until(async () => /PS |>/.test(await termText(page)), 8000, 50)
      }
      ok((await tabLabels(page)).length === 10, `round ${round}: ten shells open`)
      const proc = app.process()
      // What the process says as it dies: a native abort names itself here.
      let said = ''
      proc.stderr?.on('data', (d) => (said = (said + d).slice(-3000)))
      const exited = new Promise((r) => proc.once('exit', (code, signal) => r({ code, signal })))
      const t0 = Date.now()
      app.close().catch(() => {})
      const end = await Promise.race([exited, sleep(10000).then(() => null)])
      if (!end) {
        try {
          proc.kill()
        } catch {
          /* already gone */
        }
      }
      ok(end !== null, `round ${round}: the app quit by itself (${end ? Date.now() - t0 : '>10000'} ms)`)
      ok(end?.code === 0, `round ${round}: with exit code 0 (${JSON.stringify(end)})`)
      if (end?.code !== 0 && said.trim()) console.log(`  stderr  ${said.trim().split('\n').slice(-12).join('\n          ')}`)
    }
  },

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
    await closeApp(app)
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
    await polled(page)
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
    await closeApp(app)
  },

  /** A printed link is painted as one, in a colour that follows the theme. */
  // PATHS ARE LINKS WHEN THEY EXIST (#99; owner, 2026-09-29: "would it be
  // possible to show these as clickable links that would open the file or
  // folder"). Real files in the shell's folder, a sentence naming them the
  // way Claude writes, and one that names nothing. Under --e2e main RECORDS
  // what it would open (`__e2eOpenedPaths`); nothing opens on the desktop.
  async pathLinks(ok) {
    const w = world()
    mkdirSync(join(w.alpha, 'docs', 'sign-off'), { recursive: true })
    mkdirSync(join(w.alpha, 'docs', 'wireframes', 'png'), { recursive: true })
    writeFileSync(join(w.alpha, 'docs', 'sign-off', 'rapport.pdf'), '%PDF-1.4')
    writeFileSync(join(w.alpha, 'run.bat'), '@echo off')
    const pdf = join(w.alpha, 'docs', 'sign-off', 'rapport.pdf')
    const bat = join(w.alpha, 'run.bat')
    const { app, page } = await launch(w, { args: [w.alpha] })
    const clip = () => app.evaluate(({ clipboard }) => clipboard.readText())
    const held = await clip()
    const opened = () => app.evaluate(() => globalThis.__e2eOpenedPaths ?? [])
    const INK = '121,167,216' // LINK_BLUE on the default theme
    const inked = () =>
      page.evaluate((want) => {
        const norm = (c) => (c.match(/\d+/g) ?? []).slice(0, 3).join(',')
        return [...document.querySelectorAll('.xterm .xterm-rows > div')]
          .map((row) =>
            [...row.querySelectorAll('span')]
              .filter((sp) => norm(getComputedStyle(sp).color) === want)
              .map((sp) => sp.textContent ?? '')
              .join('')
          )
          .join('\n')
      }, INK)
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
                return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
              }
              left -= node.textContent.length
            }
          }
          return null
        },
        [needle, offset]
      )
    // A click as a hand makes it: onto the text, a rest, then the press.
    const clickOn = async (needle, button = 'left') => {
      const at = await box(needle, 2)
      await page.mouse.move(at.x + 30, at.y + 30)
      await sleep(100)
      await page.mouse.move(at.x, at.y)
      await sleep(300)
      await page.mouse.click(at.x, at.y, { button })
    }
    const menu = () =>
      until(async () => {
        const t = await page.locator('[role="menu"] [role="menuitem"]').allTextContents()
        return t.length ? t : null
      }, 4000)
    try {
      await typeLine(page, "cls; Write-Host 'Rapport: docs/sign-off/rapport.pdf, PNG i docs/wireframes/png/. Mangler: missing/file.txt og run.bat.'")
      ok(
        !!(await until(async () => {
          const t = await inked()
          return t.includes('docs/sign-off/rapport.pdf') && t.includes('docs/wireframes/png/') && t.includes('run.bat') ? t : null
        }, 8000)),
        'a file, a folder and a script that exist wear the link colour'
      )
      ok(!(await inked()).includes('missing/file.txt'), 'a path that names nothing does not')
      await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/path-links.png') }).catch(() => {})
      await clickOn('docs/sign-off/rapport.pdf')
      ok(
        !!(await until(async () => (await opened()).some((o) => o.how === 'open' && o.abs === pdf), 4000)),
        'a click opens the file, resolved against the shell folder'
      )
      const png = join(w.alpha, 'docs', 'wireframes', 'png')
      await clickOn('docs/wireframes/png/')
      ok(!!(await until(async () => (await opened()).some((o) => o.how === 'open' && o.abs === png), 4000)), 'a folder opens (in Explorer)')
      await clickOn('run.bat')
      ok(!!(await until(async () => (await opened()).some((o) => o.abs === bat), 4000)), 'the script was clicked')
      ok(
        !(await opened()).some((o) => o.how === 'open' && o.abs === bat),
        'and it is NEVER run: it is shown selected in Explorer instead'
      )
      const before = (await opened()).length
      await clickOn('docs/sign-off/rapport.pdf', 'right')
      await sleep(300)
      ok((await opened()).length === before, 'a right-click opens nothing')
      const rows = await menu()
      ok(
        !!rows && rows[0] === 'Open' && rows[1] === 'Show in Explorer' && rows[2] === 'Copy path',
        `the menu leads with Open, Show in Explorer, Copy path (${JSON.stringify(rows)})`
      )
      const glyphs = await page.evaluate(() =>
        [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((r) => r.querySelector('[data-menu-icon]')?.getAttribute('data-menu-icon') ?? null)
      )
      ok(glyphs.every(Boolean), `and every row has its icon (${JSON.stringify(glyphs)})`)
      await page.locator('[role="menu"] [role="menuitem"]', { hasText: 'Show in Explorer' }).click()
      ok(!!(await until(async () => (await opened()).some((o) => o.how === 'reveal' && o.abs === pdf), 4000)), 'Show in Explorer shows the file')
      await clickOn('docs/sign-off/rapport.pdf', 'right')
      await menu()
      await page.locator('[role="menu"] [role="menuitem"]', { hasText: 'Copy path' }).click()
      ok((await until(async () => (await clip()) === pdf, 4000)) === true, 'Copy path copies it whole and absolute')
    } finally {
      await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), held).catch(() => {})
      await closeApp(app)
    }
  },

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
    const BLUE = '121,167,216' // LINK_BLUE, which reads as it is on the default theme
    const url = 'https://go.microsoft.com/fwlink/?LinkID=108518'
    // Write-Host, so the OUTPUT row holds the sentence exactly as typed here.
    await typeLine(page, `cls; Write-Host 'online at ${url}. Then more.'`)
    ok(await until(async () => (await inked(BLUE)).includes(url), 8000), 'a printed link wears the link blue')
    await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/links.png') }).catch(() => {})
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
    // ON THE ALTERNATE SCREEN TOO (owner, 2026-09-28: a link in Claude Code's
    // fullscreen view "is not blue ... it seems to know it's a link since i can
    // click it"). Markers, so decorations, do not exist there; the rows are
    // inked as xterm draws them. And a row a TUI rewrites loses the colour.
    const alt = 'https://example.org/alt/path?x=1'
    await typeLine(page, `Write-Host -NoNewline "$([char]27)[?1049h$([char]27)[H"; Write-Host 'open ${alt} here'`)
    ok(await until(async () => (await inked(BLUE)).includes(alt), 8000), 'on the alternate screen a printed link wears the link blue')
    await typeLine(page, `Write-Host -NoNewline "$([char]27)[H$([char]27)[2Kplain words where the link was"`)
    ok(
      await until(async () => !(await inked(BLUE)).some((t) => t.includes('plain') || t.includes('words')), 8000),
      'and a row rewritten in place keeps no link colour'
    )
    // Out again. Typed as it is: the prompt now sits at the top of the
    // alternate screen, not at the end of its rows, which typeLine waits for.
    await page.keyboard.type(`Write-Host -NoNewline "$([char]27)[?1049l"`)
    await page.keyboard.press('Enter')
    // A light theme: the same blue would be unreadable, so it moves.
    await typeLine(page, `cls; Write-Host 'see ${url}'`)
    await until(async () => (await inked(BLUE)).includes(url), 8000)
    await page.locator('[data-title-settings]').click()
    await page.locator('[data-settings-tab="appearance"]').click()
    await page.locator('[data-term-card="paper"]').first().click()
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
          return ink.join(',') === '121,167,216' || ratio < 4.5 || !(ink[2] > ink[0])
            ? null
            : { rgb: ink.join(','), ratio, blue: ink[2] > ink[0] }
        }),
      8000
    )
    ok(!!light, 'on a light theme the link takes another colour that reads there')
    ok(!!light && light.blue, `and it is still a blue (${light ? light.rgb + ' at ' + light.ratio.toFixed(1) + ':1' : 'none'})`)
    await closeApp(app)
  },

  /**
   * KEYS AND FOCUS (code review 2026-09-24, PR 2), each in a real pwsh, each
   * failing on the code before the fix:
   *  - #21 Shift+Enter at a plain prompt is Enter: the line runs as typed, no
   *    backslash appended.
   *  - #6 Ctrl+C over a selection copies on a non-Latin layout, where the C
   *    key's `key` is 'с' and only its `code` says KeyC.
   *  - #9 a `cd` that lands while the find bar is open leaves the typing in it.
   *  - #32 the right-click menu goes on a tab change and does not come back.
   *  - #10 under the close question, Ctrl+T and Ctrl+Tab do nothing.
   *  - #33 a drag that never drops gives the strip back at the next pointer move.
   */
  async reviewKeys(ok) {
    const w = world()
    const { app, page } = await launch(w, { args: [w.alpha, w.beta] })
    const clip = () => app.evaluate(({ clipboard }) => clipboard.readText())
    const held = await clip()
    try {
      await until(async () => (await tabLabels(page)).length === 2)
      const activeTab = () =>
        page.evaluate(() => [...document.querySelectorAll('[data-tab]')].findIndex((t) => t.querySelector('[aria-selected="true"]') || t.getAttribute('aria-selected') === 'true'))
      // #33
      const stripDrags = () => page.locator('[data-tab-strip]').evaluate((el) => el.classList.contains('drag'))
      await page.evaluate(() => window.dispatchEvent(new DragEvent('dragenter')))
      ok(!!(await until(async () => !(await stripDrags()), 2000, 50)), 'a drag in flight takes the strip off window-drag')
      await page.mouse.move(40, 200)
      await page.mouse.move(60, 220)
      ok(!!(await until(stripDrags, 2000, 50)), 'and the next pointer move after it gives the strip back')

      await typeLine(page, 'mkdir sub | Out-Null; cls')
      await sleep(600)

      // #21
      await page.locator('.xterm').first().click({ force: true })
      await page.keyboard.type('echo shift-$(40+2)')
      await page.keyboard.press('Shift+Enter')
      ok(!!(await until(async () => /shift-42/.test(await termText(page)), 8000)), 'Shift+Enter at a plain prompt runs the line')
      ok(!(await termText(page)).includes('shift-42\\'), 'and appends no backslash to it')

      // #6: select the first row by dragging over it, then a Russian Ctrl+C.
      await app.evaluate(({ clipboard }) => clipboard.writeText('SENTINEL-6'))
      const row = await page.locator('.xterm-rows > div').first().boundingBox()
      await page.mouse.move(row.x + 2, row.y + row.height / 2)
      await page.mouse.down()
      await page.mouse.move(row.x + 160, row.y + row.height / 2, { steps: 6 })
      await page.mouse.up()
      const cdp = await page.context().newCDPSession(page)
      for (const type of ['rawKeyDown', 'keyUp'])
        await cdp.send('Input.dispatchKeyEvent', { type, key: 'с', code: 'KeyC', windowsVirtualKeyCode: 67, modifiers: 2 })
      const copied = await until(async () => {
        const c = await clip()
        return c !== 'SENTINEL-6' ? c : null
      }, 3000)
      ok(!!copied && copied.includes('PS'), `Ctrl+C by the physical key copies the selection (${JSON.stringify(copied)})`)

      // #9: the find bar is open when the shell reports a new folder.
      await page.locator('.xterm').first().click({ force: true })
      await page.keyboard.type('Start-Sleep 2; cd sub')
      await page.keyboard.press('Enter')
      await page.keyboard.press('Control+f')
      const findInput = page.locator('[data-term-find] input')
      ok(!!(await until(async () => (await findInput.count()) === 1, 4000, 50)), 'Ctrl+F opens find while the command runs')
      ok(!!(await until(async () => (await tabLabels(page)).includes('sub'), 8000)), 'the cd lands with find open')
      await sleep(400)
      await page.keyboard.type('xyz')
      ok((await findInput.inputValue()) === 'xyz', `the typing stays in the find bar (${await findInput.inputValue()})`)
      await page.keyboard.press('Escape')

      // #32
      const first = await activeTab()
      await page.locator('[data-term-region]').click({ button: 'right', position: { x: 200, y: 120 } })
      const menu = () => page.locator('[role="menu"]').count()
      ok(!!(await until(async () => (await menu()) === 1, 4000, 50)), 'the terminal menu opens')
      await page.keyboard.press('Control+Tab')
      ok(!!(await until(async () => (await menu()) === 0, 4000, 50)), 'a tab change puts it away')
      await page.keyboard.press('Control+Tab')
      ok(!!(await until(async () => (await activeTab()) === first, 4000, 50)), `back on the first tab (${first})`)
      await sleep(300)
      ok((await menu()) === 0, 'and the menu does not come back')

      // #10: a Claude title makes the close ask; the chords wait for it.
      await typeLine(page, 'echo ready')
      await polled(page) // the process poll's first "no agent" verdict, said once
      await typeLine(page, "$Host.UI.RawUI.WindowTitle = [char]0x2733 + ' Claude Code'")
      await until(() => page.evaluate(() => !!document.querySelector('[data-agent-present]')), 8000, 50)
      await page.keyboard.press('Control+w')
      const dialog = () => page.locator('[role="dialog"]').count()
      ok(!!(await until(async () => (await dialog()) === 1, 4000, 50)), 'closing an agent\'s tab asks')
      await page.keyboard.press('Control+t')
      await page.keyboard.press('Control+Tab')
      await sleep(600)
      ok((await tabLabels(page)).length === 2, 'Ctrl+T under the question opens nothing')
      ok((await activeTab()) === first, 'and Ctrl+Tab switches nothing')
      ok((await dialog()) === 1, 'and the question is still there')
      await page.keyboard.press('Escape')
      await typeLine(page, "$Host.UI.RawUI.WindowTitle = 'pwsh'")

    } finally {
      await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), held).catch(() => {})
      await closeApp(app)
    }
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
    await closeApp(app)
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
      // A copy that worked is said by the app's "Copied" badge at the bottom of
      // the window (owner, 2026-09-23), which replaced the check in the button.
      const said = await until(
        () =>
          page.evaluate(() => {
            const el = document.querySelector('[data-copied-badge="shown"]')
            return el ? { role: el.getAttribute('role'), text: el.textContent } : null
          }),
        3000,
        25
      )
      ok(!!said, 'a copy raises the "Copied" badge')
      ok(said?.role === 'status' && said?.text === 'Copied', 'and a screen reader is told, by the badge')
      const heightDuring = await mainRow.evaluate((el) => el.getBoundingClientRect().height)
      ok(heightDuring === heightBefore, `and the row does not change height (${heightBefore} -> ${heightDuring})`)
      ok(!!wantMain && /Sort-Object/.test(wantMain) && (await clip()) === wantMain, `the clipboard holds the EXACT command ("${await clip()}")`)
      ok(
        await until(async () => (await page.locator('[data-copied-badge]').count()) === 0, 3000, 50),
        'and the badge leaves the page after it has faded'
      )
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
      await page.locator('[data-term-card="paper"]').first().click()
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
      await gotoPref(page, 'help-enabled')
      const sw = page.locator('[data-pref="help-enabled"] [role="switch"]')
      ok((await sw.getAttribute('aria-checked')) === 'true', 'Settings > Terminal has the Command help switch, on by default')
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
      await gotoPref(page, 'help-enabled')
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
    await closeApp(app)
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
    // Read as TEXT, the way Prism's gate reads them: an entry is `{ id: '...'`
    // up to its first closing brace.
    const entries = (file, keep = () => true) =>
      [...readFileSync(resolve(process.cwd(), file), 'utf8').matchAll(/\{\s*id: '([a-z-]+)'[^}]*\}/g)]
        .filter((m) => keep(m[0]))
        .map((m) => ({ id: m[1], section: (m[0].match(/section: '([a-z]+)'/) ?? [])[1] ?? null }))
    const core = [
      ...entries('core/renderer/settings/options.ts'),
      ...entries('core/renderer/settings/dictationOptions.ts', (row) => !row.includes('onlyWhere')),
      // Command help (#12) keeps a list of its own, as dictation does.
      ...entries('core/renderer/settings/helpOptions.ts'),
      // The diagnostics log (#140) too: its own list, read the same way.
      ...entries('core/renderer/settings/diagnosticsOptions.ts')
    ]
    const wanted = core.map((e) => e.id).sort()
    ok(wanted.length >= 21 && wanted.includes('help-enabled') && wanted.includes('diag-verbose'), `the core lists the terminal, dictation, help and diagnostics options (${wanted.length})`)
    ok(core.every((e) => e.section), 'and every entry names its section')
    await page.locator('[data-title-settings]').click()
    const shown = new Set()
    const sections = []
    for (const tab of ['appearance', 'terminal', 'agents', 'dictation', 'diagnostics', 'about']) {
      await page.locator(`[data-settings-tab="${tab}"]`).click()
      // Default shell is drawn once main has listed the shells.
      if (tab === 'terminal') await page.locator('[data-pref="term-shell"]').waitFor({ timeout: 10000 })
      await sleep(400)
      const seen = await page.evaluate(() => ({
        ids: [...document.querySelectorAll('[data-pref]')].map((e) => e.getAttribute('data-pref')),
        sections: [...document.querySelectorAll('[data-settings-section]')].map((s) => ({
          id: s.getAttribute('data-settings-section'),
          panels: s.querySelectorAll('[data-settings-panel]').length,
          ids: [...s.querySelectorAll('[data-pref]')].map((e) => e.getAttribute('data-pref'))
        }))
      }))
      for (const id of seen.ids) shown.add(id)
      sections.push(...seen.sections)
      await page.screenshot({ path: resolve(process.cwd(), `.e2e-shots/settings-${tab}.png`) }).catch(() => {})
    }
    const missing = wanted.filter((id) => !shown.has(id))
    ok(missing.length === 0, `every terminal option is on the page (missing: ${JSON.stringify(missing)})`)
    // ONE ORDER IN BOTH APPS (owner, 2026-09-22), PER SECTION since the
    // grouped cards (2026-10-05): which page holds a core section is each
    // app's, but inside one the rows come in the list's own order, whatever
    // of this app's own sits between them. Prism's e2e asserts the same.
    for (const s of [...new Set(core.map((e) => e.section))]) {
      const list = core.filter((e) => e.section === s).map((e) => e.id)
      const drawn = sections.filter((x) => x.id === s)
      ok(drawn.length === 1, `the core section ${s} is drawn once (${drawn.length})`)
      if (drawn.length !== 1) continue
      ok(drawn[0].panels === 1, `and is one panel (${drawn[0].panels})`)
      const order = drawn[0].ids.filter((id) => list.includes(id))
      ok(JSON.stringify(order) === JSON.stringify(list), `${s}: its rows come in the shared order (${order.join(' > ')})`)
    }
    // What is left must be THIS APP's rows, a closed list (appOptions.ts): a
    // terminal-looking row outside the core's lists is a fork.
    const own = entries('src/renderer/src/components/settings/appOptions.ts').map((e) => e.id)
    ok(own.length >= 9 && own.includes('window-edges') && own.includes('taskbar-badge'), `this app's own rows are listed (${own.length})`)
    const extra = [...shown].filter((id) => !wanted.includes(id) && !own.includes(id))
    ok(extra.length === 0, `and nothing else claims to be a setting (extra: ${JSON.stringify(extra)})`)
    ok(own.every((id) => shown.has(id)), `and every one of them is drawn (${own.filter((id) => !shown.has(id))})`)
    ok((await page.locator('[data-pref="confirm-close"]').count()) === 0, 'the close question is not a setting any more')
    ok((await page.locator('[data-pref="dictation-gpu"]').count()) === 0, 'the GPU row is not offered without an NVIDIA card')

    // AND IT IS LAID OUT (#20). The rows above all existed and all worked while
    // the page was a ruin: core/ sits outside the folder Tailwind scans, so
    // every utility used only by the shared sections was never generated, and
    // a check that a row EXISTS cannot see that. Measured, so it can.
    await page.locator('[data-settings-tab="dictation"]').click()
    await page.locator('[data-dictation-item="base"]').waitFor({ timeout: 8000 })
    const dictRow = await page.evaluate(() => {
      const r = document.querySelector('[data-dictation-item="base"]')
      return r ? { pad: parseFloat(getComputedStyle(r).paddingTop), w: Math.round(r.getBoundingClientRect().width) } : null
    })
    ok(!!dictRow && dictRow.pad >= 8 && dictRow.w > 400, `the model manager is laid out (${JSON.stringify(dictRow)})`)
    const layout = async () =>
      page.evaluate(() => {
        const box = (e) => e.getBoundingClientRect()
        const cards = [...document.querySelectorAll('[data-term-card]')].map(box)
        const rows = [...document.querySelectorAll('[data-setting-row]')]
        const tile = rows[0]?.firstElementChild?.firstElementChild
        const panel = document.querySelector('[data-settings-panel]')
        const second = rows.find((r) => r.previousElementSibling?.hasAttribute('data-setting-row'))
        const rule = second ? getComputedStyle(second, '::before') : null
        const radius = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--p-radius')) || 0
        let overlaps = 0
        for (const row of document.querySelectorAll('[data-pref]')) {
          const b = [...row.querySelectorAll('button')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0)
          for (let i = 0; i < b.length; i += 1)
            for (let j = i + 1; j < b.length; j += 1)
              if (b[i].left < b[j].right - 1 && b[j].left < b[i].right - 1 && b[i].top < b[j].bottom - 1 && b[j].top < b[i].bottom - 1) overlaps += 1
        }
        return {
          cardWidth: Math.round(cards[0]?.width ?? 0),
          cardRows: new Set(cards.map((c) => Math.round(c.top))).size,
          rowMin: rows.length ? Math.min(...rows.map((r) => Math.round(box(r).height))) : 0,
          rowPad: rows[0] ? parseFloat(getComputedStyle(rows[0]).paddingTop) : 0,
          tile: tile ? `${Math.round(box(tile).width)}x${Math.round(box(tile).height)}` : null,
          panelRadius: panel ? parseFloat(getComputedStyle(panel).borderTopLeftRadius) : -1,
          wantRadius: Math.max(4, radius + 3),
          ruleLeft: rule ? parseFloat(rule.left) : -1,
          overlaps
        }
      })
    const pages = {}
    for (const tab of ['appearance', 'terminal', 'agents', 'dictation', 'diagnostics', 'about']) {
      await page.locator(`[data-settings-tab="${tab}"]`).click()
      if (tab === 'terminal') await page.locator('[data-pref="term-shell"]').waitFor({ timeout: 10000 })
      await sleep(300)
      pages[tab] = await layout()
    }
    const a = pages.appearance
    ok(a.cardWidth >= 150, `a theme card is a card, not a sliver (${a.cardWidth}px wide)`)
    ok(a.cardRows >= 2, `and the wall wraps into rows (${a.cardRows})`)
    for (const [tab, l] of Object.entries(pages)) {
      ok(l.rowMin >= 58 && l.rowPad >= 8, `${tab}: every row is at least 58px tall, with its padding (${l.rowMin}px, ${l.rowPad}px)`)
      ok(l.tile === '32x32', `${tab}: the icon tile is 32px (${l.tile})`)
      ok(Math.abs(l.panelRadius - l.wantRadius) < 0.5, `${tab}: a panel's corner is the radius plus 3px, at least 4px (${l.panelRadius} vs ${l.wantRadius})`)
      if (l.ruleLeft >= 0) ok(Math.abs(l.ruleLeft - 60) < 0.5, `${tab}: the hairline between rows starts after the icon column (${l.ruleLeft}px)`)
      ok(l.overlaps === 0, `${tab}: no two controls in a row overlap (${l.overlaps} do)`)
    }
    await closeApp(app)
  },

  /**
   * THE DIAGNOSTICS LOG (#140; owner, 2026-10-07: "robust logging and
   * debugging ... especially to catch stalls"). Each problem is made on
   * purpose and then found in <profile>\logs\diag.jsonl, the file the owner's
   * "it stalled just now" is read from: a 2.5 s busy loop in the page (a
   * page-stall naming the script, the crumbs before it, and the stack main
   * took while it spun), a call main answers after 600 ms (`e2e:slow-ipc`,
   * --e2e only), a thrown error and a rejected promise. Then the Diagnostics
   * page: Open folder, Mark, and Detailed logging kept across a relaunch.
   * And the quiet level is quiet: an idle 3 s writes nothing.
   */
  async diagLog(ok) {
    const w = world()
    const file = join(w.profile, 'logs', 'diag.jsonl')
    const read = () => {
      try {
        return readFileSync(file, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((l) => {
            try {
              return JSON.parse(l)
            } catch {
              return { bad: l }
            }
          })
      } catch {
        return []
      }
    }
    // Lines land in batches (the page's every 250 ms, the writer's every
    // 250 ms), so every look waits for its line.
    const has = (fn, ms = 10000) => until(() => read().find(fn) ?? false, ms, 100)
    let { app, page } = await launch(w, { args: [w.alpha] })
    try {
      await until(async () => (await tabLabels(page)).length === 1)
      const session = await has((l) => l.k === 'session')
      ok(!!session && session.src === 'main' && session.e2e === true && session.verbose === false && typeof session.version === 'string' && session.pid > 0,
        `a session line opens the log (${JSON.stringify(session && { version: session.version, electron: session.electron, verbose: session.verbose })})`)
      ok(!!(await has((l) => l.k === 'crumb' && l.a === 'shell-spawn' && l.src === 'main')), 'the restored tab\'s shell is a crumb, from main')
      // A tab opened by the user (the launch's own tab is a restore).
      await page.waitForFunction(() => /PS [^>]*>\s*$/.test((document.querySelector('.xterm .xterm-rows')?.textContent ?? '').trimEnd()), null, { timeout: 45000 })
      await page.keyboard.press('Control+t')
      ok(!!(await until(async () => (await tabLabels(page)).length === 2)), 'Ctrl+T opens a second tab')
      ok(!!(await has((l) => l.k === 'crumb' && l.a === 'tab-open' && l.src === 'page')), 'and the tab that opened is a crumb, from the page')

      // QUIET IS QUIET: once both shells are at their prompts, an idle 3 s
      // writes nothing (no heartbeat, no canary, no timer is a line of its own).
      await page.waitForFunction(() => {
        const rows = [...document.querySelectorAll('.xterm .xterm-rows')]
        return rows.length > 0 && rows.every((r) => /PS [^>]*>\s*$/.test((r.textContent ?? '').trimEnd()))
      }, null, { timeout: 45000 })
      await sleep(1000)
      const idleFrom = read().length
      await sleep(3000)
      const idle = read().slice(idleFrom)
      ok(idle.length === 0, `an idle 3 s at the quiet level writes nothing (${JSON.stringify(idle.map((l) => l.k))})`)

      // A STALL: 2.5 s of the page's thread, started by a named timer.
      await page.evaluate(() => {
        setTimeout(function diagE2eBusy() {
          const end = performance.now() + 2500
          while (performance.now() < end) {
            /* spin */
          }
        }, 0)
      })
      const stall = await has((l) => l.k === 'page-stall' && l.ms >= 2000)
      ok(!!stall && stall.src === 'page', `the busy loop is a page-stall (${stall?.ms} ms)`)
      const scripts = Array.isArray(stall?.scripts) ? stall.scripts : []
      ok(scripts.some((x) => x && (x.fn === 'diagE2eBusy' || /setTimeout/i.test(x.invoker ?? ''))),
        `with the script that ran named (${JSON.stringify(scripts)})`)
      const crumbs = Array.isArray(stall?.crumbs) ? stall.crumbs : []
      ok(crumbs.some((c) => c && c.a === 'tab-open'), `and the crumbs said before it (${JSON.stringify(crumbs)})`)
      // page-stack is kept (task 11, MEASURED): the stack main took while the
      // page spun, written because a page-stall overlapping it arrived.
      const stack = await has((l) => l.k === 'page-stack', 6000)
      ok(!!stack && /diagE2eBusy/.test(stack.stack ?? '') && stack.ms >= 2000, `main took the spinning page's stack (${stack ? `${stack.ms} ms, ${String(stack.stack).split('\n')[1]?.trim()}` : 'none'})`)

      // A SLOW CALL: main answers after 600 ms.
      ok((await page.evaluate(() => window.prism.e2eSlowIpc())) === true, 'the slow call answers')
      const slow = await has((l) => l.k === 'ipc-slow' && l.ch === 'e2e:slow-ipc')
      ok(!!slow && slow.ms >= 500 && slow.ok === true, `and is an ipc-slow line naming its channel (${slow?.ms} ms)`)

      // ERRORS: thrown in a timer, so it reaches the page's own handler (one
      // thrown inside evaluate is Playwright's), and a rejection nobody holds.
      await page.evaluate(() => {
        setTimeout(() => {
          throw new Error('diag-e2e-thrown')
        }, 0)
        void Promise.reject(new Error('diag-e2e-rejected'))
      })
      const thrown = await has((l) => l.k === 'page-error' && /diag-e2e-thrown/.test(l.msg ?? ''))
      ok(!!thrown && /diag-e2e-thrown/.test(thrown.stack ?? ''), 'a thrown error is a page-error, with its stack')
      ok(!!(await has((l) => l.k === 'page-rejection' && /diag-e2e-rejected/.test(l.msg ?? ''))), 'a rejected promise is a page-rejection')

      // THE PAGE: the folder, Mark, Detailed logging.
      const folderRow = await gotoPref(page, 'diag-folder')
      ok(!!(await has((l) => l.k === 'crumb' && l.a === 'settings-page' && l.page === 'diagnostics')), 'opening the page is a crumb')
      const shownDir = await until(async () => ((await folderRow.textContent()) ?? '').includes(join(w.profile, 'logs')), 5000, 100)
      ok(!!shownDir, 'Log files shows the folder the log is in')
      await folderRow.locator('button').click()
      const opened = await until(() => app.evaluate(() => globalThis.__e2eOpenedPaths ?? []).then((x) => x.find((o) => o.abs === join(w.profile, 'logs')) ?? false), 4000, 100)
      ok(!!opened, 'Open folder opens that folder (recorded under --e2e)')
      // Its word sits in the middle of the button, as Open folder's does (the
      // first shot of the page had it at the top: a grid button's row starts there).
      const off = await page.evaluate(() => {
        const b = document.querySelector('[data-diag-mark]')
        // The TEXT's own box, through a Range: a stretched span is as tall as
        // the button whatever line its word sits on.
        const t = b?.querySelector('span')?.firstChild
        if (!b || !t) return null
        const r = document.createRange()
        r.selectNodeContents(t)
        const [bb, tb] = [b.getBoundingClientRect(), r.getBoundingClientRect()]
        return Math.abs(bb.top + bb.height / 2 - (tb.top + tb.height / 2))
      })
      ok(off !== null && off <= 1, `Mark's word is centred in its button (${off?.toFixed(1)}px off)`)
      const markAt = Date.now()
      await page.locator('[data-diag-mark]').click()
      ok(!!(await until(async () => (await page.locator('[data-diag-mark] span').last().isVisible()), 2000, 50)), 'Mark says Marked')
      const mark = await has((l) => l.k === 'mark')
      ok(!!mark && mark.src === 'page' && Math.abs(Date.parse(mark.t) - markAt) < 3000, `and stamps the moment in the log (${mark?.t})`)
      const sw = page.locator('[data-pref="diag-verbose"] [role="switch"]')
      ok((await sw.getAttribute('aria-checked')) === 'false', 'Detailed logging is off by default')
      await sw.click()
      ok(!!(await has((l) => l.k === 'verbose' && l.on === true)), 'switching it on is a line')
      // The log's own diag: channels are never timed, so an app call.
      await page.evaluate(() => window.prism.homeDir())
      ok(!!(await has((l) => l.k === 'ipc' && l.ch && !l.ch.startsWith('diag:'))), 'and every call is logged from then on')
      await closeApp(app)
      ok(read().at(-1)?.k === 'quit', `a quit is the session's last line (${read().at(-1)?.k})`)

      // KEPT ACROSS A RELAUNCH: main reads it from <userData>\diag.json.
      ;({ app, page } = await launch(w, { args: [w.alpha] }))
      const second = await has((l, i, all) => l.k === 'session' && all.slice(0, i).some((x) => x.k === 'session'))
      ok(!!second && second.verbose === true, `the next session starts detailed (${second?.verbose})`)
      await gotoPref(page, 'diag-verbose')
      ok(!!(await until(async () => (await page.locator('[data-pref="diag-verbose"] [role="switch"]').getAttribute('aria-checked')) === 'true', 5000, 100)), 'and the switch says so')
      ok(read().every((l) => !l.bad), 'every line in the file is one JSON object')
    } finally {
      await closeApp(app)
    }
  },

  /**
   * THE GROUPED CARDS LOOK RIGHT (2026-10-05; spec 1.2, 1.3 and #20: a page
   * that works is not a page that looks right). On a dark theme (Pitch), a
   * light one (Paper) and with acrylic on: the label and the subtext read
   * 4.5:1 on the panel as composited over the ground, a warning subtext too,
   * the icon 3:1; the chosen rail page is the grey `--p-hover-hi` and not the
   * accent; the only accent-filled buttons are Save changes; nothing scrolls
   * sideways at 900 and 1600px; under 760px the rail is icons. Every page is
   * shot in both schemes into .e2e-shots/settings-<page>-<scheme>.png, to be
   * LOOKED AT beside the approved mockup.
   */
  async settingsLook(ok) {
    const w = world()
    const { app, page } = await launch(w, { args: [w.alpha], env: { PT_E2E_NVIDIA: '1', PT_DICTATION_ROOT: join(w.profile, 'dictation') } })
    await until(async () => (await tabLabels(page)).length === 1)
    const setSize = (wd, ht) => app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0].setSize(s[0], s[1]), [wd, ht])
    await setSize(1600, 1000)
    const measure = () =>
      page.evaluate(() => {
        const parse = (c) => {
          const span = document.createElement('span')
          span.style.color = c
          document.body.appendChild(span)
          const v = getComputedStyle(span).color
          span.remove()
          // color-mix() computes to color(srgb r g b / a), in 0..1.
          const n = (v.replace(/^color\(srgb/, '').match(/[\d.]+/g) ?? []).map(Number)
          const unit = v.startsWith('color(') ? 255 : 1
          return { rgb: n.slice(0, 3).map((x) => x * unit), a: n.length > 3 ? n[3] : 1 }
        }
        const over = (top, under) => top.rgb.map((v, i) => under[i] + (v - under[i]) * top.a)
        const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
        const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
        const ratio = (x, y) => {
          const [a, b] = [lum(x), lum(y)]
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
        }
        const root = getComputedStyle(document.documentElement)
        const solid = parse(root.getPropertyValue('--p-bg-solid').trim()).rgb
        const panelEl = document.querySelector('[data-settings-panel]')
        const panelGround = panelEl ? over(parse(getComputedStyle(panelEl).backgroundColor), solid) : solid
        const row = document.querySelector('[data-setting-row]')
        const label = row?.querySelector('label')
        const sub = row?.querySelector('[title]')
        const tile = row?.firstElementChild?.firstElementChild
        const warn = document.querySelector('[data-setting-row] [title] svg')?.closest('[title]')
        const ink = (el) => (el ? over(parse(getComputedStyle(el).color), panelGround) : null)
        const chosen = document.querySelector('[data-settings-tab][aria-current="page"]')
        const accentFilled = [...document.querySelectorAll('button')].filter((b) => {
          const bg = getComputedStyle(b).backgroundColor
          const acc = parse(root.getPropertyValue('--p-accent').trim())
          const mine = parse(bg)
          return mine.a > 0.3 && mine.rgb.join() === acc.rgb.join()
        })
        return {
          label: label ? ratio(ink(label), panelGround) : 0,
          sub: sub ? ratio(ink(sub), panelGround) : 0,
          icon: tile ? ratio(ink(tile), over(parse(getComputedStyle(tile).backgroundColor), panelGround)) : 0,
          warn: warn ? ratio(ink(warn), panelGround) : null,
          chosen: chosen ? parse(getComputedStyle(chosen).backgroundColor) : null,
          hoverHi: parse(root.getPropertyValue('--p-hover-hi').trim()),
          accent: parse(root.getPropertyValue('--p-accent').trim()),
          accentButtons: accentFilled.map((b) => (b.hasAttribute('data-save-term') ? 'save' : b.textContent.trim())),
          sideways: document.querySelector('[data-settings-page]').scrollWidth > document.querySelector('[data-settings-page]').clientWidth + 1
        }
      })
    const pages = ['appearance', 'terminal', 'agents', 'dictation', 'diagnostics', 'about']
    try {
      await page.locator('[data-title-settings]').click()
      for (const [scheme, theme] of [['dark', 'pitch'], ['light', 'paper']]) {
        await gotoPref(page, 'term-theme')
        await page.locator(`[data-term-card="${theme}"]`).first().click()
        await until(() => page.evaluate((m) => document.documentElement.dataset.mode === m, scheme), 6000, 50)
        // A warning subtext to measure: dictation on with no model.
        await page.evaluate(() => localStorage.setItem('prism.dictation.enabled', '1'))
        for (const p of pages) {
          await page.locator(`[data-settings-tab="${p}"]`).click()
          await sleep(500)
          const m = await measure()
          ok(m.label >= 4.5 && m.sub >= 4.5, `${scheme} ${p}: label and subtext read on the panel (${m.label.toFixed(1)}:1, ${m.sub.toFixed(1)}:1)`)
          ok(m.icon >= 3, `${scheme} ${p}: the icon reads 3:1 on its tile (${m.icon.toFixed(1)}:1)`)
          if (m.warn !== null) ok(m.warn >= 4.5, `${scheme} ${p}: a warning subtext reads 4.5:1 (${m.warn.toFixed(1)}:1)`)
          ok(!!m.chosen && m.chosen.rgb.join() === m.hoverHi.rgb.join() && Math.abs(m.chosen.a - m.hoverHi.a) < 0.02, `${scheme} ${p}: the chosen rail page is the grey fill (${JSON.stringify(m.chosen)})`)
          ok(!!m.chosen && m.chosen.rgb.join() !== m.accent.rgb.join(), `${scheme} ${p}: and not the accent`)
          ok(m.accentButtons.every((b) => b === 'save'), `${scheme} ${p}: the only accent-filled buttons are Save changes (${JSON.stringify(m.accentButtons)})`)
          ok(!m.sideways, `${scheme} ${p}: nothing scrolls sideways at 1600px`)
          await page.screenshot({ path: resolve(process.cwd(), `.e2e-shots/settings-${p}-${scheme}.png`) }).catch(() => {})
        }
        await page.evaluate(() => localStorage.setItem('prism.dictation.enabled', '0'))
      }
      // Lit Save changes: an agent colour of one's own, on both pages that
      // carry the button (Q3), and they light together.
      const field = (await gotoPref(page, 'agent-color')).locator('input:not([type])')
      await field.fill('#3da9fc')
      await field.press('Enter')
      ok(!!(await until(async () => !(await page.locator('[data-save-term]').isDisabled()), 4000, 50)), 'an agent colour of your own lights Mark colours\' Save changes')
      await gotoPref(page, 'term-theme')
      ok(!(await page.locator('[data-save-term]').isDisabled()), 'and the theme\'s Save changes with it')
      await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/settings-appearance-dirty.png') }).catch(() => {})
      await gotoPref(page, 'agent-color')
      await page.locator('[data-follow-theme="working"]').click()
      // Acrylic on: the panels stay one thin coat.
      await gotoPref(page, 'term-acrylic')
      const acr = page.locator('[data-pref="term-acrylic"] [role="switch"]')
      if ((await acr.getAttribute('aria-checked')) !== 'true') await acr.click()
      await sleep(600)
      const glass = await measure()
      ok(glass.label >= 4.5 && glass.sub >= 4.5, `with acrylic on, label and subtext still read (${glass.label.toFixed(1)}:1, ${glass.sub.toFixed(1)}:1)`)
      await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/settings-appearance-acrylic.png') }).catch(() => {})
      await acr.click()
      // 900px: still the full rail, nothing sideways.
      await setSize(900, 800)
      await sleep(500)
      ok(!(await measure()).sideways, 'nothing scrolls sideways at 900px')
      const railAt = async () =>
        page.evaluate(() => Math.round(document.querySelector('[data-settings-page] nav[aria-label="Settings pages"]').getBoundingClientRect().width))
      ok((await railAt()) >= 200, `at 900px the rail has its names (${await railAt()}px)`)
      // Under 760px of the frame: icons only, and the field behind a magnifier.
      await setSize(700, 800)
      await sleep(500)
      ok(!!(await until(async () => (await railAt()) <= 60, 3000, 50)), `under 760px the rail is icons (${await railAt()}px)`)
      const label = page.locator('[data-settings-tab="appearance"] span').last()
      ok(!(await label.isVisible()), 'with the page names hidden')
      ok(!(await measure()).sideways, 'and nothing scrolls sideways')
      await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/settings-narrow.png') }).catch(() => {})
      const find = page.locator('[data-settings-find]')
      await find.click()
      await page.keyboard.type('font')
      ok(!!(await until(async () => (await find.evaluate((el) => el.getBoundingClientRect().width)) > 200, 3000, 50)), 'the magnifier opens the field over the pane')
      await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/settings-narrow-search.png') }).catch(() => {})
      await page.keyboard.press('Escape')
      await setSize(1600, 1000)
    } finally {
      await closeApp(app)
    }
  },

  /**
   * FIND A SETTING (2026-10-05; spec 1.2, 1.3, 1.6): every row in the index is
   * found by its own label and opened, landing on screen, flashed and holding
   * the keyboard; by keyboard alone from the field to a control; Escape
   * clears; no status line without a query; a word that matches nothing says
   * so. The index is the app's own (settingsIndex.ts), read as text.
   */
  async settingsSearch(ok) {
    const w = world()
    const { app, page } = await launch(w, { args: [w.alpha], env: { PT_E2E_NVIDIA: '0', PT_DICTATION_ROOT: join(w.profile, 'dictation') } })
    await until(async () => (await tabLabels(page)).length === 1)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1600, 1000))
    const labelOf = {}
    for (const file of ['core/renderer/settings/options.ts', 'core/renderer/settings/dictationOptions.ts', 'core/renderer/settings/helpOptions.ts', 'src/renderer/src/components/settings/appOptions.ts'])
      for (const m of readFileSync(resolve(process.cwd(), file), 'utf8').matchAll(/\{\s*id: '([a-z-]+)'[^}]*\}/g))
        if (!m[0].includes('onlyWhere')) labelOf[m[1]] = (m[0].match(/label: '([^']+)'/) ?? [])[1]
    const order = [...readFileSync(resolve(process.cwd(), 'src/renderer/src/components/settings/settingsIndex.ts'), 'utf8').matchAll(/'([a-z]+(?:-[a-z]+)+|[a-z]+-[a-z]+)'/g)].map((m) => m[1])
    const ids = [...new Set(order.filter((id) => labelOf[id]))]
    ok(ids.length >= 30, `the index covers every row drawn on this PC (${ids.length})`)
    const find = page.locator('[data-settings-find]')
    const status = page.locator('[data-settings-page] [role="status"]')
    try {
      await page.locator('[data-title-settings]').click()
      await find.waitFor({ timeout: 8000 })
      ok((await status.count()) === 0, 'with nothing typed there is no status line')
      // An empty field lets Escape through to the host: it wears the
      // owns-Escape mark only while it holds text (Prism's App yields to any
      // element wearing it, and this field is always on the page).
      ok((await find.getAttribute('data-owns-escape')) === null, 'an empty field does not claim Escape')
      await find.fill('font')
      ok((await find.getAttribute('data-owns-escape')) !== null, 'a field holding text does')
      await find.fill('')
      // Every row's control is a group named by the row's label, so a
      // segmented control's options say which setting they set.
      await gotoPref(page, 'tab-width')
      ok((await page.locator('[data-pref="tab-width"] [role="group"]').getAttribute('aria-label')) === labelOf['tab-width'], 'a row names its controls by its label')
      // EVERY ROW, BY ITS OWN LABEL (spec 1.6: the index can drift from the
      // page, and opening every entry is what catches it).
      const misses = []
      for (const id of ids) {
        await find.fill(labelOf[id])
        const first = page.locator('[data-settings-page] [role="option"]').first()
        if (!(await until(async () => (await first.count()) === 1, 3000, 30))) {
          misses.push(`${id}: nothing found`)
          continue
        }
        const hit = await first.getAttribute('data-hit')
        if (hit !== id) {
          misses.push(`${id}: first result is ${hit}`)
          continue
        }
        await first.click()
        const landed = await until(
          () =>
            page.evaluate((pref) => {
              const row = document.querySelector(`[data-pref="${pref}"]`)
              if (!row) return null
              const r = row.getBoundingClientRect()
              const onScreen = r.bottom > 0 && r.top < innerHeight
              return onScreen && row.hasAttribute('data-flash') && row.contains(document.activeElement) ? true : null
            }, id),
          4000,
          30
        )
        if (!landed) misses.push(`${id}: not on screen, flashed and focused`)
        ok((await find.inputValue()) === '', `${id}: choosing a result clears the field`)
      }
      ok(misses.length === 0, `every row is found by its label and opened (${JSON.stringify(misses)})`)
      // KEYBOARD ONLY: the field, Down, Enter, and the control has the focus.
      await find.focus()
      await page.keyboard.type('explorer')
      ok(!!(await until(async () => ((await status.textContent().catch(() => '')) ?? '').includes('result'), 3000, 50)), `a status line says how many (${await status.textContent().catch(() => '')})`)
      await page.keyboard.press('ArrowDown')
      ok(await page.evaluate(() => document.activeElement?.getAttribute('role') === 'option'), 'Down moves to the first result')
      await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/settings-search.png') }).catch(() => {})
      await page.keyboard.press('Enter')
      ok(
        !!(await until(() => page.evaluate(() => !!document.activeElement?.closest('[data-pref="explorer-verb"]')), 4000, 30)),
        'Enter opens it with the keyboard on the row\'s control'
      )
      ok((await page.locator('[data-settings-tab="terminal"]').getAttribute('aria-current')) === 'page', 'on the page that holds it')
      // Escape clears; no status line is left behind.
      await find.focus()
      await page.keyboard.type('colour')
      await until(async () => (await status.count()) === 1, 3000, 50)
      ok((await page.locator('[data-settings-tab][aria-current="page"]').count()) === 0, 'while results are up no page is chosen in the rail')
      await page.keyboard.press('Escape')
      ok((await find.inputValue()) === '' && (await status.count()) === 0, 'Escape clears the field and the status line goes')
      // Nothing found.
      await find.fill('zebra')
      ok(!!(await until(async () => ((await status.textContent().catch(() => '')) ?? '') === 'No results', 3000, 50)), 'a word that matches nothing says No results')
      ok(((await page.locator('[data-settings-nothing]').textContent()) ?? '').includes('Nothing matches zebra'), 'and the pane says what was not found')
      await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/settings-search-empty.png') }).catch(() => {})
      await find.fill('')
    } finally {
      await closeApp(app)
    }
  },

  /** THE RAIL BY KEYBOARD (2026-10-05, spec 1.3): Tab goes field, rail, page;
   *  Up and Down walk the rail, Home and End jump; the chosen page says so. */
  async settingsKeys(ok) {
    const w = world()
    const { app, page } = await launch(w, { args: [w.alpha] })
    await until(async () => (await tabLabels(page)).length === 1)
    try {
      await page.locator('[data-title-settings]').click()
      const find = page.locator('[data-settings-find]')
      await find.waitFor({ timeout: 8000 })
      await find.focus()
      await page.keyboard.press('Tab')
      const at = () => page.evaluate(() => document.activeElement?.getAttribute('data-settings-tab') ?? document.activeElement?.tagName ?? null)
      ok((await at()) === 'appearance', `Tab from the field lands on the rail's first page (${await at()})`)
      await page.keyboard.press('ArrowDown')
      ok((await at()) === 'terminal', `Down walks the rail (${await at()})`)
      await page.keyboard.press('End')
      ok((await at()) === 'about', `End jumps to the last (${await at()})`)
      await page.keyboard.press('Home')
      ok((await at()) === 'appearance', `Home to the first (${await at()})`)
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('Enter')
      ok((await page.locator('[data-settings-tab="agents"]').getAttribute('aria-current')) === 'page', 'Enter opens it, and the rail says it is the page')
      ok((await page.locator('[data-settings-tab][aria-current]').count()) === 1, 'one page at a time')
      ok((await page.locator('nav[aria-label="Settings pages"]').count()) === 1, 'the rail is a navigation landmark')
      for (let i = 0; i < 6; i += 1) await page.keyboard.press('Tab')
      ok(await page.evaluate(() => !!document.activeElement?.closest('[data-settings-section]')), 'Tab goes on from the rail into the page')
    } finally {
      await closeApp(app)
    }
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
  /**
   * SWITCHING THEME (owner, 2026-09-23): "custom should come before default";
   * a switch takes the picked background and accent with it; and with unsaved
   * changes (Save changes lit) a pick asks first: Save as Custom, Discard or
   * Cancel, each doing what it says. Driven on the page as a user would.
   */
  async themeSwitch(ok) {
    const w = world()
    const { app, page } = await launch(w, { args: [w.alpha] })
    const store = () =>
      page.evaluate(() => ({
        theme: localStorage.getItem('prism.term.theme'),
        accent: localStorage.getItem('prism.window.accent'),
        background: localStorage.getItem('prism.window.background'),
        agent: localStorage.getItem('prism.term.agentColor'),
        pct: localStorage.getItem('prism.term.fontPct'),
        font: localStorage.getItem('prism.term.font'),
        indicator: localStorage.getItem('prism.term.agentIndicator'),
        edges: localStorage.getItem('prism.window.edges'),
        custom: localStorage.getItem('prism.term.custom')
      }))
    const ask = page.locator('[data-theme-switch-ask]')
    // The agent working colour, through its own field: a THEME setting, so it
    // lights Save changes. (The font size did, until it left the theme's
    // setup on 2026-09-28.)
    const agentColour = async (hex) => {
      await gotoPref(page, 'agent-color')
      const f = page.locator('[data-pref="agent-color"] input:not([type])')
      await f.fill(hex)
      await f.press('Enter')
      await sleep(200)
    }
    const pickFrom = async (pref, label) => {
      await gotoPref(page, pref)
      await page.locator(`[data-pref="${pref}"] button[aria-haspopup="listbox"]`).click()
      await page.locator('[role="listbox"] [role="option"]', { hasText: label }).first().click()
      await sleep(200)
    }
    try {
      await page.locator('[data-title-settings]').click()
      await page.locator('[data-settings-tab="appearance"]').click()
      await page.locator('[data-term-card]').first().waitFor({ timeout: 10000 })

      // WHAT NO THEME OWNS SITS ABOVE THE WALL, WHAT A THEME SETS UNDER IT
      // (owner, 2026-09-28). Since the grouped cards (2026-10-05) the font
      // and the agent rows have pages of their own; Appearance keeps the
      // window's rows above the theme and what a theme sets under it.
      const rows = await page.evaluate(() => [...document.querySelectorAll('[data-pref]')].map((e) => e.getAttribute('data-pref')))
      const want = ['tab-width', 'title-bar', 'window-edges', 'term-theme', 'window-background', 'window-accent', 'term-acrylic']
      ok(JSON.stringify(rows) === JSON.stringify(want), `Appearance runs ${want.join(' > ')} (${rows.join(' > ')})`)
      // Font size is 50% to 200% in tens.
      await gotoPref(page, 'term-font')
      await page.locator('[data-pref="term-font"] button[aria-haspopup="listbox"]').click()
      const sizes = await page.locator('[role="listbox"] [role="option"]').allTextContents()
      await page.keyboard.press('Escape')
      const tens = Array.from({ length: 16 }, (_, i) => `${50 + i * 10}%`)
      ok(JSON.stringify(sizes.map((x) => x.trim())) === JSON.stringify(tens), `font size offers 50% to 200% in tens (${sizes.map((x) => x.trim()).join(' ')})`)

      // A theme switch leaves the font, its size, the indicator's style and
      // the edges exactly as they were, and asks nothing about them.
      await pickFrom('term-font', '140%')
      await (await gotoPref(page, 'window-edges')).locator('[data-seg="solid"]').click()
      await (await gotoPref(page, 'agent-indicator')).locator('[data-seg="full"]').click()
      await gotoPref(page, 'term-font-family')
      const fontIds = await page.locator('[data-pref="term-font-family"] button[aria-haspopup="listbox"]').click().then(() =>
        page.locator('[role="listbox"] [role="option"]').allTextContents()
      )
      await page.locator('[role="listbox"] [role="option"]').nth(fontIds.length > 1 ? 1 : 0).click()
      await sleep(200)
      const mine = await store()
      await gotoPref(page, 'term-theme')
      ok(await page.locator('[data-save-term]').isDisabled(), 'none of them lights Save changes')
      await page.locator('[data-term-card="nord"]').first().click()
      await sleep(300)
      const switched = await store()
      ok((await ask.count()) === 0 && switched.theme === 'nord', 'a theme switch after them asks nothing')
      ok(
        switched.pct === mine.pct && switched.font === mine.font && switched.indicator === mine.indicator && switched.edges === mine.edges,
        `and keeps the font, size, indicator style and edges (${JSON.stringify({ pct: switched.pct, font: switched.font, indicator: switched.indicator, edges: switched.edges })})`
      )

      // A Custom to lead the wall: an agent colour, saved.
      await agentColour('#3DA9FC')
      // The Save in Mark colours' heading saves the same whole setup (Q3).
      await page.locator('[data-save-term]').click()
      await gotoPref(page, 'term-theme')
      await until(async () => (await page.locator('[data-term-card="custom"]').count()) === 1, 4000)
      const order = await page.evaluate(() => [...document.querySelectorAll('[data-term-card]')].slice(0, 2).map((c) => c.getAttribute('data-term-card')))
      ok(order[0] === 'custom' && order[1] === 'pt-default', `Custom comes first, then the default (${order.join(', ')})`)
      const savedCustom = JSON.parse((await store()).custom ?? '{}')
      ok(savedCustom.fontPct === undefined && savedCustom.font === undefined, 'Save as Custom carries no font and no size')

      // A picked background and accent, then a plain switch: both are forgotten.
      for (const [pref, hex] of [['window-background', '#202830'], ['window-accent', '#E07A2F']]) {
        const f = page.locator(`[data-pref="${pref}"] input:not([type])`)
        await f.fill(hex)
        await f.press('Enter')
      }
      const picked = await until(async () => {
        const s = await store()
        return s.accent && s.background ? s : null
      }, 4000)
      ok(!!picked, 'a background and an accent are picked')
      await gotoPref(page, 'term-theme')
      await page.locator('[data-term-card="pitch"]').first().click()
      await sleep(300)
      ok((await ask.count()) === 0, 'with nothing unsaved a theme switch asks nothing')
      const after = await store()
      ok(after.theme === 'pitch' && after.accent === null && after.background === null, `the switch takes the picked background and accent with it (${JSON.stringify({ ...after, custom: undefined })})`)

      // Unsaved: Cancel keeps everything as it was.
      await agentColour('#C0FFEE')
      const dirty = await store()
      await gotoPref(page, 'term-theme')
      await page.locator('[data-term-card="nord"]').first().click()
      ok(!!(await until(async () => (await ask.count()) === 1, 3000, 50)), 'with a change unsaved, picking a theme asks first')
      await page.locator('[data-ask-cancel]').click()
      const kept = await store()
      ok((await ask.count()) === 0 && kept.theme === 'pitch' && kept.agent === dirty.agent, `Cancel changes nothing (${JSON.stringify({ ...kept, custom: undefined })})`)
      // Discard: switches, and the change is gone.
      await page.locator('[data-term-card="nord"]').first().click()
      await ask.waitFor({ timeout: 3000 })
      await page.locator('[data-ask-discard]').click()
      const gone = await store()
      ok(gone.theme === 'nord' && gone.agent !== dirty.agent, `Discard switches and drops the change (${JSON.stringify({ ...gone, custom: undefined })})`)
      // Save as Custom: the change is kept in Custom, then the switch happens.
      await agentColour('#C0FFEE')
      await gotoPref(page, 'term-theme')
      await page.locator('[data-term-card="pitch"]').first().click()
      await ask.waitFor({ timeout: 3000 })
      await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/theme-switch-ask.png') }).catch(() => {})
      await page.locator('[data-ask-save]').click()
      const saved = await store()
      const custom = JSON.parse(saved.custom ?? '{}')
      ok(saved.theme === 'pitch' && custom.indicatorColor === dirty.agent, `Save as Custom keeps the change in Custom, then switches (${saved.theme}, custom colour ${custom.indicatorColor})`)
    } finally {
      await closeApp(app)
    }
  },

  /**
   * SETTINGS ASK NOTHING NOBODY CHANGED (code review 2026-09-24, PR 3):
   *  - #26 tabbing through a colour that follows the theme leaves it following.
   *  - #28 the colour editor opened by keyboard takes the focus, keeps Tab
   *    inside, closes on Escape and gives the focus back to the pencil.
   *  - #8, #29 its Save as Custom keeps the saved font size, and forgets the
   *    picked background so the edited one shows.
   *  - #27 the dictation key capture refuses a letter, and a press elsewhere
   *    ends it.
   */
  async reviewSettings(ok) {
    const w = world()
    const { app, page } = await launch(w, { args: [w.alpha] })
    const get = (k) => page.evaluate((key) => localStorage.getItem(key), k)
    const inEditor = () => page.evaluate(() => !!document.activeElement?.closest('[data-theme-editor]'))
    try {
      await page.locator('[data-title-settings]').click()
      await page.locator('[data-settings-tab="appearance"]').click()
      await page.locator('[data-term-card]').first().waitFor({ timeout: 10000 })

      // #26
      for (const pref of ['agent-color', 'window-accent']) {
        await gotoPref(page, pref)
        await page.locator(`[data-pref="${pref}"] input:not([type])`).focus()
        await page.keyboard.press('Tab')
        await sleep(200)
      }
      ok((await get('prism.term.agentColor')) === null && (await get('prism.window.accent')) === null, 'tabbing through a colour that follows the theme leaves it following')
      await gotoPref(page, 'agent-color')
      ok((await page.locator('[data-follow-theme="working"]').count()) === 0, 'and offers no Reset')
      // #112: the row is now a code field AND a swatch; Tab walks both with the
      // picker shut, and still pins nothing.
      for (const pref of ['agent-color', 'agent-done-color', 'window-background']) {
        await gotoPref(page, pref)
        await page.locator(`[data-pref="${pref}"] input:not([type])`).focus()
        await page.keyboard.press('Tab')
        ok(await page.evaluate((p) => document.activeElement?.matches(`[data-pref="${p}"] [data-colour-swatch]`), pref), `Tab goes from ${pref}'s code field to its swatch`)
        await page.keyboard.press('Tab')
      }
      await sleep(200)
      ok(
        (await get('prism.term.agentColor')) === null && (await get('prism.term.agentDoneColor')) === null && (await get('prism.window.background')) === null,
        'tabbing through a shut picker stores nothing'
      )
      ok((await page.locator('[data-colour-popover]').count()) === 0, 'and opens none')

      // #28
      await page.locator('[data-term-card="pitch"]').first().click()
      const pencil = page.locator('[data-edit-theme="pitch"]')
      await pencil.focus()
      await page.keyboard.press('Enter')
      ok(!!(await until(inEditor, 3000, 50)), 'the editor opened by keyboard takes the focus')
      for (let i = 0; i < 25; i += 1) await page.keyboard.press('Tab')
      ok(await inEditor(), 'Tab stays inside the editor')
      await page.keyboard.press('Escape')
      ok(!!(await until(async () => (await page.locator('[data-theme-editor]').count()) === 0, 3000, 50)), 'Escape closes it')
      ok(await pencil.evaluate((el) => el === document.activeElement), 'and the focus is back on the pencil')

      // #112: an Escape aimed at a picker inside the editor is the picker's.
      await pencil.click()
      await page.locator('[data-theme-editor]').waitFor({ timeout: 3000 })
      await page.locator('[data-theme-editor] [data-colour-swatch][aria-label="Pick Foreground"]').click()
      const pop = page.locator('[data-colour-popover]')
      ok(!!(await until(async () => (await pop.count()) === 1, 3000, 50)), 'a well in the editor opens the picker')
      ok(await page.evaluate(() => !!document.activeElement?.closest('[data-colour-popover]')), 'which takes the focus')
      await page.keyboard.press('Escape')
      ok(!!(await until(async () => (await pop.count()) === 0, 3000, 50)), 'Escape closes the picker')
      ok(!(await until(async () => (await page.locator('[data-theme-editor]').count()) === 0, 600, 50)), 'and only the picker: the editor stays open')
      ok(await page.evaluate(() => document.activeElement?.matches('[data-colour-swatch][aria-label="Pick Foreground"]')), 'with the focus back on the swatch')
      await page.keyboard.press('Escape')
      await until(async () => (await page.locator('[data-theme-editor]').count()) === 0, 3000, 50)

      // #8, #29: a saved Custom with an agent colour, a picked background, then
      // an edit. (A font size until 2026-09-28, when the font left the theme.)
      await gotoPref(page, 'agent-color')
      const agent = page.locator('[data-pref="agent-color"] input:not([type])')
      await agent.fill('#3DA9FC')
      await agent.press('Enter')
      await page.locator('[data-save-term]').click()
      await gotoPref(page, 'term-theme')
      await until(async () => (await page.locator('[data-term-card="custom"]').count()) === 1, 4000)
      const bgField = page.locator('[data-pref="window-background"] input:not([type])')
      await bgField.fill('#202830')
      await bgField.press('Enter')
      ok(!!(await until(async () => (await get('prism.window.background')) !== null, 3000, 50)), 'a background is picked')
      await page.locator('[data-edit-theme="custom"]').click()
      const editBg = page.locator('[data-theme-editor] input[aria-label="Background"]')
      await editBg.fill('#101820')
      await editBg.press('Enter')
      await page.locator('[data-save-custom]').click()
      const custom = JSON.parse((await get('prism.term.custom')) ?? '{}')
      ok(custom.bg === '#101820' && custom.indicatorColor === '#3da9fc', `the editor's save keeps the saved agent colour (${JSON.stringify({ bg: custom.bg, indicatorColor: custom.indicatorColor })})`)
      ok((await get('prism.window.background')) === null, 'and forgets the picked background, so the edited one shows')

      // #27
      await page.evaluate(() => localStorage.setItem('prism.dictation.enabled', '1'))
      await page.locator('[data-settings-tab="dictation"]').click()
      const capture = page.locator('[data-hotkey-capture]')
      await capture.waitFor({ timeout: 8000 })
      const before = await get('prism.dictation.hotkey')
      await capture.click()
      await page.keyboard.press('KeyA')
      await sleep(200)
      ok((await capture.getAttribute('data-hotkey-capture')) === 'on' && (await get('prism.dictation.hotkey')) === before, 'a letter is not taken as the dictation key')
      await page.mouse.click(40, 300)
      ok(!!(await until(async () => (await capture.getAttribute('data-hotkey-capture')) === 'off', 2000, 50)), 'a press elsewhere ends the capture')
      await page.evaluate(() => localStorage.setItem('prism.dictation.enabled', '0'))
    } finally {
      await closeApp(app)
    }
  },

  /**
   * ONE COLOUR PICKER, WITH ALPHA, FOR EVERY COLOUR (#112; owner, 2026-10-03:
   * "an input field for a color code and an alpha per colour on every colour
   * setting colour picker"). Driven through the DOM contract the spec fixes
   * (Prism's gate is written against the same names):
   *  - the Working colour at half alpha: hex8 stored and shown, a see-through
   *    Full tab whose text reads on the composite;
   *  - opened and shut with no change stores nothing; a change then Escape
   *    gives the row back to the theme, with no Reset;
   *  - the format toggle (HEX, RGBA, HSLA), and a typed hsla() stores hex8;
   *  - the eyedropper, stubbed, keeps the alpha;
   *  - the theme editor: red at 40% and the text at 30%, saved as Custom, still
   *    read on the ground, come back with their alphas, and Save changes keeps
   *    them;
   *  - Command help (F1) and the update window each put the picker away.
   */
  async colourPicker(ok) {
    const w = world()
    const { app, page } = await launch(w, { args: ['--preview-update', w.alpha] })
    const shot = (name) => page.screenshot({ path: resolve(process.cwd(), `.e2e-shots/colour-picker-${name}.png`) }).catch(() => {})
    const get = (k) => page.evaluate((key) => localStorage.getItem(key), k)
    const pop = page.locator('[data-colour-popover][role="dialog"]')
    const popGone = async () => !!(await until(async () => (await pop.count()) === 0, 3000, 50))
    const rgba = (c) => {
      const n = (c.match(/[\d.]+/g) ?? []).map(Number)
      return { rgb: n.slice(0, 3), a: n.length > 3 ? n[3] : 1 }
    }
    const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.trim().slice(i, i + 2), 16))
    const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    const ratio = (x, y) => {
      const [a, b] = [lum(x), lum(y)]
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
    }
    try {
      // A shell stands in for Claude, mid-answer, as in `indicator`.
      await page.waitForFunction(
        () => /PS [^>]*>\s*$/.test((document.querySelector('.xterm .xterm-rows')?.textContent ?? '').trimEnd()),
        null,
        { timeout: 45000 }
      )
      await polled(page)
      await typeLine(page, "$Host.UI.RawUI.WindowTitle = [char]0x2733 + ' Claude Code'")
      await until(() => page.evaluate(() => !!document.querySelector('[data-agent-present]')), 8000, 50)
      await typeLine(page, "$Host.UI.RawUI.WindowTitle = [char]0x25D0 + ' Claude Code'")
      ok(!!(await until(() => page.evaluate(() => !!document.querySelector('[data-agent-state="working"]')), 8000, 50)), 'a working stand-in agent is on the strip')

      await gotoPref(page, 'agent-indicator')
      await page.locator('[data-pref="agent-indicator"] [data-seg="full"]').click()
      const row = page.locator('[data-pref="agent-color"]')
      const swatch = row.locator('[data-colour-swatch]')
      const field = row.locator('input:not([type])')
      const reset = row.locator('[data-follow-theme]')
      ok((await get('prism.term.agentColor')) === null, 'the working colour follows the theme to begin with')
      ok((await swatch.getAttribute('aria-label')) === 'Pick Agent working colour', 'the row has a swatch named for it')
      ok((await page.locator('input[type="color"]').count()) === 0, 'and no native colour input is left on the page')

      // Opened and shut with no change: nothing stored, no Reset.
      await swatch.click()
      ok(!!(await until(async () => (await pop.count()) === 1, 3000, 50)), 'the swatch opens the picker')
      ok((await pop.getAttribute('aria-label')) === 'Agent working colour', "named for the row's colour")
      const sliders = await pop.locator('[role="slider"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
      ok(JSON.stringify(sliders) === JSON.stringify(['Saturation and brightness', 'Hue', 'Alpha']), `with its three sliders (${sliders.join(', ')})`)
      ok((await pop.locator('button[data-colour-format]').textContent()) === 'HEX', 'and the format reads HEX')
      await shot('open')
      await page.keyboard.press('Escape')
      ok(await popGone(), 'Escape closes it')
      ok((await get('prism.term.agentColor')) === null && (await reset.count()) === 0, 'an open and close with no change stores nothing and shows no Reset')
      ok(await swatch.evaluate((el) => el === document.activeElement), 'and the focus is back on the swatch')

      // Half alpha, on the keyboard.
      await swatch.click()
      await until(async () => (await pop.count()) === 1, 3000, 50)
      const alpha = pop.locator('[role="slider"][aria-label="Alpha"]')
      await alpha.focus()
      const now = async () => Number(await alpha.getAttribute('aria-valuenow'))
      for (let i = 0; i < 40 && (await now()) > 50; i++) await page.keyboard.press((await now()) - 50 >= 10 ? 'Shift+ArrowLeft' : 'ArrowLeft')
      ok((await now()) === 50, `Shift+Left walks the alpha to 50 percent (${await now()})`)
      const stored = await until(async () => {
        const v = await get('prism.term.agentColor')
        return /^#[0-9a-f]{8}$/.test(v ?? '') ? v : null
      }, 3000, 50)
      ok(!!stored && stored.endsWith('80'), `the working colour is stored as hex8 (${stored})`)
      ok(/^#[0-9a-f]{8}$/.test(await field.inputValue()), `and the code field shows the eight digits (${await field.inputValue()})`)
      const tab = await until(async () => {
        const l = await page.evaluate(() => {
          const el = document.querySelector('[data-agent-state="working"]')
          if (!el) return null
          const cs = getComputedStyle(el)
          return { bg: cs.backgroundColor, ink: cs.color, ground: getComputedStyle(document.documentElement).getPropertyValue('--p-bg-solid') }
        })
        // Settled, not mid-transition: the fill eases between colours.
        return l && Math.abs(rgba(l.bg).a - 128 / 255) < 0.01 ? l : null
      }, 4000, 50)
      ok(!!tab, `the Full tab's fill carries the alpha (${tab?.bg})`)
      if (tab) {
        const f = rgba(tab.bg)
        const g = hexRgb(tab.ground)
        const seen = f.rgb.map((v, i) => g[i] + (v - g[i]) * f.a)
        const r = ratio(rgba(tab.ink).rgb, seen)
        ok(r >= 4.5, `the Full tab's text reads on the composite (${r.toFixed(1)}:1, ${tab.ink} on ${tab.bg} over ${tab.ground.trim()})`)
      }
      await page.locator('[data-tab-strip]').screenshot({ path: resolve(process.cwd(), '.e2e-shots/colour-picker-full-tab.png') }).catch(() => {})
      await shot('alpha')

      // Escape after a write: the row follows the theme again.
      await page.keyboard.press('Escape')
      ok(await popGone(), 'Escape closes the changed picker')
      ok(!!(await until(async () => (await get('prism.term.agentColor')) === null, 3000, 50)), 'and puts back a row that follows the theme')
      ok((await reset.count()) === 0, 'with no Reset showing')

      // The format toggle, and a typed hsla().
      await swatch.click()
      await until(async () => (await pop.count()) === 1, 3000, 50)
      const fmt = pop.locator('button[data-colour-format]')
      await fmt.click()
      ok((await fmt.textContent()) === 'RGBA' && /^rgba\(\d+, \d+, \d+, 1\)$/.test(await field.inputValue()), `RGBA shows rgba() (${await field.inputValue()})`)
      await fmt.click()
      ok((await fmt.textContent()) === 'HSLA' && /^hsla\(\d+, \d+%, \d+%, 1\)$/.test(await field.inputValue()), `HSLA shows hsla() (${await field.inputValue()})`)
      ok((await get('prism.term.colourFormat')) === 'hsla' && (await get('prism.term.agentColor')) === null, 'the toggle is remembered and stores no colour')
      await shot('hsla')
      await field.fill('hsla(200, 50%, 40%, 0.5)')
      await field.press('Enter')
      ok(!!(await until(async () => (await get('prism.term.agentColor')) === '#33779980', 3000, 50)), `a typed hsla() stores the same hex8 (${await get('prism.term.agentColor')})`)
      ok((await reset.count()) === 1, 'and the row offers Reset')
      await swatch.click()
      await until(async () => (await pop.count()) === 1, 3000, 50)
      await fmt.click()
      ok((await fmt.textContent()) === 'HEX' && (await field.inputValue()) === '#33779980', `back to HEX, the field is the stored form (${await field.inputValue()})`)

      // The eyedropper, stubbed: the screen's RGB, the colour's own alpha.
      await page.keyboard.press('Escape')
      await popGone()
      await page.evaluate(() => {
        window.EyeDropper = class {
          open() {
            return Promise.resolve({ sRGBHex: '#ff0000' })
          }
        }
      })
      await swatch.click()
      await until(async () => (await pop.count()) === 1, 3000, 50)
      const dropper = pop.locator('button[data-colour-eyedropper]')
      ok((await dropper.count()) === 1, 'the eyedropper is offered where the browser has one')
      await dropper.click()
      ok(!!(await until(async () => (await get('prism.term.agentColor')) === '#ff000080', 3000, 50)), `a dropped colour keeps the alpha (${await get('prism.term.agentColor')})`)
      await page.keyboard.press('Escape')
      await popGone()
      ok((await get('prism.term.agentColor')) === '#33779980', 'and Escape takes the drop back to what the picker opened with')

      // Command help and the update window each put the picker away.
      await swatch.click()
      await until(async () => (await pop.count()) === 1, 3000, 50)
      await page.keyboard.press('F1')
      ok(!!(await until(async () => (await page.locator('[data-help-panel], [role="dialog"][aria-label*="help" i]').count()) > 0, 4000, 50)), 'F1 opens Command help over the picker')
      ok(await popGone(), 'and the picker is gone')
      await page.keyboard.press('Escape')
      await sleep(300)
      await swatch.click()
      await until(async () => (await pop.count()) === 1, 3000, 50)
      // A click with no pointer press: only the update window taking the focus
      // can close the picker here.
      await page.evaluate(() => document.querySelector('[data-update-chip]')?.click())
      ok(!!(await until(async () => (await page.locator('[data-update-dialog]').count()) === 1, 4000, 50)), 'the update window opens')
      ok(await popGone(), 'and the picker is gone')
      ok((await get('prism.term.agentColor')) === '#33779980', 'neither layer changed the colour')
      await page.keyboard.press('Escape')
      await until(async () => (await page.locator('[data-update-dialog]').count()) === 0, 3000, 50)
      await row.locator('[data-follow-theme]').click()

      // The theme editor: red at 40%, the text at 30%, saved as Custom.
      await gotoPref(page, 'term-theme')
      await page.locator('[data-term-card="pitch"]').first().click()
      await page.locator('[data-edit-theme="pitch"]').click()
      const editor = page.locator('[data-theme-editor]')
      await editor.waitFor({ timeout: 4000 })
      const walk = async (well, to) => {
        await editor.locator(`[data-colour-swatch][aria-label="Pick ${well}"]`).click()
        await until(async () => (await pop.count()) === 1, 3000, 50)
        const a = pop.locator('[role="slider"][aria-label="Alpha"]')
        await a.focus()
        const v = async () => Number(await a.getAttribute('aria-valuenow'))
        for (let i = 0; i < 40 && (await v()) > to; i++) await page.keyboard.press((await v()) - to >= 10 ? 'Shift+ArrowLeft' : 'ArrowLeft')
        const got = await v()
        await page.keyboard.press('Tab') // stays inside, keeps the colour
        // A press outside the picker (on the editor's own title, not its
        // backdrop, which cancels the editor) keeps the colour and closes it.
        await editor.locator('text=Edit colours').click()
        await popGone()
        return got
      }
      ok((await walk('red', 40)) === 40 && (await walk('Foreground', 30)) === 30, 'red walks to 40 percent and the text to 30')
      // The preview card draws what the terminal draws (#113 review): the 30
      // percent text composited and floored to 4.5:1, not painted at 30.
      const card = async (id) =>
        page.evaluate((cardId) => {
          const box = document.querySelector(`[data-term-card="${cardId}"] > div`)
          if (!box) return null
          const rgb = (c) => (c.match(/[\d.]+/g) ?? []).map(Number)
          const cs = getComputedStyle(box)
          return { fg: rgb(cs.color), bg: rgb(cs.backgroundColor) }
        }, id)
      const cardRatio = (c) => (c ? ratio(c.fg.slice(0, 3), c.bg.slice(0, 3)) : 0)
      const preview = await card('custom-preview')
      ok(!!preview && (preview.fg[3] ?? 1) === 1 && cardRatio(preview) >= 4.5, `the editor's preview draws the 30 percent text as the terminal does (${cardRatio(preview).toFixed(2)}:1, ${preview?.fg})`)
      // The Selection's cap is 254/255: never announced as 100 percent opaque.
      await editor.locator('[data-colour-swatch][aria-label="Pick Selection"]').click()
      await until(async () => (await pop.count()) === 1, 3000, 50)
      const selAlpha = pop.locator('[role="slider"][aria-label="Alpha"]')
      ok((await selAlpha.getAttribute('aria-valuemax')) === '99', `the Selection's alpha tops out at 99 percent, not 100 (${await selAlpha.getAttribute('aria-valuemax')})`)
      await page.keyboard.press('Escape')
      await popGone()
      // The format toggle widens every code field, which moves the swatches in
      // the editor's grid: the open picker follows its own (#113 review).
      await editor.locator('[data-colour-swatch][aria-label="Pick Foreground"]').click()
      await until(async () => (await pop.count()) === 1, 3000, 50)
      const beside = async () => {
        await sleep(100)
        return page.evaluate(() => {
          const sw = document.querySelector('[data-colour-swatch][aria-label="Pick Foreground"]').getBoundingClientRect()
          const p = document.querySelector('[data-colour-popover]').getBoundingClientRect()
          const under = Math.abs(p.top - (sw.bottom + 6)) <= 1.5 || Math.abs(p.bottom - (sw.top - 6)) <= 1.5
          return { ok: Math.abs(p.right - sw.right) <= 1.5 && under, sw: Math.round(sw.right), pop: Math.round(p.right) }
        })
      }
      const atHex = await beside()
      await pop.locator('button[data-colour-format]').click()
      const atRgba = await beside()
      ok(atHex.ok && atRgba.ok && atHex.sw !== atRgba.sw, `the picker stays on its swatch as RGBA widens the fields (swatch ${atHex.sw} to ${atRgba.sw}, picker ${atHex.pop} to ${atRgba.pop})`)
      await shot('editor-rgba')
      await pop.locator('button[data-colour-format]').click()
      await pop.locator('button[data-colour-format]').click()
      ok((await pop.locator('button[data-colour-format]').textContent()) === 'HEX', 'and back to HEX')
      await page.keyboard.press('Escape')
      await popGone()
      ok((await editor.locator('[data-colour-swatch][aria-label="Pick Background"]').count()) === 1, 'the Background well is there')
      await editor.locator('[data-colour-swatch][aria-label="Pick Background"]').click()
      await until(async () => (await pop.count()) === 1, 3000, 50)
      // The theme's Background alpha IS the window's see-through here (#114):
      // offered, at least 30% as the Opacity slider was, and inert while
      // acrylic is off, which it is on a fresh profile.
      const bgAlpha = pop.locator('[role="slider"][aria-label="Alpha"]')
      ok((await bgAlpha.count()) === 1 && (await bgAlpha.getAttribute('aria-valuemin')) === '30', "the theme's Background has an alpha, from 30 percent")
      ok((await bgAlpha.getAttribute('aria-disabled')) === 'true', 'and it is inert while acrylic is off')
      await page.keyboard.press('Escape')
      await popGone()
      await shot('editor')
      await editor.locator('[data-save-custom]').click()
      const custom = JSON.parse((await get('prism.term.custom')) ?? '{}')
      ok(/^#[0-9a-f]{6}66$/.test(custom.ansi?.red ?? '') && /^#[0-9a-f]{6}4d$/.test(custom.fg ?? ''), `the saved Custom keeps both alphas (red ${custom.ansi?.red}, text ${custom.fg})`)
      const wallCard = await card('custom')
      ok(!!wallCard && (wallCard.fg[3] ?? 1) === 1 && cardRatio(wallCard) >= 4.5, `the wall's Custom card draws the text as the terminal does (${cardRatio(wallCard).toFixed(2)}:1)`)
      await page.locator('[data-tab]').first().click()
      await typeLine(page, 'cls; Write-Host REDTEXT -ForegroundColor DarkRed')
      const seen = await until(async () => {
        const m = await page.evaluate(() => {
          const rgb = (s) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
          const ground = rgb(getComputedStyle(document.querySelector('[data-term-region]')).backgroundColor)
          // The OUTPUT line, alone on its row: the typed command above it
          // holds the same word in PSReadLine's own colours.
          const line = [...document.querySelectorAll('.xterm-rows > div')].find((r) => (r.textContent ?? '').trim() === 'REDTEXT')
          const red = line ? [...line.querySelectorAll('span')].find((s) => (s.textContent ?? '').includes('REDTEXT')) : null
          const text = getComputedStyle(document.querySelector('.xterm-rows')).color
          return red ? { ground, red: rgb(getComputedStyle(red).color), text: rgb(text) } : null
        })
        return m
      }, 8000, 150)
      ok(!!seen, 'the red line is on screen')
      if (seen) {
        ok(ratio(seen.red, seen.ground) >= 3, `the applied red reads at 3:1 on the ground (${ratio(seen.red, seen.ground).toFixed(2)}:1, ${seen.red})`)
        ok(ratio(seen.text, seen.ground) >= 4.5, `and the 30 percent text at 4.5:1 (${ratio(seen.text, seen.ground).toFixed(2)}:1, ${seen.text})`)
      }
      await page.locator('[data-title-settings]').click()
      await page.locator('[data-settings-tab="appearance"]').click()
      await page.locator('[data-edit-theme="custom"]').click()
      await editor.waitFor({ timeout: 4000 })
      const shown = async (label) => editor.locator(`input[aria-label="${label}"]`).inputValue()
      ok((await shown('red')).endsWith('66') && (await shown('Foreground')).endsWith('4d'), `reopening Custom shows the 40 and 30 percent alphas (${await shown('red')}, ${await shown('Foreground')})`)
      await editor.locator('button:has-text("Cancel")').click()
      await until(async () => (await editor.count()) === 0, 3000, 50)
      // Save changes: lit by an agent colour, it keeps the palette's alphas.
      await gotoPref(page, 'agent-color')
      await field.fill('#3da9fc')
      await field.press('Enter')
      await page.locator('[data-save-term]').click()
      const again = JSON.parse((await get('prism.term.custom')) ?? '{}')
      ok(again.ansi?.red === custom.ansi?.red && again.fg === custom.fg, `Save changes keeps them (red ${again.ansi?.red}, text ${again.fg})`)
      // End idle, so the close is not held on the agent question.
      await page.locator('[data-tab]').first().click()
      await typeLine(page, "$Host.UI.RawUI.WindowTitle = [char]0x2733 + ' Claude Code'")
      await sleep(300)
    } finally {
      await closeApp(app)
    }
  },

  /**
   * THE TERMINAL READS ON A PICKED BACKGROUND, AND AN UNPICKED INDICATOR WEARS
   * A PICKED ACCENT (2026-09-28; the two known gaps of the colour settings).
   * On the dark default theme, a light Background colour: the prompt's text is
   * measured against it, off the real DOM. And with an Accent colour picked,
   * the Agent working indicator's field shows that accent, not the theme's.
   */
  async pickedGround(ok) {
    const w = world()
    const { app, page } = await launch(w, { args: [w.alpha] })
    const inkOnGround = () =>
      page.evaluate(() => {
        const rgb = (s) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
        const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
        const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
        const ground = rgb(getComputedStyle(document.querySelector('[data-term-region]')).backgroundColor)
        // The prompt's own text: the default ink, in the rows xterm draws.
        const span = [...document.querySelectorAll('.xterm-rows span')].find((s) => /PS /.test(s.textContent ?? ''))
        const row = span ?? document.querySelector('.xterm-rows > div')
        const ink = rgb(getComputedStyle(row).color)
        const [a, b] = [lum(ink), lum(ground)]
        return { ground, ink, contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) }
      })
    try {
      await typeLine(page, 'cls')
      await sleep(500)
      const before = await inkOnGround()
      ok(before.contrast >= 4.5, `the theme's text reads on its own ground (${before.contrast.toFixed(1)}:1)`)
      // Through the setting's own field, so the store's listeners fire.
      await page.locator('[data-title-settings]').click()
      await page.locator('[data-settings-tab="appearance"]').click()
      const bg = page.locator('[data-pref="window-background"] input:not([type])')
      await bg.fill('#F4F1E8')
      await bg.press('Enter')
      const accent = page.locator('[data-pref="window-accent"] input:not([type])')
      await accent.fill('#1D3FBF')
      await accent.press('Enter')
      await gotoPref(page, 'agent-color')
      const working = await until(async () => {
        const v = (await page.locator('[data-pref="agent-color"] input:not([type])').inputValue()).toLowerCase()
        return v === '#1d3fbf' ? v : null
      }, 3000, 50)
      ok(!!working, `the working indicator follows the picked accent (${await page.locator('[data-pref="agent-color"] input:not([type])').inputValue()})`)
      await page.keyboard.press('Control+Tab') // back to the shell
      await page.locator('[data-tab]').first().click()
      await sleep(600)
      const after = await until(async () => {
        const m = await inkOnGround()
        return m.ground.join() === '244,241,232' ? m : null
      }, 4000, 100)
      ok(!!after && after.contrast >= 4.5, `on a picked light background the text still reads (${after ? after.contrast.toFixed(1) : '?'}:1, ink ${after?.ink})`)
    } finally {
      await closeApp(app)
    }
  },

  /**
   * THE OPACITY SLIDER BECAME THE BACKGROUND'S ALPHA (#114; owner, 2026-10-03:
   * alpha "should be built into the colour pickers ... it should not be a
   * separate opacity setting"; option a, "go ahead"). What the old app left in
   * storage is seeded into a real profile, the app is quit and launched again,
   * and the window must be the window it was:
   *  - a preset at Opacity 60 with acrylic on paints the same `--p-bg` (the
   *    byte round(0.6 * 255) = 0x99), with no Opacity row on the page, and the
   *    Background picker's own alpha moves it;
   *  - a theme pick with a see-through Background asks first (#60), as a
   *    changed Opacity did;
   *  - a Custom saved at 80 and left live at 60 paints 60, and picking Custom
   *    again restores its saved 80.
   */
  async opacityAlpha(ok) {
    const w = world()
    let { app, page } = await launch(w, { args: [w.alpha] })
    const sheet = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--p-bg').trim().toLowerCase())
    const get = (k) => page.evaluate((key) => localStorage.getItem(key), k)
    /** Quit properly (localStorage is flushed on the way out), seed what the
     *  old app left, quit again, and come back: the migration runs at launch. */
    const relaunchWith = async (seed) => {
      await page.evaluate((s) => {
        localStorage.clear()
        for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v)
      }, seed)
      const gone = new Promise((r) => app.process().on('exit', r))
      await page.evaluate(() => window.prism.quitApp()).catch(() => {})
      ok(await Promise.race([gone.then(() => true), sleep(45000).then(() => false)]), 'the app quits before it is launched again')
      ;({ app, page } = await launch(w))
      await until(async () => (await tabLabels(page)).length >= 1, 20000)
    }
    const openAppearance = async () => {
      await page.locator('[data-title-settings]').click()
      await page.locator('[data-settings-tab="appearance"]').click()
      await page.locator('[data-term-card]').first().waitFor({ timeout: 10000 })
    }
    try {
      // 1. A preset, Opacity 60, acrylic on.
      await relaunchWith({ 'prism.term.theme': 'dracula', 'prism.term.acrylic': '1', 'prism.term.opacity': '60' })
      const ground = await until(async () => {
        const s = await sheet()
        return /^#[0-9a-f]{6}99$/.test(s) ? s : null
      }, 10000)
      ok(!!ground, `a saved Opacity 60 paints the ground at alpha 0x99, as it did (${await sheet()})`)
      const picked = await get('prism.window.background')
      ok(picked === ground, `it now lives on the Background colour (${picked})`)
      ok((await get('prism.term.opacity')) === null, 'and the old key is gone')
      await openAppearance()
      ok((await page.locator('[data-pref="term-opacity"]').count()) === 0, 'there is no Opacity row')
      const row = page.locator('[data-pref="window-background"]')
      await row.scrollIntoViewIfNeeded()
      const field = row.locator('input:not([type])')
      ok((await field.inputValue()) === ground, `the Background field shows the eight digits in force (${await field.inputValue()})`)
      await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/opacity-alpha-row.png') }).catch(() => {})
      // The picker's own alpha moves the window.
      await row.locator('[data-colour-swatch]').click()
      const pop = page.locator('[data-colour-popover][role="dialog"]')
      await pop.waitFor({ timeout: 3000 })
      const alpha = pop.locator('[role="slider"][aria-label="Alpha"]')
      ok((await alpha.getAttribute('aria-valuenow')) === '60', `the Alpha slider reads 60 (${await alpha.getAttribute('aria-valuenow')})`)
      ok((await alpha.getAttribute('aria-valuemin')) === '30', `and goes no lower than the slider did, 30 (${await alpha.getAttribute('aria-valuemin')})`)
      ok((await alpha.getAttribute('aria-disabled')) !== 'true', 'and is live, with acrylic on')
      await alpha.focus()
      await page.keyboard.press('Shift+ArrowLeft')
      const moved = await until(async () => {
        const s = await sheet()
        return /^#[0-9a-f]{6}(7f|80)$/.test(s) ? s : null
      }, 4000, 50)
      ok(!!moved, `Shift+Left takes the window to half (${await sheet()})`)
      await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/opacity-alpha-picker.png') }).catch(() => {})
      await page.keyboard.press('Escape')
      ok(!!(await until(async () => (await sheet()) === ground, 4000, 50)), 'Escape puts the window back as it was')

      // A theme pick with the see-through Background in force asks first.
      ok(!(await page.locator('[data-save-term]').isDisabled()), 'a see-through Background lights Save changes, as a changed Opacity did')
      await page.locator('[data-term-card="nord"]').first().click()
      const ask = page.locator('[data-theme-switch-ask]')
      ok(!!(await until(async () => (await ask.count()) === 1, 3000, 50)), 'and a theme pick asks before it forgets it')
      await page.locator('[data-ask-cancel]').click()
      ok((await sheet()) === ground && (await get('prism.term.theme')) === 'dracula', 'Cancel keeps the theme and the see-through')

      // Acrylic off: the bar is there, faded and inert, and the window is solid.
      await page.locator('[data-pref="term-acrylic"] [role="switch"]').click()
      ok(!!(await until(async () => /^#[0-9a-f]{6}$/.test(await sheet()), 4000, 50)), `with acrylic off the window is solid (${await sheet()})`)
      await row.locator('[data-colour-swatch]').click()
      await pop.waitFor({ timeout: 3000 })
      ok((await pop.locator('[role="slider"][aria-label="Alpha"]').getAttribute('aria-disabled')) === 'true', 'and the Alpha slider is inert')
      await page.keyboard.press('Escape')
      await page.locator('[data-pref="term-acrylic"] [role="switch"]').click()

      // 2. A Custom saved at 80, left live at 60.
      const customTheme = { bg: '#1d1f21', fg: '#c5c8c6', cursor: '#f0c674', ansi: {}, acrylic: true, opacity: 80 }
      await relaunchWith({
        'prism.term.theme': 'custom',
        'prism.term.acrylic': '1',
        'prism.term.opacity': '60',
        'prism.term.custom': JSON.stringify(customTheme)
      })
      ok(!!(await until(async () => (await sheet()) === '#1d1f2199', 10000)), `a Custom left live at 60 paints 60 (${await sheet()})`)
      const savedSlot = JSON.parse((await get('prism.term.custom')) ?? '{}')
      ok(savedSlot.bg === '#1d1f21cc' && savedSlot.opacity === undefined, `its saved 80 rides on its own background (${savedSlot.bg})`)
      await openAppearance()
      await page.locator('[data-term-card="custom"]').first().click()
      const ask2 = page.locator('[data-theme-switch-ask]')
      if (await until(async () => (await ask2.count()) === 1, 2000, 50)) await page.locator('[data-ask-discard]').click()
      ok(!!(await until(async () => (await sheet()) === '#1d1f21cc', 4000, 50)), `picking Custom again restores the saved 80 (${await sheet()})`)
      ok((await get('prism.window.background')) === null, 'and the live 60 went with the pick')
      await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/opacity-alpha-custom.png') }).catch(() => {})
    } finally {
      await closeApp(app)
    }
  },

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
        // Positions IN THE PAGE, not on the screen: a picked card low on the
        // page is scrolled into view, which moves everything on screen and
        // shifts nothing in the layout (2026-09-28, when rows moved above the
        // wall and put it lower). The shift is what this is about.
        const any = document.querySelector('[data-term-card]')
        let box = any?.parentElement ?? null
        while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement
        const origin = box ? box.getBoundingClientRect().top - box.scrollTop : 0
        const y = (el) => el.getBoundingClientRect().top - origin
        const cards = [...document.querySelectorAll('[data-term-card]')].map((c) => ({
          id: c.getAttribute('data-term-card'),
          top: Math.round(y(c)),
          h: Math.round(c.getBoundingClientRect().height * 10) / 10
        }))
        const row = document.querySelector('[data-pref="window-background"]')
        return { cards, below: row ? Math.round(y(row) * 10) / 10 : -1 }
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
    // The whole wall, opened, for a person to look at (#62: the list is taste).
    // Forty cards are taller than the window: grow it for the picture, then
    // put it back.
    const size = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getSize())
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1500, 2600))
    await page.locator('[data-theme-wall-toggle]').click()
    await sleep(900)
    await page.locator('[data-term-wall]').screenshot({ path: resolve(process.cwd(), '.e2e-shots/theme-wall.png') }).catch(() => {})
    await page.locator('[data-theme-wall-toggle]').click()
    await app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0].setSize(s[0], s[1]), size)
    await sleep(500)
    // A colour put back to the theme's is a plain RESET word, as in Prism
    // (owner, same day: "just a simple reset text you can click"), not a
    // bordered button.
    await gotoPref(page, 'agent-color')
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
    await closeApp(app)
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
        const rail = document.querySelector('[data-settings-page] nav[aria-label="Settings pages"]')
        // The grouped cards (2026-10-05): a section's panel edge, and the
        // hairline between two of its rows, both the list's line.
        const panel = document.querySelector('[data-settings-section="window"] [data-settings-panel]')
        const second = document.querySelector('[data-pref="title-bar"]')
        const css = (el, prop) => (el ? getComputedStyle(el)[prop] : null)
        const edges = {
          tab: css(tab, 'borderRightColor'),
          title: css(title, 'borderBottomColor'),
          rail: css(rail, 'borderRightColor'),
          row: css(panel, 'borderTopColor'),
          rule: second ? getComputedStyle(second, '::before').backgroundColor : null
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
          rule: edges.rule === null ? null : alpha(edges.rule),
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
        const arrived = chrome.every((a) => near(a, p.divider)) && (p.row === null || near(p.row, p.line)) && (p.rule === null || near(p.rule, p.line))
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
    ok(near((await probe(page)).row, 0.09) && near((await probe(page)).rule, 0.09), 'a settings panel and the hairline between its rows wear the 9% list line')

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
      for (const edge of ['tab', 'title', 'rail', 'row', 'rule']) {
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
    await page.locator('[data-term-card="paper"]').first().click()
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
    await closeApp(app)
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
          solid: root.getPropertyValue('--p-accent-solid').trim().toLowerCase(),
          // The tab spinner's ring, drawn with its own classes: the line
          // that reads --p-accent-solid (#114) needs no loading tab to sample.
          spinner: (() => {
            const span = document.createElement('span')
            span.className = 'inline-block border-[1.5px] border-t-[var(--p-accent-solid)]'
            document.body.appendChild(span)
            const c = getComputedStyle(span).borderTopColor
            span.remove()
            return c
          })(),
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
    // button and a pressed segment must not move. AN ON SWITCH DOES (#138;
    // owner, 2026-10-07: "yes option 1 but it should depend on the theme so
    // only teal on the teal theme"): its track is the accent's fill
    // (--p-sel-bg) and its knob the ink on it (--p-on-accent), both times.
    const controls = () =>
      page.evaluate(() => {
        const look = (el) => {
          if (!el) return null
          const s = getComputedStyle(el)
          return `${s.backgroundColor}|${s.color}|${s.borderTopColor}`
        }
        const token = (name) => {
          const span = document.createElement('span')
          span.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
          document.body.appendChild(span)
          const c = getComputedStyle(span).backgroundColor
          span.remove()
          return c
        }
        const sw = document.querySelector('[role="switch"][aria-checked="true"]:not(:disabled)')
        return {
          button: look(document.querySelector('[data-choose-folder]')),
          segment: look(document.querySelector('[data-pref="newtab-mode"] [aria-pressed="true"]')),
          track: sw ? getComputedStyle(sw).backgroundColor : null,
          knob: sw?.firstElementChild ? getComputedStyle(sw.firstElementChild).backgroundColor : null,
          selBg: token('--p-sel-bg'),
          onAccent: token('--p-on-accent')
        }
      })
    await gotoPref(page, 'newtab-mode')
    await page.locator('[data-choose-folder]').waitFor({ state: 'visible', timeout: 10000 })
    await sleep(700)
    const plain = await controls()
    ok(!!plain.button && !!plain.segment && !!plain.track, 'a row button, a pressed segment and an on switch are on the Terminal page')
    ok(plain.track === plain.selBg, `an on switch's track is the theme's accent fill (${plain.track} vs ${plain.selBg})`)
    ok(plain.knob === plain.onAccent, `and its knob is the ink on the accent (${plain.knob} vs ${plain.onAccent})`)
    await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/settings-switch-pt-default.png') }).catch(() => {})
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

    // A SEE-THROUGH ACCENT (#114): its FILLS wear the alpha, its LINES never
    // do, and the text on a fill reads 4.5:1 on what the eye sees. Under a
    // see-through window the text-bearing fills are flattened (owner decision
    // 5), since no ink can be held over an unknown desktop.
    await field.fill('#e07a2f80')
    await field.press('Enter')
    const glassAccent = await until(async () => {
      const p = await probe()
      return /^#[0-9a-f]{6}80$/.test(p.accent) && p.stored === '#e07a2f80' ? p : null
    }, 8000)
    ok(!!glassAccent, `a hex8 accent publishes a see-through fill (${glassAccent?.accent}, stored ${glassAccent?.stored})`)
    ok(!!glassAccent && glassAccent.rule === glassAccent.hi && !/rgba/.test(glassAccent.rule ?? ''), `and the active tab's rule stays solid (${glassAccent?.rule})`)
    // The rule reads --p-accent-hi, which never carried the alpha, so the
    // check above alone proves nothing about the lines that read the accent
    // (review of #115): the line token is the exact pick, opaque, and the
    // spinner's ring drawn from it has no alpha.
    ok(glassAccent?.solid === '#e07a2f', `the accent's line token is the pick, opaque (${glassAccent?.solid})`)
    ok(glassAccent?.spinner === 'rgb(224, 122, 47)', `and the tab spinner's ring drawn from it is solid (${glassAccent?.spinner})`)
    const save = page.locator('[data-save-term]')
    const saveLook = () =>
      save.evaluate((el) => {
        const s = getComputedStyle(el)
        return { bg: s.backgroundColor, ink: s.color, ground: getComputedStyle(document.documentElement).getPropertyValue('--p-bg-solid').trim() }
      })
    const nums = (c) => (c.match(/[\d.]+/g) ?? []).map(Number)
    const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
    const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    const ratio = (x, y) => {
      const [a, b] = [lum(x), lum(y)]
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
    }
    /** The Save label's contrast on its fill as seen over the solid ground. */
    const saveReads = (l) => {
      const f = nums(l.bg)
      const a = f.length > 3 ? f[3] : 1
      const g = hexRgb(l.ground)
      const seen = f.slice(0, 3).map((v, i) => g[i] + (v - g[i]) * a)
      return { a, r: ratio(nums(l.ink).slice(0, 3), seen) }
    }
    // Save changes lights with a changed working colour (a theme setting).
    await gotoPref(page, 'agent-color')
    const working = page.locator('[data-pref="agent-color"] input:not([type])')
    await working.fill('#3da9fc')
    await working.press('Enter')
    await until(async () => !(await save.isDisabled()), 4000, 50)
    await save.scrollIntoViewIfNeeded()
    await sleep(400) // the button's colours transition
    const open = saveReads(await saveLook())
    ok(Math.abs(open.a - 128 / 255) < 0.01, `over an opaque window the Save fill is see-through (alpha ${open.a.toFixed(2)})`)
    ok(open.r >= 4.5, `and its label reads on the composite (${open.r.toFixed(1)}:1)`)
    await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/accent-see-through.png') }).catch(() => {})
    // A see-through window: acrylic on, the Background at 60%.
    await gotoPref(page, 'term-acrylic')
    await page.locator('[data-pref="term-acrylic"] [role="switch"]').click()
    const bgPick = page.locator('[data-pref="window-background"] input:not([type])')
    await bgPick.fill('#1c233099')
    await bgPick.press('Enter')
    await until(async () => (await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--p-bg').trim())) === '#1c233099', 6000, 50)
    await sleep(400)
    const glass = saveReads(await saveLook())
    ok(glass.a === 1, `under a see-through window the Save fill is flattened, opaque (alpha ${glass.a})`)
    ok(glass.r >= 4.5, `and its label still reads (${glass.r.toFixed(1)}:1)`)
    await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/accent-under-glass.png') }).catch(() => {})
    // Back to an opaque window and a working colour that follows the theme.
    await page.locator('[data-follow-theme="background"]').click()
    await page.locator('[data-pref="term-acrylic"] [role="switch"]').click()
    await gotoPref(page, 'agent-color')
    await page.locator('[data-follow-theme="working"]').click()
    await until(async () => (await save.isDisabled()), 4000, 50)
    await gotoPref(page, 'window-accent')
    await row.scrollIntoViewIfNeeded()
    await sleep(800)
    await row.scrollIntoViewIfNeeded()
    await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/accent-picked.png') }).catch(() => {})
    // The accent reached the tab (above); the settings controls stay as they
    // were, and none of them is the accent.
    await gotoPref(page, 'newtab-mode')
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
    for (const k of ['button', 'segment']) {
      ok(after[k] === plain[k], `the ${k} is unchanged by the picked accent (${after[k]})`)
      ok(!after[k].split('|').includes(accentRgb), `and the ${k} wears no accent`)
    }
    ok(after.track !== plain.track && after.track === after.selBg, `an on switch's track follows the picked accent (${plain.track} -> ${after.track})`)
    ok(after.knob === after.onAccent, `and its knob is the ink on it (${after.knob})`)
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

    // BACKGROUND AND ACCENT SIT RIGHT UNDER THE THEME WALL (2026-09-28: a
    // theme sets them, so they follow it; they sat under Font size before).
    const order = await page.evaluate(() => [...document.querySelectorAll('[data-pref]')].map((e) => e.getAttribute('data-pref')))
    const at = order.indexOf('term-theme')
    ok(
      at >= 0 && order[at + 1] === 'window-background' && order[at + 2] === 'window-accent',
      `Background and Accent come right after the theme wall (${order.slice(Math.max(0, at - 1), at + 4).join(' > ')})`
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

    // On a LIGHT theme the on switch is that theme's accent and its ink (#138).
    await page.locator('[data-term-card="paper"]').first().click()
    await until(async () => (await page.locator('[data-term-card="paper"]').first().getAttribute('aria-pressed')) === 'true', 4000, 50)
    await gotoPref(page, 'newtab-mode')
    await page.locator('[data-choose-folder]').waitFor({ state: 'visible', timeout: 10000 })
    await sleep(700)
    const light = await controls()
    ok(light.track === light.selBg && light.track !== plain.track, `on a light theme the on switch is its accent (${light.track})`)
    ok(light.knob === light.onAccent, `with the ink on it as the knob (${light.knob})`)
    await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/settings-switch-light.png') }).catch(() => {})
    await closeApp(app)
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
    await page.locator('[data-term-card="paper"]').first().click()
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
    await closeApp(app)
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
    // WHAT MAIN OFFERED IS INSTALLED, NEVER A URL THE PAGE SENT (code review
    // 2026-09-24, #15): a real-looking past release asset, handed to the
    // bridge, is refused before anything is fetched.
    const before = await installs()
    const refused = await page.evaluate(() =>
      window.prism.installUpdate('https://github.com/Maxaubert/PrismTerminal/releases/download/v0.1.0/PrismTerminal-Setup-x64-0.1.0.exe')
    )
    ok(refused === false && (await installs()) === before, 'an install for any url but the offered one is refused, and nothing is fetched')
    // As closeAsk does: let the process poll say "no agent" once, then have a
    // shell stand in for Claude through the title, idle first and then working.
    await typeLine(page, 'echo ready')
    await polled(page)
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
    await closeApp(app)
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
    await closeApp(app)
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
    await closeApp(app)
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
    // WARM BEFORE ANYBODY SPEAKS (2026-09-28): switched on, the engine is
    // started and warmed a moment later, not at the first press.
    ok(await until(() => ourSpeechServers() === 1, 15000), 'switched on, the speech engine is started before any press')
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
    await closeApp(app)
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
    ok((await page.locator('[data-settings-tab="dictation"]').getAttribute('aria-current')) === 'page' && (await page.locator('[data-settings-tab="appearance"]').getAttribute('aria-current')) === null, 'the rail marks Dictation as the page in front')
    await page.mouse.move(900, 300)
    await sleep(400)

    const names = await page.evaluate(() => [...document.querySelectorAll('[data-dictation-item] [data-item-name]')].map((e) => e.textContent.trim()))
    ok(
      names.length === 6 && JSON.stringify(names.slice(0, 5)) === JSON.stringify(['Whisper Base', 'Whisper Small', 'Parakeet v3', 'Whisper Large v3 Turbo', 'Whisper Large v3']),
      `models carry their full names, smallest first (${JSON.stringify(names)})`
    )
    const marks = await page.evaluate(() => [...document.querySelectorAll('[data-dictation-item] [data-vendor]')].map((e) => e.getAttribute('data-vendor')))
    ok(marks.filter((m) => m === 'openai').length === 4 && marks.filter((m) => m === 'nvidia').length === 2, `every row leads with its vendor's mark (${marks.join(',')})`)
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
    const fills = await page.evaluate(() => ['small', 'parakeet-v3', 'large-v3-turbo', 'large-v3'].map((id) => getComputedStyle(document.querySelector(`[data-dictation-item="${id}"] button`)).backgroundColor))
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

    // A MODEL THAT DOES NOT SUPPORT EVERY LANGUAGE SAYS SO, ONCE, BEFORE ITS
    // DOWNLOAD (#121; owner, 2026-10-04): one line, Cancel and Download.
    const LINE = "This model doesn't support all languages."
    const ask = () => page.locator('[data-model-download-ask]')
    await row('parakeet-v3').locator('button').click()
    ok(await until(async () => (await ask().count()) === 1, 4000), 'Download on Parakeet v3 asks first')
    const said = ((await ask().textContent()) ?? '').trim()
    ok(said === LINE + 'Cancel' + 'Download', `and says the one line, with Cancel and Download and nothing else ("${said}")`)
    ok((await row('parakeet-v3').getAttribute('data-state')) === 'absent', 'nothing downloads while it asks')
    await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/dictation-parakeet-ask.png') }).catch(() => {})
    await ask().locator('[data-ask-cancel]').click()
    ok(await until(async () => (await ask().count()) === 0, 2000), 'Cancel puts it away')
    ok((await row('parakeet-v3').getAttribute('data-state')) === 'absent', 'and downloads nothing')
    await row('parakeet-v3').locator('button').click()
    await until(async () => (await ask().count()) === 1, 4000)
    await page.keyboard.press('Escape')
    ok(await until(async () => (await ask().count()) === 0, 2000) && (await row('parakeet-v3').getAttribute('data-state')) === 'absent', 'Escape is Cancel')
    await row('parakeet-v3').locator('button').click()
    await until(async () => (await ask().count()) === 1, 4000)
    await ask().locator('[data-ask-download]').click()
    ok(await until(async () => (await row('parakeet-v3').getAttribute('data-state')) === 'downloading', 4000), 'Download starts the download')
    await row('parakeet-v3').locator('button', { hasText: 'Cancel' }).click()
    ok(await until(async () => (await row('parakeet-v3').getAttribute('data-state')) === 'absent', 15000), 'and its own Cancel stops it')
    ok(!existsSync(join(root, 'models', 'parakeet-v3.bin')), 'leaving no model behind')
    // A Whisper model asks nothing.
    await row('small').locator('button').click()
    await sleep(400)
    ok((await ask().count()) === 0, 'a Whisper model downloads without a question')
    await row('small').locator('button', { hasText: 'Cancel' }).click().catch(() => {})
    await until(async () => (await row('small').getAttribute('data-state')) === 'absent', 15000)

    // THE LANGUAGE PICKER WHILE IT IS IN USE: Auto-detect, disabled, an icon
    // that says the same line, and the user's own language kept for later.
    await page.evaluate(() => localStorage.setItem('prism.dictation.language', 'no'))
    await page.locator('[data-settings-tab="terminal"]').click()
    const pk = join(root, 'models', 'parakeet-v3.bin')
    writeFileSync(pk, '')
    truncateSync(pk, entry('parakeet-v3').bytes)
    await page.locator('[data-settings-tab="dictation"]').click()
    const lang = page.locator('button#dictation-language')
    ok(((await lang.textContent()) ?? '').trim() === 'Norwegian' && !(await lang.isDisabled()), 'on Whisper Base the picker shows the chosen language')
    ok((await page.locator('[data-language-limited]').count()) === 0, 'with no icon beside it')
    await until(async () => (await row('parakeet-v3').getAttribute('data-state')) === 'installed', 8000)
    await row('parakeet-v3').locator('button', { hasText: 'Use' }).click()
    ok(await until(async () => ((await lang.textContent()) ?? '').trim() === 'Auto-detect', 4000), 'on Parakeet v3 the picker shows Auto-detect')
    ok(await lang.isDisabled(), 'and cannot be changed')
    const icon = page.locator('[data-pref="dictation-language"] [data-language-limited]')
    ok((await icon.count()) === 1 && (await icon.getAttribute('title')) === LINE, 'an icon beside it says the same line on hover')
    await icon.hover()
    await page.screenshot({ path: resolve(process.cwd(), '.e2e-shots/dictation-parakeet-language.png') }).catch(() => {})
    ok((await page.evaluate(() => localStorage.getItem('prism.dictation.language'))) === 'no', 'the stored language is untouched')
    await row('base').locator('button', { hasText: 'Use' }).click()
    ok(await until(async () => ((await lang.textContent()) ?? '').trim() === 'Norwegian', 4000) && !(await lang.isDisabled()), 'back on Whisper Base, Norwegian is back and the picker works')
    ok((await page.locator('[data-language-limited]').count()) === 0, 'and the icon is gone')
    await closeApp(app)
  },

  /**
   * PARAKEET, REALLY (#121): the same fake microphone and sentence as
   * `dictation`, heard by the REAL parakeet-cli from the bundled engine with
   * the smallest official Parakeet v3 file. The words must land on the prompt
   * with no Enter, live text must show while listening, and nothing may stay
   * running: Parakeet is one process per pass, never a resident server.
   */
  async dictationParakeet(ok) {
    const w = world()
    const m = parakeetE2eModel()
    const model = await cached('ggml-parakeet-tdt-0.6b-v3-q4_0.bin', m.url, m.sha256)
    const clip = await cached('jfk.wav', JFK.url, JFK.sha256)
    const root = join(w.profile, 'dictation')
    mkdirSync(join(root, 'models'), { recursive: true })
    copyFileSync(model, join(root, 'models', 'parakeet-v3-q4.bin'))
    const engine = PACKAGED ? resolve(process.cwd(), 'dist/win-unpacked/resources/bin/whisper') : resolve(process.cwd(), 'vendor/whisper')
    ok(existsSync(join(engine, 'parakeet-cli.exe')) && existsSync(join(engine, 'parakeet.dll')), `Parakeet's runner is bundled beside the speech engine (${PACKAGED ? 'packaged' : 'vendor/whisper'})`)
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
    // Norwegian is the stored language on purpose: Parakeet is asked for auto,
    // so the English sentence must still come back in English.
    await page.evaluate(() => {
      localStorage.setItem('prism.dictation.model', 'parakeet-v3-q4')
      localStorage.setItem('prism.dictation.language', 'no')
      localStorage.setItem('prism.dictation.sounds', '0')
    })
    await page.locator('[data-title-settings]').click()
    await page.locator('[data-settings-tab="dictation"]').click()
    await page.locator('[data-pref="dictation-enabled"] [role="switch"]').click()
    ok((await page.locator('button#dictation-language').isDisabled()) && (await page.locator('[data-language-limited]').count()) === 1, 'its language picker is disabled with the icon beside it')
    // The warm-up runs a silent pass a moment after switching on, then ends.
    // That the pass RUNS is dictationEngine.test.ts's to prove; here only that
    // nothing is left behind once it could have.
    await sleep(6000)
    ok(ourParakeetPasses() === 0 && ourSpeechServers() === 0, 'switched on, nothing stays running')
    await page.locator('[data-tab]').first().click()
    await page.locator('.xterm').first().click({ force: true })

    await page.keyboard.down('AltRight')
    await sleep(300)
    ok(await until(async () => (await pill().getAttribute('data-dictation-pill').catch(() => null)) === 'listening', 8000), 'holding Right Alt opens the pill: Listening')
    const live = await until(async () => ((await page.locator('[data-dictation-live]').textContent().catch(() => '')) ?? '').trim(), 15000)
    ok(!!live, `live text appears while still listening ("${live}")`)
    await sleep(9000) // let the whole sentence play
    const before = await termText(page)
    const t0 = Date.now()
    await page.keyboard.up('AltRight')
    const heard = await until(async () => /ask not what your country/i.test((await termText(page)).replace(/\s+/g, ' ')), 30000)
    ok(heard, `the spoken sentence arrives on the prompt line (${Date.now() - t0} ms after release)`)
    ok(await until(async () => (await pill().count()) === 0, 5000), 'and the pill goes away')
    const after = await termText(page)
    ok(
      (after.match(/PS [^>]*>/g) ?? []).length === (before.match(/PS [^>]*>/g) ?? []).length,
      'NO ENTER was sent: there is no new prompt, the text is still being edited'
    )
    ok(await until(() => ourParakeetPasses() === 0, 4000), 'no Parakeet process outlives its pass')
    ok(ourSpeechServers() === 0, 'and no Whisper server was ever started')

    // Off again, and nothing at all.
    await page.locator('[data-title-settings]').click()
    await page.locator('[data-settings-tab="dictation"]').click()
    await page.locator('[data-pref="dictation-enabled"] [role="switch"]').click()
    ok(await until(() => ourParakeetPasses() === 0 && ourSpeechServers() === 0, 8000), 'switched off, no speech process exists')
    await closeApp(app)
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
    await closeApp(app)
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
    await closeApp(app)
  }
}

const table = []
/**
 * THE STALLS REPORT (#140): every scenario's app keeps the diagnostics log in
 * its own profile, so before the profile goes its stall and error lines are
 * kept for one table at the end of the run. A report only: the exit code is
 * the scenarios' alone. The diagLog scenario makes some on purpose (the busy
 * loop and its stack, the slow call, the two errors), and those rows say so;
 * anything else it logged is as real as any other scenario's.
 */
const stalls = []
const STALL_KINDS = new Set(['page-stall', 'page-stack', 'main-lag', 'fs-slow', 'ipc-slow', 'unresponsive'])
const ERROR_KINDS = new Set(['page-error', 'page-rejection', 'main-error', 'main-rejection', 'ipc-error', 'gone', 'logger-error'])
function stallDetail(l) {
  const cut = (v) => String(v ?? '').replace(/\s+/g, ' ').slice(0, 70)
  if (l.k === 'page-stall') {
    const top = Array.isArray(l.scripts) ? l.scripts[0] : null
    return cut(top ? [top.fn, top.src, top.invoker].filter(Boolean).join(' ') : `blocking ${l.blocking ?? '?'}`)
  }
  if (l.k === 'page-stack') return cut(String(l.stack ?? '').split('\n').find((x) => /^\s*at /.test(x))?.trim())
  if (l.k === 'main-lag') return cut((Array.isArray(l.inflight) ? l.inflight : []).map((c) => `${c.ch} ${c.ms}${c.done ? ' done' : ''}`).join(', ') || 'nothing in flight')
  if (l.k === 'ipc-slow' || l.k === 'ipc-error') return cut(`${l.ch}${l.err ? ` ${l.err}` : ''}`)
  if (l.k === 'gone') return cut(`${l.type} ${l.reason} ${l.exitCode}`)
  return cut(l.msg ?? l.err ?? '')
}
function collectStalls(scenario) {
  for (const base of worlds) {
    const dir = join(base, 'profile', 'logs')
    let files
    try {
      files = readdirSync(dir).filter((f) => f.startsWith('diag.jsonl'))
    } catch {
      continue
    }
    for (const f of files) {
      let text
      try {
        text = readFileSync(join(dir, f), 'utf8')
      } catch {
        continue
      }
      for (const raw of text.split('\n')) {
        if (!raw) continue
        let l
        try {
          l = JSON.parse(raw)
        } catch {
          continue
        }
        const err = ERROR_KINDS.has(l.k)
        if (!err && !(STALL_KINDS.has(l.k) && typeof l.ms === 'number' && l.ms >= 1000)) continue
        const made = scenario === 'diagLog' && (['page-stall', 'page-stack', 'page-error', 'page-rejection'].includes(l.k) || l.ch === 'e2e:slow-ipc')
        stalls.push({ scenario, kind: l.k, ms: typeof l.ms === 'number' ? l.ms : null, detail: stallDetail(l), expected: made })
      }
    }
  }
}
/** Scenarios that honestly take longer than the default limit. */
const SLOW = { dictation: 360000, dictationParakeet: 360000, helpPanel: 300000, updateWindow: 300000 }
reapStrays()
for (const [name, run] of Object.entries(scenarios)) {
  if (only.length && !only.some((o) => name.toLowerCase().includes(o.toLowerCase()))) continue
  const t0 = Date.now()
  let fails = 0
  let checks = 0
  let over = false
  const ok = (cond, msg) => {
    checks += 1
    if (!cond) fails += 1
    console.log(`  ${cond ? 'pass' : 'FAIL'}  ${msg}`)
  }
  console.log(`\n${name}`)
  // A TIME LIMIT (code review 2026-09-24, #35): one await that never returns
  // (a second instance that never hands off, an app held on a question) hung
  // the whole suite with no FAIL line. Past the limit the scenario fails, its
  // processes are reaped, and the next one runs; `ok` goes quiet, so a
  // scenario still running in the background cannot count against another.
  const limit = SLOW[name] ?? 180000
  let timer
  try {
    await Promise.race([
      run((cond, msg) => (over ? undefined : ok(cond, msg))),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`scenario timed out after ${limit / 1000} s`)), limit)
      })
    ])
  } catch (e) {
    fails += 1
    console.log(`  FAIL  threw: ${e?.stack ?? e}`)
  } finally {
    clearTimeout(timer)
    over = true
  }
  const strays = reapStrays()
  collectStalls(name)
  removeWorlds()
  table.push({ name, checks, fails, secs: ((Date.now() - t0) / 1000).toFixed(1), strays })
}

console.log('\nscenario          checks  fails  secs')
for (const r of table) {
  console.log(`${r.name.padEnd(18)}${String(r.checks).padStart(6)}${String(r.fails).padStart(7)}${r.secs.padStart(6)}`)
}
console.log('\nStalls (stalls of 1 s or more and errors, from each scenario\'s diagnostics log; a report, not a gate)')
if (!stalls.length) console.log('  none')
else {
  console.log(`  ${'scenario'.padEnd(18)}${'kind'.padEnd(16)}${'ms'.padStart(7)}  detail`)
  for (const r of stalls)
    console.log(`  ${r.scenario.padEnd(18)}${r.kind.padEnd(16)}${(r.ms === null ? '-' : String(r.ms)).padStart(7)}  ${r.expected ? '(expected) ' : ''}${r.detail}`)
}
const failed = table.filter((r) => r.fails > 0)
console.log(failed.length ? `\n${failed.length} scenario(s) FAILED` : '\nall scenarios passed')
process.exit(failed.length ? 1 : 0)
