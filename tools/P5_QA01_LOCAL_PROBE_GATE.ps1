param(
  [string]$RepoRoot = 'E:\AI_PROJECTS\VISUAL_CONSOLE',
  [string]$Branch = 'feat/p5-qa01-scene-freeze',
  [Parameter(Mandatory = $true)][string]$ExpectedHead
)

$ErrorActionPreference = 'Stop'

function Invoke-Git {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
  $previous = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $output = @(& git @Args 2>&1)
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }
  if ($code -ne 0) {
    throw ('GIT_FAILED: git ' + ($Args -join ' ') + ' :: ' + (($output | ForEach-Object { [string]$_ }) -join ' | '))
  }
  return @($output | ForEach-Object { [string]$_ })
}

try {
  Set-Location $RepoRoot

  $repo = ((Invoke-Git rev-parse --show-toplevel) -join '').Trim()
  if ([IO.Path]::GetFullPath($repo) -ne [IO.Path]::GetFullPath($RepoRoot)) {
    throw 'REPO_ROOT_MISMATCH'
  }

  $dirty = @((Invoke-Git status --porcelain))
  if ($dirty.Count -gt 0 -and -not [string]::IsNullOrWhiteSpace(($dirty -join ''))) {
    throw ('WORKTREE_NOT_CLEAN :: ' + ($dirty -join ' | '))
  }

  Invoke-Git fetch origin ("+refs/heads/{0}:refs/remotes/origin/{0}" -f $Branch) | Out-Null
  $remoteHead = ((Invoke-Git rev-parse ("refs/remotes/origin/{0}" -f $Branch)) -join '').Trim()
  Write-Host ('REMOTE_P5_HEAD=' + $remoteHead)
  if ($remoteHead -ne $ExpectedHead) {
    throw ("REMOTE_HEAD_MISMATCH: expected=$ExpectedHead actual=$remoteHead")
  }

  $currentHead = ((Invoke-Git rev-parse HEAD) -join '').Trim()
  $currentBranch = ((Invoke-Git branch --show-current) -join '').Trim()
  Write-Host ('LOCAL_BEFORE_HEAD=' + $currentHead)
  Write-Host ('LOCAL_BEFORE_BRANCH=' + $currentBranch)

  if ($currentHead -ne $ExpectedHead) {
    $safety = 'safety/local-before-p5-probe-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
    Invoke-Git branch $safety $currentHead | Out-Null
    Write-Host ('SAFETY_BRANCH=' + $safety)
  }

  Invoke-Git switch --detach $ExpectedHead | Out-Null

  $localRef = 'refs/heads/' + $Branch
  $localExists = $true
  try {
    Invoke-Git show-ref --verify --quiet $localRef | Out-Null
  } catch {
    $localExists = $false
  }

  if ($localExists) {
    Invoke-Git branch -f $Branch $ExpectedHead | Out-Null
  } else {
    Invoke-Git branch $Branch $ExpectedHead | Out-Null
  }

  Invoke-Git switch $Branch | Out-Null

  $head = ((Invoke-Git rev-parse HEAD) -join '').Trim()
  if ($head -ne $ExpectedHead) {
    throw ("LOCAL_HEAD_MISMATCH: expected=$ExpectedHead actual=$head")
  }

  $dirtyAfter = @((Invoke-Git status --porcelain))
  if ($dirtyAfter.Count -gt 0 -and -not [string]::IsNullOrWhiteSpace(($dirtyAfter -join ''))) {
    throw ('WORKTREE_NOT_CLEAN_AFTER_SWITCH :: ' + ($dirtyAfter -join ' | '))
  }

  Write-Host 'P5_QA01_LOCAL_PROBE_PREP=PASS'
  Write-Host ('HEAD=' + $head)

  $probe = Join-Path $RepoRoot 'tools\P5_QA01_CAPABILITY_PROBE.ps1'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $probe -ExpectedHead $ExpectedHead
  $probeCode = $LASTEXITCODE
  if ($probeCode -ne 0) {
    throw ("CAPABILITY_PROBE_FAILED: exit=$probeCode")
  }

  exit 0
} catch {
  Write-Host ('P5_QA01_LOCAL_PROBE_PREP=FAIL :: ' + $_.Exception.Message) -ForegroundColor Red
  exit 1
}
