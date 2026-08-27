param(
    [string]$ExpectedHead = "",
    [string]$Site = "drift-curio",
    [string]$Sku = "DC-ZY-SZ-31001"
)

$ErrorActionPreference = "Stop"
$Repo = Split-Path -Parent $PSScriptRoot
$Branch = "feat/p3-approved-archive"

function Fail([string]$Message) {
    throw "GATE15_FAIL: $Message"
}

function Read-Utf8Text([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        Fail "File not found: $Path"
    }

    $bytes = [System.IO.File]::ReadAllBytes($Path)
    $utf8 = New-Object System.Text.UTF8Encoding($false, $true)
    try {
        $text = $utf8.GetString($bytes)
    }
    catch {
        Fail "File is not valid UTF-8: $Path"
    }

    if ($text.Length -gt 0 -and [int][char]$text[0] -eq 0xFEFF) {
        $text = $text.Substring(1)
    }
    return $text
}

function Read-JsonUtf8([string]$Path) {
    try {
        return (Read-Utf8Text $Path) | ConvertFrom-Json -ErrorAction Stop
    }
    catch {
        Fail "JSON parse failed: $Path / $($_.Exception.Message)"
    }
}

function NormPath([string]$Path) {
    $normalized = $Path.Replace("/", [string][System.IO.Path]::DirectorySeparatorChar)
    return [System.IO.Path]::GetFullPath($normalized).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
}

