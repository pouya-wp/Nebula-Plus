# Installs this repo as the live "Nebula" mod in your Zen profile.
#
#   - Waits for Zen to close (Sine rewrites mods.json while running)
#   - Moves the store copy of Nebula aside (sine-mods\Nebula.store-backup)
#   - Links sine-mods\Nebula -> this repo (a directory junction), so every
#     save here is what Zen loads; plus-dev.uc.js hot-reloads it live
#   - Updates the Nebula entry in mods.json: new scripts, auto-updates OFF
#     (an auto-update would write the store version into this repo)
#   - Starts Nebula Bridge and relaunches Zen
#
# Undo: scripts\uninstall-dev.ps1

param(
  [string]$Profile = "$env:APPDATA\zen\Profiles\r8ayobza.Default (release)-1",
  [string]$ZenExe = "C:\Program Files\Zen Browser\zen.exe"
)

$ErrorActionPreference = "Stop"
$Repo = Split-Path -Parent $PSScriptRoot
$Mods = Join-Path $Profile "chrome\sine-mods"
$Target = Join-Path $Mods "Nebula"
$Backup = Join-Path $Mods "Nebula.store-backup"
$ModsJson = Join-Path $Mods "mods.json"

if (Get-Process zen -ErrorAction SilentlyContinue) {
  Write-Host "Close Zen to continue (waiting)..." -ForegroundColor Yellow
  while (Get-Process zen -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 500 }
  Start-Sleep -Seconds 1
}

# 1) junction
$item = Get-Item $Target -ErrorAction SilentlyContinue
if ($item -and $item.LinkType -eq "Junction") {
  Write-Host "sine-mods\Nebula is already linked to $($item.Target)"
} else {
  if ($item) {
    if (Test-Path $Backup) { Remove-Item $Backup -Recurse -Force }
    Rename-Item $Target "Nebula.store-backup"
    Write-Host "Store copy moved to Nebula.store-backup"
  }
  New-Item -ItemType Junction -Path $Target -Target $Repo | Out-Null
  Write-Host "Linked sine-mods\Nebula -> $Repo" -ForegroundColor Green
}

# 2) mods.json
Copy-Item $ModsJson "$ModsJson.bak-plus" -Force
$theme = Get-Content (Join-Path $Repo "theme.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$mods = Get-Content $ModsJson -Raw -Encoding UTF8 | ConvertFrom-Json
$entry = $mods.Nebula
$entry.name = $theme.name
$entry.description = $theme.description
$entry.version = $theme.version
$entry.scripts = $theme.scripts
$entry."no-updates" = $true
$entry.enabled = $true
$json = $mods | ConvertTo-Json -Depth 20
[System.IO.File]::WriteAllText($ModsJson, $json, (New-Object System.Text.UTF8Encoding $false))
Write-Host "mods.json updated (backup: mods.json.bak-plus)" -ForegroundColor Green

# 3) bridge
$bridge = Join-Path $Repo "bridge-dist\NebulaBridge.exe"
if ((Test-Path $bridge) -and -not (Get-Process NebulaBridge -ErrorAction SilentlyContinue)) {
  Start-Process $bridge
  Write-Host "Nebula Bridge started"
}

# 4) relaunch
Start-Process $ZenExe
Write-Host "Zen relaunched. Enjoy ✨" -ForegroundColor Cyan
