param(
  [string]$SiteId = "drift-curio",
  [string]$Sku = "DC-ZY-SZ-31001",
  [string]$ApiBase = "http://127.0.0.1:4179",
  [string]$WebBase = "http://127.0.0.1:5173",
  [int]$HumanTimeoutMinutes = 30,
  [switch]$SkipSync,
  [switch]$ResumeLatestArchive
)

$ErrorActionPreference = "Stop"
$Branch = "feat/p4c-sd01-production"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$SelfCheck = Join-Path $PSScriptRoot "P4C_SD01_FINAL_SELF_CHECK.ps1"

function Write-Step([string]$Text) { Write-Host ""; Write-Host ("==> " + $Text) -ForegroundColor Cyan }

function Invoke-Git {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
  $previous = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $output = @(& git @Args 2>&1)
    $exitCode = $LASTEXITCODE
  } finally { $ErrorActionPreference = $previous }
  if ($exitCode -ne 0) { throw ("GIT_FAILED: git " + ($Args -join " ") + "`n" + (($output | ForEach-Object { [string]$_ }) -join "`n")) }
  return @($output | ForEach-Object { [string]$_ })
}

function Get-JsonArray([string]$Url) {
  $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 15
  $parsed = $response.Content | ConvertFrom-Json -ErrorAction Stop
  if ($null -eq $parsed) { return }
  foreach ($item in $parsed) { Write-Output $item }
}

function Wait-Http([string]$Url, [int]$TimeoutSeconds = 120) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $last = ""
  while ((Get-Date) -lt $deadline) {
    try { $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5; if ([int]$response.StatusCode -ge 200 -and [int]$response.StatusCode -lt 400) { return } } catch { $last = $_.Exception.Message }
    Start-Sleep -Milliseconds 750
  }
  throw "HTTP_NOT_READY: $Url :: $last"
}

function Get-OwnedListenerPids {
  $pids = New-Object System.Collections.Generic.HashSet[int]
  foreach ($port in @(4177,4179,5173)) {
    foreach ($row in @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)) {
      if ([int]$row.OwningProcess -gt 0) { [void]$pids.Add([int]$row.OwningProcess) }
    }
  }
  return @($pids)
}

function Stop-VisualConsoleRuntime {
  $pids = @(Get-OwnedListenerPids)
  foreach ($processId in $pids) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
    if ($null -eq $proc) { continue }
    $cmd = [string]$proc.CommandLine
    if ([string]::IsNullOrWhiteSpace($cmd) -or $cmd.IndexOf($RepoRoot, [System.StringComparison]::OrdinalIgnoreCase) -lt 0) { throw "PORT_OWNER_NOT_VISUAL_CONSOLE: PID=$processId CMD=$cmd" }
  }
  foreach ($processId in $pids) { & taskkill.exe /PID $processId /T /F *> $null }
  $deadline = (Get-Date).AddSeconds(20)
  while ((Get-Date) -lt $deadline) { if (@(Get-OwnedListenerPids).Count -eq 0) { return }; Start-Sleep -Milliseconds 500 }
  throw "VISUAL_CONSOLE_PORTS_DID_NOT_RELEASE"
}

function Start-VisualConsoleRuntime([string]$EvidenceDir) {
  $stdout = Join-Path $EvidenceDir "runtime.stdout.log"
  $stderr = Join-Path $EvidenceDir "runtime.stderr.log"
  Start-Process -FilePath "cmd.exe" -ArgumentList "/d", "/c", "npm.cmd run dev" -WorkingDirectory $RepoRoot -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr | Out-Null
  Wait-Http "$ApiBase/health"
  Wait-Http "$WebBase/sd01.html"
}

