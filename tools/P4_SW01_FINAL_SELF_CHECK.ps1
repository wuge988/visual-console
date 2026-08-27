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

function Add-Check {
  param([string]$Name, [bool]$Pass, [string]$Detail)
  $Checks.Add([pscustomobject]@{
    Check = $Name
    Result = $(if ($Pass) { "PASS" } else { "FAIL" })
    Detail = $Detail
  }) | Out-Null
}

function Read-JsonBomSafe {
  param([string]$Path)
  $text = [IO.File]::ReadAllText($Path, [Text.Encoding]::UTF8)
  if ($text.Length -gt 0 -and [int][char]$text[0] -eq 0xFEFF) {
    $text = $text.Substring(1)
  }
  return $text | ConvertFrom-Json
}

function Assert-FileSnapshot {
  param(
    [string]$Path,
    [long]$ExpectedSize,
    [string]$ExpectedSha,
    [string]$CheckName
  )
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    Add-Check $CheckName $false "missing: $Path"
    return $false
  }
  $item = Get-Item -LiteralPath $Path
  $actualSha = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  $sizeOk = ([long]$item.Length -eq $ExpectedSize)
  $shaOk = ($actualSha -eq $ExpectedSha.ToLowerInvariant())
  Add-Check $CheckName ($sizeOk -and $shaOk) "size=$($item.Length)/$ExpectedSize sha=$($actualSha.Substring(0,12))..."
  return ($sizeOk -and $shaOk)
}

function Get-ApiJson {
  param([string]$Path)
  $response = Invoke-WebRequest -Uri ($ApiBase + $Path) -Method Get -UseBasicParsing -TimeoutSec 15
  return $response.Content | ConvertFrom-Json -ErrorAction Stop
}

function Get-ApiJsonArray {
  param([string]$Path)
  $response = Invoke-WebRequest -Uri ($ApiBase + $Path) -Method Get -UseBasicParsing -TimeoutSec 15
  $parsed = $response.Content | ConvertFrom-Json -ErrorAction Stop
  if ($null -eq $parsed) { return }
  foreach ($item in $parsed) { Write-Output $item }
}

function Post-ApiJson {
  param([string]$Path, [object]$Body = $null)
  if ($null -eq $Body) { $Body = @{} }
  return Invoke-RestMethod -Uri ($ApiBase + $Path) -Method Post -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 8 -Compress) -TimeoutSec 20
}

