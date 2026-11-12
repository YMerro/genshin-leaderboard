# Turns automatic start at Windows sign-in on or off for the installed Friends Leaderboard.
#
#   powershell -ExecutionPolicy Bypass -File scripts\windows\autostart.ps1 enable
#   powershell -ExecutionPolicy Bypass -File scripts\windows\autostart.ps1 disable
#   powershell -ExecutionPolicy Bypass -File scripts\windows\autostart.ps1 status
#
# It only adds or removes a shortcut in this user's Startup folder. It doesn't start or stop the
# app right now; use start.ps1 / stop.ps1 in the install folder for that.
param(
    [Parameter(Position = 0)][ValidateSet('enable', 'disable', 'status')][string]$Action = 'status',
    [string]$Target = "$env:USERPROFILE\GenshinLeaderboard"
)
$ErrorActionPreference = 'Stop'
$shortcut = Join-Path ([Environment]::GetFolderPath('Startup')) 'Friends Leaderboard.lnk'

switch ($Action) {
    'enable' {
        $start = Join-Path $Target 'start.ps1'
        if (-not (Test-Path $start)) { throw "Not installed at $Target. Run scripts\windows\install.ps1 first." }
        $lnk = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcut)
        $lnk.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
        $lnk.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$start`""
        $lnk.WorkingDirectory = $Target
        $lnk.WindowStyle = 7
        $lnk.Description = 'Starts the Friends Leaderboard in the background'
        $lnk.Save()
        Write-Host 'Auto-start ENABLED: the app will start every time you sign in to Windows.'
    }
    'disable' {
        if (Test-Path $shortcut) { Remove-Item $shortcut -Force }
        Write-Host 'Auto-start DISABLED: the app will not start at sign-in. Use start.ps1 to run it manually.'
    }
    'status' {
        if (Test-Path $shortcut) { Write-Host 'Auto-start is ENABLED (starts at sign-in).' }
        else { Write-Host 'Auto-start is DISABLED.' }
    }
}
