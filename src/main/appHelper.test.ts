import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { appHelperSend, configureAppHelper, onAppHelperLine, stopAppHelper } from './appHelper'

describe('appHelper', () => {
  // MEASURED in both installed 0.58.0 copies (2026-10-17, owner: "The
  // dictation only opens inside of Prism Terminal, not outside it"): the page
  // says its dictation key before the window is shown, which is where the
  // helper's path is set; `hook 1` went nowhere and was never sent again.
  it('keeps a line sent before it is configured, and sends it once it is', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pt-helper-'))
    const script = join(dir, 'echo.ps1')
    writeFileSync(script, 'while ($null -ne ($l = [Console]::In.ReadLine())) { if ($l -eq "quit") { break }; [Console]::Out.WriteLine("got " + $l); [Console]::Out.Flush() }\n')
    const heard: string[] = []
    const off = onAppHelperLine((l) => heard.push(l))
    appHelperSend('hook 1')
    configureAppHelper(script, null)
    const until = Date.now() + 15000
    while (!heard.includes('got hook 1') && Date.now() < until) await new Promise((r) => setTimeout(r, 50))
    off()
    stopAppHelper()
    expect(heard).toContain('got hook 1')
  }, 20000)
})
