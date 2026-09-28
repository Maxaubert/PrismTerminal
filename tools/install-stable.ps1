# A SECOND, STABLE PRISM TERMINAL for working in while this repo builds and
# installs new versions (owner, 2026-09-28: "install prism terminal somewhere
# safe, a duplicate version, just so i can code with claude or codex in there
# without it closing when we're building and installing new versions").
#
# The installed app is copied as it is, under another exe name, with its own
# profile:
#  - `PrismTerminalStable.exe`: every install step closes `PrismTerminal`
#    processes by name, and so does the NSIS installer; this name is neither.
#  - `--user-data-dir` = %APPDATA%\PrismTerminalStable: the app keeps that
#    profile (main/index.ts), and the single-instance lock is per profile, so
#    it runs beside the installed app with its own tabs and its own restore.
#  - `shell-verb-off` in that profile: it never writes Explorer's "Open
#    terminal here" entries, which belong to the installed app.
# Its update chip will still offer releases: ignore it there, and run this
# script again to move the copy to whatever is installed now. Settings
# (theme, font) are copied from the installed app's profile on the FIRST
# setup only; a refresh keeps the copy's own.
#
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File tools\install-stable.ps1
$ErrorActionPreference = 'Stop'
$source = Join-Path $env:LOCALAPPDATA 'Programs\PrismTerminal'
$target = Join-Path $env:LOCALAPPDATA 'Programs\PrismTerminalStable'
$profileDir = Join-Path $env:APPDATA 'PrismTerminalStable'
$exe = Join-Path $target 'PrismTerminalStable.exe'
if (-not (Test-Path (Join-Path $source 'PrismTerminal.exe'))) { throw "Prism Terminal is not installed at $source" }

# A refresh replaces the files, so the copy must not be running. It is closed
# by its OWN name only; the installed app and its shells are never touched.
$running = Get-Process PrismTerminalStable -ErrorAction SilentlyContinue
if ($running) {
  Write-Host 'Closing the stable copy to refresh it (its tabs come back when it starts).'
  $running | ForEach-Object { $_.CloseMainWindow() | Out-Null }
  Start-Sleep 3
  Get-Process PrismTerminalStable -ErrorAction SilentlyContinue | Stop-Process -Force
}

# /MIR makes the copy exactly the installed app; exit codes below 8 are success.
robocopy $source $target /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "copy failed (robocopy $LASTEXITCODE)" }
$global:LASTEXITCODE = 0
Move-Item -Force (Join-Path $target 'PrismTerminal.exe') $exe
# The uninstaller belongs to the installed app; one in the copy would remove it.
Get-ChildItem $target -Filter 'Uninstall*.exe' | Remove-Item -Force

$first = -not (Test-Path $profileDir)
New-Item -ItemType Directory -Force $profileDir | Out-Null
if ($first) {
  $installedProfile = Join-Path $env:APPDATA 'PrismTerminal'
  foreach ($part in @('Local Storage', 'Preferences')) {
    $from = Join-Path $installedProfile $part
    if (Test-Path $from) { Copy-Item -Recurse -Force $from (Join-Path $profileDir $part) -ErrorAction SilentlyContinue }
  }
}
Set-Content -LiteralPath (Join-Path $profileDir 'shell-verb-off') -Value '' -NoNewline

$menu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Prism Terminal (Stable).lnk'
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($menu)
$link.TargetPath = $exe
$link.Arguments = "--user-data-dir=`"$profileDir`""
$link.WorkingDirectory = $env:USERPROFILE
$link.IconLocation = "$exe,0"
$link.Description = 'Prism Terminal, a stable copy that installs never touch'
$link.Save()

$version = (Get-Item $exe).VersionInfo.ProductVersion
Write-Host "Prism Terminal (Stable) $version is at $target, profile $profileDir."
Write-Host "Start it from the Start menu: Prism Terminal (Stable)."
