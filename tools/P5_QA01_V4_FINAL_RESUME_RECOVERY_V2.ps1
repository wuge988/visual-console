param(
  [string]$RepoRoot = 'E:\AI_PROJECTS\VISUAL_CONSOLE',
  [string]$Branch = 'feat/p5-qa01-scene-freeze',
  [string]$ExpectedHead = 'ed216ac6bcd2f703ac6826631b9984dd43320172',
  [string]$VideoPath = '',
  [switch]$PlanOnly,
  [switch]$PatchOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ToolRoot = 'D:\AI\TOOLS\DC_Video2Twin'
$PythonExe = "$ToolRoot\venv-py310\Scripts\python.exe"
$RuntimeMarker = "$ToolRoot\runtime-py310-pt291-cu128-v1.json"
$Recon3dRepo = 'https://github.com/jashshah999/recon3d.git'
$Recon3dCommit = '59fe356bceab74ef7d5839b68aba232bce20e14d'
$Recon3dCache = "$ToolRoot\git-cache\recon3d.git"
$ExpectedVideoSha = 'a322cd09820af0fe7d3092101d7660787853c7b2979c7e207c3be5e0bf4778aa'
$GpuProbeBase64 = 'aW1wb3J0IHRvcmNoLCBnc3BsYXQKZnJvbSBzYW0yLmF1dG9tYXRpY19tYXNrX2dlbmVyYXRvciBpbXBvcnQgU0FNMkF1dG9tYXRpY01hc2tHZW5lcmF0b3IKZnJvbSB2Z2d0Lm1vZGVscy52Z2d0IGltcG9ydCBWR0dUCnByaW50KCJydW50aW1lX2ltcG9ydHM9UEFTUyIpCnByaW50KCJ0b3JjaD0iICsgdG9yY2guX192ZXJzaW9uX18pCnByaW50KCJjdWRhPSIgKyBzdHIodG9yY2guY3VkYS5pc19hdmFpbGUoKSkpCnByaW50KCJncHU9IiArICh0b3JjaC5jdWRhLmdldF9kZXZpY2VfbmFtZSgwKSBpZiB0b3JjaC5jdWRhLmlzX2F2YWlsYWJsZSgpIGVsc2UgIk5PTkUiKSkKcHJpbnQoImdzcGxhdD0iICsgZ2V0YXR0cihnc3BsYXQsICJfX3ZlcnNpb25fXyIsICJ1bmtub3duIikpCmlmIG5vdCB0b3JjaC5jdWRhLmlzX2F2YWlsYWJsZSgpOgogICAgcmFpc2UgU3lzdGVtRXhpdCg0NikK'

function Fail([string]$Message) {
  Write-Host 'P5_QA01_V4_FINAL_RESUME_RECOVERY_V2=FAIL' -ForegroundColor Red
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
    throw "TEMP_GATE_POWERSHELL_PARSE_FAILED:$messages"
  }
}

function Assert-ExactLocalState {
  $resolvedRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
  Set-Location $resolvedRoot
  $top = (& git rev-parse --show-toplevel).Trim()
  if ((Resolve-Path -LiteralPath $top).Path -ne $resolvedRoot) { Fail 'REPO_ROOT_MISMATCH' }
  $dirty = @(& git status --porcelain=v1 --untracked-files=all)
  if ($dirty.Count -gt 0) { Fail ('WORKTREE_NOT_CLEAN:' + ($dirty -join ' | ')) }
  $head = (& git rev-parse HEAD).Trim()
  if ($head -ne $ExpectedHead) { Fail "HEAD_MISMATCH:expected=$ExpectedHead:actual=$head" }
  $branchNow = (& git branch --show-current).Trim()
  if ($branchNow -ne $Branch) { Fail "WRONG_BRANCH:expected=$Branch:actual=$branchNow" }
}

function Assert-SourceVideo {
  if ([string]::IsNullOrWhiteSpace($VideoPath)) { Fail 'VIDEO_PATH_REQUIRED' }
  if (-not (Test-Path -LiteralPath $VideoPath -PathType Leaf)) { Fail "VIDEO_MISSING:$VideoPath" }
  $sha = (Get-FileHash -Algorithm SHA256 -LiteralPath $VideoPath).Hash.ToLowerInvariant()
  if ($sha -ne $ExpectedVideoSha) { Fail "VIDEO_SHA_MISMATCH:expected=$ExpectedVideoSha:actual=$sha" }
  Write-Host "VIDEO_SHA256=PASS $sha" -ForegroundColor Green
  Write-Host 'SOURCE_VIDEO_MUTATION=NONE'
}

