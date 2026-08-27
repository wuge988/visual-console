param(
  [string]$SiteId = "drift-curio",
  [string]$Sku = "DC-ZY-SZ-31001",
  [string]$ApiBase = "http://127.0.0.1:4179",
  [string]$AssetId = "",
  [switch]$SkipIdempotentRetry
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Checks = New-Object System.Collections.Generic.List[object]

function Add-Check([string]$Name, [bool]$Pass, [string]$Detail) {
  $Checks.Add([pscustomobject]@{ Check=$Name; Result=$(if($Pass){"PASS"}else{"FAIL"}); Detail=$Detail }) | Out-Null
}

function Read-JsonBomSafe([string]$Path) {
  $text = [IO.File]::ReadAllText($Path, [Text.Encoding]::UTF8)
  if ($text.Length -gt 0 -and [int][char]$text[0] -eq 0xFEFF) { $text = $text.Substring(1) }
  return $text | ConvertFrom-Json -ErrorAction Stop
}

function Get-ApiJson([string]$Path) {
  $response = Invoke-WebRequest -Uri ($ApiBase + $Path) -UseBasicParsing -TimeoutSec 20
  return $response.Content | ConvertFrom-Json -ErrorAction Stop
}

function Get-ApiJsonArray([string]$Path) {
  $response = Invoke-WebRequest -Uri ($ApiBase + $Path) -UseBasicParsing -TimeoutSec 20
  $parsed = $response.Content | ConvertFrom-Json -ErrorAction Stop
  if ($null -eq $parsed) { return }
  foreach ($item in $parsed) { Write-Output $item }
}

function Post-ApiJson([string]$Path) {
  return Invoke-RestMethod -Uri ($ApiBase + $Path) -Method Post -ContentType "application/json" -Body "{}" -TimeoutSec 20
}

function Assert-FileSnapshot([string]$Path, [long]$ExpectedSize, [string]$ExpectedSha, [string]$Name) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { Add-Check $Name $false "missing=$Path"; return $false }
  $item = Get-Item -LiteralPath $Path
  $sha = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  $pass = ([long]$item.Length -eq $ExpectedSize -and $sha -eq $ExpectedSha.ToLowerInvariant())
  Add-Check $Name $pass "size=$($item.Length)/$ExpectedSize sha=$($sha.Substring(0,12))..."
  return $pass
}

