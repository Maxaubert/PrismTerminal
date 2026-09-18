# Prism Terminal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Prism Terminal 0.1.0, Prism's built-in terminal as a standalone tabbed Windows app with the agent indicator, themes that drive the whole window, tab restore with agent resume, and Explorer verbs.

**Architecture:** A new Electron app whose terminal core (pty, shells, prompt bootstrap, agent detection, xterm panel, tab strip, theme libs) is COPIED from Prism at commit `4196c3a` and trimmed; the only substantial new code is a small `App.tsx`, a pure `lib/tabs.ts`, `lib/chromeTheme.ts`, and a main `index.ts` that is wiring only. Prism is never modified.

**Tech Stack:** Electron, electron-vite, React 19, TypeScript, Tailwind v4, node-pty, @xterm/*, vitest, playwright-core (e2e over CDP), electron-builder NSIS.

**Spec:** `docs/superpowers/specs/2026-09-18-prism-terminal-design.md`

## Global Constraints

- `SRC` below means `C:\Users\Admin\Documents\Claude\Github\Prism` at commit `4196c3a`. READ from it, never write to it. Line numbers refer to that commit.
- `DST` means `C:\Users\Admin\Documents\Claude\Github\PrismTerminal`.
- Runtime dependencies are exactly: `react`, `react-dom`, `node-pty`, `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-search`, `@xterm/addon-unicode11`, `@xterm/addon-web-links`. Use the SAME versions as `SRC/package.json`, dev dependencies included.
- `node-pty` stays `asarUnpack`ed and shells spawn with `useConptyDll: true`.
- No em-dashes anywhere (code, comments, docs, commit messages). Use en-dashes, commas or rephrase.
- Match Prism's conventions: aliases `@shared` / `@renderer`, its eslint and prettier configs, its comment density and IPC naming. The preload global stays `window.prism` so copied components need no renaming.
- localStorage keys keep their `prism.term.*` names; the app has its own userData, so they cannot collide.
- Never commit to `main` after the bootstrap commit (Task 1). Branch `feat/1-app` carries Tasks 2-12 as ONE PR; branch `feat/2-icon-release` carries Task 13. Commits are `type(scope): subject` and end with:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
- Never merge without the owner's explicit "merge" for that PR.
- The app must never write the Explorer verb in dev or under `--e2e`.
- Product name `Prism Terminal`, appId `com.prism.terminal`, exe `PrismTerminal.exe`, artifact `PrismTerminal-Setup-x64-${version}.exe`, userData folder `PrismTerminal`.

## File map

```
DST/
  package.json, electron.vite.config.ts, electron-builder.yml, tsconfig*.json,
  eslint.config.js, .prettierrc*, vitest.config.ts, vitest.setup.ts, .gitignore,
  README.md, LICENSE, CLAUDE.md
  .github/workflows/ci.yml            (Task 2)   release.yml (Task 13)
  build/installer.nsh                 uninstall macro: deletes the two verb keys
  build/icon.ico                      placeholder (Task 2), real (Task 13)
  src/shared/termCwd.ts (+test)       OSC 9;9 parsing only
  src/shared/types.ts                 ShellDef, SavedTabs, RestoredTab, UpdateInfo
  src/main/terminal.ts shells.ts termPrompt.ts agentDetect.ts update.ts   copied (+tests)
  src/main/agentResume.ts (+test)     claudeSessions + resume planning, extracted
  src/main/agentPoll.ts               the backed-off poll, extracted
  src/main/tabsStore.ts (+test)       tabs.json load / save / flush
  src/main/windowState.ts             bounds memory, extracted
  src/main/argv.ts (+test)            folder arguments
  src/main/shellVerb.ts (+test)       two keys, no `*`
  src/main/index.ts                   window, resident lifecycle, IPC wiring
  src/preload/index.ts, index.d.ts
  src/renderer/index.html, src/main.tsx, src/index.css
  src/renderer/src/App.tsx
  src/renderer/src/components/        TitleBar TabStrip TerminalPanel TermFind Settings
                                      ContextMenu ConfirmDialog EmptyState UpdateChip
  src/renderer/src/lib/               tabs chromeTheme newTabPrefs closePrefs (new)
                                      agentTitle agentClock termActivity termAnsi termBus
                                      termLook termPaste termPrefs termTheme recentRoots (copied)
  tools/e2e/run.mjs
```

---

### Task 1: Bootstrap the repository

The one direct commit to `main`: an empty repo has no base to open a PR against. It contains docs only.

**Files:**
- Create: `DST/.gitignore`, `DST/LICENSE`, `DST/README.md` (stub, replaced in Task 12)
- Existing: `DST/docs/superpowers/specs/...`, `DST/docs/superpowers/plans/...`

- [ ] **Step 1: Init and first commit**

```bash
cd /c/Users/Admin/Documents/Claude/Github/PrismTerminal
git init -b main
cp ../Prism/LICENSE LICENSE
printf 'node_modules\nout\ndist\n*.log\n.e2e-profile\n' > .gitignore
printf '# Prism Terminal\n\nA tabbed Windows terminal for AI CLIs. Work in progress.\n' > README.md
git add . && git commit -m "docs: design spec and implementation plan

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 2: Create the public GitHub repo and push**

```bash
gh repo create PrismTerminal --public --source . --remote origin --push \
  --description "A tabbed Windows terminal for AI CLIs, with an agent indicator on every tab."
gh issue create --title "Prism Terminal 0.1.0: the app" --body "Tracks the first PR. See docs/superpowers."
gh issue create --title "App icon and first release" --body "Mockup round, owner pick, release.yml."
git switch -c feat/1-app
```

Expected: issues #1 and #2 exist; branch `feat/1-app` checked out.

---

### Task 2: Tooling and the verification loop

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`, `eslint.config.js`, prettier config, `vitest.config.ts`, `vitest.setup.ts`, `.github/workflows/ci.yml`, `build/icon.ico`

**Interfaces:**
- Produces: `npm run typecheck`, `npm test`, `npm run lint`, `npm run build`, `npm run dev`.

- [ ] **Step 1: Copy the configs verbatim**

```bash
S=../Prism
cp $S/tsconfig.json $S/tsconfig.node.json $S/tsconfig.web.json $S/eslint.config.js \
   $S/vitest.config.ts $S/vitest.setup.ts $S/electron.vite.config.ts .
cp $S/.prettierrc* $S/.prettierignore . 2>/dev/null || true
mkdir -p .github/workflows build && cp $S/.github/workflows/ci.yml .github/workflows/ci.yml
```

- [ ] **Step 2: Trim `electron.vite.config.ts`**

Read it. Remove the second renderer entry (`phone.html`) and any pdf.js / wasm / worker asset handling. Keep: the main, preload and renderer blocks, the `@shared` and `@renderer` aliases, the React and Tailwind plugins, and `node-pty` in main's `external` list.

- [ ] **Step 3: Write `package.json`**

Copy name/scripts shape from `SRC/package.json` with these values; copy every version string from SRC for the listed packages.

```json
{
  "name": "prism-terminal",
  "productName": "Prism Terminal",
  "version": "0.1.0",
  "description": "A tabbed Windows terminal for AI CLIs.",
  "main": "./out/main/index.js",
  "author": "Max",
  "license": "MIT",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "start": "electron-vite preview",
    "typecheck:node": "tsc --noEmit -p tsconfig.node.json --composite false",
    "typecheck:web": "tsc --noEmit -p tsconfig.web.json --composite false",
    "typecheck": "npm run typecheck:node && npm run typecheck:web",
    "test": "vitest run --passWithNoTests",
    "test:watch": "vitest",
    "e2e": "npm run build && node tools/e2e/run.mjs",
    "lint": "eslint .",
    "format": "prettier --write .",
    "package": "electron-vite build && electron-builder --win"
  }
}
```

`license` must match `SRC/package.json`'s. dependencies: the eight in Global Constraints. devDependencies: SRC's list minus `@types/adm-zip` and `@types/qrcode`.

- [ ] **Step 4: Placeholder icon and ci.yml check**

```bash
cp ../Prism/build/icon.ico build/icon.ico   # PLACEHOLDER, replaced in Task 13; never released
```

Read `ci.yml`; remove any step that fetches ffmpeg / 7-Zip / FluidSynth. It must run `npm ci`, `npm run typecheck`, `npm run lint`, `npm test` on `windows-latest`.

- [ ] **Step 5: Install and prove the loop runs**

Run: `npm install && npm test`
Expected: vitest exits 0 with "No test files found" (passWithNoTests).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore(tooling): scaffold, configs and ci from Prism

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Transplant the pure libs with their tests

**Files:**
- Create (copy): `src/shared/termCwd.ts` + test; `src/renderer/src/lib/` `agentTitle` `agentClock` `termActivity` (+ `termActivity.born.test.ts`) `termAnsi` `termBus` `termPaste` `termPrefs` `termTheme` (+ `termTheme.legible.test.ts`) `termLook` `recentRoots`, each with its `.test.ts` where one exists

**Interfaces:**
- Produces (unchanged from Prism): `parseOsc9`, `readAgentTitle(id, title): AgentTitle | null`, `forgetAgentTitle(id)`, `noteWorking(ids)`, `workingFor(id): number | null`, `humanFor(ms): string`, `markBorn`, `startupOutput`, `markTouched`, `markResume(id, session)`, `takeResume(id)`, `forgetSession(id)`, `onCwd(fn)`, `onTitle(fn)`, `resolveTermTheme(id): TermTheme`, `TERM_PRESETS`, `contrastRatio`, `ensureContrast`, `mixHex`, `luminance`, `recentRoots()`, `rememberRoot(path)`, `pinnedRoots()`, `togglePin(path)`, `plusMenuList(...)`, and every `termLook` getter / setter / hook.

- [ ] **Step 1: Copy**

```bash
S=../Prism/src; mkdir -p src/shared src/renderer/src/lib
cp $S/shared/termCwd.ts $S/shared/termCwd.test.ts src/shared/
for f in agentTitle agentClock termActivity termAnsi termBus termPaste termPrefs termTheme termLook recentRoots; do
  cp $S/renderer/src/lib/$f.ts src/renderer/src/lib/
  cp $S/renderer/src/lib/$f*.test.ts src/renderer/src/lib/ 2>/dev/null || true
done
```

- [ ] **Step 2: Trim `termCwd.ts`**

Delete `cdCommand` and the inside/outside-root decision (and their tests). Keep `parseOsc9` and any path normaliser it uses. `terminal.ts` (Task 5) loses its `cdCommand` import accordingly.

- [ ] **Step 3: Remove "follow the app style" from `termTheme.ts` and `termLook.ts`**

In `termTheme.ts`: delete `readTermTheme`, `watchTermTheme` and `buildTermTheme`'s CSS-variable reader (keep `buildTermTheme` itself if presets without `ansi` use it). Add a first preset and make it the fallback of `resolveTermTheme`:

```ts
  // Prism's own dark look: what the terminal wore by default inside Prism.
  { id: 'prism', name: 'Prism', bg: '#0b0b0f', fg: '#e7e7ee', cursor: '#7c7cf0' },
```

`resolveTermTheme(id)`: an unknown id, or the legacy `'style'`, resolves to the `prism` preset. In `termLook.ts`: `termThemeId()` defaults to `'prism'` instead of `'style'`, and maps a stored `'style'` to `'prism'`. Replace the boolean `termAcrylic` store with:

```ts
const ACRYLIC_KEY = 'prism.term.acrylic'
const OPACITY_KEY = 'prism.term.opacity'

export function termAcrylic(): boolean {
  return localStorage.getItem(ACRYLIC_KEY) === '1'
}
export function setTermAcrylic(on: boolean): void {
  localStorage.setItem(ACRYLIC_KEY, on ? '1' : '0')
  notify()
}
/** 30-100. Read defensively: Number(null) and Number('') are 0, which would
 *  read "never set" as fully transparent. */
