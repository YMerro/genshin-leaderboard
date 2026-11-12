# Rebuilds the app from the project folder and restarts it with the new version.
# Your data and settings in this folder are not touched.
$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $MyInvocation.MyCommand.Path
$project = (Get-Content (Join-Path $base 'config\project-path.txt') -ErrorAction Stop).Trim()

Write-Host "Building $project ..."
Push-Location $project
try { & mvn -q -B package; if ($LASTEXITCODE -ne 0) { throw 'Build failed; the running version was left as it is.' } }
finally { Pop-Location }

& (Join-Path $base 'stop.ps1')
Start-Sleep -Seconds 3
Copy-Item (Join-Path $project 'target\genshin-leaderboard-0.0.1-SNAPSHOT.jar') (Join-Path $base 'app\genshin-leaderboard.jar') -Force
Start-Process powershell -ArgumentList '-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $base 'start.ps1') -WindowStyle Hidden
Write-Host 'Updated and restarted. Give it ~15 seconds, then open http://localhost:8081'