function Sha256([string]$Path) {
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

Write-Host ""
Write-Host "=== 1. SYNC FINAL AUDITED HEAD ==="
Set-Location $Repo

$currentBranch = (git branch --show-current).Trim()
if ($currentBranch -ne $Branch) {
    Fail "Current branch=$currentBranch, expected=$Branch"
}

$dirty = @(git status --porcelain)
if ($dirty.Count -gt 0) {
    $dirty | ForEach-Object { Write-Host $_ }
    Fail "Git worktree is not clean. Automatic overwrite is blocked."
}

$before = (git rev-parse HEAD).Trim()
Write-Host "LOCAL_BEFORE = $before"

git fetch origin "refs/heads/$Branch`:refs/remotes/origin/$Branch"
if ($LASTEXITCODE -ne 0) {
    Fail "git fetch failed"
}

$remote = (git rev-parse "refs/remotes/origin/$Branch").Trim()
Write-Host "REMOTE_HEAD  = $remote"
if ($ExpectedHead -and $remote -ne $ExpectedHead) {
    Fail "Remote HEAD moved. expected=$ExpectedHead actual=$remote"
}

if ($before -ne $remote) {
    git merge-base --is-ancestor $before $remote
    if ($LASTEXITCODE -ne 0) {
        Fail "Local HEAD is not an ancestor of remote candidate. Automatic overwrite is blocked."
    }

    git merge --ff-only $remote
    if ($LASTEXITCODE -ne 0) {
        Fail "fast-forward failed"
    }
}

$head = (git rev-parse HEAD).Trim()
if ($head -ne $remote) {
    Fail "Post-sync HEAD mismatch. local=$head remote=$remote"
}
if (@(git status --porcelain).Count -gt 0) {
    Fail "Worktree is not clean after sync"
}
Write-Host "SYNC = PASS / $head"

Write-Host ""
Write-Host "=== 2. LOAD PHYSICAL GATE15 TRUTH ==="

$profilePath = Join-Path $Repo "config\sites\drift-curio.json"
$profile = Read-JsonUtf8 $profilePath
if ([string]$profile.site_id -ne $Site) {
    Fail "Site Profile site_id mismatch: $($profile.site_id)"
}

$manifestPath = Join-Path ([string]$profile.manifest_root) "$Sku.json"
$manifest = Read-JsonUtf8 $manifestPath
if ([string]$manifest.sku -ne $Sku) {
    Fail "Manifest SKU mismatch: $($manifest.sku)"
}

$cutoutRoot = NormPath ([string]$manifest.destinations.cutout)
$controlRoot = [string]$profile.control_root
$jobsJournal = Join-Path $controlRoot "jobs.jsonl"
$archiveJournal = Join-Path $controlRoot "archives.jsonl"

$latestJobs = @{}
$jobText = Read-Utf8Text $jobsJournal
foreach ($line in ($jobText -split "`r?`n")) {
    if ([string]::IsNullOrWhiteSpace($line)) {
        continue
    }

    try {
        $row = $line | ConvertFrom-Json -ErrorAction Stop
    }
    catch {
        Fail "jobs.jsonl contains invalid JSONL"
    }

    if ($row.event -eq "JOB_SNAPSHOT" -and $row.job.job_id) {
        $latestJobs[[string]$row.job.job_id] = $row.job
    }
}

$archiveByAsset = @{}
$archiveText = Read-Utf8Text $archiveJournal
foreach ($line in ($archiveText -split "`r?`n")) {
    if ([string]::IsNullOrWhiteSpace($line)) {
        continue
    }

    try {
        $row = $line | ConvertFrom-Json -ErrorAction Stop
    }
    catch {
        Fail "archives.jsonl contains invalid JSONL"
    }

    if ($row.event -eq "ARCHIVE_SNAPSHOT" -and $row.item_id -eq $Sku -and $row.asset_id) {
        $archiveByAsset[[string]$row.asset_id] = $row
    }
}

if ($archiveByAsset.Count -ne 3) {
    Fail "Expected 3 archived SC01 masters for this test SKU, actual=$($archiveByAsset.Count)"
}
Write-Host "ARCHIVED_ASSETS = $($archiveByAsset.Count)"
Write-Host "CUTOUT_ROOT     = $cutoutRoot"

Write-Host ""
Write-Host "=== 3. VERIFY F + MANIFEST + D DELETE ==="

foreach ($assetId in $archiveByAsset.Keys) {
    $record = $archiveByAsset[$assetId]
    $target = NormPath ([string]$record.destination_path)
    $targetParent = NormPath (Split-Path -Parent $target)

    if ($targetParent -ne $cutoutRoot) {
        Fail "F target is outside Manifest destinations.cutout: $target"
    }

    if ([System.IO.Path]::GetFileName($target) -notmatch "__cutout__master__wf-SC01__v\d{3}\.png$") {
        Fail "Formal filename is not SC01 standard: $target"
    }

    if (-not (Test-Path -LiteralPath $target)) {
        Fail "F formal asset does not exist: $target"
    }

    $fInfo = Get-Item -LiteralPath $target
    $fHash = Sha256 $target
    if ([int64]$fInfo.Length -ne [int64]$record.size_bytes) {
        Fail "F size mismatch: $assetId"
    }
    if ($fHash -ne ([string]$record.sha256).ToLowerInvariant()) {
        Fail "F SHA256 mismatch: $assetId"
    }

    $job = @(
        $latestJobs.Values | Where-Object {
            $_.item_id -eq $Sku -and $_.generated_asset_id -eq $assetId
        }
    ) | Select-Object -First 1

    if ($null -eq $job) {
        Fail "Matching P2 job not found: $assetId"
    }

    if ([int64]$job.generated_size_bytes -ne [int64]$record.size_bytes) {
        Fail "P2 capture size does not match F: $assetId"
    }
    if (([string]$job.generated_sha256).ToLowerInvariant() -ne ([string]$record.sha256).ToLowerInvariant()) {
        Fail "P2 capture SHA does not match F: $assetId"
    }
    if (Test-Path -LiteralPath ([string]$job.generated_path)) {
        Fail "D staging source still exists after archive: $assetId"
    }

    $matchingHistory = @(
        $manifest.archive_history | Where-Object {
            $_.gate -eq "15" -and
            $_.workflow_code -eq "SC01" -and
            $_.asset_id -eq $assetId -and
            $_.result -eq "VERIFIED_ARCHIVE"
        }
    )

    if ($matchingHistory.Count -ne 1) {
        Fail "Manifest Gate15 history count must be exactly 1: asset=$assetId count=$($matchingHistory.Count)"
    }

    $mh = $matchingHistory[0]
    if ((NormPath ([string]$mh.destination_path)) -ne $target) {
        Fail "Manifest destination_path mismatch: $assetId"
    }
    if ([int64]$mh.size_bytes -ne [int64]$record.size_bytes) {
        Fail "Manifest size mismatch: $assetId"
    }
    if (([string]$mh.sha256).ToLowerInvariant() -ne ([string]$record.sha256).ToLowerInvariant()) {
        Fail "Manifest SHA mismatch: $assetId"
    }

    Write-Host "PHYSICAL_PASS: $($record.filename)"
}

$legacy = @(
    $manifest.archive_history | Where-Object {
        $_.result -eq "ARCHIVED" -and $_.route
    }
)
if ($legacy.Count -lt 1) {
    Fail "Legacy archive_history entry was not preserved"
}
Write-Host "LEGACY_HISTORY_PRESERVED = $($legacy.Count)"

Write-Host ""
Write-Host "=== 4. RESTART VISUAL CONSOLE ==="

$processIds = @{}
foreach ($port in @(4177, 4179, 5173)) {
    foreach ($listener in @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)) {
        $processIds[[int]$listener.OwningProcess] = $true
    }
}

foreach ($processId in $processIds.Keys) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $processId"
    $cmd = [string]$proc.CommandLine
    if ($cmd -notmatch "VISUAL_CONSOLE") {
        Fail "Port is owned by a non-Visual-Console process: PID=$processId CMD=$cmd"
    }
    Stop-Process -Id $processId -Force
}

Start-Sleep -Seconds 2
Start-Process -FilePath "powershell.exe" -WorkingDirectory $Repo -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", "npm.cmd run dev"

