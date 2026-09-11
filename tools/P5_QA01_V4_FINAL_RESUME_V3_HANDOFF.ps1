param(
  [string]$RepoRoot = 'E:\AI_PROJECTS\VISUAL_CONSOLE',
  [string]$Branch = 'feat/p5-qa01-scene-freeze',
  [string]$ExpectedLocalHead = 'ed216ac6bcd2f703ac6826631b9984dd43320172',
  [string]$VideoPath = '',
  [string]$V2Path = '',
  [string]$V3Path = '',
  [switch]$SelfCheckOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ValidatedRemoteHead = '4dce2f1fb8fd6e4e58df6e333ec8c90c174be687'
$ExpectedV2Blob = 'a81d5307cbab518786a5171144e8851d32b27cc0'
$ExpectedV3Blob = 'd3bc233484cb3815a564ba832d9bfe913782a21b'
$ExpectedVideoSha = 'a322cd09820af0fe7d3092101d7660787853c7b2979c7e207c3be5e0bf4778aa'
$V2Url = "https://raw.githubusercontent.com/wuge988/visual-console/$ValidatedRemoteHead/tools/P5_QA01_V4_FINAL_RESUME_RECOVERY_V2.ps1"
$V3Url = "https://raw.githubusercontent.com/wuge988/visual-console/$ValidatedRemoteHead/tools/P5_QA01_V4_FINAL_RESUME_RECOVERY_V3.ps1"

function Fail([string]$Message) {
  Write-Host 'P5_QA01_V4_FINAL_RESUME_V3_HANDOFF=FAIL' -ForegroundColor Red
  Write-Host "error=$Message" -ForegroundColor Red
  exit 1
}

function Assert-PowerShellParses([string]$Path, [string]$Label) {
  $tokens = $null
  $errors = $null
  [System.Management.Automation.Language.Parser]::ParseFile($Path, [ref]$tokens, [ref]$errors) | Out-Null
  if ($errors.Count -gt 0) {
    $messages = @($errors | ForEach-Object { $_.Message }) -join ' | '
    Fail "${Label}_PARSE_FAILED:$messages"
  }
  Write-Host "${Label}_PARSE=PASS" -ForegroundColor Green
}

function Assert-Runner([string]$Path, [string]$ExpectedBlob, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { Fail "${Label}_MISSING:$Path" }
  $blob = (& git -C $RepoRoot hash-object --no-filters -- $Path).Trim()
  if ($LASTEXITCODE -ne 0) { Fail "${Label}_HASH_OBJECT_FAILED:exit=$LASTEXITCODE" }
  if ($blob -ne $ExpectedBlob) { Fail "${Label}_BLOB_MISMATCH:expected=$ExpectedBlob:actual=$blob" }
  Write-Host "${Label}_BLOB=PASS $blob" -ForegroundColor Green
  Assert-PowerShellParses $Path $Label
}

function Download-Exact([string]$Url, [string]$Destination, [string]$Label) {
  Write-Host "==> Download exact $Label runner" -ForegroundColor Cyan

  $common = @(
    '--fail',
    '--location',
    '--http1.1',
    '--retry', '5',
    '--retry-delay', '2',
    '--connect-timeout', '20',
    '--max-time', '180',
    $Url,
    '--output', $Destination
  )

  & curl.exe --ssl-revoke-best-effort @common
  $downloadExit = [int]$LASTEXITCODE

  if ($downloadExit -ne 0) {
    Write-Host "==> Retry exact $Label runner with Schannel no-revoke fallback" -ForegroundColor Yellow
    Remove-Item -LiteralPath $Destination -Force -ErrorAction SilentlyContinue
    & curl.exe --ssl-no-revoke @common
    $downloadExit = [int]$LASTEXITCODE
  }

  if ($downloadExit -ne 0) { Fail "${Label}_DOWNLOAD_FAILED:exit=$downloadExit" }
}

function Assert-PhysicalState {
  $branchNow = (& git -C $RepoRoot branch --show-current).Trim()
  if ($LASTEXITCODE -ne 0) { Fail "GIT_BRANCH_READ_FAILED:exit=$LASTEXITCODE" }
  if ($branchNow -ne $Branch) { Fail "WRONG_BRANCH:expected=$Branch:actual=$branchNow" }

  $localHead = (& git -C $RepoRoot rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0) { Fail "GIT_HEAD_READ_FAILED:exit=$LASTEXITCODE" }
  if ($localHead -ne $ExpectedLocalHead) { Fail "LOCAL_HEAD_MISMATCH:expected=$ExpectedLocalHead:actual=$localHead" }
  Write-Host "LOCAL_HEAD=PASS $localHead" -ForegroundColor Green

  $dirty = @(& git -C $RepoRoot status --porcelain=v1 --untracked-files=all)
  if ($LASTEXITCODE -ne 0) { Fail "GIT_STATUS_FAILED:exit=$LASTEXITCODE" }
  if ($dirty.Count -gt 0) { Fail ('WORKTREE_NOT_CLEAN:' + ($dirty -join ' | ')) }
  Write-Host 'WORKTREE_CLEAN=PASS' -ForegroundColor Green

  if ([string]::IsNullOrWhiteSpace($VideoPath)) { Fail 'VIDEO_PATH_REQUIRED' }
  if (-not (Test-Path -LiteralPath $VideoPath -PathType Leaf)) { Fail "VIDEO_MISSING:$VideoPath" }
  $videoSha = (Get-FileHash -Algorithm SHA256 -LiteralPath $VideoPath).Hash.ToLowerInvariant()
  if ($videoSha -ne $ExpectedVideoSha) { Fail "VIDEO_SHA_MISMATCH:expected=$ExpectedVideoSha:actual=$videoSha" }
  Write-Host "VIDEO_SHA256=PASS $videoSha" -ForegroundColor Green
  Write-Host 'SOURCE_VIDEO_MUTATION=NONE'
}

$downloadedV2 = $false
$downloadedV3 = $false
try {
  $RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path

  Write-Host 'THIS_IS_V3_HANDOFF=PASS' -ForegroundColor Green
  Write-Host 'DIRECT_V2_EXECUTION=FORBIDDEN_KNOWN_TYPO'

  if ($SelfCheckOnly) {
    if ([string]::IsNullOrWhiteSpace($V2Path)) { $V2Path = Join-Path $RepoRoot 'tools\P5_QA01_V4_FINAL_RESUME_RECOVERY_V2.ps1' }
    if ([string]::IsNullOrWhiteSpace($V3Path)) { $V3Path = Join-Path $RepoRoot 'tools\P5_QA01_V4_FINAL_RESUME_RECOVERY_V3.ps1' }
    Assert-Runner $V2Path $ExpectedV2Blob 'V2'
    Assert-Runner $V3Path $ExpectedV3Blob 'V3'
    Write-Host "VALIDATED_REMOTE_HEAD=$ValidatedRemoteHead"
    Write-Host 'P5_QA01_V4_FINAL_RESUME_V3_HANDOFF_SELF_CHECK=PASS' -ForegroundColor Green
    Write-Host 'qa01_enabled=false'
    Write-Host 'production_mutation=NONE'
    exit 0
  }

  Assert-PhysicalState

  if ([string]::IsNullOrWhiteSpace($V2Path)) {
    $V2Path = Join-Path ([System.IO.Path]::GetTempPath()) ("P5_QA01_V4_FINAL_RESUME_RECOVERY_V2_PINNED_{0}.ps1" -f ([guid]::NewGuid().ToString('N')))
    Download-Exact $V2Url $V2Path 'V2'
    $downloadedV2 = $true
  }
  else { $V2Path = (Resolve-Path -LiteralPath $V2Path).Path }

  if ([string]::IsNullOrWhiteSpace($V3Path)) {
    $V3Path = Join-Path ([System.IO.Path]::GetTempPath()) ("P5_QA01_V4_FINAL_RESUME_RECOVERY_V3_PINNED_{0}.ps1" -f ([guid]::NewGuid().ToString('N')))
    Download-Exact $V3Url $V3Path 'V3'
    $downloadedV3 = $true
  }
  else { $V3Path = (Resolve-Path -LiteralPath $V3Path).Path }

  Assert-Runner $V2Path $ExpectedV2Blob 'V2'
  Assert-Runner $V3Path $ExpectedV3Blob 'V3'

  Write-Host '==> Start exact-CI-PASS Final Resume V3 physical Gate' -ForegroundColor Cyan
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $V3Path `
    -RepoRoot $RepoRoot `
    -Branch $Branch `
    -ExpectedHead $ExpectedLocalHead `
    -VideoPath $VideoPath `
    -V2Path $V2Path

  $downstreamExit = [int]$LASTEXITCODE
  Write-Host "V3_DOWNSTREAM_EXIT=$downstreamExit"
  if ($downstreamExit -ne 0) { Fail "V3_DOWNSTREAM_FAILED:exit=$downstreamExit" }

  Write-Host 'P5_QA01_V4_FINAL_RESUME_V3_HANDOFF=PASS' -ForegroundColor Green
  Write-Host 'qa01_enabled=false'
  Write-Host 'production_mutation=NONE'
  exit 0
}
catch {
  Fail $_.Exception.Message
}
finally {
  if ($downloadedV2 -and -not [string]::IsNullOrWhiteSpace($V2Path)) { Remove-Item -LiteralPath $V2Path -Force -ErrorAction SilentlyContinue }
  if ($downloadedV3 -and -not [string]::IsNullOrWhiteSpace($V3Path)) { Remove-Item -LiteralPath $V3Path -Force -ErrorAction SilentlyContinue }
}
