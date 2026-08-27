param(
  [string]$SiteId = "drift-curio",
  [string]$Sku = "DC-ZY-SZ-31001",
  [string]$ApiBase = "http://127.0.0.1:4179",
  [string]$WebBase = "http://127.0.0.1:5173",
  [int]$HumanTimeoutMinutes = 30,
  [switch]$SkipSync
)

$ErrorActionPreference = "Stop"
$Branch = "feat/p4-static-derivatives"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$SelfCheck = Join-Path $PSScriptRoot "P4_SW01_FINAL_SELF_CHECK.ps1"

function Write-Step([string]$Text) {
  Write-Host ""
  Write-Host ("==> " + $Text) -ForegroundColor Cyan
}

function Invoke-Git {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
  $output = & git @Args 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw ("GIT_FAILED: git " + ($Args -join " ") + "`n" + ($output -join "`n"))
  }
  return @($output)
}

function Get-Json([string]$Url) {
  return Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec 15
}

function Wait-Http {
  param([string]$Url, [int]$TimeoutSeconds = 90)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $last = $null
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
      if ([int]$response.StatusCode -ge 200 -and [int]$response.StatusCode -lt 400) { return $true }
    } catch { $last = $_.Exception.Message }
    Start-Sleep -Milliseconds 750
  }
  throw "HTTP_NOT_READY: $Url :: $last"
}

function Get-OwnedListenerPids {
  $ports = @(4177, 4179, 5173)
  $pids = New-Object System.Collections.Generic.HashSet[int]
  foreach ($port in $ports) {
    $rows = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
    foreach ($row in $rows) {
      if ([int]$row.OwningProcess -gt 0) { [void]$pids.Add([int]$row.OwningProcess) }
    }
  }
  return @($pids)
}

function Stop-VisualConsoleRuntime {
  $pids = @(Get-OwnedListenerPids)
  if ($pids.Count -eq 0) { return }

  foreach ($processId in $pids) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
    if ($null -eq $proc) { continue }
    $cmd = [string]$proc.CommandLine
    if ([string]::IsNullOrWhiteSpace($cmd) -or $cmd.IndexOf($RepoRoot, [System.StringComparison]::OrdinalIgnoreCase) -lt 0) {
      throw "PORT_OWNER_NOT_VISUAL_CONSOLE: PID=$processId CMD=$cmd"
    }
  }

  foreach ($processId in $pids) {
    & taskkill.exe /PID $processId /T /F *> $null
  }

  $deadline = (Get-Date).AddSeconds(20)
  while ((Get-Date) -lt $deadline) {
    if (@(Get-OwnedListenerPids).Count -eq 0) { return }
    Start-Sleep -Milliseconds 500
  }
  throw "VISUAL_CONSOLE_PORTS_DID_NOT_RELEASE"
}

function Start-VisualConsoleRuntime {
  param([string]$EvidenceDir)
  $stdout = Join-Path $EvidenceDir "runtime.stdout.log"
  $stderr = Join-Path $EvidenceDir "runtime.stderr.log"
  Start-Process -FilePath "cmd.exe" -ArgumentList "/d", "/c", "npm.cmd run dev" -WorkingDirectory $RepoRoot -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr | Out-Null
  [void](Wait-Http "$ApiBase/health" 120)
  [void](Wait-Http "$WebBase/sw01.html" 120)
}

function Read-Profile {
  $path = Join-Path $RepoRoot ("config\sites\" + $SiteId + ".json")
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "SITE_PROFILE_NOT_FOUND: $path" }
  $text = [IO.File]::ReadAllText($path, [Text.Encoding]::UTF8)
  if ($text.Length -gt 0 -and [int][char]$text[0] -eq 0xFEFF) { $text = $text.Substring(1) }
  return $text | ConvertFrom-Json
}

function Get-Sw01Archives {
  $siteEsc = [Uri]::EscapeDataString($SiteId)
  $skuEsc = [Uri]::EscapeDataString($Sku)
  return @(Get-Json "$ApiBase/api/archive?site_id=$siteEsc&item_id=$skuEsc" | Where-Object {
    $_.workflow_code -eq "SW01" -and $_.destination_key -eq "white" -and $_.result -eq "VERIFIED_ARCHIVE"
  })
}

function Run-SelfCheck {
  param([switch]$SkipRetry, [string]$OutputPath)
  if (-not (Test-Path -LiteralPath $SelfCheck -PathType Leaf)) { throw "SELF_CHECK_NOT_FOUND: $SelfCheck" }
  $args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $SelfCheck, "-SiteId", $SiteId, "-Sku", $Sku, "-ApiBase", $ApiBase)
  if ($SkipRetry) { $args += "-SkipIdempotentRetry" }
  $output = & powershell.exe @args 2>&1
  $code = $LASTEXITCODE
  $output | Tee-Object -FilePath $OutputPath
  if ($code -ne 0) { throw "P4_SELF_CHECK_FAILED: exit=$code" }
  if (-not (($output -join "`n") -match "P4_SW01_FINAL_PHYSICAL_SELF_CHECK=PASS")) {
    throw "P4_SELF_CHECK_PASS_MARKER_MISSING"
  }
}

