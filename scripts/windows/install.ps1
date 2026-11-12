# Installs the Friends Leaderboard to run in the background on Windows.
#
#   powershell -ExecutionPolicy Bypass -File scripts\windows\install.ps1             # install and start
#   powershell -ExecutionPolicy Bypass -File scripts\windows\install.ps1 -AutoStart  # ...and start at every sign-in
#
# Creates %USERPROFILE%\GenshinLeaderboard with the app, a config file holding a generated admin
# password, a data folder (copied from the project's data\ the first time) and start/stop/update
# scripts. Auto-start is off unless you pass -AutoStart; turn it on or off later with autostart.ps1.
# Safe to run again: existing data and config are kept.
param([string]$Target = "$env:USERPROFILE\GenshinLeaderboard", [switch]$AutoStart)
$ErrorActionPreference = 'Stop'
$project = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$jar = Join-Path $project 'target\genshin-leaderboard-0.0.1-SNAPSHOT.jar'
if (-not (Test-Path $jar)) { throw "Build the app first: run 'mvn package' in $project" }

New-Item -ItemType Directory -Force "$Target\app", "$Target\config", "$Target\data", "$Target\logs" | Out-Null
Copy-Item $jar "$Target\app\genshin-leaderboard.jar" -Force
foreach ($s in 'start.ps1', 'stop.ps1', 'update.ps1') { Copy-Item (Join-Path $PSScriptRoot $s) $Target -Force }
Set-Content "$Target\config\project-path.txt" $project -Encoding ascii

if (-not (Get-ChildItem "$Target\data" -Force | Select-Object -First 1) -and (Test-Path "$project\data")) {
    Copy-Item "$project\data\*" "$Target\data" -Recurse
    Write-Host "Copied existing data from $project\data"
}

$config = "$Target\config\application.properties"
if (-not (Test-Path $config)) {
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'.ToCharArray()
    $bytes = New-Object byte[] 20
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $password = -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })
    @"
# Settings for this installation. Kept outside the git repo on purpose.
app.data-dir=$(("$Target\data").Replace('\', '/'))
app.admin.password=$password
server.port=8081
logging.file.name=logs/app.log
logging.logback.rollingpolicy.max-file-size=5MB
logging.logback.rollingpolicy.max-history=7
"@ | Set-Content $config -Encoding ascii
    Write-Host "Generated an admin password in $config"
}

if ($AutoStart) { & (Join-Path $PSScriptRoot 'autostart.ps1') enable -Target $Target }

Start-Process powershell -ArgumentList '-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', "$Target\start.ps1" -WindowStyle Hidden
Write-Host "Installed to $Target and started; open http://localhost:8081 in ~15 seconds."
if (-not $AutoStart) { Write-Host 'Auto-start at sign-in is off. Turn it on with: scripts\windows\autostart.ps1 enable' }