function Assert-RuntimeMarker {
  if (-not (Test-Path -LiteralPath $RuntimeMarker -PathType Leaf)) { Fail "RUNTIME_MARKER_MISSING:$RuntimeMarker" }
  try { $m = Get-Content -LiteralPath $RuntimeMarker -Raw -Encoding UTF8 | ConvertFrom-Json }
  catch { Fail "RUNTIME_MARKER_PARSE_FAILED:$($_.Exception.Message)" }
  $expected = [ordered]@{
    schema_version='1.0'; python='3.10'; torch='2.9.1'; torchvision='0.24.1'; cuda_wheel='cu128'; gsplat='1.5.3';
    vggt_code_commit='a288dd0f14786c93483e45524328726ab7b1b4ce'; vggt_model='facebook/VGGT-1B-Commercial';
    sam2_commit='2b90b9f5ceec907a1c18123530e92e794ad901a4'; sam2_model='facebook/sam2.1-hiera-base-plus'
  }
  foreach ($name in $expected.Keys) {
    if ([string]$m.$name -ne [string]$expected[$name]) { Fail "RUNTIME_MARKER_MISMATCH:$name" }
  }
  Write-Host 'RUNTIME_MARKER=PASS' -ForegroundColor Green
}

function Assert-GpuRuntimeDirect {
  if (-not (Test-Path -LiteralPath $PythonExe -PathType Leaf)) { Fail "VENV_PYTHON_MISSING:$PythonExe" }
  $probePath = Join-Path ([System.IO.Path]::GetTempPath()) ("dc-v4-final-v2-runtime-probe-{0}.py" -f ([guid]::NewGuid().ToString('N')))
  try {
    [System.IO.File]::WriteAllBytes($probePath, [Convert]::FromBase64String($GpuProbeBase64))
    Write-Host '==> V4_FINAL_V2_DIRECT_GPU_RUNTIME_VERIFY' -ForegroundColor Cyan
    & $PythonExe -B $probePath
    if ($LASTEXITCODE -ne 0) { Fail "DIRECT_GPU_RUNTIME_VERIFY_FAILED:exit=$LASTEXITCODE" }
  }
  finally { Remove-Item -LiteralPath $probePath -Force -ErrorAction SilentlyContinue }
}

function Set-Recon3dLocalRewrite {
  if (-not (Test-Path -LiteralPath $Recon3dCache -PathType Container)) { Fail "RECON3D_CACHE_MISSING:$Recon3dCache" }
  & git -C $Recon3dCache cat-file -e "$Recon3dCommit^{commit}"
  if ($LASTEXITCODE -ne 0) { Fail 'RECON3D_CACHE_COMMIT_MISSING' }
  $cacheUrl = 'file:///D:/AI/TOOLS/DC_Video2Twin/git-cache/recon3d.git'
  $env:GIT_CONFIG_COUNT = '2'
  $env:GIT_CONFIG_KEY_0 = "url.$cacheUrl.insteadOf"
  $env:GIT_CONFIG_VALUE_0 = $Recon3dRepo
  $env:GIT_CONFIG_KEY_1 = 'protocol.file.allow'
  $env:GIT_CONFIG_VALUE_1 = 'always'
  Write-Host 'RECON3D_LOCAL_CACHE=PASS' -ForegroundColor Green
  Write-Host 'recon3d_clone_transport=PROCESS_SCOPED_LOCAL_URL_REWRITE'
}