export function termOpacity(): number {
  const raw = localStorage.getItem(OPACITY_KEY)
  const n = raw === null || raw === '' ? NaN : Number(raw)
  return Number.isFinite(n) ? Math.min(100, Math.max(30, Math.round(n))) : 100
}
export function setTermOpacity(pct: number): void {
  localStorage.setItem(OPACITY_KEY, String(Math.min(100, Math.max(30, Math.round(pct)))))
  notify()
}
export function useTermOpacity(): number {
  return useSyncExternalStore(sub, termOpacity)
}
```

(`sub` is the file's existing subscribe helper; keep `useTermAcrylic`.) Add to `termLook.test.ts`:

```ts
it('reads a never-set opacity as opaque, not transparent', () => {
  localStorage.clear()
  expect(termOpacity()).toBe(100)
  localStorage.setItem('prism.term.opacity', '')
  expect(termOpacity()).toBe(100)
  setTermOpacity(5)
  expect(termOpacity()).toBe(30)
})
```

Fix any test that asserted the `'style'` default so it asserts `'prism'`.

- [ ] **Step 4: Run**

Run: `npm test && npm run typecheck:web`
Expected: all copied suites PASS; typecheck clean (fix imports of anything deleted).

- [ ] **Step 5: Commit** `feat(lib): terminal libs transplanted from Prism, follow-style removed`

---

### Task 4: `lib/tabs.ts`, the tab model (new, pure)

**Files:**
- Create: `src/renderer/src/lib/tabs.ts`, `src/renderer/src/lib/tabs.test.ts`

**Interfaces:**
- Produces:

```ts
export interface Tab { id: string; kind?: 'settings'; cwd: string }
export interface TabState { tabs: Tab[]; activeId: string | null }
export const EMPTY: TabState
export function addTab(s: TabState, id: string, cwd: string): TabState          // appends, activates
export function closeTab(s: TabState, id: string): TabState                     // activates right neighbour, else left
export function pickTab(s: TabState, id: string): TabState
export function stepTab(s: TabState, dir: 1 | -1): TabState                     // wraps
export function setCwd(s: TabState, id: string, cwd: string): TabState          // same ref when unchanged
export function openSettings(s: TabState): TabState                             // one settings tab, reused
export function reorderTabs(tabs: readonly Tab[], id: string, toIndex: number): Tab[]
export function tabLabels(tabs: readonly Tab[]): string[]
export function shellTabs(s: TabState): Tab[]                                   // without settings
```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { EMPTY, addTab, closeTab, openSettings, pickTab, reorderTabs, setCwd, shellTabs, stepTab, tabLabels } from './tabs'

const three = () => addTab(addTab(addTab(EMPTY, 'a', 'C:\\w\\api'), 'b', 'C:\\w\\web'), 'c', 'D:\\x\\api')

describe('tabs', () => {
  it('adds at the end and activates', () => {
    const s = three()
    expect(s.tabs.map((t) => t.id)).toEqual(['a', 'b', 'c'])
    expect(s.activeId).toBe('c')
  })
  it('allows two tabs in the same folder', () => {
    const s = addTab(addTab(EMPTY, 'a', 'C:\\w'), 'b', 'C:\\w')
    expect(s.tabs).toHaveLength(2)
    expect(tabLabels(s.tabs)).toEqual(['w', 'w'])
  })
  it('closing the active tab activates the right neighbour, else the left', () => {
    expect(closeTab(pickTab(three(), 'b'), 'b').activeId).toBe('c')
    expect(closeTab(three(), 'c').activeId).toBe('b')
  })
  it('closing a background tab keeps the active one', () => {
    expect(closeTab(three(), 'a').activeId).toBe('c')
  })
  it('closing the last tab leaves nothing active', () => {
    expect(closeTab(addTab(EMPTY, 'a', 'C:\\w'), 'a')).toEqual({ tabs: [], activeId: null })
  })
  it('steps with wrap', () => {
    expect(stepTab(three(), 1).activeId).toBe('a')
    expect(stepTab(pickTab(three(), 'a'), -1).activeId).toBe('c')
  })
  it('relabels on cwd and returns the same state when nothing changed', () => {
    const s = three()
    expect(setCwd(s, 'a', 'C:\\w\\api')).toBe(s)
    expect(tabLabels(setCwd(s, 'b', 'C:\\w\\web\\src').tabs)[1]).toBe('src')
  })
  it('tells same-named folders apart by their parent', () => {
    expect(tabLabels(three().tabs)).toEqual(['api - w', 'web', 'api - x'])
  })
  it('labels a drive root by its letter', () => {
    expect(tabLabels(addTab(EMPTY, 'a', 'D:\\').tabs)).toEqual(['D:'])
  })
  it('opens one settings tab and reuses it', () => {
    const s = openSettings(openSettings(three()))
    expect(s.tabs.filter((t) => t.kind === 'settings')).toHaveLength(1)
    expect(tabLabels(s.tabs).at(-1)).toBe('Settings')
    expect(shellTabs(s)).toHaveLength(3)
  })
  it('reorders, correcting for the removed slot', () => {
    expect(reorderTabs(three().tabs, 'a', 3).map((t) => t.id)).toEqual(['b', 'c', 'a'])
    expect(reorderTabs(three().tabs, 'c', 0).map((t) => t.id)).toEqual(['c', 'a', 'b'])
  })
})
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/renderer/src/lib/tabs.test.ts` - Expected: FAIL, cannot resolve `./tabs`.

