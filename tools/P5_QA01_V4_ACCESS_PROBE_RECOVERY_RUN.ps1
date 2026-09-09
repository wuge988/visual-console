param(
  [Parameter(Mandatory=$true)][string]$RepoRoot,
  [Parameter(Mandatory=$true)][string]$Branch,
  [Parameter(Mandatory=$true)][string]$ExpectedHead,
  [Parameter(Mandatory=$true)][string]$VideoPath,
  [string]$SiteId = 'drift-curio',
  [string]$Sku = 'DC-ZY-SZ-31001'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Fail([string]$Message) {
  Write-Host 'P5_QA01_V4_ACCESS_PROBE_RECOVERY=FAIL' -ForegroundColor Red
  Write-Host "error=$Message" -ForegroundColor Red
  exit 1
}

try {
  $RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
  Set-Location $RepoRoot

  $top = (& git rev-parse --show-toplevel).Trim()
  if ((Resolve-Path -LiteralPath $top).Path -ne $RepoRoot) { Fail 'REPO_ROOT_MISMATCH' }

  $dirty = @(& git status --porcelain=v1 --untracked-files=all)
  if ($dirty.Count -gt 0) { Fail ('WORKTREE_NOT_CLEAN:' + ($dirty -join ' | ')) }

  $head = (& git rev-parse HEAD).Trim()
  if ($head -ne $ExpectedHead) { Fail "HEAD_MISMATCH:expected=$ExpectedHead:actual=$head" }

  $branchNow = (& git branch --show-current).Trim()
  if ($branchNow -ne $Branch) { Fail "WRONG_BRANCH:expected=$Branch:actual=$branchNow" }

  $VideoPath = (Resolve-Path -LiteralPath $VideoPath).Path
  if (-not (Test-Path -LiteralPath $VideoPath -PathType Leaf)) { Fail "VIDEO_MISSING:$VideoPath" }

  $gate = Join-Path $RepoRoot 'tools\P5_QA01_V4_VIDEO2TWIN_LOCAL_GATE.ps1'
  if (-not (Test-Path -LiteralPath $gate -PathType Leaf)) { Fail "V4_GATE_MISSING:$gate" }

  $utf8Strict = New-Object System.Text.UTF8Encoding($false, $true)
  $text = [System.IO.File]::ReadAllText($gate, $utf8Strict)

  $old = @'
  try {
    & $PythonExe -B $probePath
    return $LASTEXITCODE
  }
  finally {
    Remove-Item -LiteralPath $probePath -Force -ErrorAction SilentlyContinue
  }
'@

  $new = @'
  try {
    # IMPORTANT: assigning the function result captures Success-stream output from the
    # native Python process. Capture it locally, print it via Write-Host, and return
    # only the integer exit code so $accessExit is a scalar rather than an array.
    $probeOutput = @(& $PythonExe -B $probePath 2>&1)
    $probeExit = $LASTEXITCODE
    $probeOutput | ForEach-Object { Write-Host $_ }
    return [int]$probeExit
  }
  finally {
    Remove-Item -LiteralPath $probePath -Force -ErrorAction SilentlyContinue
  }
'@

  $count = ([regex]::Matches($text, [regex]::Escape($old))).Count
  if ($count -ne 1) { Fail "ACCESS_PROBE_PATCH_SITE_MISMATCH:count=$count" }

  $patched = $text.Replace($old, $new)
  if ($patched -eq $text) { Fail 'ACCESS_PROBE_PATCH_NO_CHANGE' }
  if ($patched -notmatch '\$probeOutput\s*=\s*@\(& \$PythonExe -B \$probePath 2>&1\)') { Fail 'ACCESS_PROBE_PATCH_OUTPUT_CAPTURE_MISSING' }
  if ($patched -notmatch 'return \[int\]\$probeExit') { Fail 'ACCESS_PROBE_PATCH_SCALAR_EXIT_MISSING' }

  $tempGate = Join-Path $env:TEMP ("P5_QA01_V4_VIDEO2TWIN_LOCAL_GATE_RECOVERY_{0}.ps1" -f ([guid]::NewGuid().ToString('N')))
  [System.IO.File]::WriteAllText($tempGate, $patched, (New-Object System.Text.UTF8Encoding($false)))

  Write-Host '=============================================' -ForegroundColor Cyan
  Write-Host 'V4_ACCESS_PROBE_RECOVERY_PATCH=PASS' -ForegroundColor Green
  Write-Host 'tracked_gate_mutation=NONE'
  Write-Host "source_gate=$gate"
  Write-Host "temp_gate=$tempGate"
  Write-Host '=============================================' -ForegroundColor Cyan

  try {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $tempGate `
      -RepoRoot $RepoRoot `
      -Branch $Branch `
      -ExpectedHead $ExpectedHead `
      -SiteId $SiteId `
      -Sku $Sku `
      -VideoPath $VideoPath
    $exitCode = $LASTEXITCODE
  }
  finally {
    Remove-Item -LiteralPath $tempGate -Force -ErrorAction SilentlyContinue
  }

  if ($exitCode -ne 0) {
    Write-Host 'P5_QA01_V4_ACCESS_PROBE_RECOVERY=DOWNSTREAM_FAIL' -ForegroundColor Yellow
    exit $exitCode
  }

  Write-Host 'P5_QA01_V4_ACCESS_PROBE_RECOVERY=PASS' -ForegroundColor Green
  exit 0
}
catch {
  Fail $_.Exception.Message
}
