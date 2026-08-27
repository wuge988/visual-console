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
        Fail "文件不存在：$Path"
    }
    $bytes = [System.IO.File]::ReadAllBytes($Path)
    $utf8 = New-Object System.Text.UTF8Encoding($false, $true)
    try {
        $text = $utf8.GetString($bytes)
    }
    catch {
        Fail "文件不是有效 UTF-8：$Path"
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
        Fail "JSON 解析失败：$Path / $($_.Exception.Message)"
    }
}

function NormPath([string]$Path) {
    return [System.IO.Path]::GetFullPath(($Path -replace '/', '\')).TrimEnd('\')
}

function Sha256([string]$Path) {
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

Write-Host ""
Write-Host "=== 1. SYNC FINAL AUDITED HEAD ==="
Set-Location $Repo

$currentBranch = (git branch --show-current).Trim()
if ($currentBranch -ne $Branch) {
    Fail "当前分支=$currentBranch，预期=$Branch"
}

$dirty = @(git status --porcelain)
if ($dirty.Count -gt 0) {
    $dirty | ForEach-Object { Write-Host $_ }
    Fail "Git 工作区非 clean；为避免覆盖本机修改已停止"
}

$before = (git rev-parse HEAD).Trim()
Write-Host "LOCAL_BEFORE = $before"

git fetch origin "refs/heads/$Branch`:refs/remotes/origin/$Branch"
if ($LASTEXITCODE -ne 0) { Fail "git fetch 失败" }

$remote = (git rev-parse "refs/remotes/origin/$Branch").Trim()
Write-Host "REMOTE_HEAD  = $remote"
if ($ExpectedHead -and $remote -ne $ExpectedHead) {
    Fail "远端 HEAD 漂移。预期=$ExpectedHead 实际=$remote"
}

if ($before -ne $remote) {
    git merge-base --is-ancestor $before $remote
    if ($LASTEXITCODE -ne 0) {
        Fail "本机 HEAD 不是远端候选祖先，禁止自动覆盖"
    }
    git merge --ff-only $remote
    if ($LASTEXITCODE -ne 0) { Fail "fast-forward 失败" }
}

$head = (git rev-parse HEAD).Trim()
if ($head -ne $remote) { Fail "同步后 HEAD=$head，远端=$remote" }
if (@(git status --porcelain).Count -gt 0) { Fail "同步后工作区非 clean" }
Write-Host "SYNC = PASS / $head"

Write-Host ""
Write-Host "=== 2. LOAD PHYSICAL GATE15 TRUTH ==="

$profilePath = Join-Path $Repo "config\sites\drift-curio.json"
$profile = Read-JsonUtf8 $profilePath
if ([string]$profile.site_id -ne $Site) {
    Fail "Site Profile site_id 不匹配：$($profile.site_id)"
}

$manifestPath = Join-Path ([string]$profile.manifest_root) "$Sku.json"
$manifest = Read-JsonUtf8 $manifestPath
if ([string]$manifest.sku -ne $Sku) {
    Fail "Manifest SKU 不匹配：$($manifest.sku)"
}

$cutoutRoot = NormPath ([string]$manifest.destinations.cutout)
$controlRoot = [string]$profile.control_root
$jobsJournal = Join-Path $controlRoot "jobs.jsonl"
$archiveJournal = Join-Path $controlRoot "archives.jsonl"

$latestJobs = @{}
$jobText = Read-Utf8Text $jobsJournal
foreach ($line in ($jobText -split "`r?`n")) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    try {
        $row = $line | ConvertFrom-Json -ErrorAction Stop
    }
    catch {
        Fail "jobs.jsonl 存在非法 JSONL"
    }
    if ($row.event -eq "JOB_SNAPSHOT" -and $row.job.job_id) {
        $latestJobs[[string]$row.job.job_id] = $row.job
    }
}

$archiveByAsset = @{}
$archiveText = Read-Utf8Text $archiveJournal
foreach ($line in ($archiveText -split "`r?`n")) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    try {
        $row = $line | ConvertFrom-Json -ErrorAction Stop
    }
    catch {
        Fail "archives.jsonl 存在非法 JSONL"
    }
    if ($row.event -eq "ARCHIVE_SNAPSHOT" -and $row.item_id -eq $Sku -and $row.asset_id) {
        $archiveByAsset[[string]$row.asset_id] = $row
    }
}

if ($archiveByAsset.Count -ne 3) {
    Fail "当前测试 SKU 应有 3 个已归档 SC01 Master，实际=$($archiveByAsset.Count)"
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
        Fail "F 目标未落在 Manifest destinations.cutout：$target"
    }
    if ([System.IO.Path]::GetFileName($target) -notmatch "__cutout__master__wf-SC01__v\d{3}\.png$") {
        Fail "正式文件名不符合 SC01 标准：$target"
    }
    if (-not (Test-Path -LiteralPath $target)) {
        Fail "F 正式资产不存在：$target"
    }

    $fInfo = Get-Item -LiteralPath $target
    $fHash = Sha256 $target
    if ([int64]$fInfo.Length -ne [int64]$record.size_bytes) {
        Fail "F size mismatch：$assetId"
    }
    if ($fHash -ne ([string]$record.sha256).ToLowerInvariant()) {
        Fail "F SHA256 mismatch：$assetId"
    }

    $job = @(
        $latestJobs.Values | Where-Object {
            $_.item_id -eq $Sku -and $_.generated_asset_id -eq $assetId
        }
    ) | Select-Object -First 1
    if ($null -eq $job) { Fail "找不到对应 P2 Job：$assetId" }

    if ([int64]$job.generated_size_bytes -ne [int64]$record.size_bytes) {
        Fail "P2 capture size 与 F 不一致：$assetId"
    }
    if (([string]$job.generated_sha256).ToLowerInvariant() -ne ([string]$record.sha256).ToLowerInvariant()) {
        Fail "P2 capture SHA 与 F 不一致：$assetId"
    }
    if (Test-Path -LiteralPath ([string]$job.generated_path)) {
        Fail "D staging 源仍存在，最终状态不成立：$assetId"
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
        Fail "Manifest Gate15 history 数量不是 1：$assetId / count=$($matchingHistory.Count)"
    }

    $mh = $matchingHistory[0]
    if ((NormPath ([string]$mh.destination_path)) -ne $target) {
        Fail "Manifest destination_path mismatch：$assetId"
    }
    if ([int64]$mh.size_bytes -ne [int64]$record.size_bytes) {
        Fail "Manifest size mismatch：$assetId"
    }
    if (([string]$mh.sha256).ToLowerInvariant() -ne ([string]$record.sha256).ToLowerInvariant()) {
        Fail "Manifest SHA mismatch：$assetId"
    }

    Write-Host "PHYSICAL_PASS: $($record.filename)"
}