function Read-Profile {
  $path = Join-Path $RepoRoot ("config\sites\" + $SiteId + ".json")
  $text = [IO.File]::ReadAllText($path, [Text.Encoding]::UTF8)
  if ($text.Length -gt 0 -and [int][char]$text[0] -eq 0xFEFF) { $text = $text.Substring(1) }
  return $text | ConvertFrom-Json
}

function Get-Sd01Archives {
  $siteEsc = [Uri]::EscapeDataString($SiteId); $skuEsc = [Uri]::EscapeDataString($Sku)
  return @(Get-JsonArray "$ApiBase/api/archive?site_id=$siteEsc&item_id=$skuEsc" | Where-Object { $_.workflow_code -eq "SD01" -and $_.destination_key -eq "dark" -and $_.result -eq "VERIFIED_ARCHIVE" })
}

function Run-SelfCheck([string]$OutputPath, [string]$AssetId, [switch]$SkipRetry) {
  $args = @("-NoProfile","-ExecutionPolicy","Bypass","-File",$SelfCheck,"-SiteId",$SiteId,"-Sku",$Sku,"-ApiBase",$ApiBase,"-AssetId",$AssetId)
  if ($SkipRetry) { $args += "-SkipIdempotentRetry" }
  $output = & powershell.exe @args 2>&1
  $code = $LASTEXITCODE
  $output | Tee-Object -FilePath $OutputPath
  if ($code -ne 0) { throw "P4C_SELF_CHECK_FAILED: exit=$code" }
  if (-not (($output -join "`n") -match "P4C_SD01_FINAL_PHYSICAL_SELF_CHECK=PASS")) { throw "P4C_SELF_CHECK_PASS_MARKER_MISSING" }
}

function Copy-Summary([string[]]$Lines) {
  if (Get-Command Set-Clipboard -ErrorAction SilentlyContinue) { try { Set-Clipboard -Value ($Lines -join [Environment]::NewLine); Write-Host "Gate summary copied to clipboard. Paste it back into ChatGPT." -ForegroundColor Yellow } catch {} }
}

try {
  Write-Step "Repository preflight"
  Set-Location $RepoRoot
  $root = ((Invoke-Git rev-parse --show-toplevel) -join "").Trim()
  if ([IO.Path]::GetFullPath($root) -ne [IO.Path]::GetFullPath($RepoRoot)) { throw "REPO_ROOT_MISMATCH: $root" }
  $dirty = @((Invoke-Git status --porcelain))
  if ($dirty.Count -gt 0 -and -not [string]::IsNullOrWhiteSpace(($dirty -join ""))) { throw ("WORKTREE_NOT_CLEAN`n" + ($dirty -join "`n")) }
  $currentBranch = ((Invoke-Git branch --show-current) -join "").Trim()
  if ($currentBranch -ne $Branch) { throw "WRONG_BRANCH: expected=$Branch actual=$currentBranch" }

  if (-not $SkipSync) {
    Write-Step "Fast-forward to current remote P4C branch"
    [void](Invoke-Git fetch origin "+refs/heads/${Branch}:refs/remotes/origin/${Branch}")
    $localHead = ((Invoke-Git rev-parse HEAD) -join "").Trim(); $remoteHead = ((Invoke-Git rev-parse "origin/$Branch") -join "").Trim()
    & git merge-base --is-ancestor $localHead $remoteHead 2>$null
    if ($LASTEXITCODE -ne 0) { throw "LOCAL_BRANCH_DIVERGED_FROM_REMOTE" }
    if ($localHead -ne $remoteHead) {
      [void](Invoke-Git merge --ff-only "origin/$Branch")
      $relaunch = @("-NoProfile","-ExecutionPolicy","Bypass","-File",$PSCommandPath,"-SiteId",$SiteId,"-Sku",$Sku,"-ApiBase",$ApiBase,"-WebBase",$WebBase,"-HumanTimeoutMinutes",[string]$HumanTimeoutMinutes,"-SkipSync")
      if ($ResumeLatestArchive) { $relaunch += "-ResumeLatestArchive" }
      & powershell.exe @relaunch; exit $LASTEXITCODE
    }
  }

  $head = ((Invoke-Git rev-parse HEAD) -join "").Trim()
  Write-Host "HEAD=$head" -ForegroundColor Green
  if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw "NPM_CMD_NOT_FOUND" }
  if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot "node_modules"))) { & npm.cmd ci; if ($LASTEXITCODE -ne 0) { throw "NPM_CI_FAILED" } }

  $profile = Read-Profile
  $evidenceRoot = Join-Path ([string]$profile.control_root) "evidence"
  New-Item -ItemType Directory -Path $evidenceRoot -Force | Out-Null
  $evidenceDir = Join-Path $evidenceRoot ("P4C_SD01_" + (Get-Date -Format "yyyyMMdd-HHmmss"))
  New-Item -ItemType Directory -Path $evidenceDir -Force | Out-Null

  Write-Step "Restart Visual Console on exact P4C head"
  Stop-VisualConsoleRuntime
  Start-VisualConsoleRuntime $evidenceDir

  $archive = $null
  if ($ResumeLatestArchive) {
    $archive = @(Get-Sd01Archives | Sort-Object archived_at -Descending) | Select-Object -First 1
    if ($null -eq $archive) { throw "NO_EXISTING_SD01_ARCHIVE_TO_RESUME" }
  } else {
    $before = @(Get-Sd01Archives)
    $beforeIds = New-Object System.Collections.Generic.HashSet[string]
    foreach ($row in $before) { [void]$beforeIds.Add([string]$row.asset_id) }
    Write-Step "Open SD01 production validation surface"
    Start-Process "$WebBase/sd01.html" | Out-Null
    Write-Host "Only manual gate: generate SD01, inspect exact-piece/edges/wood color/#171B20, then approve+archive only if correct." -ForegroundColor Yellow
    $deadline = (Get-Date).AddMinutes($HumanTimeoutMinutes)
    while ((Get-Date) -lt $deadline) {
      Start-Sleep -Seconds 2
      try {
        $rows = @(Get-Sd01Archives | Sort-Object archived_at -Descending)
        $candidate = @($rows | Where-Object { -not $beforeIds.Contains([string]$_.asset_id) }) | Select-Object -First 1
        if ($null -ne $candidate) { $archive = $candidate; break }
      } catch {}
    }
    if ($null -eq $archive) { throw "NO_NEW_SD01_ARCHIVE_WITHIN_TIMEOUT" }
  }

  $assetId = [string]$archive.asset_id
  if (-not ($assetId -match '^[a-f0-9]{32}$')) { throw "SD01_ARCHIVE_ASSET_ID_INVALID" }
  Write-Step "Run D/E/F + Manifest + journal + idempotency self-check"
  $first = Join-Path $evidenceDir "self-check-before-restart.txt"
  Run-SelfCheck -OutputPath $first -AssetId $assetId

  Write-Step "Restart runtime and prove reconstruction + F preview"
  Stop-VisualConsoleRuntime
  Start-VisualConsoleRuntime $evidenceDir
  $second = Join-Path $evidenceDir "self-check-after-restart.txt"
  Run-SelfCheck -OutputPath $second -AssetId $assetId -SkipRetry

  $summary = @(
    "P4C_SD01_WINDOWS_GATE=PASS",
    "timestamp=$(Get-Date -Format o)",
    "site_id=$SiteId",
    "sku=$Sku",
    "asset_id=$assetId",
    "git_head=$head",
    "evidence_dir=$evidenceDir"
  )
  [IO.File]::WriteAllLines((Join-Path $evidenceDir "summary.txt"), $summary, [Text.Encoding]::UTF8)
  Copy-Summary $summary
  Write-Host "P4C_SD01_WINDOWS_GATE=PASS" -ForegroundColor Green
  Write-Host "Evidence: $evidenceDir" -ForegroundColor Green
  exit 0
} catch {
  $summary = @("P4C_SD01_WINDOWS_GATE=FAIL","timestamp=$(Get-Date -Format o)","site_id=$SiteId","sku=$Sku","error=$($_.Exception.Message)")
  Copy-Summary $summary
  Write-Host ("P4C_SD01_WINDOWS_GATE=FAIL :: " + $_.Exception.Message) -ForegroundColor Red
  exit 1
}
