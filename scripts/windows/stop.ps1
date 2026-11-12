# Stops the Friends Leaderboard (and tells start.ps1 not to restart it).
$base = Split-Path -Parent $MyInvocation.MyCommand.Path
New-Item -ItemType File -Force (Join-Path $base 'stop.flag') | Out-Null
Get-CimInstance Win32_Process -Filter "Name='javaw.exe'" |
    Where-Object { $_.CommandLine -like '*genshin-leaderboard.jar*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Write-Host 'Friends Leaderboard stopped.'