try {
  $siteEsc = [Uri]::EscapeDataString($SiteId)
  $skuEsc = [Uri]::EscapeDataString($Sku)

  $health = Get-ApiJson "/health"
  Add-Check "P4C_SERVICE_HEALTH" ([bool]$health.ok) "service=$($health.service) version=$($health.version)"

  $profilePath = Join-Path $RepoRoot "config\sites\$SiteId.json"
  $profile = Read-JsonBomSafe $profilePath
  Add-Check "SITE_PROFILE_SD01_ENABLED" (@($profile.enabled_workflows) -contains "SD01") "enabled=$(@($profile.enabled_workflows) -join ',')"

  $manifestPath = Join-Path ([string]$profile.manifest_root) ($Sku + ".json")
  $manifest = Read-JsonBomSafe $manifestPath
  $darkDestination = [string]$manifest.destinations.dark
  Add-Check "MANIFEST_DARK_DESTINATION" (-not [string]::IsNullOrWhiteSpace($darkDestination)) "dark=$darkDestination"

  $archives = @(Get-ApiJsonArray "/api/archive?site_id=$siteEsc&item_id=$skuEsc" | Where-Object {
    $_.workflow_code -eq "SD01" -and $_.destination_key -eq "dark" -and $_.result -eq "VERIFIED_ARCHIVE"
  } | Sort-Object archived_at -Descending)
  if ($archives.Count -lt 1) { throw "NO_SD01_VERIFIED_ARCHIVE_FOR_SKU" }
  $archive = if ([string]::IsNullOrWhiteSpace($AssetId)) { $archives[0] } else { @($archives | Where-Object { [string]$_.asset_id -eq $AssetId }) | Select-Object -First 1 }
  if ($null -eq $archive) { throw "REQUESTED_SD01_ARCHIVE_NOT_FOUND" }
  $assetId = [string]$archive.asset_id
  if (-not ($assetId -match '^[a-f0-9]{32}$')) { throw "SD01_ARCHIVE_ASSET_ID_INVALID" }
  Add-Check "API_SD01_ARCHIVE_TRUTH" $true "asset=$assetId file=$($archive.filename)"

  $derivatives = @(Get-ApiJsonArray "/api/dark-derivatives?site_id=$siteEsc&item_id=$skuEsc")
  $derivative = @($derivatives | Where-Object { [string]$_.generated_asset_id -eq $assetId }) | Select-Object -First 1
  if ($null -eq $derivative) { throw "DARK_DERIVATIVE_RECORD_NOT_FOUND" }
  Add-Check "DARK_DERIVATIVE_ARCHIVED_STATE" ([bool]$derivative.archived -and $derivative.state -eq "QA_PASS") "state=$($derivative.state) archived=$($derivative.archived)"
  Add-Check "DARK_RENDERER_ID" ($derivative.renderer_id -eq "sd01-flat-gallery-surface-rgb-v1") "renderer=$($derivative.renderer_id)"
  Add-Check "DARK_BACKGROUND_FROZEN" ($derivative.background_hex -eq "#171B20") "background=$($derivative.background_hex)"

  $history = @($manifest.archive_history)
  $darkRows = @($history | Where-Object {
    $_.asset_id -eq $assetId -and $_.gate -eq "15" -and $_.workflow_code -eq "SD01" -and $_.destination_key -eq "dark" -and $_.result -eq "VERIFIED_ARCHIVE"
  })
  Add-Check "MANIFEST_SINGLE_SD01_HISTORY" ($darkRows.Count -eq 1) "matching_rows=$($darkRows.Count)"
  if ($darkRows.Count -ne 1) { throw "SD01_MANIFEST_HISTORY_NOT_EXACTLY_ONE" }
  $dark = $darkRows[0]

  $targetPath = [string]$dark.destination_path
  $targetParent = Split-Path -Parent $targetPath
  Add-Check "MANIFEST_DARK_ROUTE_MATCH" ([IO.Path]::GetFullPath($targetParent) -eq [IO.Path]::GetFullPath($darkDestination)) "target_dir=$targetParent"
  [void](Assert-FileSnapshot $targetPath ([long]$dark.size_bytes) ([string]$dark.sha256) "F_DARK_HASH_SIZE")

  $stagingPath = Join-Path ([string]$profile.staging_root) ("visual-console\" + $Sku + "\dark\" + [string]$dark.filename)
  Add-Check "D_DELETE_LAST_FINAL_STATE" (-not (Test-Path -LiteralPath $stagingPath)) "staging_absent=$(-not (Test-Path -LiteralPath $stagingPath))"

  $sourceAssetId = [string]$derivative.source_asset_id
  $sourceRows = @($history | Where-Object {
    $_.asset_id -eq $sourceAssetId -and $_.gate -eq "15" -and $_.workflow_code -eq "SC01" -and $_.destination_key -eq "cutout" -and $_.result -eq "VERIFIED_ARCHIVE"
  })
  Add-Check "SOURCE_MANIFEST_HISTORY" ($sourceRows.Count -eq 1) "matching_rows=$($sourceRows.Count)"
  if ($sourceRows.Count -ne 1) { throw "SOURCE_MANIFEST_HISTORY_NOT_EXACTLY_ONE" }
  $source = $sourceRows[0]
  $sourceMeta = ([string]$source.filename -eq [string]$derivative.source_filename -and [string]$source.sha256 -eq [string]$derivative.source_sha256 -and [long]$source.size_bytes -eq [long]$derivative.source_size_bytes)
  Add-Check "SOURCE_ARCHIVE_IDENTITY_MATCH" $sourceMeta "source_asset=$sourceAssetId"
  [void](Assert-FileSnapshot ([string]$source.destination_path) ([long]$source.size_bytes) ([string]$source.sha256) "F_CUTOUT_SOURCE_HASH_SIZE")

  $journalPath = Join-Path ([string]$profile.control_root) "dark-derivatives.jsonl"
  if (-not (Test-Path -LiteralPath $journalPath -PathType Leaf)) { throw "DARK_DERIVATIVE_JOURNAL_NOT_FOUND" }
  $snapshots = @()
  foreach ($line in [IO.File]::ReadAllLines($journalPath, [Text.Encoding]::UTF8)) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    try { $row = $line | ConvertFrom-Json; if ($row.event -eq "DARK_DERIVATIVE_SNAPSHOT" -and $row.generated_asset_id -eq $assetId) { $snapshots += $row } } catch { }
  }
  $latest = $snapshots | Select-Object -Last 1
  Add-Check "DARK_JOURNAL_RECONSTRUCTABLE" ($null -ne $latest -and $latest.state -eq "QA_PASS" -and $latest.renderer_id -eq "sd01-flat-gallery-surface-rgb-v1" -and $latest.background_hex -eq "#171B20") "snapshots=$($snapshots.Count) latest=$($latest.state)"

  $archiveJournal = Join-Path ([string]$profile.control_root) "archives.jsonl"
  $archiveSnapshots = @()
  foreach ($line in [IO.File]::ReadAllLines($archiveJournal, [Text.Encoding]::UTF8)) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    try { $row = $line | ConvertFrom-Json; if ($row.event -eq "ARCHIVE_SNAPSHOT" -and $row.asset_id -eq $assetId) { $archiveSnapshots += $row } } catch { }
  }
  $latestArchive = $archiveSnapshots | Select-Object -Last 1
  $archiveOk = ($null -ne $latestArchive -and $latestArchive.workflow_code -eq "SD01" -and $latestArchive.destination_key -eq "dark" -and $latestArchive.source_deleted -eq $true -and [string]$latestArchive.sha256 -eq [string]$dark.sha256 -and [long]$latestArchive.size_bytes -eq [long]$dark.size_bytes)
  Add-Check "ARCHIVE_JOURNAL_SNAPSHOT" $archiveOk "snapshots=$($archiveSnapshots.Count)"

  $temp = Join-Path ([IO.Path]::GetTempPath()) ("vc-sd01-preview-" + [Guid]::NewGuid().ToString("N") + ".png")
  try {
    Invoke-WebRequest -Uri ($ApiBase + "/api/dark-derivatives/assets/$siteEsc/$skuEsc/$assetId/content") -OutFile $temp -UseBasicParsing -TimeoutSec 20 | Out-Null
    [void](Assert-FileSnapshot $temp ([long]$dark.size_bytes) ([string]$dark.sha256) "F_DARK_PREVIEW_HASH_SIZE")
  } finally { Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue }

  if (-not $SkipIdempotentRetry) {
    $beforeHash = (Get-FileHash -LiteralPath $targetPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $beforeSize = (Get-Item -LiteralPath $targetPath).Length
    $beforeMtime = (Get-Item -LiteralPath $targetPath).LastWriteTimeUtc.Ticks
    $manifestHashBefore = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $countBefore = $archives.Count
    $retry = Post-ApiJson "/api/dark-derivatives/archive/$siteEsc/$skuEsc/$assetId"
    Add-Check "IDEMPOTENT_RETRY_API" ([bool]$retry.ok -and $retry.archive.asset_id -eq $assetId) "asset=$($retry.archive.asset_id)"
    $manifestAfter = Read-JsonBomSafe $manifestPath
    $retryRows = @($manifestAfter.archive_history | Where-Object { $_.asset_id -eq $assetId -and $_.workflow_code -eq "SD01" -and $_.destination_key -eq "dark" })
    $afterItem = Get-Item -LiteralPath $targetPath
    $afterHash = (Get-FileHash -LiteralPath $targetPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $manifestHashAfter = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $countAfter = @(Get-ApiJsonArray "/api/archive?site_id=$siteEsc&item_id=$skuEsc" | Where-Object { $_.workflow_code -eq "SD01" -and $_.destination_key -eq "dark" -and $_.result -eq "VERIFIED_ARCHIVE" }).Count
    $retryOk = ($retryRows.Count -eq 1 -and $beforeHash -eq $afterHash -and [long]$beforeSize -eq [long]$afterItem.Length -and $beforeMtime -eq $afterItem.LastWriteTimeUtc.Ticks -and $manifestHashBefore -eq $manifestHashAfter -and $countBefore -eq $countAfter -and -not (Test-Path -LiteralPath $stagingPath))
    Add-Check "IDEMPOTENT_RETRY_INVARIANTS" $retryOk "history=$($retryRows.Count) hash=$($beforeHash -eq $afterHash) size=$([long]$beforeSize -eq [long]$afterItem.Length) mtime=$($beforeMtime -eq $afterItem.LastWriteTimeUtc.Ticks) manifest=$($manifestHashBefore -eq $manifestHashAfter) api_count=$countBefore/$countAfter D_absent=$(-not (Test-Path -LiteralPath $stagingPath))"
  }

  Write-Host ""
  Write-Host "P4C SD01 FINAL PHYSICAL SELF-CHECK" -ForegroundColor Cyan
  Write-Host "Site: $SiteId  SKU: $Sku  Asset: $assetId"
  $Checks | Format-Table -AutoSize
  $failed = @($Checks | Where-Object { $_.Result -ne "PASS" })
  if ($failed.Count -gt 0) { Write-Host "P4C_SD01_FINAL_PHYSICAL_SELF_CHECK=FAIL" -ForegroundColor Red; exit 1 }
  Write-Host "P4C_SD01_FINAL_PHYSICAL_SELF_CHECK=PASS" -ForegroundColor Green
  exit 0
} catch {
  Add-Check "UNHANDLED_CHECK_ERROR" $false $_.Exception.Message
  Write-Host ""
  Write-Host "P4C SD01 FINAL PHYSICAL SELF-CHECK" -ForegroundColor Cyan
  $Checks | Format-Table -AutoSize
  Write-Host ("ERROR: " + $_.Exception.Message) -ForegroundColor Red
  Write-Host "P4C_SD01_FINAL_PHYSICAL_SELF_CHECK=FAIL" -ForegroundColor Red
  exit 1
}
