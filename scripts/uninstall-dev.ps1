# Restores the store version of Nebula (undoes install-dev.ps1). Close Zen first.

param([string]$Profile = "$env:APPDATA\zen\Profiles\r8ayobza.Default (release)-1")

$ErrorActionPreference = "Stop"
$Mods = Join-Path $Profile "chrome\sine-mods"
$Target = Join-Path $Mods "Nebula"
$Backup = Join-Path $Mods "Nebula.store-backup"

if (Get-Process zen -ErrorAction SilentlyContinue) { throw "Close Zen first." }

$item = Get-Item $Target -ErrorAction SilentlyContinue
if ($item -and $item.LinkType -eq "Junction") {
  # Removes only the link, never the repo it points to.
  [System.IO.Directory]::Delete($Target)
}
if (Test-Path $Backup) { Rename-Item $Backup "Nebula" }
if (Test-Path "$Mods\mods.json.bak-plus") { Copy-Item "$Mods\mods.json.bak-plus" "$Mods\mods.json" -Force }
Write-Host "Store Nebula restored."
