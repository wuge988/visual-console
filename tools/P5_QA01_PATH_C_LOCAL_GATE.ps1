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
  if ($code -ne 0) {
    throw ("GIT_FAILED: git " + ($Args -join " ") + " :: " + (($output | ForEach-Object { [string]$_ }) -join " | "))
  }
  return @($output | ForEach-Object { [string]$_ })
}

function Normalize-StatusPath([string]$Line) {
  if ($Line.Length -lt 4) { return "" }
  $path = $Line.Substring(3).Trim()
  if ($path.StartsWith('"') -and $path.EndsWith('"')) {
    $path = $path.Trim('"')
  }
  return $path.Replace('\\', '/')
}

try {
  Set-Location $RepoRoot
  $repo = ((Invoke-Git rev-parse --show-toplevel) -join "").Trim()
  if ([IO.Path]::GetFullPath($repo) -ne [IO.Path]::GetFullPath($RepoRoot)) { throw "REPO_ROOT_MISMATCH" }

  Write-Host "==> Inspect local generated-artifact debt" -ForegroundColor Cyan
  $status = @((Invoke-Git status --porcelain=v1 --untracked-files=all) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  $allowed = @{
    "apps/web/src/App.vue.js" = $true
    "apps/web/src/main.js" = $true
    "apps/web/tsconfig.tsbuildinfo" = $true
  }
  $unexpected = New-Object System.Collections.Generic.List[string]
  foreach ($line in $status) {
    $path = Normalize-StatusPath $line
    if (-not $line.StartsWith("?? ") -or -not $allowed.ContainsKey($path)) {
      $unexpected.Add($line)
    }
  }
  if ($unexpected.Count -gt 0) {
    throw ("WORKTREE_HAS_UNEXPECTED_CHANGES :: " + ($unexpected -join " | "))
  }

  if ($status.Count -gt 0) {
    $backupRoot = Join-Path (Split-Path -Parent $RepoRoot) ("VISUAL_CONSOLE_RECOVERY_P5_" + (Get-Date -Format "yyyyMMdd-HHmmss"))
    New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
    foreach ($line in $status) {
      $relative = Normalize-StatusPath $line
      $source = Join-Path $RepoRoot ($relative.Replace('/', '\\'))
      if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw ("GENERATED_ARTIFACT_MISSING: " + $relative) }
      $destination = Join-Path $backupRoot ($relative.Replace('/', '\\'))
      New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
      Move-Item -LiteralPath $source -Destination $destination
      Write-Host ("PRESERVED_GENERATED_ARTIFACT=" + $relative)
    }
    Write-Host ("GENERATED_ARTIFACT_BACKUP=" + $backupRoot) -ForegroundColor Yellow
  }

  $afterCleanup = @((Invoke-Git status --porcelain=v1 --untracked-files=all) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ($afterCleanup.Count -gt 0) { throw ("WORKTREE_NOT_CLEAN_AFTER_RECOVERY :: " + ($afterCleanup -join " | ")) }

  Write-Host "==> Sync exact audited P5 head" -ForegroundColor Cyan
  Invoke-Git fetch origin ("+refs/heads/" + $Branch + ":refs/remotes/origin/" + $Branch) | Out-Null
  $remote = ((Invoke-Git rev-parse ("refs/remotes/origin/" + $Branch)) -join "").Trim()
  if ($remote -ne $ExpectedHead.Trim()) { throw ("REMOTE_HEAD_MISMATCH: expected=" + $ExpectedHead + " actual=" + $remote) }

  $current = ((Invoke-Git rev-parse HEAD) -join "").Trim()
  if ($current -ne $remote) {
    $safety = "safety/local-before-p5-path-c-" + (Get-Date -Format "yyyyMMdd-HHmmss")
    Invoke-Git branch $safety $current | Out-Null
    Write-Host ("SAFETY_BRANCH=" + $safety)
  }

  Invoke-Git switch --detach $remote | Out-Null
  $localBranchExists = $true
  try { Invoke-Git show-ref --verify ("refs/heads/" + $Branch) | Out-Null } catch { $localBranchExists = $false }
  if ($localBranchExists) {
    Invoke-Git branch -f $Branch $remote | Out-Null
  } else {
    Invoke-Git branch $Branch $remote | Out-Null
  }
  Invoke-Git switch $Branch | Out-Null

  $head = ((Invoke-Git rev-parse HEAD) -join "").Trim()
  if ($head -ne $remote) { throw ("LOCAL_HEAD_MISMATCH: " + $head) }
  $finalStatus = @((Invoke-Git status --porcelain=v1 --untracked-files=all) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ($finalStatus.Count -gt 0) { throw ("WORKTREE_NOT_CLEAN_BEFORE_INSTALL_GATE :: " + ($finalStatus -join " | ")) }

  Write-Host "P5_QA01_PATH_C_LOCAL_PREP=PASS" -ForegroundColor Green
  Write-Host ("HEAD=" + $head)
  Write-Host "==> Launch bounded Path C install/runtime Gate" -ForegroundColor Cyan

  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "tools\P5_QA01_PATH_C_INSTALL_GATE.ps1") -ExpectedHead $remote
  $installCode = $LASTEXITCODE
  if ($installCode -eq 0) { exit 0 }

  Write-Host ("P5_PATH_C_LEGACY_INSTALL_GATE_EXIT=" + $installCode) -ForegroundColor Yellow
  Write-Host "==> Run targeted ComfyUI runtime recovery Gate" -ForegroundColor Cyan
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "tools\P5_QA01_RUNTIME_GATE.ps1") -ExpectedHead $remote
  $runtimeCode = $LASTEXITCODE
  if ($runtimeCode -ne 0) {
    throw ("P5_PATH_C_INSTALL_AND_RUNTIME_GATE_FAILED: install_exit=" + $installCode + " runtime_exit=" + $runtimeCode)
  }

  Write-Host "P5_QA01_PATH_C_LOCAL_GATE=PASS_VIA_TARGETED_RUNTIME_RECOVERY" -ForegroundColor Green
  exit 0
} catch {
  $summary = @(
    "P5_QA01_PATH_C_LOCAL_PREP=FAIL",
    ("error=" + $_.Exception.Message)
  )
  if (Get-Command Set-Clipboard -ErrorAction SilentlyContinue) {
    try { Set-Clipboard -Value ($summary -join [Environment]::NewLine) } catch {}
  }
  $summary | ForEach-Object { Write-Host $_ -ForegroundColor Red }
  exit 1
}
