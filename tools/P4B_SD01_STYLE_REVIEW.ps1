param(
  [string]$RepoRoot = "E:\AI_PROJECTS\VISUAL_CONSOLE",
  [string]$Branch = "feat/p4b-sd01-style-freeze",
  [string]$ApiBase = "http://127.0.0.1:4179",
  [string]$WebBase = "http://127.0.0.1:5173"
)

$ErrorActionPreference = "Stop"

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

function Wait-Http([string]$Url, [int]$TimeoutSeconds = 120) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $last = ""
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
      if ([int]$response.StatusCode -ge 200 -and [int]$response.StatusCode -lt 400) { return }
    } catch { $last = $_.Exception.Message }
    Start-Sleep -Milliseconds 750
  }
  throw "HTTP_NOT_READY: $Url :: $last"
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

  $oldHead = ((Invoke-Git rev-parse HEAD) -join "").Trim()
  $oldBranch = ((Invoke-Git branch --show-current) -join "").Trim()
  Write-Host "LOCAL_BEFORE_HEAD=$oldHead"
  Write-Host "LOCAL_BEFORE_BRANCH=$oldBranch"

  Write-Step "Fetch exact P4B style-review branch"
  [void](Invoke-Git fetch origin "+refs/heads/${Branch}:refs/remotes/origin/${Branch}")
  $remoteHead = ((Invoke-Git rev-parse "refs/remotes/origin/$Branch") -join "").Trim()
  Write-Host "REMOTE_P4B_HEAD=$remoteHead"

  if ($oldHead -ne $remoteHead) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $safeBranch = "safety/local-before-p4b-style-$stamp"
    [void](Invoke-Git branch $safeBranch $oldHead)
    Write-Host "SAFETY_BRANCH=$safeBranch" -ForegroundColor Yellow
  }

  Write-Step "Switch to exact remote P4B style-review head"
  [void](Invoke-Git switch --detach $remoteHead)
  [void](Invoke-Git branch -f $Branch $remoteHead)
  [void](Invoke-Git switch $Branch)
  $head = ((Invoke-Git rev-parse HEAD) -join "").Trim()
  if ($head -ne $remoteHead) { throw "P4B_HEAD_MISMATCH" }
  $afterDirty = @((Invoke-Git status --porcelain))
  if ($afterDirty.Count -gt 0 -and -not [string]::IsNullOrWhiteSpace(($afterDirty -join ""))) {
    throw "P4B_WORKTREE_NOT_CLEAN_AFTER_SWITCH"
  }
  Write-Host "P4B_HEAD=$head" -ForegroundColor Green

  if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw "NPM_CMD_NOT_FOUND" }
  if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot "node_modules"))) {
    Write-Step "node_modules missing; npm.cmd ci"
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw "NPM_CI_FAILED" }
  }

  Write-Step "Restart Visual Console read-only review runtime"
  Stop-VisualConsoleRuntime
  $logRoot = Join-Path $env:TEMP "visual-console-p4b-style"
  New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
  $stdout = Join-Path $logRoot "runtime.stdout.log"
  $stderr = Join-Path $logRoot "runtime.stderr.log"
  Start-Process -FilePath "cmd.exe" -ArgumentList "/d", "/c", "npm.cmd run dev" -WorkingDirectory $RepoRoot -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr | Out-Null
  Wait-Http "$ApiBase/health"
  Wait-Http "$WebBase/sd01-style.html"

  Start-Process "$WebBase/sd01-style.html" | Out-Null
  $summary = @(
    "P4B_SD01_STYLE_REVIEW_READY=PASS",
    "git_head=$head",
    "url=$WebBase/sd01-style.html",
    "review=A(#171B20) vs B(#0E1114); pure black is reject reference",
    "production_mutation=NONE"
  )
  if (Get-Command Set-Clipboard -ErrorAction SilentlyContinue) {
    try { Set-Clipboard -Value ($summary -join [Environment]::NewLine) } catch { }
  }
  Write-Host ""
  $summary | ForEach-Object { Write-Host $_ -ForegroundColor Green }
  Write-Host "Review the same VERIFIED Cutout on A and B. No production asset is written by this page." -ForegroundColor Yellow
  exit 0
} catch {
  Write-Host ""
  Write-Host ("P4B_SD01_STYLE_REVIEW_READY=FAIL :: " + $_.Exception.Message) -ForegroundColor Red
  exit 1
}
