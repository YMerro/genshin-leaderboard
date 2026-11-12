# Starts the Friends Leaderboard in the background and restarts it if it stops unexpectedly.
# Returns immediately: the watcher that keeps the app running is launched as a hidden process.
# Use stop.ps1 to stop it.
param([switch]$Supervise)
$base = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not $Supervise) {
    # Hand off to a hidden copy of this script so the terminal is free right away
    Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile', '-WindowStyle', 'Hidden',
        '-ExecutionPolicy', 'Bypass', '-File', "`"$($MyInvocation.MyCommand.Path)`"", '-Supervise'
    Write-Host 'Friends Leaderboard is starting in the background. Open http://localhost:8081 in about 15 seconds.'
    Write-Host 'Stop it with stop.ps1.'
    exit
}

$java = if ($env:JAVA_HOME -and (Test-Path "$env:JAVA_HOME\bin\javaw.exe")) { "$env:JAVA_HOME\bin\javaw.exe" }
        elseif (Test-Path "$env:USERPROFILE\tools\jdk-21.0.13+9\bin\javaw.exe") { "$env:USERPROFILE\tools\jdk-21.0.13+9\bin\javaw.exe" }
        else { 'javaw.exe' }
$stopFlag = Join-Path $base 'stop.flag'
$log = Join-Path $base 'logs\launcher.log'
New-Item -ItemType Directory -Force (Join-Path $base 'logs') | Out-Null
Remove-Item $stopFlag -ErrorAction SilentlyContinue

function Write-Log($message) { Add-Content $log "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $message" }

if (Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue) {
    Write-Log 'Port 8081 is already in use (already running, or another copy like mvn spring-boot:run). Not starting.'
    exit
}

Write-Log 'Starting'
while (-not (Test-Path $stopFlag)) {
    $p = Start-Process $java -ArgumentList '-Xmx512m', '-jar', 'app\genshin-leaderboard.jar' `
        -WorkingDirectory $base -PassThru -WindowStyle Hidden
    $p.WaitForExit()
    if (Test-Path $stopFlag) { break }
    Write-Log "App exited with code $($p.ExitCode); restarting in 15 seconds"
    Start-Sleep -Seconds 15
}
Remove-Item $stopFlag -ErrorAction SilentlyContinue
Write-Log 'Stopped'
