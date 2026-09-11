param(
  [string]$RepoRoot = 'E:\AI_PROJECTS\VISUAL_CONSOLE',
  [string]$Branch = 'feat/p5-qa01-scene-freeze',
  [string]$ExpectedHead = 'ed216ac6bcd2f703ac6826631b9984dd43320172',
  [string]$VideoPath = '',
  [string]$V2Path = '',
  [switch]$PlanOnly,
  [switch]$PatchOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ToolRoot = 'D:\AI\TOOLS\DC_Video2Twin'
$PythonExe = "$ToolRoot\venv-py310\Scripts\python.exe"
$ExpectedV2Blob = 'a81d5307cbab518786a5171144e8851d32b27cc0'
$CorrectedProbeBase64 = 'aW1wb3J0IHRvcmNoLCBnc3BsYXQKZnJvbSBzYW0yLmF1dG9tYXRpY19tYXNrX2dlbmVyYXRvciBpbXBvcnQgU0FNMkF1dG9tYXRpY01hc2tHZW5lcmF0b3IKZnJvbSB2Z2d0Lm1vZGVscy52Z2d0IGltcG9ydCBWR0dUCnByaW50KCJydW50aW1lX2ltcG9ydHM9UEFTUyIpCnByaW50KCJ0b3JjaD0iICsgdG9yY2guX192ZXJzaW9uX18pCnByaW50KCJjdWRhPSIgKyBzdHIodG9yY2guY3VkYS5pc19hdmFpbGFibGUoKSkpCnByaW50KCJncHU9IiArICh0b3JjaC5jdWRhLmdldF9kZXZpY2VfbmFtZSgwKSBpZiB0b3JjaC5jdWRhLmlzX2F2YWlsYWJsZSgpIGVsc2UgIk5PTkUiKSkKcHJpbnQoImdzcGxhdD0iICsgZ2V0YXR0cihnc3BsYXQsICJfX3ZlcnNpb25fXyIsICJ1bmtub3duIikpCmlmIG5vdCB0b3JjaC5jdWRhLmlzX2F2YWlsYWJsZSgpOgogICAgcmFpc2UgU3lzdGVtRXhpdCg0NikK'

function Fail([string]$Message) {
  Write-Host 'P5_QA01_V4_FINAL_RESUME_RECOVERY_V3=FAIL' -ForegroundColor Red
  Write-Host "error=$Message" -ForegroundColor Red
  exit 1
}

function Quote-WindowsCommandLineArg([string]$Value) {
  if ($null -eq $Value) { return '""' }
  if ($Value.Contains('"')) { throw 'COMMAND_LINE_ARG_CONTAINS_QUOTE' }
  return '"' + $Value + '"'
}

function Assert-PowerShellParses([string]$Path) {
  $tokens = $null
  $errors = $null
  [System.Management.Automation.Language.Parser]::ParseFile($Path, [ref]$tokens, [ref]$errors) | Out-Null
  if ($errors.Count -gt 0) {
    $messages = @($errors | ForEach-Object { $_.Message }) -join ' | '
    throw "TEMP_V2_POWERSHELL_PARSE_FAILED:$messages"
  }
}

function Get-CorrectedProbeSource {
  return [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($CorrectedProbeBase64))
}

function Assert-CorrectedProbeContract {
  $probe = Get-CorrectedProbeSource
  if ($probe.Contains('is_availe')) { throw 'GPU_PROBE_FORBIDDEN_TYPO_PRESENT' }
  $needle = 'torch.cuda.is_available()'
  $count = ([regex]::Matches($probe, [regex]::Escape($needle))).Count
  if ($count -ne 3) { throw "GPU_PROBE_IS_AVAILABLE_CALL_COUNT_MISMATCH:actual=$count" }
  if (-not $probe.Contains('torch.cuda.get_device_name(0)')) { throw 'GPU_PROBE_DEVICE_NAME_CHECK_MISSING' }
  if (-not $probe.Contains('raise SystemExit(46)')) { throw 'GPU_PROBE_CUDA_FAIL_CLOSED_MISSING' }
  if (-not $probe.Contains('print("runtime_imports=PASS")')) { throw 'GPU_PROBE_RUNTIME_IMPORT_MARKER_MISSING' }
  Write-Host 'GPU_PROBE_CONTRACT=PASS' -ForegroundColor Green
  Write-Host 'gpu_probe_is_available_calls=3'
  Write-Host 'gpu_probe_forbidden_typo=ABSENT'
}

function Resolve-V2Runner {
  if (-not [string]::IsNullOrWhiteSpace($V2Path)) {
    return (Resolve-Path -LiteralPath $V2Path).Path
  }
  $candidate = Join-Path ([System.IO.Path]::GetTempPath()) 'P5_QA01_V4_FINAL_RESUME_RECOVERY_V2.ps1'
  if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { Fail "V2_RUNNER_MISSING:$candidate" }
  return $candidate
}

function Assert-V2Blob([string]$Path) {
  $blob = (& git -C $RepoRoot hash-object --no-filters -- $Path).Trim()
  if ($blob -ne $ExpectedV2Blob) { Fail "V2_BLOB_MISMATCH:expected=$ExpectedV2Blob:actual=$blob" }
  Write-Host "V2_BLOB=PASS $blob" -ForegroundColor Green
}

function Build-CorrectedV2([string]$SourcePath) {
  $utf8Strict = New-Object System.Text.UTF8Encoding($false, $true)
  $text = [System.IO.File]::ReadAllText($SourcePath, $utf8Strict)
  $nl = if ($text.Contains("`r`n")) { "`r`n" } else { "`n" }
  $lines = @([regex]::Split($text, '\r?\n'))
  $hits = @()
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i].StartsWith('$GpuProbeBase64 = ')) { $hits += $i }
  }
  if ($hits.Count -ne 1) { throw "V2_GPU_PROBE_LINE_COUNT_MISMATCH:actual=$($hits.Count)" }
  $index = [int]$hits[0]
  $line = [string]$lines[$index]
  $quote = [string][char]39
  $prefix = '$GpuProbeBase64 = ' + $quote
  if (-not $line.StartsWith($prefix)) { throw 'V2_GPU_PROBE_LINE_PREFIX_MISMATCH' }
  if (-not $line.EndsWith($quote)) { throw 'V2_GPU_PROBE_LINE_SUFFIX_MISMATCH' }
  $encodedLength = $line.Length - $prefix.Length - $quote.Length
  if ($encodedLength -le 0) { throw 'V2_GPU_PROBE_BASE64_EMPTY' }
  $encoded = $line.Substring($prefix.Length, $encodedLength)
  $oldProbe = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encoded))
  if (-not $oldProbe.Contains('torch.cuda.is_availe()')) { throw 'V2_EXPECTED_TYPO_NOT_FOUND' }
  $lines[$index] = $prefix + $CorrectedProbeBase64 + $quote
  $patched = [string]::Join($nl, $lines)
  $temp = Join-Path ([System.IO.Path]::GetTempPath()) ("P5_QA01_V4_FINAL_RESUME_RECOVERY_V2_CORRECTED_{0}.ps1" -f ([guid]::NewGuid().ToString('N')))
  [System.IO.File]::WriteAllText($temp, $patched, (New-Object System.Text.UTF8Encoding($false)))
  Assert-PowerShellParses $temp
  return $temp
}

