param(
  [string]$RepoRoot = "E:\AI_PROJECTS\VISUAL_CONSOLE",
  [string]$Branch = "feat/p4-static-derivatives"
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Text) {
  Write-Host ""
  Write-Host ("==> " + $Text) -ForegroundColor Cyan
}

function Invoke-Git {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
  $output = & git @Args 2>&1
  $code = $LASTEXITCODE
  if ($code -ne 0) {
    throw ("GIT_FAILED: git " + ($Args -join " ") + "`n" + ($output -join "`n"))
  }
  return @($output)
}

try {
  if (-not (Test-Path -LiteralPath $RepoRoot -PathType Container)) {
    throw "REPO_NOT_FOUND: $RepoRoot"
  }
  Set-Location $RepoRoot

  Write-Step "Inspect local repository"
  $actualRoot = ((Invoke-Git rev-parse --show-toplevel) -join "").Trim()
  if ([IO.Path]::GetFullPath($actualRoot) -ne [IO.Path]::GetFullPath($RepoRoot)) {
    throw "REPO_ROOT_MISMATCH: $actualRoot"
  }
  $beforeHead = ((Invoke-Git rev-parse HEAD) -join "").Trim()
  $beforeBranch = ((Invoke-Git branch --show-current) -join "").Trim()
  if ([string]::IsNullOrWhiteSpace($beforeBranch)) { $beforeBranch = "DETACHED" }
  Write-Host "LOCAL_BEFORE_HEAD=$beforeHead"
  Write-Host "LOCAL_BEFORE_BRANCH=$beforeBranch"

  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $backupRoot = Join-Path (Split-Path -Parent $RepoRoot) ("VISUAL_CONSOLE_RECOVERY_" + $stamp)
  New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null

  $status = @(& git status --porcelain=v1 -uall)
  [IO.File]::WriteAllLines((Join-Path $backupRoot "status-before.txt"), $status, [Text.Encoding]::UTF8)
  (& git diff --binary) | Out-File -LiteralPath (Join-Path $backupRoot "worktree.patch") -Encoding utf8
  (& git diff --cached --binary) | Out-File -LiteralPath (Join-Path $backupRoot "index.patch") -Encoding utf8
  (& git log -1 --decorate --oneline) | Out-File -LiteralPath (Join-Path $backupRoot "head-before.txt") -Encoding utf8

  if ($status.Count -gt 0) {
    Write-Step "Preserve dirty work in a new safety stash"
    $stashName = "safety-before-p4-local-recovery-$stamp"
    & git stash push --include-untracked -m $stashName
    if ($LASTEXITCODE -ne 0) { throw "SAFETY_STASH_FAILED" }
    $stashList = @(& git stash list)
    [IO.File]::WriteAllLines((Join-Path $backupRoot "stash-list-after.txt"), $stashList, [Text.Encoding]::UTF8)
    if (-not (($stashList -join "`n") -match [regex]::Escape($stashName))) {
      throw "SAFETY_STASH_NOT_FOUND_AFTER_CREATE"
    }
    Write-Host "SAFETY_STASH=$stashName" -ForegroundColor Green
  } else {
    Write-Host "WORKTREE_ALREADY_CLEAN" -ForegroundColor Green
  }

  $afterStash = @(& git status --porcelain=v1 -uall)
  if ($afterStash.Count -gt 0) {
    throw ("WORKTREE_STILL_DIRTY_AFTER_SAFETY_STASH`n" + ($afterStash -join "`n"))
  }

  Write-Step "Fetch exact remote P4A branch"
  & git fetch origin "+refs/heads/${Branch}:refs/remotes/origin/${Branch}"
  if ($LASTEXITCODE -ne 0) { throw "P4_REMOTE_FETCH_FAILED" }
  $remoteRef = "refs/remotes/origin/$Branch"
  & git show-ref --verify --quiet $remoteRef
  if ($LASTEXITCODE -ne 0) { throw "P4_REMOTE_REF_MISSING: $remoteRef" }
  $remoteHead = ((Invoke-Git rev-parse $remoteRef) -join "").Trim()
  Write-Host "REMOTE_P4_HEAD=$remoteHead" -ForegroundColor Green

  Write-Step "Preserve old HEAD with a safety branch"
  $safeBranch = "safety/local-before-p4-recovery-$stamp"
  & git branch $safeBranch $beforeHead
  if ($LASTEXITCODE -ne 0) { throw "SAFETY_BRANCH_CREATE_FAILED" }
  Write-Host "SAFETY_BRANCH=$safeBranch" -ForegroundColor Green

  Write-Step "Recreate local P4A branch from exact remote head"
  & git switch --detach $remoteHead
  if ($LASTEXITCODE -ne 0) { throw "DETACH_REMOTE_HEAD_FAILED" }
  & git branch -f $Branch $remoteHead
  if ($LASTEXITCODE -ne 0) { throw "LOCAL_P4_BRANCH_REPOINT_FAILED" }
  & git switch $Branch
  if ($LASTEXITCODE -ne 0) { throw "LOCAL_P4_BRANCH_SWITCH_FAILED" }

  $finalHead = ((Invoke-Git rev-parse HEAD) -join "").Trim()
  $finalBranch = ((Invoke-Git branch --show-current) -join "").Trim()
  $finalStatus = @(& git status --porcelain=v1 -uall)
  if ($finalBranch -ne $Branch) { throw "FINAL_BRANCH_MISMATCH: $finalBranch" }
  if ($finalHead -ne $remoteHead) { throw "FINAL_HEAD_MISMATCH: local=$finalHead remote=$remoteHead" }
  if ($finalStatus.Count -gt 0) { throw "FINAL_WORKTREE_NOT_CLEAN" }

  Write-Host "LOCAL_RECOVERY=PASS" -ForegroundColor Green
  Write-Host "HEAD=$finalHead" -ForegroundColor Green
  Write-Host "BACKUP_DIR=$backupRoot" -ForegroundColor Green
  Write-Host "Old local work was preserved; do not pop any safety stash during P4 validation." -ForegroundColor Yellow

  $gate = Join-Path $RepoRoot "tools\P4_SW01_WINDOWS_GATE.ps1"
  if (-not (Test-Path -LiteralPath $gate -PathType Leaf)) { throw "P4_GATE_SCRIPT_NOT_FOUND: $gate" }

  Write-Step "Launch P4 SW01 Windows Gate"
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $gate
  exit $LASTEXITCODE
} catch {
  Write-Host ""
  Write-Host ("P4_SW01_LOCAL_RECOVERY=FAIL :: " + $_.Exception.Message) -ForegroundColor Red
  exit 1
}