try {
  $siteEsc = [Uri]::EscapeDataString($SiteId)
  $skuEsc = [Uri]::EscapeDataString($Sku)

  $health = Get-ApiJson "/health"
  Add-Check "P4_SERVICE_HEALTH" ([bool]$health.ok) "service=$($health.service) version=$($health.version)"

  $profilePath = Join-Path $RepoRoot "config\sites\$SiteId.json"
  if (-not (Test-Path -LiteralPath $profilePath -PathType Leaf)) { throw "SITE_PROFILE_NOT_FOUND: $profilePath" }
  $profile = Read-JsonBomSafe $profilePath
  Add-Check "SITE_PROFILE_SW01_ENABLED" (@($profile.enabled_workflows) -contains "SW01") "enabled=$(@($profile.enabled_workflows) -join ',')"

  $manifestPath = Join-Path ([string]$profile.manifest_root) ($Sku + ".json")
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw "MANIFEST_NOT_FOUND: $manifestPath" }
  $manifest = Read-JsonBomSafe $manifestPath
  $whiteDestination = [string]$manifest.destinations.white
  Add-Check "MANIFEST_WHITE_DESTINATION" (-not [string]::IsNullOrWhiteSpace($whiteDestination)) "white=$whiteDestination"

  $sw01Archives = @(Get-ApiJsonArray "/api/archive?site_id=$siteEsc&item_id=$skuEsc" | Where-Object {
    $_.workflow_code -eq "SW01" -and $_.destination_key -eq "white" -and $_.result -eq "VERIFIED_ARCHIVE"
  } | Sort-Object archived_at -Descending)
  if ($sw01Archives.Count -lt 1) { throw "NO_SW01_VERIFIED_ARCHIVE_FOR_SKU" }

  $archive = $null
  if (-not [string]::IsNullOrWhiteSpace($AssetId)) {
    $archive = @($sw01Archives | Where-Object { [string]$_.asset_id -eq $AssetId }) | Select-Object -First 1
    if ($null -eq $archive) { throw "REQUESTED_SW01_ARCHIVE_NOT_FOUND" }
  } else {
    $archive = $sw01Archives[0]
  }
  $assetId = [string]$archive.asset_id
  if (-not ($assetId -match '^[a-f0-9]{32}$')) { throw "SW01_ARCHIVE_ASSET_ID_INVALID" }
  Add-Check "API_SW01_ARCHIVE_TRUTH" $true "asset=$assetId file=$($archive.filename)"

  $derivatives = @(Get-ApiJsonArray "/api/derivatives?site_id=$siteEsc&item_id=$skuEsc")
  $derivative = @($derivatives | Where-Object { [string]$_.generated_asset_id -eq $assetId }) | Select-Object -First 1
  if ($null -eq $derivative) { throw "DERIVATIVE_RECORD_NOT_FOUND_FOR_ARCHIVE" }
  Add-Check "DERIVATIVE_ARCHIVED_STATE" ([bool]$derivative.archived -and $derivative.state -eq "QA_PASS") "state=$($derivative.state) archived=$($derivative.archived)"
  Add-Check "DERIVATIVE_RENDERER" ($derivative.renderer_id -eq "sw01-flat-white-rgb-v1") "renderer=$($derivative.renderer_id)"

  $history = @($manifest.archive_history)
  $sw01History = @($history | Where-Object {
    $_.asset_id -eq $assetId -and $_.gate -eq "15" -and $_.workflow_code -eq "SW01" -and $_.destination_key -eq "white" -and $_.result -eq "VERIFIED_ARCHIVE"
  })
  Add-Check "MANIFEST_SINGLE_SW01_HISTORY" ($sw01History.Count -eq 1) "matching_rows=$($sw01History.Count)"
  if ($sw01History.Count -ne 1) { throw "SW01_MANIFEST_HISTORY_NOT_EXACTLY_ONE" }
  $sw01 = $sw01History[0]

  $targetPath = [string]$sw01.destination_path
  $targetParent = Split-Path -Parent $targetPath
  Add-Check "MANIFEST_WHITE_ROUTE_MATCH" ([IO.Path]::GetFullPath($targetParent) -eq [IO.Path]::GetFullPath($whiteDestination)) "target_dir=$targetParent"
  [void](Assert-FileSnapshot $targetPath ([long]$sw01.size_bytes) ([string]$sw01.sha256) "F_WHITE_HASH_SIZE")

  $stagingPath = Join-Path ([string]$profile.staging_root) ("visual-console\" + $Sku + "\white\" + [string]$sw01.filename)
  Add-Check "D_DELETE_LAST_FINAL_STATE" (-not (Test-Path -LiteralPath $stagingPath)) "staging_absent=$(-not (Test-Path -LiteralPath $stagingPath))"

  $sourceAssetId = [string]$derivative.source_asset_id
  $sourceHistory = @($history | Where-Object {
    $_.asset_id -eq $sourceAssetId -and $_.gate -eq "15" -and $_.workflow_code -eq "SC01" -and $_.destination_key -eq "cutout" -and $_.result -eq "VERIFIED_ARCHIVE"
  })
  Add-Check "SOURCE_MANIFEST_HISTORY" ($sourceHistory.Count -eq 1) "matching_rows=$($sourceHistory.Count)"
  if ($sourceHistory.Count -ne 1) { throw "SOURCE_MANIFEST_HISTORY_NOT_EXACTLY_ONE" }
  $source = $sourceHistory[0]
  $sourceMetaOk = (
    [string]$source.filename -eq [string]$derivative.source_filename -and
    [string]$source.sha256 -eq [string]$derivative.source_sha256 -and
    [long]$source.size_bytes -eq [long]$derivative.source_size_bytes
  )
  Add-Check "SOURCE_ARCHIVE_IDENTITY_MATCH" $sourceMetaOk "source_asset=$sourceAssetId"
  [void](Assert-FileSnapshot ([string]$source.destination_path) ([long]$source.size_bytes) ([string]$source.sha256) "F_CUTOUT_SOURCE_HASH_SIZE")

  $derivativeJournal = Join-Path ([string]$profile.control_root) "derivatives.jsonl"
  if (-not (Test-Path -LiteralPath $derivativeJournal -PathType Leaf)) { throw "DERIVATIVE_JOURNAL_NOT_FOUND" }
  $derivativeSnapshots = @()
  foreach ($line in [IO.File]::ReadAllLines($derivativeJournal, [Text.Encoding]::UTF8)) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    try {
      $row = $line | ConvertFrom-Json
      if ($row.event -eq "DERIVATIVE_SNAPSHOT" -and $row.generated_asset_id -eq $assetId) { $derivativeSnapshots += $row }
    } catch { }
  }
  $latestDerivative = $derivativeSnapshots | Select-Object -Last 1
  Add-Check "DERIVATIVE_JOURNAL_RECONSTRUCTABLE" ($null -ne $latestDerivative -and $latestDerivative.state -eq "QA_PASS") "snapshots=$($derivativeSnapshots.Count) latest=$($latestDerivative.state)"

  $archiveJournal = Join-Path ([string]$profile.control_root) "archives.jsonl"
  $archiveSnapshots = @()
  if (Test-Path -LiteralPath $archiveJournal -PathType Leaf) {
    foreach ($line in [IO.File]::ReadAllLines($archiveJournal, [Text.Encoding]::UTF8)) {
      if ([string]::IsNullOrWhiteSpace($line)) { continue }
      try {
        $row = $line | ConvertFrom-Json
        if ($row.event -eq "ARCHIVE_SNAPSHOT" -and $row.asset_id -eq $assetId) { $archiveSnapshots += $row }
      } catch { }
    }
  }
  $latestArchive = $archiveSnapshots | Select-Object -Last 1
  $archiveSnapshotOk = (
    $null -ne $latestArchive -and $latestArchive.workflow_code -eq "SW01" -and $latestArchive.destination_key -eq "white" -and
    $latestArchive.source_deleted -eq $true -and [string]$latestArchive.sha256 -eq [string]$sw01.sha256 -and
    [long]$latestArchive.size_bytes -eq [long]$sw01.size_bytes
  )
  Add-Check "ARCHIVE_JOURNAL_SNAPSHOT" $archiveSnapshotOk "snapshots=$($archiveSnapshots.Count)"

  $tempPreview = Join-Path ([IO.Path]::GetTempPath()) ("vc-sw01-preview-" + [Guid]::NewGuid().ToString("N") + ".png")
  try {
    Invoke-WebRequest -Uri ($ApiBase + "/api/derivatives/assets/$siteEsc/$skuEsc/$assetId/content") -OutFile $tempPreview -UseBasicParsing -TimeoutSec 20 | Out-Null
    [void](Assert-FileSnapshot $tempPreview ([long]$sw01.size_bytes) ([string]$sw01.sha256) "F_PREVIEW_ENDPOINT_HASH_SIZE")
  } finally {
    Remove-Item -LiteralPath $tempPreview -Force -ErrorAction SilentlyContinue
  }

  if (-not $SkipIdempotentRetry) {
    $beforeHash = (Get-FileHash -LiteralPath $targetPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $retry = Post-ApiJson "/api/derivatives/archive/$siteEsc/$skuEsc/$assetId"
    Add-Check "IDEMPOTENT_RETRY_API" ([bool]$retry.ok -and $retry.archive.asset_id -eq $assetId) "asset=$($retry.archive.asset_id)"

    $manifestAfterRetry = Read-JsonBomSafe $manifestPath
    $retryRows = @($manifestAfterRetry.archive_history | Where-Object {
      $_.asset_id -eq $assetId -and $_.workflow_code -eq "SW01" -and $_.destination_key -eq "white"
    })
    $afterHash = (Get-FileHash -LiteralPath $targetPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $retryOk = ($retryRows.Count -eq 1 -and $beforeHash -eq $afterHash -and -not (Test-Path -LiteralPath $stagingPath))
    Add-Check "IDEMPOTENT_RETRY_INVARIANTS" $retryOk "manifest_rows=$($retryRows.Count) hash_unchanged=$($beforeHash -eq $afterHash) staging_absent=$(-not (Test-Path -LiteralPath $stagingPath))"
  }

  Write-Host ""
  Write-Host "P4 SW01 FINAL PHYSICAL SELF-CHECK" -ForegroundColor Cyan
  Write-Host "Site: $SiteId  SKU: $Sku  Asset: $assetId"
  $Checks | Format-Table -AutoSize
  $failed = @($Checks | Where-Object { $_.Result -ne "PASS" })
  if ($failed.Count -gt 0) {
    Write-Host "P4_SW01_FINAL_PHYSICAL_SELF_CHECK=FAIL" -ForegroundColor Red
    exit 1
  }
  Write-Host "P4_SW01_FINAL_PHYSICAL_SELF_CHECK=PASS" -ForegroundColor Green
  exit 0
} catch {
  Add-Check "UNHANDLED_CHECK_ERROR" $false $_.Exception.Message
  Write-Host ""
  Write-Host "P4 SW01 FINAL PHYSICAL SELF-CHECK" -ForegroundColor Cyan
  $Checks | Format-Table -AutoSize
  Write-Host ("ERROR: " + $_.Exception.Message) -ForegroundColor Red
  Write-Host "P4_SW01_FINAL_PHYSICAL_SELF_CHECK=FAIL" -ForegroundColor Red
  exit 1
}