function Assert-RealGpuProbe {
  if (-not (Test-Path -LiteralPath $PythonExe -PathType Leaf)) { Fail "VENV_PYTHON_MISSING:$PythonExe" }
  $probePath = Join-Path ([System.IO.Path]::GetTempPath()) ("dc-v4-v3-real-gpu-probe-{0}.py" -f ([guid]::NewGuid().ToString('N')))
  try {
    [System.IO.File]::WriteAllBytes($probePath, [Convert]::FromBase64String($CorrectedProbeBase64))
    Write-Host '==> V4_V3_REAL_GPU_PROBE' -ForegroundColor Cyan
    & $PythonExe -B $probePath
    if ($LASTEXITCODE -ne 0) { Fail "REAL_GPU_PROBE_FAILED:exit=$LASTEXITCODE" }
    Write-Host 'REAL_GPU_PROBE=PASS' -ForegroundColor Green
  }
  finally {
    Remove-Item -LiteralPath $probePath -Force -ErrorAction SilentlyContinue
  }
}

$tempV2 = $null
try {
  Assert-CorrectedProbeContract

  if ($PlanOnly) {
    Write-Host 'P5_QA01_V4_FINAL_RESUME_RECOVERY_V3_PLAN=PASS' -ForegroundColor Green
    Write-Host 'probe_semantics=CI_EXECUTED_WITH_API_STUBS'
    Write-Host 'qa01_enabled=false'
    Write-Host 'production_mutation=NONE'
    exit 0
  }

  $RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
  $sourceV2 = Resolve-V2Runner
  Assert-V2Blob $sourceV2
  $tempV2 = Build-CorrectedV2 $sourceV2

  Write-Host 'V4_FINAL_RESUME_V3_PATCH=PASS' -ForegroundColor Green
  Write-Host 'probe_fix=torch.cuda.is_available'
  Write-Host 'source_v2_mutation=NONE'
  Write-Host 'temp_v2_parse=PASS'

  if ($PatchOnly) {
    Write-Host 'P5_QA01_V4_FINAL_RESUME_RECOVERY_V3_PATCH_ONLY=PASS' -ForegroundColor Green
    exit 0
  }

  if ([string]::IsNullOrWhiteSpace($VideoPath)) { Fail 'VIDEO_PATH_REQUIRED' }
  Assert-RealGpuProbe

  $argumentLine = @(
    '-NoProfile','-ExecutionPolicy','Bypass','-File',(Quote-WindowsCommandLineArg $tempV2),
    '-RepoRoot',(Quote-WindowsCommandLineArg $RepoRoot),
    '-Branch',(Quote-WindowsCommandLineArg $Branch),
    '-ExpectedHead',(Quote-WindowsCommandLineArg $ExpectedHead),
    '-VideoPath',(Quote-WindowsCommandLineArg $VideoPath)
  ) -join ' '

  Write-Host '==> Resume corrected V2 after real semantic GPU probe PASS' -ForegroundColor Cyan
  $resume = Start-Process -FilePath 'powershell.exe' -ArgumentList $argumentLine -Wait -PassThru -NoNewWindow
  $exitCode = [int]$resume.ExitCode
  Write-Host "V4_FINAL_RESUME_V3_DOWNSTREAM_EXIT=$exitCode"
  if ($exitCode -ne 0) { Fail "V4_FINAL_RESUME_V3_DOWNSTREAM_FAILED:exit=$exitCode" }

  Write-Host 'P5_QA01_V4_FINAL_RESUME_RECOVERY_V3=PASS' -ForegroundColor Green
  Write-Host 'qa01_enabled=false'
  Write-Host 'production_mutation=NONE'
  exit 0
}
catch { Fail $_.Exception.Message }
finally {
  if ($null -ne $tempV2 -and (Test-Path -LiteralPath $tempV2 -PathType Leaf)) {
    Remove-Item -LiteralPath $tempV2 -Force -ErrorAction SilentlyContinue
  }
}
