param(
  [string]$RepoRoot = "E:\AI_PROJECTS\VISUAL_CONSOLE",
  [string]$Branch = "feat/p5-qa01-scene-freeze",
  [Parameter(Mandatory = $true)][string]$ExpectedHead
)

$ErrorActionPreference = "Stop"
$ComfyBase = "http://127.0.0.1:8188"

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

function Test-ComfyReady {
  try {
    $response = Invoke-WebRequest -Uri ($ComfyBase + "/system_stats") -UseBasicParsing -TimeoutSec 8
    return ([int]$response.StatusCode -eq 200)
  } catch {
    return $false
  }
}

try {
  Set-Location $RepoRoot
  $repo = ((Invoke-Git rev-parse --show-toplevel) -join "").Trim()
  if ([IO.Path]::GetFullPath($repo) -ne [IO.Path]::GetFullPath($RepoRoot)) { throw "REPO_ROOT_MISMATCH" }

  $dirty = @((Invoke-Git status --porcelain=v1 --untracked-files=all) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ($dirty.Count -gt 0) { throw ("WORKTREE_NOT_CLEAN :: " + ($dirty -join " | ")) }

  Write-Host "==> Sync exact audited P5 v2 capability head" -ForegroundColor Cyan
  Invoke-Git fetch origin ("+refs/heads/" + $Branch + ":refs/remotes/origin/" + $Branch) | Out-Null
  $remote = ((Invoke-Git rev-parse ("refs/remotes/origin/" + $Branch)) -join "").Trim()
  if ($remote -ne $ExpectedHead.Trim()) { throw ("REMOTE_HEAD_MISMATCH: expected=" + $ExpectedHead + " actual=" + $remote) }

  $current = ((Invoke-Git rev-parse HEAD) -join "").Trim()
  if ($current -ne $remote) {
    $safety = "safety/local-before-p5-v2-capability-" + (Get-Date -Format "yyyyMMdd-HHmmss")
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
  if ($finalStatus.Count -gt 0) { throw ("WORKTREE_NOT_CLEAN_BEFORE_V2_PROBE :: " + ($finalStatus -join " | ")) }

  Write-Host "P5_QA01_V2_CAPABILITY_LOCAL_PREP=PASS" -ForegroundColor Green
  Write-Host ("HEAD=" + $head)

  $runtimeRecovered = $false
  if (-not (Test-ComfyReady)) {
    Write-Host "==> ComfyUI offline; recover existing verified runtime without downloads" -ForegroundColor Cyan
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "tools\P5_QA01_RUNTIME_GATE.ps1") -ExpectedHead $remote
    $runtimeCode = $LASTEXITCODE
    if ($runtimeCode -ne 0) { throw ("P5_QA01_RUNTIME_RECOVERY_FAILED: exit=" + $runtimeCode) }
    $runtimeRecovered = $true
  }

  if (-not (Test-ComfyReady)) { throw "COMFYUI_STILL_OFFLINE_AFTER_RUNTIME_RECOVERY" }
  Write-Host ("P5_QA01_V2_RUNTIME_RECOVERED=" + $runtimeRecovered)

  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "tools\P5_QA01_V2_CAPABILITY_PROBE.ps1") -ExpectedHead $remote
  $code = $LASTEXITCODE
  if ($code -ne 0) { throw ("P5_QA01_V2_CAPABILITY_PROBE_FAILED: exit=" + $code) }

  Write-Host "P5_QA01_V2_CAPABILITY_LOCAL_GATE=PASS" -ForegroundColor Green
  exit 0
} catch {
  $summary = @("P5_QA01_V2_CAPABILITY_LOCAL_GATE=FAIL", ("error=" + $_.Exception.Message))
  if (Get-Command Set-Clipboard -ErrorAction SilentlyContinue) { try { Set-Clipboard -Value ($summary -join [Environment]::NewLine) } catch {} }
  $summary | ForEach-Object { Write-Host $_ -ForegroundColor Red }
  exit 1
}
