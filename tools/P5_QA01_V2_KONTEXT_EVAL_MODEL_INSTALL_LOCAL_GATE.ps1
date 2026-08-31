param(
  [string]$RepoRoot = "E:\AI_PROJECTS\VISUAL_CONSOLE",
  [string]$Branch = "feat/p5-qa01-scene-freeze",
  [Parameter(Mandatory = $true)][string]$ExpectedHead
)

$ErrorActionPreference = "Stop"

function Invoke-Git {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
  $previous = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $output = @(& git @Args 2>&1)
    $code = $LASTEXITCODE
  } finally { $ErrorActionPreference = $previous }
  if ($code -ne 0) { throw ("GIT_FAILED: git " + ($Args -join " ") + " :: " + (($output | ForEach-Object { [string]$_ }) -join " | ")) }
  return @($output | ForEach-Object { [string]$_ })
}

try {
  Set-Location $RepoRoot
  $repo = ((Invoke-Git rev-parse --show-toplevel) -join "").Trim()
  if ([IO.Path]::GetFullPath($repo) -ne [IO.Path]::GetFullPath($RepoRoot)) { throw "REPO_ROOT_MISMATCH" }

  $dirty = @((Invoke-Git status --porcelain=v1 --untracked-files=all) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ($dirty.Count -gt 0) { throw ("WORKTREE_NOT_CLEAN :: " + ($dirty -join " | ")) }

  Write-Host "==> Sync exact audited P5 Kontext eval-install head" -ForegroundColor Cyan
  Invoke-Git fetch origin ("+refs/heads/" + $Branch + ":refs/remotes/origin/" + $Branch) | Out-Null
  $remote = ((Invoke-Git rev-parse ("refs/remotes/origin/" + $Branch)) -join "").Trim()
  if ($remote -ne $ExpectedHead.Trim()) { throw ("REMOTE_HEAD_MISMATCH: expected=" + $ExpectedHead + " actual=" + $remote) }

  $current = ((Invoke-Git rev-parse HEAD) -join "").Trim()
  if ($current -ne $remote) {
    $safety = "safety/local-before-p5-kontext-eval-install-" + (Get-Date -Format "yyyyMMdd-HHmmss")
    Invoke-Git branch $safety $current | Out-Null
    Write-Host ("SAFETY_BRANCH=" + $safety)
  }

  Invoke-Git switch --detach $remote | Out-Null
  $localBranchExists = $true
  try { Invoke-Git show-ref --verify ("refs/heads/" + $Branch) | Out-Null } catch { $localBranchExists = $false }
  if ($localBranchExists) { Invoke-Git branch -f $Branch $remote | Out-Null } else { Invoke-Git branch $Branch $remote | Out-Null }
  Invoke-Git switch $Branch | Out-Null

  $head = ((Invoke-Git rev-parse HEAD) -join "").Trim()
  if ($head -ne $remote) { throw ("LOCAL_HEAD_MISMATCH: " + $head) }
  $finalStatus = @((Invoke-Git status --porcelain=v1 --untracked-files=all) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ($finalStatus.Count -gt 0) { throw ("WORKTREE_NOT_CLEAN_BEFORE_KONTEXT_EVAL_INSTALL :: " + ($finalStatus -join " | ")) }

  Write-Host "P5_QA01_V2_KONTEXT_EVAL_MODEL_INSTALL_LOCAL_PREP=PASS" -ForegroundColor Green
  Write-Host ("HEAD=" + $head)
  Write-Host "==> Launch resumable four-file Kontext evaluation model install" -ForegroundColor Cyan
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "tools\P5_QA01_V2_KONTEXT_EVAL_MODEL_INSTALL_GATE.ps1") -ExpectedHead $remote
  $code = $LASTEXITCODE
  if ($code -ne 0) { throw ("P5_QA01_V2_KONTEXT_EVAL_MODEL_INSTALL_GATE_FAILED: exit=" + $code) }

  Write-Host "P5_QA01_V2_KONTEXT_EVAL_MODEL_INSTALL_LOCAL_GATE=PASS" -ForegroundColor Green
  exit 0
} catch {
  $summary = @("P5_QA01_V2_KONTEXT_EVAL_MODEL_INSTALL_LOCAL_GATE=FAIL", ("error=" + $_.Exception.Message))
  if (Get-Command Set-Clipboard -ErrorAction SilentlyContinue) { try { Set-Clipboard -Value ($summary -join [Environment]::NewLine) } catch {} }
  $summary | ForEach-Object { Write-Host $_ -ForegroundColor Red }
  exit 1
}