- [ ] **Step 3: Implement**

```ts
/**
 * The tab list, as pure data. A tab is one shell and the folder it is in.
 * Every rule about which tab is in front after a change lives here, so it can
 * be tested without a window.
 */
export interface Tab {
  /** Stable for the tab's life; also the pty session id. */
  id: string
  /** The Settings page riding the strip. Never persisted, owns no shell. */
  kind?: 'settings'
  /** Where the shell was opened, then whatever it last reported (OSC 9;9). */
  cwd: string
}

export interface TabState {
  tabs: Tab[]
  activeId: string | null
}

export const EMPTY: TabState = { tabs: [], activeId: null }
const SETTINGS_ID = 'settings'

export function addTab(s: TabState, id: string, cwd: string): TabState {
  return { tabs: [...s.tabs, { id, cwd }], activeId: id }
}

export function closeTab(s: TabState, id: string): TabState {
  const at = s.tabs.findIndex((t) => t.id === id)
  if (at < 0) return s
  const tabs = s.tabs.filter((t) => t.id !== id)
  if (s.activeId !== id) return { tabs, activeId: s.activeId }
  const next = tabs[at] ?? tabs[at - 1] ?? null
  return { tabs, activeId: next ? next.id : null }
}

export function pickTab(s: TabState, id: string): TabState {
  return s.tabs.some((t) => t.id === id) && s.activeId !== id ? { ...s, activeId: id } : s
}

export function stepTab(s: TabState, dir: 1 | -1): TabState {
  if (s.tabs.length < 2) return s
  const at = s.tabs.findIndex((t) => t.id === s.activeId)
  const next = s.tabs[(at + dir + s.tabs.length) % s.tabs.length]
  return { ...s, activeId: next.id }
}

export function setCwd(s: TabState, id: string, cwd: string): TabState {
  const tab = s.tabs.find((t) => t.id === id)
  if (!tab || tab.cwd.toLowerCase() === cwd.toLowerCase()) return s
  return { ...s, tabs: s.tabs.map((t) => (t.id === id ? { ...t, cwd } : t)) }
}

export function openSettings(s: TabState): TabState {
  if (s.tabs.some((t) => t.kind === 'settings')) return { ...s, activeId: SETTINGS_ID }
  return { tabs: [...s.tabs, { id: SETTINGS_ID, kind: 'settings', cwd: '' }], activeId: SETTINGS_ID }
}

export function shellTabs(s: TabState): Tab[] {
  return s.tabs.filter((t) => t.kind !== 'settings')
}

export function reorderTabs(tabs: readonly Tab[], id: string, toIndex: number): Tab[] {
  const from = tabs.findIndex((t) => t.id === id)
  if (from < 0) return [...tabs]
  const next = [...tabs]
  const [moved] = next.splice(from, 1)
  // Removing the tab shifts everything after it left by one, so a drop aimed
  // past its old home has to come back by one too.
  const at = Math.max(0, Math.min(toIndex > from ? toIndex - 1 : toIndex, next.length))
  next.splice(at, 0, moved)
  return next
}

const parts = (p: string): string[] => p.split(/[\\/]+/).filter(Boolean)
const baseOf = (p: string): string => parts(p).at(-1) ?? p
const parentOf = (p: string): string => parts(p).at(-2) ?? ''

export function tabLabels(tabs: readonly Tab[]): string[] {
  const bases = tabs.map((t) => (t.kind === 'settings' ? 'Settings' : baseOf(t.cwd)))
  // A collision is one basename over DIFFERENT folders. Two tabs in the very
  // same folder have nothing to tell apart and keep the plain name.
  const byBase = new Map<string, Set<string>>()
  tabs.forEach((t, i) => {
    const set = byBase.get(bases[i]) ?? new Set<string>()
    set.add(t.cwd.toLowerCase())
    byBase.set(bases[i], set)
  })
  return tabs.map((t, i) => {
    const clash = (byBase.get(bases[i])?.size ?? 0) > 1
    const parent = parentOf(t.cwd)
    return clash && parent ? bases[i] + ' - ' + parent : bases[i]
  })
}
```

- [ ] **Step 4: Run** `npx vitest run src/renderer/src/lib/tabs.test.ts` - Expected: PASS (11 tests).
- [ ] **Step 5: Commit** `feat(tabs): the tab model, one shell and its folder`

---

### Task 5: Main-process transplant

**Files:**
- Create (copy): `src/main/terminal.ts` `shells.ts` `termPrompt.ts` `agentDetect.ts` `update.ts` `argv.ts` `shellVerb.ts`, each with its `.test.ts`
- Create (extract): `src/main/agentResume.ts` (+test), `src/main/agentPoll.ts`, `src/main/windowState.ts`, `src/main/tabsStore.ts` (+test), `src/shared/types.ts`

**Interfaces:**
- Produces:

```ts
// shared/types.ts
export interface ShellDef { id: string; name: string; path: string; args?: string[] }   // copy Prism's exact shape
export type AgentKind = 'claude' | 'codex'
export interface SavedTab { cwd: string; agent?: AgentKind }
export interface SavedTabs { tabs: SavedTab[]; active: number }
export interface RestoredTab { cwd: string; resume?: string }
export interface Restored { tabs: RestoredTab[]; active: number }
// main/agentResume.ts
export const CODEX_RESUME = 'codex:last'
export function claudeSessions(cwd: string): string[]          // newest first
export function validResume(r: string | undefined): string | undefined
export function planRestore(saved: SavedTabs, exists: (p: string) => boolean,
  sessions: (cwd: string) => string[]): Restored
// main/tabsStore.ts
export function createTabsStore(file: string): {
  load(): SavedTabs; save(s: SavedTabs): void; flush(): void }
// main/agentPoll.ts
export function startAgentPoll(send: (id: string, has: boolean, kind: AgentKind | null) => void): () => void
// main/windowState.ts
export function readWindowState(): WindowState; export function watchWindowState(win: BrowserWindow): void
```

- [ ] **Step 1: Copy the whole files**

```bash
S=../Prism/src/main; mkdir -p src/main
for f in terminal shells termPrompt agentDetect update argv shellVerb; do
  cp $S/$f.ts src/main/; cp $S/$f*.test.ts src/main/ 2>/dev/null || true
done
```

Copy `ShellDef` (and `UpdateInfo` if `update.ts` imports it) from `SRC/src/shared/types.ts` into `src/shared/types.ts` and add the types in the Interfaces block.

- [ ] **Step 2: Trim `terminal.ts`**

Remove the `cdCommand` import and `cdTerm` (SRC line 150 and its helpers). Keep everything else, prewarm included. Run its test file; delete only tests of `cdTerm`.

- [ ] **Step 3: Reshape `shellVerb.ts`**

Two keys, no `*`, own key name and labels. Replace the key constants and `verbSpec`:

```ts
const DIR_KEY = 'HKCU\\Software\\Classes\\Directory\\shell\\PrismTerminal'
const BG_KEY = 'HKCU\\Software\\Classes\\Directory\\Background\\shell\\PrismTerminal'

export const verbKeys = (): string[] => [DIR_KEY, BG_KEY]

export function verbSpec(key: string): { label: string; arg: string } {
  // A background click has no %1: the folder you are IN arrives as %V.
  return key === BG_KEY
    ? { label: 'Open Prism Terminal here', arg: '%V' }
    : { label: 'Open in Prism Terminal', arg: '%1' }
}
```

`queryArgs()` must query `DIR_KEY`. Update `shellVerb.test.ts`: two keys, the new labels, and no key containing `\\*\\`.

- [ ] **Step 4: Trim `argv.ts`**

Keep `pathsFromArgv` as is (it already returns `{ path, dir }`). Add:

