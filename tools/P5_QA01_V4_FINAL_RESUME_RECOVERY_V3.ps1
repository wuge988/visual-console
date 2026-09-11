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

$ExpectedV2Blob = 'a81d5307cbab518786a5171144e8851d32b27cc0'
$OldProbeBase64 = 'aW1wb3J0IHRvcmNoLCBnc3BsYXQKZnJvbSBzYW0yLmF1dG9tYXRpY19tYXNrX2dlbmVyYXRvciBpbXBvcnQgU0FNMkF1dG9tYXRpY01hc2tHZW5lcmF0b3IKZnJvbSB2Z2d0Lm1vZGVscy52Z2d0IGltcG9ydCBWR0dUCnByaW50KCJydW50aW1lX2ltcG9ydHM9UEFTUyIpCnByaW50KCJ0b3JjaD0iICsgdG9yY2guX192ZXJzaW9uX18pCnByaW50KCJjdWRhPSIgKyBzdHIodG9yY2guY3VkYS5pc19hdmFpbGUoKSkpCnByaW50KCJncHU9IiArICh0b3JjaC5jdWRhLmdldF9kZXZpY2VfbmFtZSgwKSBpZiB0b3JjaC5jdWRhLmlzX2F2YWlsYWJsZSgpIGVsc2UgIk5PTkUiKSkKcHJpbnQoImdzcGxhdD0iICsgZ2V0YXR0cihnc3BsYXQsICJfX3ZlcnNpb25fXyIsICJ1bmtub3duIikpCmlmIG5vdCB0b3JjaC5jdWRhLmlzX2F2YWlsYWJsZSgpOgogICAgcmFpc2UgU3lzdGVtRXhpdCg0NikK'
$NewProbeBase64 = 'aW1wb3J0IHRvcmNoLCBnc3BsYXQKZnJvbSBzYW0yLmF1dG9tYXRpY19tYXNrX2dlbmVyYXRvciBpbXBvcnQgU0FNMkF1dG9tYXRpY01hc2tHZW5lcmF0b3IKZnJvbSB2Z2d0Lm1vZGVscy52Z2d0IGltcG9ydCBWR0dUCnByaW50KCJydW50aW1lX2ltcG9ydHM9UEFTUyIpCnByaW50KCJ0b3JjaD0iICsgdG9yY2guX192ZXJzaW9uX18pCnByaW50KCJjdWRhPSIgKyBzdHIodG9yY2guY3VkYS5pc19hdmFpbGUoKSkpCnByaW50KCJncHU9IiArICh0b3JjaC5jdWRhLmdldF9kZXZpY2VfbmFtZSgwKSBpZiB0b3JjaC5jdWRhLmlzX2F2YWlsYWJsZSgpIGVsc2UgIk5PTkUiKSkKcHJpbnQoImdzcGxhdD0iICsgZ2V0YXR0cihnc3BsYXQsICJfX3ZlcnNpb25fXyIsICJ1bmtub3duIikpCmlmIG5vdCB0b3JjaC5jdWRhLmlzX2F2YWlsYWJsZSgpOgogICAgcmFpc2UgU3lzdGVtRXhpdCg0NikK'

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

function Assert-ProbeContract {
  $probe = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($NewProbeBase64))
  if ($probe.Contains('is_availe')) { throw 'GPU_PROBE_FORBIDDEN_TYPO_PRESENT' }
  $expectedCall = 'torch.cuda.is_available()'
  $callCount = ([regex]::Matches($probe, [regex]::Escape($expectedCall))).Count
  if ($callCount -ne 3) { throw "GPU_PROBE_IS_AVAILABLE_CALL_COUNT_MISMATCH:actual=$callCount" }
  if (-not $probe.Contains('torch.cuda.get_device_name(0)')) { throw 'GPU_PROBE_DEVICE_NAME_CHECK_MISSING' }
  if (-not $probe.Contains('raise SystemExit(46)')) { throw 'GPU_PROBE_CUDA_FAIL_CLOSED_MISSING' }
  if (-not $probe.Contains('print("runtime_imports=PASS")')) { throw 'GPU_PROBE_RUNTIME_IMPORT_MARKER_MISSING' }
  Write-Host 'GPU_PROBE_CONTRACT=PASS' -ForegroundColor Green
  Write-Host 'gpu_probe_is_available_calls=3'
  Write-Host 'gpu_probe_forbidden_typo=ABSENT'
}

