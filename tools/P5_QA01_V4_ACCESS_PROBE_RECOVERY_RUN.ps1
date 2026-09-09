param(
  [Parameter(Mandatory=$true)][string]$RepoRoot,
  [Parameter(Mandatory=$true)][string]$Branch,
  [Parameter(Mandatory=$true)][string]$ExpectedHead,
  [Parameter(Mandatory=$true)][string]$VideoPath,
  [string]$SiteId = 'drift-curio',
  [string]$Sku = 'DC-ZY-SZ-31001',
  [switch]$PatchOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Fail([string]$Message) {
  Write-Host 'P5_QA01_V4_ACCESS_PROBE_RECOVERY=FAIL' -ForegroundColor Red
  Write-Host "error=$Message" -ForegroundColor Red
  exit 1
}

function Patch-AccessProbeText([string]$Text) {
  $nl = if ($Text.Contains("`r`n")) { "`r`n" } else { "`n" }
  $lines = @([regex]::Split($Text, '\r?\n'))

  $hits = @()
  for ($i = 0; $i -lt ($lines.Count - 1); $i++) {
    if (
      $lines[$i].Trim() -eq '& $PythonExe -B $probePath' -and
      $lines[$i + 1].Trim() -eq 'return $LASTEXITCODE'
    ) {
      $hits += $i
    }
  }

  if ($hits.Count -ne 1) {
    throw "ACCESS_PROBE_PATCH_SITE_MISMATCH:count=$($hits.Count)"
  }

  $callIndex = [int]$hits[0]
  $start = $callIndex - 1
  $end = $callIndex + 5

  if ($start -lt 0 -or $end -ge $lines.Count) {
    throw 'ACCESS_PROBE_PATCH_BOUNDS_INVALID'
  }

  $expected = @(
    'try {',
    '& $PythonExe -B $probePath',
    'return $LASTEXITCODE',
    '}',
    'finally {',
    'Remove-Item -LiteralPath $probePath -Force -ErrorAction SilentlyContinue',
    '}'
  )

  for ($offset = 0; $offset -lt $expected.Count; $offset++) {
    if ($lines[$start + $offset].Trim() -ne $expected[$offset]) {
      throw "ACCESS_PROBE_PATCH_STRUCTURE_MISMATCH:offset=$offset:actual=$($lines[$start + $offset].Trim())"
    }
  }

  $replacement = @(
    '  try {',
    '    # Keep native Python diagnostics visible while returning only a scalar exit code.',
    '    $probeOutput = @(& $PythonExe -B $probePath 2>&1)',
    '    $probeExit = $LASTEXITCODE',
    '    $probeOutput | ForEach-Object { Write-Host $_ }',
    '    return [int]$probeExit',
    '  }',
    '  finally {',
    '    Remove-Item -LiteralPath $probePath -Force -ErrorAction SilentlyContinue',
    '  }'
  )

  $out = New-Object 'System.Collections.Generic.List[string]'
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($i -eq $start) {
      foreach ($line in $replacement) { $out.Add($line) }
      $i = $end
      continue
    }
    $out.Add($lines[$i])
  }

  $patched = [string]::Join($nl, $out)
  if ($patched -eq $Text) { throw 'ACCESS_PROBE_PATCH_NO_CHANGE' }
  if ($patched -notmatch '\$probeOutput\s*=\s*@\(& \$PythonExe -B \$probePath 2>&1\)') { throw 'ACCESS_PROBE_PATCH_OUTPUT_CAPTURE_MISSING' }
  if ($patched -notmatch 'return \[int\]\$probeExit') { throw 'ACCESS_PROBE_PATCH_SCALAR_EXIT_MISSING' }
  return $patched
}

function Assert-PowerShellParses([string]$Path) {
  $tokens = $null
  $errors = $null
  [System.Management.Automation.Language.Parser]::ParseFile($Path, [ref]$tokens, [ref]$errors) | Out-Null
  if ($errors.Count -gt 0) {
    $messages = @($errors | ForEach-Object { $_.Message }) -join ' | '
    throw "TEMP_GATE_POWERSHELL_PARSE_FAILED:$messages"
  }
}

$tempGate = $null
try {
  $RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
  Set-Location $RepoRoot

  $top = (& git rev-parse --show-toplevel).Trim()
  if ((Resolve-Path -LiteralPath $top).Path -ne $RepoRoot) { Fail 'REPO_ROOT_MISMATCH' }

  $gate = Join-Path $RepoRoot 'tools\P5_QA01_V4_VIDEO2TWIN_LOCAL_GATE.ps1'
  if (-not (Test-Path -LiteralPath $gate -PathType Leaf)) { Fail "V4_GATE_MISSING:$gate" }

  $utf8Strict = New-Object System.Text.UTF8Encoding($false, $true)
  $text = [System.IO.File]::ReadAllText($gate, $utf8Strict)
  $patched = Patch-AccessProbeText $text

  $tempGate = Join-Path $env:TEMP ("P5_QA01_V4_VIDEO2TWIN_LOCAL_GATE_RECOVERY_{0}.ps1" -f ([guid]::NewGuid().ToString('N')))
  [System.IO.File]::WriteAllText($tempGate, $patched, (New-Object System.Text.UTF8Encoding($false)))
  Assert-PowerShellParses $tempGate

  Write-Host '=============================================' -ForegroundColor Cyan
  Write-Host 'V4_ACCESS_PROBE_RECOVERY_PATCH=PASS' -ForegroundColor Green
  Write-Host 'patch_method=LINE_SAFE_NO_REGEX_REPLACEMENT'
  Write-Host 'tracked_gate_mutation=NONE'
  Write-Host "source_gate=$gate"
  Write-Host "temp_gate=$tempGate"
  Write-Host 'temp_gate_parse=PASS'
  Write-Host '=============================================' -ForegroundColor Cyan

  if ($PatchOnly) {
    Write-Host 'P5_QA01_V4_ACCESS_PROBE_RECOVERY_PATCH_ONLY=PASS' -ForegroundColor Green
    exit 0
  }

  $dirty = @(& git status --porcelain=v1 --untracked-files=all)
  if ($dirty.Count -gt 0) { Fail ('WORKTREE_NOT_CLEAN:' + ($dirty -join ' | ')) }

  $head = (& git rev-parse HEAD).Trim()
  if ($head -ne $ExpectedHead) { Fail "HEAD_MISMATCH:expected=$ExpectedHead:actual=$head" }

  $branchNow = (& git branch --show-current).Trim()
  if ($branchNow -ne $Branch) { Fail "WRONG_BRANCH:expected=$Branch:actual=$branchNow" }

  $VideoPath = (Resolve-Path -LiteralPath $VideoPath).Path
  if (-not (Test-Path -LiteralPath $VideoPath -PathType Leaf)) { Fail "VIDEO_MISSING:$VideoPath" }

  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $tempGate `
    -RepoRoot $RepoRoot `
    -Branch $Branch `
    -ExpectedHead $ExpectedHead `
    -SiteId $SiteId `
    -Sku $Sku `
    -VideoPath $VideoPath
  $exitCode = $LASTEXITCODE

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
finally {
  if ($null -ne $tempGate -and (Test-Path -LiteralPath $tempGate -PathType Leaf)) {
    Remove-Item -LiteralPath $tempGate -Force -ErrorAction SilentlyContinue
  }
}