```ts
import { dirname } from 'path'

/** A terminal opens FOLDERS: a file argument means the folder it is in. */
export function foldersFromArgv(argv: string[], ignore?: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const a of pathsFromArgv(argv, ignore)) {
    const dir = a.dir ? a.path : dirname(a.path)
    if (!seen.has(dir.toLowerCase())) {
      seen.add(dir.toLowerCase())
      out.push(dir)
    }
  }
  return out
}
```

Test (append to `argv.test.ts`, using `os.tmpdir()` and a temp file created in the test):

```ts
it('turns a file argument into its folder, once', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pt-'))
  const file = join(dir, 'a.txt')
  writeFileSync(file, 'x')
  expect(foldersFromArgv(['exe', file, dir, '--e2e'], [])).toEqual([dir])
})
```

- [ ] **Step 5: Extract `agentResume.ts`**

Move `CODEX_RESUME` and `claudeSessions` from `SRC/src/main/index.ts` lines 644-745 unchanged (read that block fully first; it carries the rules). Add `validResume` from the check at SRC line 1725, and `planRestore` as the pure form of SRC lines 695-740:

```ts
export function validResume(r: string | undefined): string | undefined {
  return r === CODEX_RESUME || (r && /^[0-9a-f][0-9a-f-]{6,62}[0-9a-f]$/i.test(r)) ? r : undefined
}

/**
 * What a saved tab list comes back as. A folder that has gone is dropped
 * without a word. Two claude tabs in one folder take the newest and the
 * second-newest session, in order; no session on disk means no resume at all,
 * never a bare --continue guessing.
 */
export function planRestore(
  saved: SavedTabs,
  exists: (p: string) => boolean,
  sessions: (cwd: string) => string[]
): Restored {
  const taken = new Map<string, number>()
  const tabs: RestoredTab[] = []
  let active = 0
  saved.tabs.forEach((t, i) => {
    if (!t.cwd || !exists(t.cwd)) return
    if (i === saved.active) active = tabs.length
    let resume: string | undefined
    if (t.agent === 'codex') resume = CODEX_RESUME
    else if (t.agent === 'claude') {
      const key = t.cwd.toLowerCase()
      const n = taken.get(key) ?? 0
      resume = sessions(t.cwd)[n]
      if (resume) taken.set(key, n + 1)
    }
    tabs.push(resume ? { cwd: t.cwd, resume } : { cwd: t.cwd })
  })
  return { tabs, active: Math.min(active, Math.max(0, tabs.length - 1)) }
}
```

Test `agentResume.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { CODEX_RESUME, planRestore, validResume } from './agentResume'

describe('planRestore', () => {
  const all = (): boolean => true
  it('drops a folder that has gone and keeps the active tab pointing right', () => {
    const r = planRestore(
      { tabs: [{ cwd: 'C:\\gone' }, { cwd: 'C:\\a' }, { cwd: 'C:\\b' }], active: 2 },
      (p) => p !== 'C:\\gone', () => [])
    expect(r).toEqual({ tabs: [{ cwd: 'C:\\a' }, { cwd: 'C:\\b' }], active: 1 })
  })
  it('hands two claude tabs in one folder the newest and second-newest session', () => {
    const r = planRestore(
      { tabs: [{ cwd: 'C:\\a', agent: 'claude' }, { cwd: 'c:\\A', agent: 'claude' }], active: 0 },
      all, () => ['new-id', 'old-id'])
    expect(r.tabs.map((t) => t.resume)).toEqual(['new-id', 'old-id'])
  })
  it('resumes nothing when claude recorded no session', () => {
    expect(planRestore({ tabs: [{ cwd: 'C:\\a', agent: 'claude' }], active: 0 }, all, () => []).tabs[0])
      .toEqual({ cwd: 'C:\\a' })
  })
  it('gives codex its own resume', () => {
    expect(planRestore({ tabs: [{ cwd: 'C:\\a', agent: 'codex' }], active: 0 }, all, () => []).tabs[0].resume)
      .toBe(CODEX_RESUME)
  })
})

describe('validResume', () => {
  it('accepts a session id and the codex marker, refuses a command', () => {
    expect(validResume('3f2a9c1e-77aa-4c0d-9b1e-0a1b2c3d4e5f')).toBeTruthy()
    expect(validResume(CODEX_RESUME)).toBe(CODEX_RESUME)
    expect(validResume('x; rm -rf')).toBeUndefined()
  })
})
```

- [ ] **Step 6: `tabsStore.ts`**

```ts
import { existsSync, readFileSync, writeFileSync } from 'fs'
import type { SavedTabs } from '@shared/types'

const EMPTY: SavedTabs = { tabs: [], active: 0 }
const MAX_TABS = 50

/** Reads whatever is there and keeps only what has the right shape. */
export function parseTabs(raw: string): SavedTabs {
  try {
    const j = JSON.parse(raw) as { tabs?: unknown; active?: unknown }
    if (!Array.isArray(j.tabs)) return EMPTY
    const tabs = j.tabs
      .filter((t): t is { cwd: string; agent?: string } => !!t && typeof (t as { cwd?: unknown }).cwd === 'string')
      .slice(0, MAX_TABS)
      .map((t) => (t.agent === 'claude' || t.agent === 'codex' ? { cwd: t.cwd, agent: t.agent } : { cwd: t.cwd }))
    const active = typeof j.active === 'number' && j.active >= 0 && j.active < tabs.length ? j.active : 0
    return { tabs, active }
  } catch {
    return EMPTY
  }
}

export function createTabsStore(file: string, delayMs = 400): {
  load(): SavedTabs
  save(s: SavedTabs): void
  flush(): void
} {
  let pending: SavedTabs | null = null
  let timer: NodeJS.Timeout | null = null
  const write = (): void => {
    if (timer) clearTimeout(timer)
    timer = null
    if (!pending) return
    try {
      writeFileSync(file, JSON.stringify(pending))
    } catch {
      /* a lost save is a tab that does not come back, not a crash */
    }
    pending = null
  }
  return {
    load: () => (existsSync(file) ? parseTabs(readFileSync(file, 'utf8')) : EMPTY),
    save: (s) => {
      pending = s
      if (timer) clearTimeout(timer)
      timer = setTimeout(write, delayMs)
    },
    // Close flushes the debounce: a lost last write is a Claude session that never resumes.
    flush: write
  }
}
```

Test `tabsStore.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createTabsStore, parseTabs } from './tabsStore'

describe('tabsStore', () => {
  it('keeps only well-shaped tabs and a valid active index', () => {
    expect(parseTabs('{"tabs":[{"cwd":"C:\\\\a","agent":"claude"},{"x":1},{"cwd":"C:\\\\b","agent":"vim"}],"active":9}'))
      .toEqual({ tabs: [{ cwd: 'C:\\a', agent: 'claude' }, { cwd: 'C:\\b' }], active: 0 })
    expect(parseTabs('not json')).toEqual({ tabs: [], active: 0 })
  })
  it('flush writes a pending save at once', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'pt-')), 'tabs.json')
    const store = createTabsStore(file, 60000)
    store.save({ tabs: [{ cwd: 'C:\\a' }], active: 0 })
    store.flush()
    expect(JSON.parse(readFileSync(file, 'utf8')).tabs[0].cwd).toBe('C:\\a')
    expect(store.load().tabs).toHaveLength(1)
  })
})
```

- [ ] **Step 7: Extract `agentPoll.ts` and `windowState.ts`**

`agentPoll.ts`: move the poll from SRC `index.ts` lines 198-260 (constants and the PowerShell query helper; read to find its end) and 1758-1840 into `startAgentPoll(send)`, which starts the interval and returns a stop function. It consumes `livePids` and `ptyOutputTicks` from `./terminal` and `parseProcLines`, `treeAgentKind` from `./agentDetect`. Keep every comment in that block; it is the measured reasoning. `windowState.ts`: move `readWindowState` and `watchWindowState` (SRC lines 770-850) with their `WindowState` type; the state file is `window.json` in userData.

- [ ] **Step 8: Run**

Run: `npm test && npm run typecheck:node`
Expected: PASS. `index.ts` does not exist yet, so typecheck covers the modules only; fix stray imports of Prism modules (`roots`, `holders`, etc.) by deleting the code that used them, never by copying those modules.

- [ ] **Step 9: Commit** `feat(main): pty, shells, agent detection and resume transplanted; tab store`