function Patch-AccessProbeText([string]$Text) {
  $nl = if ($Text.Contains("`r`n")) { "`r`n" } else { "`n" }
  $lines = @([regex]::Split($Text, '\r?\n'))
  $hits = @()
  for ($i = 0; $i -lt ($lines.Count - 1); $i++) {
    if ($lines[$i].Trim() -eq '& $PythonExe -B $probePath' -and $lines[$i + 1].Trim() -eq 'return $LASTEXITCODE') { $hits += $i }
  }
  if ($hits.Count -ne 1) { throw "ACCESS_PROBE_PATCH_SITE_MISMATCH:count=$($hits.Count)" }
  $callIndex = [int]$hits[0]
  $start = $callIndex - 1
  $end = $callIndex + 5
  $expected = @('try {','& $PythonExe -B $probePath','return $LASTEXITCODE','}','finally {','Remove-Item -LiteralPath $probePath -Force -ErrorAction SilentlyContinue','}')
  for ($offset = 0; $offset -lt $expected.Count; $offset++) {
    if ($lines[$start + $offset].Trim() -ne $expected[$offset]) { throw "ACCESS_PROBE_PATCH_STRUCTURE_MISMATCH:offset=$offset" }
  }
  $replacement = @(
    '  try {',
    '    $probeTempRoot = [System.IO.Path]::GetTempPath()',
    '    $probeStdout = Join-Path $probeTempRoot ("dc-v4-hf-probe-stdout-{0}.log" -f ([guid]::NewGuid().ToString(''N'')))',
    '    $probeStderr = Join-Path $probeTempRoot ("dc-v4-hf-probe-stderr-{0}.log" -f ([guid]::NewGuid().ToString(''N'')))',
    '    try {',
    '      $env:HF_HUB_DISABLE_SYMLINKS_WARNING = ''1''',
    '      $probeProcess = Start-Process -FilePath $PythonExe -ArgumentList @(''-B'', $probePath) -Wait -PassThru -NoNewWindow -RedirectStandardOutput $probeStdout -RedirectStandardError $probeStderr',
    '      if (Test-Path -LiteralPath $probeStdout -PathType Leaf) { Get-Content -LiteralPath $probeStdout -Encoding UTF8 | ForEach-Object { Write-Host $_ } }',
    '      if (Test-Path -LiteralPath $probeStderr -PathType Leaf) { Get-Content -LiteralPath $probeStderr -Encoding UTF8 | ForEach-Object { Write-Host $_ -ForegroundColor Yellow } }',
    '      return [int]$probeProcess.ExitCode',
    '    }',
    '    finally {',
    '      Remove-Item -LiteralPath $probeStdout -Force -ErrorAction SilentlyContinue',
    '      Remove-Item -LiteralPath $probeStderr -Force -ErrorAction SilentlyContinue',
    '    }',
    '  }',
    '  finally {',
    '    Remove-Item -LiteralPath $probePath -Force -ErrorAction SilentlyContinue',
    '  }'
  )
  $out = New-Object 'System.Collections.Generic.List[string]'
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($i -eq $start) { foreach ($line in $replacement) { $out.Add($line) }; $i = $end; continue }
    $out.Add($lines[$i])
  }
  return [string]::Join($nl, $out)
}

