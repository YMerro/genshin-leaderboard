# Finds your most recent Genshin Impact wish history link and copies it to the clipboard.
#
# 1. Open Genshin, go to Wish > History, and let the page load (this refreshes the link).
# 2. Run:  powershell -ExecutionPolicy Bypass -File scripts\get-wish-link.ps1
# 3. Paste the link into the Wishes tab of the leaderboard.
#
# The link contains a temporary key (valid ~24h) that lets anyone read your wish history.
# It can't log in or change anything, but don't post it publicly.

$ErrorActionPreference = 'Stop'

$logCandidates = @(
    "$env:USERPROFILE\AppData\LocalLow\miHoYo\Genshin Impact\output_log.txt",
    "$env:USERPROFILE\AppData\LocalLow\miHoYo\$([char]0x539F)$([char]0x795E)\output_log.txt"   # Chinese client folder
)
$log = $logCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $log) {
    Write-Error "Couldn't find Genshin's log file. Start the game once, then run this again."
}

# The log mentions the game's data folder, e.g. "C:/Program Files/Genshin Impact/Genshin Impact game/GenshinImpact_Data/..."
$match = Select-String -Path $log -Pattern '([A-Za-z]:[\\/].*?(GenshinImpact_Data|YuanShen_Data))' | Select-Object -Last 1
if (-not $match) {
    Write-Error "Couldn't find the game folder in the log. Open your wish history in-game, then run this again."
}
$dataDir = $match.Matches[0].Groups[1].Value

# Newer clients keep the cache in a versioned subfolder: webCaches\<version>\Cache\Cache_Data\data_2
$cacheFile = Join-Path $dataDir 'webCaches\Cache\Cache_Data\data_2'
if (-not (Test-Path $cacheFile)) {
    $versionDir = Get-ChildItem (Join-Path $dataDir 'webCaches') -Directory -ErrorAction SilentlyContinue |
        Where-Object { Test-Path (Join-Path $_.FullName 'Cache\Cache_Data\data_2') } |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $versionDir) {
        Write-Error "Couldn't find the game's web cache. Open your wish history in-game, then run this again."
    }
    $cacheFile = Join-Path $versionDir.FullName 'Cache\Cache_Data\data_2'
}

# The game keeps the file open, so read a copy
$copy = Join-Path $env:TEMP "genshin-wish-cache-$PID.tmp"
Copy-Item $cacheFile $copy -Force
try {
    $text = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($copy))
} finally {
    Remove-Item $copy -Force -ErrorAction SilentlyContinue
}

$links = [regex]::Matches($text, 'https://[^\s"\x00]*?(getGachaLog|webview_gacha)[^\s"\x00]*') |
    ForEach-Object { $_.Value } | Where-Object { $_ -match 'authkey=' }
if (-not $links) {
    Write-Error "No wish history link found. Open Wish > History in-game, wait for it to load, then run this again."
}

$link = $links | Select-Object -Last 1
Set-Clipboard -Value $link
Write-Host "Wish history link copied to the clipboard. Paste it into the Wishes tab." -ForegroundColor Green
