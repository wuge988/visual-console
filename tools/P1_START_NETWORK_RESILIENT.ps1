$ErrorActionPreference = "Stop"

$Target = "E:\AI_PROJECTS\VISUAL_CONSOLE"
$Branch = "feat/p1-mobile-capture-runtime"
$OfficialRegistry = "https://registry.npmjs.org/"
$MirrorRegistry = "https://registry.npmmirror.com/"
$Log = Join-Path $env:TEMP "visual-console-p1-runtime.log"
$script:NpmInstallExitCode = $null

function Section([string]$Text) {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor DarkGray
    Write-Host $Text -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor DarkGray
}

function Invoke-NpmInstall([string]$Registry, [string]$Label) {
    $script:NpmInstallExitCode = $null
    Write-Host ""
    Write-Host "Trying ${Label}: ${Registry}" -ForegroundColor Yellow
    & npm.cmd install `
      --registry=$Registry `
      --fetch-retries=5 `
      --fetch-retry-factor=2 `
      --fetch-retry-mintimeout=1000 `
      --fetch-retry-maxtimeout=20000 `
      --fetch-timeout=120000
    $script:NpmInstallExitCode = [int]$LASTEXITCODE
    Write-Host "npm install exit code: $script:NpmInstallExitCode" -ForegroundColor DarkGray
}

try {
    Start-Transcript -Path $Log -Force | Out-Null

    Section "VISUAL CONSOLE - P1 runtime launcher"
    Write-Host "This window will remain open." -ForegroundColor Green
    Write-Host "Log: $Log"

    if (-not (Test-Path (Join-Path $Target ".git"))) {
        throw "Formal repository not found: $Target"
    }

    Set-Location $Target

    Section "1/4 Update formal repository"
    & git.exe fetch origin $Branch
    if ($LASTEXITCODE -ne 0) { throw "git fetch failed: $LASTEXITCODE" }

    & git.exe checkout $Branch
    if ($LASTEXITCODE -ne 0) { throw "git checkout failed: $LASTEXITCODE" }

    & git.exe pull --ff-only origin $Branch
    if ($LASTEXITCODE -ne 0) { throw "git pull failed: $LASTEXITCODE" }

    Section "2/4 npm network diagnostics"
    Write-Host ("npm registry    : " + (& npm.cmd config get registry))
    Write-Host ("npm proxy       : " + (& npm.cmd config get proxy))
    Write-Host ("npm https-proxy : " + (& npm.cmd config get https-proxy))
    Write-Host "Registry fallback is per-command only; global npm config is not changed."

    & npm.cmd cache verify
    $cacheExit = [int]$LASTEXITCODE
    if ($cacheExit -ne 0) {
        Write-Host "npm cache verify returned $cacheExit; continuing." -ForegroundColor Yellow
    }

    Section "3/4 Install dependencies"
    Invoke-NpmInstall $OfficialRegistry "npm official registry"

    if ($script:NpmInstallExitCode -ne 0) {
        Write-Host "Official registry failed. Trying mirror for this install only." -ForegroundColor Yellow
        Invoke-NpmInstall $MirrorRegistry "npmmirror registry"
    }

    if ($script:NpmInstallExitCode -ne 0) {
        throw "Dependency install failed. Last exit code: $script:NpmInstallExitCode"
    }

    Write-Host "Dependencies installed." -ForegroundColor Green
    Write-Host "Running build preflight..."

    & npm.cmd run build
    $buildExit = [int]$LASTEXITCODE
    Write-Host "npm run build exit code: $buildExit" -ForegroundColor DarkGray
    if ($buildExit -ne 0) {
        throw "npm run build failed: $buildExit"
    }

    Section "4/4 Start P1"
    Write-Host "Desktop UI : http://localhost:5173" -ForegroundColor Green
    Write-Host "Local API  : http://localhost:4177/api/health" -ForegroundColor Green
    Write-Host "Keep this window open. Press Ctrl+C to stop Visual Console."
    Write-Host ""

    & npm.cmd run dev
    $devExit = [int]$LASTEXITCODE
    Write-Host "npm run dev exited: $devExit" -ForegroundColor Yellow
}
catch {
    Write-Host ""
    Write-Host "P1 START FAILED" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Send a screenshot of this window and the log file." -ForegroundColor Yellow
}
finally {
    try { Stop-Transcript | Out-Null } catch {}
    Write-Host ""
    Write-Host "Log: $Log" -ForegroundColor DarkGray
    Write-Host ""
    Read-Host "Press Enter to close"
}
