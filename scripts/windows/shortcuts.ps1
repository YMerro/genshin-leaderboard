# Adds or removes "Start Leaderboard" / "Stop Leaderboard" / "Open Leaderboard" shortcuts on this
# user's Desktop, pointing at the installed copy (run install.ps1 first).
#
#   powershell -ExecutionPolicy Bypass -File scripts\windows\shortcuts.ps1 create
#   powershell -ExecutionPolicy Bypass -File scripts\windows\shortcuts.ps1 remove
#
# The shortcuts are made on each PC rather than stored in git, because they contain paths that
# are specific to this user and machine.
param(
    [Parameter(Position = 0)][ValidateSet('create', 'remove')][string]$Action = 'create',
    [string]$Target = "$env:USERPROFILE\GenshinLeaderboard"
)
$ErrorActionPreference = 'Stop'
$desktop = [Environment]::GetFolderPath('Desktop')
$names = 'Start Leaderboard', 'Stop Leaderboard', 'Open Leaderboard'

if ($Action -eq 'remove') {
    foreach ($n in $names) { Remove-Item (Join-Path $desktop "$n.lnk") -ErrorAction SilentlyContinue }
    Write-Host 'Desktop shortcuts removed.'
    exit
}

if (-not (Test-Path (Join-Path $Target 'start.ps1'))) { throw "Not installed at $Target. Run scripts\windows\install.ps1 first." }
$shell = New-Object -ComObject WScript.Shell
$powershell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"

function New-Shortcut($name, $script, $icon, $description) {
    $lnk = $shell.CreateShortcut((Join-Path $desktop "$name.lnk"))
    $lnk.TargetPath = $powershell
    $lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $Target $script)`""
    $lnk.WorkingDirectory = $Target
    $lnk.WindowStyle = 7   # minimized: only a brief flash in the taskbar
    $lnk.IconLocation = $icon
    $lnk.Description = $description
    $lnk.Save()
}

New-Shortcut 'Start Leaderboard' 'start.ps1' "$env:SystemRoot\System32\imageres.dll,101" 'Start the Friends Leaderboard in the background'
New-Shortcut 'Stop Leaderboard' 'stop.ps1' "$env:SystemRoot\System32\imageres.dll,100" 'Stop the Friends Leaderboard'

$web = $shell.CreateShortcut((Join-Path $desktop 'Open Leaderboard.lnk'))
$web.TargetPath = 'http://localhost:8081'
$web.Save()

Write-Host "Created Start / Stop / Open Leaderboard shortcuts on $desktop"