$deadline = (Get-Date).AddSeconds(60)
$health = $null
$webReady = $false
while ((Get-Date) -lt $deadline) {
    try {
        $health = Invoke-RestMethod "http://127.0.0.1:4179/health"
        $web = Invoke-WebRequest "http://127.0.0.1:5173/assets" -UseBasicParsing
        $webReady = $web.StatusCode -eq 200
        if ($health.ok -eq $true -and $health.version -eq "0.3.0-p3" -and $webReady) {
            break
        }
    }
    catch {}
    Start-Sleep -Seconds 1
}

if ($null -eq $health -or $health.ok -ne $true -or $health.version -ne "0.3.0-p3" -or -not $webReady) {
    Fail "4179/5173 did not recover within 60 seconds"
}
Write-Host "RESTART = PASS"

Write-Host ""
Write-Host "=== 5. VERIFY RECONSTRUCTION + F CONTENT ENDPOINT ==="

$query = "?site_id=$Site&item_id=$Sku"
$afterRestart = @(Invoke-RestMethod "http://127.0.0.1:4179/api/archive$query")
if ($afterRestart.Count -ne $archiveByAsset.Count) {
    Fail "Archive count changed after restart: before=$($archiveByAsset.Count) after=$($afterRestart.Count)"
}

foreach ($record in $afterRestart) {
    $tmp = Join-Path $env:TEMP "vc_gate15_$($record.asset_id).png"
    try {
        Invoke-WebRequest -Uri "http://127.0.0.1:4179/api/archive/assets/$Site/$Sku/$($record.asset_id)/content" -OutFile $tmp -UseBasicParsing
        $servedHash = Sha256 $tmp
        if ($servedHash -ne ([string]$record.sha256).ToLowerInvariant()) {
            Fail "F preview endpoint SHA mismatch: $($record.asset_id)"
        }
    }
    finally {
        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    }
}
Write-Host "RESTART_RECONSTRUCTION = PASS"
Write-Host "F_PREVIEW_ENDPOINT      = PASS"

Write-Host ""
Write-Host "=== 6. IDEMPOTENCE RETRY ==="

$retryRecord = $afterRestart | Select-Object -First 1
$retryAssetId = [string]$retryRecord.asset_id
$retryTarget = NormPath ([string]$archiveByAsset[$retryAssetId].destination_path)
$targetInfoBefore = Get-Item -LiteralPath $retryTarget
$targetHashBefore = Sha256 $retryTarget
$manifestHashBefore = Sha256 $manifestPath
$manifestBefore = Read-JsonUtf8 $manifestPath
$historyBefore = @($manifestBefore.archive_history | Where-Object { $_.gate -eq "15" -and $_.asset_id -eq $retryAssetId }).Count
$archiveCountBefore = @(Invoke-RestMethod "http://127.0.0.1:4179/api/archive$query").Count

Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:4179/api/archive/$Site/$Sku/$retryAssetId" | Out-Null

$targetInfoAfter = Get-Item -LiteralPath $retryTarget
$targetHashAfter = Sha256 $retryTarget
$manifestHashAfter = Sha256 $manifestPath
$manifestAfter = Read-JsonUtf8 $manifestPath
$historyAfter = @($manifestAfter.archive_history | Where-Object { $_.gate -eq "15" -and $_.asset_id -eq $retryAssetId }).Count
$archiveCountAfter = @(Invoke-RestMethod "http://127.0.0.1:4179/api/archive$query").Count

if ($historyBefore -ne 1 -or $historyAfter -ne 1) {
    Fail "Manifest Gate15 history changed during retry: before=$historyBefore after=$historyAfter"
}
if ($targetHashBefore -ne $targetHashAfter -or $targetInfoBefore.Length -ne $targetInfoAfter.Length -or $targetInfoBefore.LastWriteTimeUtc.Ticks -ne $targetInfoAfter.LastWriteTimeUtc.Ticks) {
    Fail "F formal asset changed during idempotence retry"
}
if ($manifestHashBefore -ne $manifestHashAfter) {
    Fail "Manifest was rewritten during idempotence retry"
}
if ($archiveCountBefore -ne $archiveCountAfter) {
    Fail "Archive cardinality changed during retry: before=$archiveCountBefore after=$archiveCountAfter"
}

$jobAfterRetry = @(
    $latestJobs.Values | Where-Object {
        $_.item_id -eq $Sku -and $_.generated_asset_id -eq $retryAssetId
    }
) | Select-Object -First 1
if ($null -ne $jobAfterRetry -and (Test-Path -LiteralPath ([string]$jobAfterRetry.generated_path))) {
    Fail "D staging source reappeared after idempotence retry"
}

Write-Host "IDEMPOTENT_RETRY = PASS"

Write-Host ""
Write-Host "=============================================="
Write-Host "GATE15_FINAL_PHYSICAL_SELF_CHECK = PASS"
Write-Host "HEAD     = $head"
Write-Host "ARCHIVED = $($archiveByAsset.Count)"
Write-Host "=============================================="

Start-Process "http://127.0.0.1:5173/assets"