function Patch-GpuRuntimeVerifyText([string]$Text) {
  $nl = if ($Text.Contains("`r`n")) { "`r`n" } else { "`n" }
  $lines = @([regex]::Split($Text, '\r?\n'))
  $hits = @()
  $callNeedle = 'Run-Checked ''V4_VERIFY_GPU_RUNTIME'' $python @(''-c'',$verify)'
  for ($i = 0; $i -lt ($lines.Count - 1); $i++) {
    if ($lines[$i].Trim().StartsWith('$verify = ''import torch, gsplat;') -and $lines[$i + 1].Trim() -eq $callNeedle) { $hits += $i }
  }
  if ($hits.Count -ne 1) { throw "GPU_VERIFY_PATCH_SITE_MISMATCH:count=$($hits.Count)" }
  $index = [int]$hits[0]
  $replacement = @(
    ('  $gpuProbeBase64 = ''' + $GpuProbeBase64 + ''''),
    '  $gpuProbePath = Join-Path ([System.IO.Path]::GetTempPath()) ("dc-v4-gpu-runtime-probe-{0}.py" -f ([guid]::NewGuid().ToString(''N'')))',
    '  try {',
    '    [System.IO.File]::WriteAllBytes($gpuProbePath, [Convert]::FromBase64String($gpuProbeBase64))',
    '    Run-Checked ''V4_VERIFY_GPU_RUNTIME'' $python @(''-B'',$gpuProbePath)',
    '  }',
    '  finally {',
    '    Remove-Item -LiteralPath $gpuProbePath -Force -ErrorAction SilentlyContinue',
    '  }'
  )
  $out = New-Object 'System.Collections.Generic.List[string]'
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($i -eq $index) { foreach ($replacementLine in $replacement) { $out.Add($replacementLine) }; $i++; continue }
    $out.Add($lines[$i])
  }
  $patched = [string]::Join($nl, $out)
  if ($patched.Contains($callNeedle)) { throw 'GPU_VERIFY_INLINE_C_REMAINS' }
  if (-not $patched.Contains("Run-Checked 'V4_VERIFY_GPU_RUNTIME' `$python @('-B',`$gpuProbePath)")) { throw 'GPU_VERIFY_TEMP_FILE_PATCH_MISSING' }
  return $patched
}

function Build-PatchedGate([string]$GatePath) {
  $utf8Strict = New-Object System.Text.UTF8Encoding($false, $true)
  $text = [System.IO.File]::ReadAllText($GatePath, $utf8Strict)
  $patched = Patch-AccessProbeText $text
  $patched = Patch-GpuRuntimeVerifyText $patched
  $tempGate = Join-Path ([System.IO.Path]::GetTempPath()) ("P5_QA01_V4_VIDEO2TWIN_FINAL_RESUME_V2_{0}.ps1" -f ([guid]::NewGuid().ToString('N')))
  [System.IO.File]::WriteAllText($tempGate, $patched, (New-Object System.Text.UTF8Encoding($false)))
  Assert-PowerShellParses $tempGate
  return $tempGate
}

$tempGate = $null
try {
  if ($PlanOnly) {
    Write-Host 'P5_QA01_V4_FINAL_RESUME_RECOVERY_V2_PLAN=PASS' -ForegroundColor Green
    Write-Host 'strict_mode_verify_literal=NO_UNBOUND_VARIABLE_INTERPOLATION'
    Write-Host 'gpu_verify=TEMP_PY_FILE_BASE64_NO_NATIVE_QUOTE_TRANSIT'
    Write-Host 'qa01_enabled=false'
    Write-Host 'production_mutation=NONE'
    exit 0
  }

  $RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
  $gate = Join-Path $RepoRoot 'tools\P5_QA01_V4_VIDEO2TWIN_LOCAL_GATE.ps1'
  if (-not (Test-Path -LiteralPath $gate -PathType Leaf)) { Fail "V4_GATE_MISSING:$gate" }

  $tempGate = Build-PatchedGate $gate
  Write-Host 'V4_FINAL_RESUME_V2_PATCH=PASS' -ForegroundColor Green
  Write-Host 'strict_mode_verify_literal=PASS'
  Write-Host 'gpu_verify_patch=TEMP_PY_FILE_BASE64_NO_NATIVE_QUOTE_TRANSIT'
  Write-Host 'tracked_gate_mutation=NONE'
  Write-Host 'temp_gate_parse=PASS'

  if ($PatchOnly) {
    Write-Host 'P5_QA01_V4_FINAL_RESUME_RECOVERY_V2_PATCH_ONLY=PASS' -ForegroundColor Green
    exit 0
  }

  Assert-ExactLocalState
  Assert-SourceVideo
  Assert-RuntimeMarker
  Assert-GpuRuntimeDirect
  Set-Recon3dLocalRewrite

  $env:HF_HOME = 'D:\AI\MODELS\HuggingFace'
  $env:HF_HUB_DISABLE_SYMLINKS_WARNING = '1'
  $env:PYTORCH_ALLOC_CONF = 'expandable_segments:True'
  Remove-Item Env:PYTORCH_CUDA_ALLOC_CONF -ErrorAction SilentlyContinue

  $argumentLine = @(
    '-NoProfile','-ExecutionPolicy','Bypass','-File',(Quote-WindowsCommandLineArg $tempGate),
    '-RepoRoot',(Quote-WindowsCommandLineArg $RepoRoot),
    '-Branch',(Quote-WindowsCommandLineArg $Branch),
    '-ExpectedHead',(Quote-WindowsCommandLineArg $ExpectedHead),
    '-SiteId','"drift-curio"','-Sku','"DC-ZY-SZ-31001"',
    '-VideoPath',(Quote-WindowsCommandLineArg $VideoPath)
  ) -join ' '

  Write-Host '==> Resume tracked Video2Twin Gate through validated V2 temp patch' -ForegroundColor Cyan
  $resume = Start-Process -FilePath 'powershell.exe' -ArgumentList $argumentLine -Wait -PassThru -NoNewWindow
  $exitCode = [int]$resume.ExitCode
  Write-Host "V4_FINAL_RESUME_V2_DOWNSTREAM_EXIT=$exitCode"
  if ($exitCode -ne 0) { Fail "V4_FINAL_RESUME_V2_DOWNSTREAM_FAILED:exit=$exitCode" }

  Write-Host 'P5_QA01_V4_FINAL_RESUME_RECOVERY_V2=PASS' -ForegroundColor Green
  Write-Host 'qa01_enabled=false'
  Write-Host 'production_mutation=NONE'
  exit 0
}
catch { Fail $_.Exception.Message }
finally {
  if ($null -ne $tempGate -and (Test-Path -LiteralPath $tempGate -PathType Leaf)) {
    Remove-Item -LiteralPath $tempGate -Force -ErrorAction SilentlyContinue
  }
}