function Resolve-V2Path {
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

function Build-CorrectedV2([string]$SourceV2) {
  $utf8Strict = New-Object System.Text.UTF8Encoding($false, $true)
  $text = [System.IO.File]::ReadAllText($SourceV2, $utf8Strict)
  $oldCount = ([regex]::Matches($text, [regex]::Escape($OldProbeBase64))).Count
  if ($oldCount -ne 1) { throw "V2_OLD_GPU_PROBE_MATCH_COUNT_MISMATCH:actual=$oldCount" }
  if ($text.Contains($NewProbeBase64)) { throw 'V2_NEW_GPU_PROBE_ALREADY_PRESENT_UNEXPECTED' }
  $patched = $text.Replace($OldProbeBase64, $NewProbeBase64)
  if ($patched -eq $text) { throw 'V2_GPU_PROBE_PATCH_NO_CHANGE' }
  if ($patched.Contains($OldProbeBase64)) { throw 'V2_OLD_GPU_PROBE_REMAINS' }
  if (-not $patched.Contains($NewProbeBase64)) { throw 'V2_NEW_GPU_PROBE_MISSING' }
  $temp = Join-Path ([System.IO.Path]::GetTempPath()) ("P5_QA01_V4_FINAL_RESUME_RECOVERY_V2_CORRECTED_{0}.ps1" -f ([guid]::NewGuid().ToString('N')))
  [System.IO.File]::WriteAllText($temp, $patched, (New-Object System.Text.UTF8Encoding($false)))
  Assert-PowerShellParses $temp
  return $temp
}

$tempV2 = $null
try {
  Assert-ProbeContract

  if ($PlanOnly) {
    Write-Host 'P5_QA01_V4_FINAL_RESUME_RECOVERY_V3_PLAN=PASS' -ForegroundColor Green
    Write-Host 'probe_semantics=STATIC_CONTRACT_VALIDATED'
    Write-Host 'qa01_enabled=false'
    Write-Host 'production_mutation=NONE'
    exit 0
  }

  $RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
  $sourceV2 = Resolve-V2Path
  Assert-V2Blob $sourceV2
  $tempV2 = Build-CorrectedV2 $sourceV2

  Write-Host 'V4_FINAL_RESUME_V3_PATCH=PASS' -ForegroundColor Green
  Write-Host 'probe_fix=torch.cuda.is_available'
  Write-Host 'probe_semantic_contract=PASS'
  Write-Host 'source_v2_mutation=NONE'
  Write-Host 'temp_v2_parse=PASS'

  if ($PatchOnly) {
    Write-Host 'P5_QA01_V4_FINAL_RESUME_RECOVERY_V3_PATCH_ONLY=PASS' -ForegroundColor Green
    exit 0
  }

  if ([string]::IsNullOrWhiteSpace($VideoPath)) { Fail 'VIDEO_PATH_REQUIRED' }
  $argumentLine = @(
    '-NoProfile','-ExecutionPolicy','Bypass','-File',(Quote-WindowsCommandLineArg $tempV2),
    '-RepoRoot',(Quote-WindowsCommandLineArg $RepoRoot),
    '-Branch',(Quote-WindowsCommandLineArg $Branch),
    '-ExpectedHead',(Quote-WindowsCommandLineArg $ExpectedHead),
    '-VideoPath',(Quote-WindowsCommandLineArg $VideoPath)
  ) -join ' '

  Write-Host '==> Resume validated V2 through semantically checked V3 probe correction' -ForegroundColor Cyan
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
