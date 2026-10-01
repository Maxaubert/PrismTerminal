import { describe, expect, it } from 'vitest'
import { handoffCommand, isStableCopy } from './updateHandoff'

const INSTALLED = 'C:\\Users\\me\\AppData\\Local\\Programs\\PrismTerminal'
const base = {
  installer: 'C:\\T\\pt-update-1\\PrismTerminal-Setup.exe',
  tempDir: 'C:\\T\\pt-update-1',
  pid: 4321,
  installedDir: INSTALLED
}

describe('handoffCommand', () => {
  it('the installed app: install, start again, clean up, as before', () => {
    const cmd = handoffCommand({ ...base, execPath: `${INSTALLED}\\PrismTerminal.exe`, userDataDir: null })
    expect(cmd).toBe(
      "Start-Process -Wait -FilePath 'C:\\T\\pt-update-1\\PrismTerminal-Setup.exe' -ArgumentList '/S'; " +
        `Start-Process -FilePath '${INSTALLED}\\PrismTerminal.exe'; ` +
        "Remove-Item -LiteralPath 'C:\\T\\pt-update-1' -Recurse -Force -ErrorAction SilentlyContinue"
    )
    expect(cmd).not.toContain('robocopy')
  })

  it('starts again on the SAME profile it was started with', () => {
    const cmd = handoffCommand({ ...base, execPath: `${INSTALLED}\\PrismTerminal.exe`, userDataDir: 'C:\\Users\\me\\AppData\\Roaming\\Other' })
    expect(cmd).toContain(`Start-Process -FilePath '${INSTALLED}\\PrismTerminal.exe' -ArgumentList '--user-data-dir="C:\\Users\\me\\AppData\\Roaming\\Other"'`)
  })

  it('the stable copy updates ITSELF: waits for this process, mirrors the install in, renames the exe, keeps its profile', () => {
    const stable = 'C:\\Users\\me\\AppData\\Local\\PrismTerminalStable'
    const cmd = handoffCommand({
      ...base,
      execPath: `${stable}\\PrismTerminalStable.exe`,
      userDataDir: 'C:\\Users\\me\\AppData\\Roaming\\PrismTerminalStable'
    })
    const steps = cmd.split('; ')
    expect(steps[0]).toContain("-ArgumentList '/S'")
    expect(steps[1]).toBe('Wait-Process -Id 4321 -Timeout 30 -ErrorAction SilentlyContinue')
    expect(steps[2]).toBe(`robocopy '${INSTALLED}' '${stable}' /MIR /NFL /NDL /NJH /NJS /NP | Out-Null`)
    expect(steps[3]).toBe(`Move-Item -Force -LiteralPath '${stable}\\PrismTerminal.exe' -Destination '${stable}\\PrismTerminalStable.exe'`)
    expect(steps[4]).toContain("-Filter 'Uninstall*.exe' | Remove-Item -Force")
    expect(steps[5]).toBe(
      `Start-Process -FilePath '${stable}\\PrismTerminalStable.exe' -ArgumentList '--user-data-dir="C:\\Users\\me\\AppData\\Roaming\\PrismTerminalStable"'`
    )
    expect(steps[6]).toContain('Remove-Item')
  })

  it("doubles a quote in a path, PowerShell's own escaping", () => {
    const cmd = handoffCommand({ ...base, tempDir: "C:\\T\\o'brien", execPath: `${INSTALLED}\\PrismTerminal.exe`, userDataDir: null })
    expect(cmd).toContain("'C:\\T\\o''brien'")
  })
})

describe('isStableCopy', () => {
  it('only the stable exe, and only outside the installed folder', () => {
    expect(isStableCopy('C:\\x\\PrismTerminalStable\\PrismTerminalStable.exe', INSTALLED)).toBe(true)
    expect(isStableCopy(`${INSTALLED}\\PrismTerminal.exe`, INSTALLED)).toBe(false)
    expect(isStableCopy(`${INSTALLED}\\PrismTerminalStable.exe`, INSTALLED)).toBe(false)
  })
})