---

### Task 6: Main `index.ts` and preload

**Files:**
- Create: `src/main/index.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`

**Interfaces:**
- Consumes: everything Task 5 produced.
- Produces `window.prism`:

```ts
interface PrismApi {
  termShells(): Promise<ShellDef[]>
  termSpawn(id: string, cwd: string, shellId?: string, resume?: string): Promise<boolean>
  termInput(id: string, data: string): void
  termResize(id: string, cols: number, rows: number): void
  termKill(id: string): void
  termPrewarm(cwd: string, shellId?: string): void
  onTermData(cb: (id: string, data: string) => void): () => void
  onTermAgent(cb: (id: string, has: boolean, kind: AgentKind | null) => void): () => void
  onTermExit(cb: (id: string) => void): () => void
  clipboardKind(): Promise<...>            // copy the exact name and return type Prism's preload uses for the paste rule (SRC preload lines 503-520)
  openExternal(url: string): void          // http(s) only
  pickFolder(): Promise<string | null>
  restoreTabs(): Promise<Restored>         // saved tabs + launch-argument folders appended
  tabsChanged(s: SavedTabs): void
  onOpenFolder(cb: (cwd: string) => void): () => void
  setAgentBusy(busy: boolean): void        // main mirrors it for the window-close question
  onCloseRequest(cb: () => void): () => void
  confirmClose(): void                     // the renderer's "go ahead"
  shellVerbStatus(): Promise<boolean>
  setShellVerb(on: boolean): Promise<boolean>
  setAcrylic(on: boolean): Promise<boolean>   // false = not supported here
  acrylicSupported(): Promise<boolean>
  windowMinimize(): void; windowToggleMaximize(): void; windowClose(): void
  windowToggleFullscreen(): void; quitApp(): void
  appVersion(): Promise<string>
  onUpdate(cb): () => void; onUpdateProgress(cb): () => void; installUpdate(url: string): Promise<boolean>
}
```

- [ ] **Step 1: Write `index.ts` from Prism's, by subtraction**

Start from these SRC blocks, read each fully before copying: single-instance lock and `second-instance` (line 1291 on), `raise` (1102), `createWindow` (1142, keep the NOT-`frame: false` window setup and its comment), `applyMaterial` (920), the `--e2e` handling (grep `e2e` in SRC index.ts: `focusable: false`, `showInactive`, no verb), the update wiring (1600-1660), `dialog:pick-folder` (1667), `term:*` handlers (1716-1757), verb handlers (2211 on) and the apply-once marker logic around `shouldWriteVerb`, `will-navigate` + window-open guards, `shell:open-external`. Drop the root wall from `term:spawn`; its checks become:

```ts
ipcMain.handle('term:spawn', async (_e, id: string, cwd: string, shellId?: string, resume?: string) => {
  const dir = typeof cwd === 'string' && existsSync(cwd) && statSync(cwd).isDirectory() ? cwd : homedir()
  return spawnTerm(id, dir, shellId, validResume(resume), /* same remaining args as SRC */)
})
```

