# Starts Nebula Bridge automatically when you sign in to Windows
# (a shortcut in your Startup folder), and starts it right now.
# Undo: delete "Nebula Bridge.lnk" from shell:startup.

$ErrorActionPreference = "Stop"
$Repo = Split-Path -Parent $PSScriptRoot
$Exe = Join-Path $Repo "bridge-dist\NebulaBridge.exe"
if (-not (Test-Path $Exe)) { throw "Build the bridge first: dotnet publish bridge -c Release -o bridge-dist" }

$Startup = [Environment]::GetFolderPath("Startup")
$Link = Join-Path $Startup "Nebula Bridge.lnk"
$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($Link)
$sc.TargetPath = $Exe
$sc.WorkingDirectory = Split-Path $Exe
$sc.Description = "Nebula Plus media bridge for Zen"
$sc.Save()
Write-Host "Startup shortcut: $Link"

if (-not (Get-Process NebulaBridge -ErrorAction SilentlyContinue)) {
  Start-Process $Exe
  Write-Host "Nebula Bridge started"
}