try {
  Write-Step "Repository preflight"
  Set-Location $RepoRoot
  $root = ((Invoke-Git rev-parse --show-toplevel) -join "").Trim()
  if ([IO.Path]::GetFullPath($root) -ne [IO.Path]::GetFullPath($RepoRoot)) {
    throw "REPO_ROOT_MISMATCH: $root"
  }

  $dirty = @((Invoke-Git status --porcelain))
  if ($dirty.Count -gt 0 -and -not [string]::IsNullOrWhiteSpace(($dirty -join ""))) {
    throw ("WORKTREE_NOT_CLEAN`n" + ($dirty -join "`n"))
  }

  $currentBranch = ((Invoke-Git branch --show-current) -join "").Trim()
  if ($currentBranch -ne $Branch) { throw "WRONG_BRANCH: expected=$Branch actual=$currentBranch" }

  if (-not $SkipSync) {
    Write-Step "Fast-forward to current remote P4A branch"
    [void](Invoke-Git fetch origin "refs/heads/${Branch}:refs/remotes/origin/${Branch}")
    $localHead = ((Invoke-Git rev-parse HEAD) -join "").Trim()
    $remoteHead = ((Invoke-Git rev-parse "origin/$Branch") -join "").Trim()
    & git merge-base --is-ancestor $localHead $remoteHead 2>$null
    if ($LASTEXITCODE -ne 0) { throw "LOCAL_BRANCH_DIVERGED_FROM_REMOTE" }
    if ($localHead -ne $remoteHead) {
      [void](Invoke-Git merge --ff-only "origin/$Branch")
      Write-Host "Repository updated. Relaunching the newest gate script..." -ForegroundColor Yellow
      $relaunch = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $PSCommandPath, "-SiteId", $SiteId, "-Sku", $Sku, "-ApiBase", $ApiBase, "-WebBase", $WebBase, "-HumanTimeoutMinutes", [string]$HumanTimeoutMinutes, "-SkipSync")
      & powershell.exe @relaunch
      exit $LASTEXITCODE
    }
  }

  $head = ((Invoke-Git rev-parse HEAD) -join "").Trim()
  Write-Host "HEAD=$head" -ForegroundColor Green

  if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw "NPM_CMD_NOT_FOUND" }
  if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot "node_modules"))) {
    Write-Step "node_modules missing; running npm.cmd ci"
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw "NPM_CI_FAILED" }
  }

  $profile = Read-Profile
  $evidenceRoot = Join-Path ([string]$profile.control_root) "evidence"
  New-Item -ItemType Directory -Path $evidenceRoot -Force | Out-Null
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $evidenceDir = Join-Path $evidenceRoot ("P4_SW01_" + $stamp)
  New-Item -ItemType Directory -Path $evidenceDir -Force | Out-Null
  $summaryPath = Join-Path $evidenceDir "summary.txt"

  Write-Step "Restart Visual Console on exact P4A head"
  Stop-VisualConsoleRuntime
  Start-VisualConsoleRuntime $evidenceDir
  Write-Host "Runtime ready: $ApiBase / $WebBase" -ForegroundColor Green

  $before = @(Get-Sw01Archives)
  $beforeIds = New-Object System.Collections.Generic.HashSet[string]
  foreach ($row in $before) { [void]$beforeIds.Add([string]$row.asset_id) }

  Write-Step "Open SW01 physical validation surface"
  Start-Process "$WebBase/sw01.html" | Out-Null
  Write-Host "The newest verified SC01 Cutout is auto-selected." -ForegroundColor Yellow
  Write-Host "Manual visual gate only: click '生成 SW01 白底主图', inspect exact-piece/edges/background, then click '通过并归档到 F' only if correct." -ForegroundColor Yellow
  Write-Host "This terminal is now monitoring the local archive automatically." -ForegroundColor DarkGray

  $deadline = (Get-Date).AddMinutes($HumanTimeoutMinutes)
  $newArchive = $null
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
    try {
      $rows = @(Get-Sw01Archives | Sort-Object archived_at -Descending)
      $candidate = @($rows | Where-Object { -not $beforeIds.Contains([string]$_.asset_id) }) | Select-Object -First 1
      if ($null -ne $candidate) { $newArchive = $candidate; break }
    } catch { }
  }
  if ($null -eq $newArchive) { throw "NO_NEW_SW01_ARCHIVE_WITHIN_TIMEOUT" }
  $assetId = [string]$newArchive.asset_id
  Write-Host "Detected new SW01 archive: $assetId" -ForegroundColor Green

  Write-Step "Run physical D/E/F + Manifest + journal + idempotency self-check"
  $firstCheck = Join-Path $evidenceDir "self-check-before-restart.txt"
  Run-SelfCheck -OutputPath $firstCheck

  Write-Step "Restart runtime to prove reconstruction and F preview"
  Stop-VisualConsoleRuntime
  Start-VisualConsoleRuntime $evidenceDir
  $secondCheck = Join-Path $evidenceDir "self-check-after-restart.txt"
  Run-SelfCheck -SkipRetry -OutputPath $secondCheck

  $summary = @(
    "P4_SW01_WINDOWS_GATE=PASS",
    "timestamp=$(Get-Date -Format o)",
    "site_id=$SiteId",
    "sku=$Sku",
    "asset_id=$assetId",
    "git_head=$head",
    "first_check=$firstCheck",
    "restart_check=$secondCheck"
  )
  [IO.File]::WriteAllLines($summaryPath, $summary, [Text.Encoding]::UTF8)

  Write-Host ""
  Write-Host "P4_SW01_WINDOWS_GATE=PASS" -ForegroundColor Green
  Write-Host "Evidence: $evidenceDir" -ForegroundColor Green
  Write-Host "Leave the runtime running; repository merge remains blocked until this physical evidence is reviewed and the six-page integration is completed." -ForegroundColor DarkGray
  exit 0
} catch {
  Write-Host ""
  Write-Host ("P4_SW01_WINDOWS_GATE=FAIL :: " + $_.Exception.Message) -ForegroundColor Red
  exit 1
}