(Match `spawnTerm`'s real parameter list at SRC `terminal.ts` line 270.)

- [ ] **Step 2: The resident lifecycle (new)**

```ts
let quitting = false          // set by quitApp, the installer's close, and before-quit
let agentBusy = false         // mirrored from the renderer
let closeAgreed = false

ipcMain.on('agent:busy', (_e, busy: boolean) => { agentBusy = busy })
ipcMain.on('close:confirmed', () => { closeAgreed = true; mainWindow?.close() })

win.on('close', (e) => {
  if (agentBusy && !closeAgreed) {
    e.preventDefault()
    win.webContents.send('close:request')   // the renderer asks, names the agent, then confirms or not
    return
  }
  closeAgreed = false
  tabs.flush()
  killAll()
  if (!quitting) {
    // Resident: the window goes, the process stays, so the next launch is instant.
    e.preventDefault()
    win.hide()
    win.webContents.send('window:hidden')   // the renderer drops its tab list; restore refills it
  }
})

app.on('before-quit', () => { quitting = true })
app.on('window-all-closed', () => { /* resident: nothing */ })
```

Showing again (`second-instance`, or a plain relaunch): `win.show()`, `raise(win)`, then send `restore:again` so the renderer calls `restoreTabs()`; folders from the second instance's argv go out as `open:folder` events AFTER that restore resolves. `restoreTabs` = `planRestore(tabs.load(), existsSync-and-isDirectory, claudeSessions)` with `foldersFromArgv(process.argv)` appended as plain tabs on first launch. The renderer closing its LAST tab calls `windowClose()`, which takes the same path.

- [ ] **Step 3: Acrylic**

```ts
const acrylicOk = (): boolean => {
  const [maj, , build] = release().split('.').map(Number)   // os.release(): "10.0.22631"
  return maj >= 10 && build >= 22000
}
ipcMain.handle('acrylic:supported', () => acrylicOk())
ipcMain.handle('acrylic:set', (_e, on: boolean) => {
  if (!acrylicOk() || !mainWindow) return false
  mainWindow.setBackgroundMaterial(on ? 'acrylic' : 'none')
  return true
})
```

Keep SRC `applyMaterial`'s fullscreen rule (material off while fullscreen) if it has one; read its comment block at SRC 859-935.

- [ ] **Step 4: Preload**

Copy the relevant members from SRC `preload/index.ts` (terminal block 464-520, update block 541-560, `pickFolder`, verb pair) and add the new ones from the Interfaces block. `index.d.ts` declares `window.prism: PrismApi`.

- [ ] **Step 5: Verify**

Run: `npm run typecheck:node && npm run lint`
Expected: clean. `index.ts` should land under ~600 lines; if it is heading past that, something that belongs in its own file is being inlined.

- [ ] **Step 6: Commit** `feat(main): window, resident lifecycle, IPC and preload`

---

### Task 7: `chromeTheme.ts`, the theme drives the chrome (new, pure)

**Files:**
- Create: `src/renderer/src/lib/chromeTheme.ts`, `src/renderer/src/lib/chromeTheme.test.ts`

**Interfaces:**
- Consumes: `TermTheme` (`background`, `foreground`, `cursor`, `blue` as xterm names them; check `termTheme.ts` line 9), `mixHex`, `luminance`, `contrastRatio`, `ensureContrast` from `termAnsi`.
- Produces:

```ts
export interface ChromeTokens { mode: 'dark' | 'light'; vars: Record<string, string> }
export function chromeTokens(theme: TermTheme, opacityPct?: number): ChromeTokens
export function applyChrome(t: ChromeTokens, el?: HTMLElement): void
```

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest'
import { chromeTokens } from './chromeTheme'
import { TERM_PRESETS, resolveTermTheme } from './termTheme'
import { contrastRatio } from './termAnsi'

describe('chromeTokens', () => {
  it.each(TERM_PRESETS.map((p) => p.id))('%s: readable text and a visible accent on its own ground', (id) => {
    const { vars } = chromeTokens(resolveTermTheme(id))
    expect(contrastRatio(vars['--p-text'], vars['--p-bg-solid'])).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(vars['--p-accent'], vars['--p-bg-solid'])).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(vars['--p-text-dim'], vars['--p-bg-solid'])).toBeGreaterThanOrEqual(3)
  })
  it('measures the mode instead of trusting a name', () => {
    expect(chromeTokens(resolveTermTheme('github')).mode).toBe('light')
    expect(chromeTokens(resolveTermTheme('dracula')).mode).toBe('dark')
  })
  it('paints a translucent ground only when asked', () => {
    expect(chromeTokens(resolveTermTheme('prism')).vars['--p-bg']).toMatch(/^#[0-9a-f]{6}$/i)
    expect(chromeTokens(resolveTermTheme('prism'), 60).vars['--p-bg']).toMatch(/^#[0-9a-f]{6}99$/i)
  })
})
```

- [ ] **Step 2: Run, expect FAIL** (`./chromeTheme` missing).

- [ ] **Step 3: Implement**

```ts
import type { TermTheme } from './termTheme'
import { contrastRatio, ensureContrast, luminance, mixHex } from './termAnsi'

// The window wears the terminal's theme. Every chrome colour is derived from
// the theme's background, foreground and blue, and whatever falls short of a
// contrast floor is moved to it, so no preset and no custom theme can make an
// unreadable title bar.

const INDIGO = '#5b5bd6'

export interface ChromeTokens {
  mode: 'dark' | 'light'
  vars: Record<string, string>
}

const alphaHex = (pct: number): string =>
  Math.round((Math.min(100, Math.max(0, pct)) / 100) * 255).toString(16).padStart(2, '0')

export function chromeTokens(theme: TermTheme, opacityPct = 100): ChromeTokens {
  const bg = theme.background ?? '#0b0b0f'
  const fg = ensureContrast(theme.foreground ?? '#e7e7ee', bg, 4.5)
  // Measured, never read off a name: a custom ground is whatever somebody made it.
  const mode = luminance(bg) > 0.4 ? 'light' : 'dark'
  const candidates = [theme.blue, theme.cursor, INDIGO].filter((c): c is string => !!c)
  const best = candidates.find((c) => contrastRatio(c, bg) >= 3) ?? ensureContrast(candidates[0], bg, 3)
  const accentText = contrastRatio('#ffffff', best) >= contrastRatio('#0b0b0f', best) ? '#ffffff' : '#0b0b0f'
  const vars: Record<string, string> = {
    '--p-bg-solid': bg,
    '--p-bg': opacityPct >= 100 ? bg : bg + alphaHex(opacityPct),
    '--p-text': fg,
    '--p-text-dim': ensureContrast(mixHex(fg, bg, 0.4), bg, 3),
    '--p-surface': mixHex(bg, fg, 0.06),
    '--p-surface-hi': mixHex(bg, fg, 0.12),
    '--p-border': mixHex(bg, fg, 0.16),
    '--p-side-flat': mixHex(bg, fg, 0.04),
    '--p-accent': best,
    '--p-accent-hi': mixHex(best, fg, 0.25),
    '--p-accent-text': accentText
  }
  return { mode, vars }
}

export function applyChrome(t: ChromeTokens, el: HTMLElement = document.documentElement): void {
  for (const [k, v] of Object.entries(t.vars)) el.style.setProperty(k, v)
  el.dataset.mode = t.mode
  el.style.colorScheme = t.mode
}
```

Confirm `mixHex(a, b, t)`'s argument order in `termAnsi.ts` line 61 (t = share of `b`) and flip the calls if it is the other way. After the components are copied (Task 8), grep them for every `var(--p-...)` they read and add any token missing from `vars`, derived the same way; the test file then gains one assertion that each of those names is present.

- [ ] **Step 4: Run, expect PASS** for every preset. If a preset fails the 4.5 floor, the fix is in `chromeTokens` (it must move the colour), never in the preset.
- [ ] **Step 5: Commit** `feat(theme): chrome tokens derived from the terminal theme`

---

### Task 8: Renderer components transplant

**Files:**
- Create (copy then trim): `src/renderer/src/components/TerminalPanel.tsx`, `TermFind.tsx`, `TabStrip.tsx`, `ContextMenu.tsx`; `src/renderer/index.html`, `src/renderer/src/main.tsx`, `src/renderer/src/index.css`
- Create: `src/renderer/src/components/ConfirmDialog.tsx`, `EmptyState.tsx`, `TitleBar.tsx`, `UpdateChip.tsx`

**Interfaces:**
- Produces: `TerminalPanel` exports unchanged (`ensureTermSession(id, cwd, shellId)`, `focusTermSession`, `disposeTermSession`, `findInTerm`, `clearTermFind`, `onTermFindResults`, default panel component taking the session id); `TabStrip` props as in SRC minus `onDropFile` semantics noted below and minus `wash`.

- [ ] **Step 1: Copy**

```bash
S=../Prism/src/renderer; mkdir -p src/renderer/src/components
cp $S/index.html src/renderer/; cp $S/src/main.tsx src/renderer/src/
for f in TerminalPanel TermFind TabStrip ContextMenu; do cp $S/src/components/$f.tsx src/renderer/src/components/; done
```

- [ ] **Step 2: Trim `TerminalPanel.tsx`**

- `currentTermTheme()` becomes: resolve the preset, and when `termAcrylic()` is on, paint the background with the opacity (`bg + alphaHex`), since acrylic now works with any theme. Remove the `'style'` branch and `watchTermTheme`; repaint on `onTermLookChange` only.
- The key handler: delete the Ctrl+` branch (nothing to hide). Keep the `Tab` / `[twb]` / `1-9` yield and add `,` for Ctrl+, (settings).
- Everything else stays, comments included.

- [ ] **Step 3: Trim `TabStrip.tsx`**

- `Tab` comes from the new `lib/tabs`. Remove `dragPayload` / `setDrag` file-drop handling and the `wash` prop; a FOLDER dropped on the strip calls `onDropFolder(path)` (new tab there), a file's folder likewise.
- Add `title={tab.cwd}` on each tab button (the full-path tooltip).
- Keep: reorder, the + with its right-click pinned/recent list (`onNew`, `onOpenRecent`), indicator rendering (`workingIds`, `doneIds`, `agentIds`, minimal and full).

- [ ] **Step 4: `index.css`**

Start from SRC `index.css`. Keep: the Tailwind import, base resets, scrollbar styling, the tab indicator keyframes (grep `agent` and `indeterminate`), xterm overrides, context-menu styles. Delete: token colours for the code viewer, every viewer/transport/phone rule, and the static `--p-*` values (they come from `applyChrome` now; leave the `prism` preset's values as the `:root` fallback so first paint is not unstyled).

- [ ] **Step 5: Small new components**

`ConfirmDialog.tsx`: a focus-trapped modal `{ title, body, confirmLabel, onConfirm, onCancel }`, Escape cancels, Enter confirms; if SRC has an equivalent dialog used by the close flow (grep `Discard` in SRC components), copy that instead and strip it to these props. `EmptyState.tsx`: centred "New tab" button calling `onNew`. `TitleBar.tsx`: copy SRC's TopBar (grep `WebkitAppRegion` to find it), keep the monogram, the drag region, min / max / close, and a menu button with "Settings" and "Quit Prism Terminal" (`quitApp`); drop the file name, the Tools and phone buttons. `UpdateChip.tsx`: copy SRC's chip unchanged (grep `onUpdateProgress`).

- [ ] **Step 6: Verify** `npm run typecheck:web && npm run lint` - clean apart from `App` not existing yet (stub `App.tsx` exporting an empty fragment if needed for the typecheck, replaced in Task 9).
- [ ] **Step 7: Commit** `feat(ui): terminal panel, tab strip and chrome components transplanted`

---

### Task 9: `App.tsx`, prefs and the new-tab flow

**Files:**
- Create: `src/renderer/src/lib/newTabPrefs.ts` (+test), `src/renderer/src/lib/closePrefs.ts`, `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: Tasks 3, 4, 6, 7, 8.
- Produces: `newTabMode(): 'ask' | 'folder'`, `newTabFolder(): string`, `setNewTabMode(mode, folder?)`, hooks `useNewTabMode`, `useNewTabFolder`; `confirmClose(): boolean`, `setConfirmClose(on)`, `useConfirmClose`.

- [ ] **Step 1: `newTabPrefs.ts` with test**

```ts
import { useSyncExternalStore } from 'react'

// What the + opens: a chooser every time, or one fixed folder.
export type NewTabMode = 'ask' | 'folder'

const MODE_KEY = 'prism.newtab.mode'
const FOLDER_KEY = 'prism.newtab.folder'

let listeners: Array<() => void> = []
const notify = (): void => listeners.forEach((l) => l())

export function newTabFolder(): string {
  return localStorage.getItem(FOLDER_KEY) ?? ''
}
/** 'folder' only counts while a folder is actually chosen. */
export function newTabMode(): NewTabMode {
  return localStorage.getItem(MODE_KEY) === 'folder' && newTabFolder() ? 'folder' : 'ask'
}
export function setNewTabMode(mode: NewTabMode, folder?: string): void {
  localStorage.setItem(MODE_KEY, mode)
  if (folder !== undefined) localStorage.setItem(FOLDER_KEY, folder)
  notify()
}
const sub = (cb: () => void): (() => void) => {
  listeners.push(cb)
  return () => {
    listeners = listeners.filter((l) => l !== cb)
  }
}
export const useNewTabMode = (): NewTabMode => useSyncExternalStore(sub, newTabMode)
export const useNewTabFolder = (): string => useSyncExternalStore(sub, newTabFolder)
```

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { newTabMode, setNewTabMode } from './newTabPrefs'

describe('newTabPrefs', () => {
  beforeEach(() => localStorage.clear())
  it('asks by default', () => expect(newTabMode()).toBe('ask'))
  it('is only a fixed folder once one is chosen', () => {
    setNewTabMode('folder')
    expect(newTabMode()).toBe('ask')
    setNewTabMode('folder', 'C:\\work')
    expect(newTabMode()).toBe('folder')
  })
})
```

`closePrefs.ts` is the same store shape over `prism.close.confirm`, default ON (`!== '0'`).

- [ ] **Step 2: `App.tsx`**

State: `const [state, setState] = useState<TabState>(EMPTY)`, `workingIds`, `doneIds`, `agentIds` (Sets), `agentKinds` (Map id -> AgentKind), `findOpen`, `confirm` (a pending close question or null). Behaviour, each mapped to the SRC code it replaces (read SRC `App.tsx` around every use of `onTermAgent`, `onTitle`, `readAgentTitle`, `startupOutput`, `noteWorking`, `doneIds` before writing; the indicator rules there are copied, not reinvented):

```ts
let seq = 0
const nextId = (): string => 't' + Date.now().toString(36) + '-' + String((seq += 1))

function openTab(cwd: string, resume?: string): void {
  const id = nextId()
  if (resume) markResume(id, resume)
  rememberRoot(cwd)
  void import('./components/TerminalPanel').then((m) => m.ensureTermSession(id, cwd, savedShellId()))
  setState((s) => addTab(s, id, cwd))
}

async function newTab(): Promise<void> {
  let cwd: string | null = newTabMode() === 'folder' ? newTabFolder() : null
  if (!cwd) cwd = await window.prism.pickFolder()      // cancel opens nothing
  if (cwd) openTab(cwd)
}
```

Effects:
1. On mount and on `restore:again`: `restoreTabs()` then `openTab(t.cwd, t.resume)` for each, then `pickTab` the saved active. Every restored shell spawns at once.
2. `onOpenFolder(openTab)`.
3. `onCwd((id, path) => setState((s) => setCwd(s, id, path)))`.
4. `onTermExit((id) => closeNow(id))`.
5. Agent indicator: `onTermAgent` maintains `agentIds` / `agentKinds`; `onTitle` + `readAgentTitle` set and clear `workingIds` the moment the title says so, with the Codex dialect acted on only for ids in `agentIds`; sessions without a title state use the `termActivity` output fallback exactly as SRC does. A tab leaving `workingIds` while not active joins `doneIds`; visiting a tab removes it from `doneIds`. Call `noteWorking(workingIds)` whenever the set changes.
6. Report: on every change of `shellTabs(state)` or the active tab, `tabsChanged({ tabs: shell tabs mapped to { cwd, agent: agentKinds.get(id) }, active })`, and `setAgentBusy(workingIds.size > 0 && confirmClose())`.
7. Theme: on mount and on `onTermLookChange`, `applyChrome(chromeTokens(resolveTermTheme(termThemeId()), termAcrylic() ? termOpacity() : 100))` and `void window.prism.setAcrylic(termAcrylic())`.
8. In `folder` mode, `termPrewarm(newTabFolder(), savedShellId())` on mount and after each new tab.

Closing:

```ts
function closeNow(id: string): void {
  void import('./components/TerminalPanel').then((m) => m.disposeTermSession(id))
  window.prism.termKill(id)
  forgetSession(id); forgetAgentTitle(id)
  setState((s) => {
    const next = closeTab(s, id)
    if (shellTabs(next).length === 0) window.prism.windowClose()   // last tab: the window goes
    return next
  })
}

function requestClose(id: string): void {
  const ms = workingFor(id)
  if (confirmClose() && workingIds.has(id) && ms !== null) {
    const who = agentKinds.get(id) === 'codex' ? 'Codex' : 'Claude'
    setConfirm({ id, body: who + ' has been working for ' + humanFor(ms) + '. Closing the tab stops it.' })
  } else closeNow(id)
}
```

`onCloseRequest` (window close while busy) raises the same dialog for the window: the body names the longest-running agent and how many tabs are working; confirming calls `window.prism.confirmClose()`. On `window:hidden`, `setState(EMPTY)` and clear the agent sets.

Keys (window `keydown`, capture): Ctrl+Shift+T `newTab`, Ctrl+Shift+W `requestClose(active)`, Ctrl+Tab / Ctrl+Shift+Tab `stepTab`, Ctrl+1-9 pick by index, Ctrl+Shift+F toggles `TermFind`, Ctrl+, `openSettings`, F11 fullscreen.

Render: `TitleBar` (with `UpdateChip`), `TabStrip` (always present while any tab exists), then one mounted `TerminalPanel` for the active shell tab (sessions live in module scope, so switching reattaches), `Settings` for the settings tab (lazy, Task 10), `EmptyState` when there are no tabs, `TermFind` over the panel, `ConfirmDialog`. After a tab becomes active, `focusTermSession(id)`.

- [ ] **Step 3: Verify in the real app**

Run: `npm test && npm run typecheck && npm run lint`, then `npm run dev`.
Expected by hand: + asks for a folder and opens pwsh there; the label follows `cd`; `exit` closes the tab; two tabs keep separate scrollback; running `claude` lights the tab while it works and clears when it answers; a background tab holds the finished colour until visited.

- [ ] **Step 4: Commit** `feat(app): tabs, new-tab flow, agent indicator and close confirmation`

---

### Task 10: Settings

**Files:**
- Create: `src/renderer/src/components/Settings.tsx`, `src/renderer/src/components/StyleMini.tsx` (only if `TerminalTab` uses it)

- [ ] **Step 1: Appearance page**

Copy `TerminalTab` from SRC `Settings.tsx` (line 1199 to the end of that function) plus the small field primitives it uses (row, toggle, select, slider, colour well; grep their names inside `TerminalTab`). Remove the "Follow app style" option and the app-style coupling at SRC line 1240. Acrylic becomes: a toggle bound to `useTermAcrylic` / `setTermAcrylic` with an opacity slider (30-100) bound to `useTermOpacity` / `setTermOpacity`, the slider disabled while acrylic is off; when `acrylicSupported()` is false the toggle is disabled with the hint "Needs Windows 11". Keep: theme grid, custom theme editor, font, size, agent working / finished colours.

- [ ] **Step 2: General page**

- New tabs: radio "Ask where each time" / "Always open in a folder", the second with a "Choose folder..." button (`pickFolder` then `setNewTabMode('folder', path)`) and the chosen path shown.
- Shell: select over `termShells()`, saved with `saveShellId`.
- Agent indicator: minimal / full (`useAgentIndicator`, moved here from the terminal page).
- "Ask before closing a working agent": `useConfirmClose`.
- Explorer menu: switch showing `shellVerbStatus()` (what the REGISTRY says), calling `setShellVerb`, re-reading afterwards; hint: "On Windows 11 it is under Show more options."
- Version from `appVersion()`.

Two-page layout with a left rail, lazy-loaded from `App` (`const Settings = lazy(() => import('./components/Settings'))`).

- [ ] **Step 3: Verify** `npm run typecheck && npm run lint`, then in `npm run dev`: picking the `github` preset turns the whole window light; acrylic at 60% shows the desktop through terminal and chrome alike; fixed-folder mode makes + instant.
- [ ] **Step 4: Commit** `feat(settings): general and appearance pages`

---

### Task 11: Packaging, installer and verb parity

**Files:**
- Create: `electron-builder.yml`, `build/installer.nsh`, `src/main/shellVerbParity.test.ts`

- [ ] **Step 1: `electron-builder.yml`**

```yaml
appId: com.prism.terminal
productName: Prism Terminal
directories:
  buildResources: build
files:
  - out/**
  - package.json
asarUnpack:
  - node_modules/node-pty/**
win:
  target:
    - target: nsis
      arch: [x64]
  executableName: PrismTerminal
  icon: build/icon.ico
nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: false
  artifactName: PrismTerminal-Setup-x64-${version}.exe
  include: build/installer.nsh
  deleteAppDataOnUninstall: false
publish: null
```

Compare with SRC `electron-builder.yml` and carry across any node-pty / native-module setting it has that this lacks (`npmRebuild`, `buildDependenciesFromSource`, extra `asarUnpack` entries).

- [ ] **Step 2: `build/installer.nsh`**

```nsis
!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\Directory\shell\PrismTerminal"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\PrismTerminal"
!macroend
```

It lives directly in the included file (Prism's uninstaller never ran because its macro sat in a file excluded under `BUILD_UNINSTALLER`). The resident process is closed by electron-builder's own running-app check; confirm during Step 4 that an install over a running app succeeds.

- [ ] **Step 3: Parity test**

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { verbKeys } from './shellVerb'

describe('uninstaller parity', () => {
  it('deletes every key the app writes', () => {
    const nsh = readFileSync(join(__dirname, '../../build/installer.nsh'), 'utf8')
    for (const key of verbKeys()) {
      const sub = key.replace(/^HKCU\\/, '')
      expect(nsh).toContain('DeleteRegKey HKCU "' + sub + '"')
    }
  })
})
```

- [ ] **Step 4: Package and install**

```powershell
npm run package
Get-Process PrismTerminal, 'PrismTerminal-Setup*' -ErrorAction SilentlyContinue | Stop-Process -Force
$exe = "$env:LOCALAPPDATA\Programs\Prism Terminal\PrismTerminal.exe"
$before = if (Test-Path $exe) { (Get-Item $exe).LastWriteTime } else { [datetime]::MinValue }
Start-Process "dist\PrismTerminal-Setup-x64-0.1.0.exe" -ArgumentList '/S'
# poll: the exe goes MISSING mid-install, then reappears with a new timestamp
do { Start-Sleep -Milliseconds 500 } until ((Test-Path $exe) -and (Get-Item $exe).LastWriteTime -gt $before -and -not (Get-Process 'PrismTerminal-Setup*' -ErrorAction SilentlyContinue))
```

(Confirm the install directory name from the first install; adjust `$exe` once.) Launch it. Expected: a terminal opens; right-clicking a folder in Explorer offers "Open in Prism Terminal" (under "Show more options" on Windows 11) and it adds a tab to the running window; closing the last tab hides the window and `Get-Process PrismTerminal` still lists it; launching again restores instantly.

- [ ] **Step 5: Commit** `build: nsis installer, verb cleanup on uninstall`

---

### Task 12: e2e, README, CLAUDE.md, open PR 1

**Files:**
- Create: `tools/e2e/run.mjs`, `README.md`, `CLAUDE.md`

- [ ] **Step 1: e2e harness**

Copy SRC `tools/e2e/run.mjs` and keep its skeleton: launch the BUILT app with `--e2e` and a throwaway `--user-data-dir` under `.e2e-profile`, `park()`, per-scenario try/catch, name filter (`npm run e2e -- <name>`), reap processes matched by the profile path only, the pass/fail/duration table. Delete every Prism scenario and the fixtures import except `promptLayout`. Under `--e2e` main must: never write the verb, create the window `focusable: false` + `showInactive()`, skip the update check, and make `pickFolder` return `process.env.PT_E2E_PICK` when set (so the ask flow is drivable without a native dialog).

Scenarios (each asserts off the DOM or the xterm buffer via `page.evaluate`):
- `spawn`: with `PT_E2E_PICK` = a temp dir, click +, type `echo pt-ok`, buffer contains `pt-ok`.
- `cwdLabel`: `mkdir sub; cd sub`, the active tab's label becomes `sub` and its `title` ends in `\sub`.
- `indicator`: open a second tab, in the first run `$Host.UI.RawUI.WindowTitle = [char]0x25D0 + ' Claude Code'` (never a raw `[Console]::Write`, which re-encodes the glyph), assert the first tab carries the working marker; set `[char]0x2733 + ' Claude Code'`, assert working is gone and, being a background tab, the finished marker is on; visit it, assert it clears. Use the same `data-` attributes SRC's e2e reads on `TabStrip`.
- `theme`: set `localStorage['prism.term.theme'] = 'github'` through Settings' grid click, assert `documentElement.dataset.mode === 'light'` and the title bar's computed background luminance is above 0.4.
- `newTabFolder`: choose fixed-folder mode in Settings, click +, a tab opens in it with no pick call.
- `restore`: open two tabs in two temp dirs, quit via `quitApp`, relaunch on the same profile, two tabs with those labels return.
- `handoff`: launch a second instance with a folder argument, the first window gains a tab labelled for it; the second process exits.
- `lastTab`: close the only tab, the window becomes hidden (`BrowserWindow.isVisible()` false via `electronApp.evaluate`) and the process is alive.
- `verbGuard`: after a run, `reg query HKCU\Software\Classes\Directory\shell\PrismTerminal` under the e2e profile's lifetime was never created by it: assert main logged no `reg add` (expose a counter under `--e2e`), rather than reading the real registry, which the installed app legitimately owns.
- `promptLayout`: copied.

Run: `npm run e2e` - Expected: all PASS.

- [ ] **Step 2: README** via the `readme` skill: what it is, a screenshot of a working tab with the indicator, install, keys table, themes, the Explorer verb, "unsigned" note, build from source.

- [ ] **Step 3: CLAUDE.md**, lean (well under 200 lines): what it is, that it was transplanted from Prism `4196c3a` and Prism keeps its own copy (port fixes by hand), the scope list and the stripped list from the spec, the hard-won rules that must not regress (bundled conpty.dll, not `frame: false`, keys on `onKey`, `fitKeepingCursorLine`, title-driven indicator, startup is not work, resident lifecycle, verb applied once and never under dev/e2e, opacity read defensively), build/test/release commands, the install-and-poll-the-timestamp rule, pointers to the spec and plan.

- [ ] **Step 4: Full gate, push, PR**

```bash
npm run typecheck && npm run lint && npm test && npm run e2e
git add -A && git commit -m "test(e2e): scenarios, readme and project instructions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push -u origin feat/1-app
gh pr create --title "Prism Terminal 0.1.0: the app (#1)" --body "Closes #1. The terminal lifted out of Prism 4196c3a: tabs, agent indicator, themes driving the chrome, acrylic, restore with agent resume, Explorer verbs, resident lifecycle. Unsigned. Placeholder icon; no release is published until #2.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Then package + install the branch build (Task 11 Step 4's script), report the installed version, and ask "merge?" once with a recommendation. STOP until answered.

---

### Task 13: Icon mockups, owner pick, first release

Runs on `feat/2-icon-release` after PR 1 merges. Has its own owner checkpoint by design (spec: Icon).

- [ ] **Step 1: Mockup round.** Generate candidates through Codex as the owner asked (`/codex:rescue generate ...`, using the image / vector model the owner names at that point). Brief: near-black rounded tile, one indigo accent `#5b5bd6`, the Prism monogram's family, a prompt mark (`>_` or a caret), must read at 16px; vector output preferred. At least six directions.
- [ ] **Step 2: Comparison sheet.** Render every candidate at 16 / 32 / 48 / 256 on Explorer light and dark grounds plus the taskbar, as one PNG (adapt SRC `tools/icons/compare.py`). Show the owner. STOP for the pick.
- [ ] **Step 3: Draw the pick per size** into `build/icon.ico` (16, 20, 24, 32, 40, 48, 64, 256), each frame drawn at its size with the 16px frame on whole pixels, following SRC `tools/icons/build_icons.py`'s approach; also the TitleBar monogram SVG.
- [ ] **Step 4: `release.yml`.** Copy SRC's, remove the binary-fetch steps, artifact glob `dist/PrismTerminal-Setup-x64-*.exe`. It publishes `v<version>` on push to main and refuses to overwrite an existing version. Wire `update.ts`'s repo constant to `PrismTerminal`.
- [ ] **Step 5: Gate, PR, install, "merge?"** as in Task 12 Step 4. Version stays `0.1.0`: it is the first release. After the merge, install the RELEASED build and confirm the version.

---

## Self-review notes

- Spec coverage: tab model (T4), transplant (T3, T5, T8), new tab modes + recents (T8, T9), last tab / resident / second open (T6, T9), verbs + uninstall (T5, T11), theme drives chrome (T7, T9), acrylic (T3, T6, T8, T10), settings (T10), close confirmation (T6, T9), keys (T8, T9), resume (T5, T6, T9), icon (T13), verification (T2, T12), CI / release (T2, T13).
- Known reads the executor must do rather than trust this plan: `spawnTerm`'s parameter list, the clipboard-kind preload member's exact name, `mixHex`'s argument order, the `--p-*` tokens the copied components read. Each is called out in its step.