$legacy = @(
    $manifest.archive_history | Where-Object {
        $_.result -eq "ARCHIVED" -and $_.route
    }
)
if ($legacy.Count -lt 1) {
    Fail "原有 legacy archive_history 未保留"
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
        Fail "端口被非 Visual Console 进程占用：PID=$processId CMD=$cmd"
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
        if ($health.ok -eq $true -and $health.version -eq "0.3.0-p3" -and $webReady) { break }
    }
    catch {}
    Start-Sleep -Seconds 1
}

if ($null -eq $health -or $health.ok -ne $true -or $health.version -ne "0.3.0-p3" -or -not $webReady) {
    Fail "重启后 4179/5173 未在 60 秒内恢复"
}
Write-Host "RESTART = PASS"

Write-Host ""
Write-Host "=== 5. VERIFY RECONSTRUCTION + F CONTENT ENDPOINT ==="

$query = "?site_id=$Site&item_id=$Sku"
$afterRestart = @(Invoke-RestMethod "http://127.0.0.1:4179/api/archive$query")
if ($afterRestart.Count -ne $archiveByAsset.Count) {
    Fail "重启后 archive 数量变化：before=$($archiveByAsset.Count) after=$($afterRestart.Count)"
}

foreach ($record in $afterRestart) {
    $tmp = Join-Path $env:TEMP "vc_gate15_$($record.asset_id).png"
    try {
        Invoke-WebRequest -Uri "http://127.0.0.1:4179/api/archive/assets/$Site/$Sku/$($record.asset_id)/content" -OutFile $tmp -UseBasicParsing
        $servedHash = Sha256 $tmp
        if ($servedHash -ne ([string]$record.sha256).ToLowerInvariant()) {
            Fail "F preview endpoint SHA mismatch：$($record.asset_id)"
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
    Fail "幂等重试造成 Manifest Gate15 history 变化：before=$historyBefore after=$historyAfter"
}
if ($targetHashBefore -ne $targetHashAfter -or $targetInfoBefore.Length -ne $targetInfoAfter.Length -or $targetInfoBefore.LastWriteTimeUtc.Ticks -ne $targetInfoAfter.LastWriteTimeUtc.Ticks) {
    Fail "幂等重试改变了 F 正式资产"
}
if ($manifestHashBefore -ne $manifestHashAfter) {
    Fail "幂等重试改写了 Manifest"
}
if ($archiveCountBefore -ne $archiveCountAfter) {
    Fail "幂等重试改变 archive cardinality：before=$archiveCountBefore after=$archiveCountAfter"
}

$jobAfterRetry = @(
    $latestJobs.Values | Where-Object { $_.item_id -eq $Sku -and $_.generated_asset_id -eq $retryAssetId }
) | Select-Object -First 1
if ($null -ne $jobAfterRetry -and (Test-Path -LiteralPath ([string]$jobAfterRetry.generated_path))) {
    Fail "幂等重试后 D staging 源重新出现"
}

Write-Host "IDEMPOTENT_RETRY = PASS"

Write-Host ""
Write-Host "=============================================="
Write-Host "GATE15_FINAL_PHYSICAL_SELF_CHECK = PASS"
Write-Host "HEAD     = $head"
Write-Host "ARCHIVED = $($archiveByAsset.Count)"
Write-Host "=============================================="

Start-Process "http://127.0.0.1:5173/assets"
