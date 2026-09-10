param(
  [string]$RepoRoot = 'E:\AI_PROJECTS\VISUAL_CONSOLE',
  [string]$Branch = 'feat/p5-qa01-scene-freeze',
  [string]$ExpectedHead = 'ed216ac6bcd2f703ac6826631b9984dd43320172',
  [Parameter(Mandatory=$true)][string]$VideoPath,
  [string]$RecoveryPath = '',
  [switch]$PlanOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ToolRoot = 'D:\AI\TOOLS\DC_Video2Twin'
$VenvRoot = "$ToolRoot\venv-py310"
$PythonExe = "$VenvRoot\Scripts\python.exe"
$UvExe = "$ToolRoot\uv-0.12.10\uv.exe"
$Wheelhouse = "$ToolRoot\wheelhouse"
$ExpectedRecoveryBlob = '5601155de9c09cc1e2ee45fbf147e21410d714a5'
$ExpectedVideoSha = 'a322cd09820af0fe7d3092101d7660787853c7b2979c7e207c3be5e0bf4778aa'

$TorchFile = 'torch-2.9.1+cu128-cp310-cp310-win_amd64.whl'
$TorchVisionFile = 'torchvision-0.24.1+cu128-cp310-cp310-win_amd64.whl'
$TorchUrl = 'https://download-r2.pytorch.org/whl/cu128/torch-2.9.1%2Bcu128-cp310-cp310-win_amd64.whl'
$TorchVisionUrl = 'https://download-r2.pytorch.org/whl/cu128/torchvision-0.24.1%2Bcu128-cp310-cp310-win_amd64.whl'

function Fail([string]$Message) {
  Write-Host 'P5_QA01_V4_TORCH_CURL_RESUME_RECOVERY=FAIL' -ForegroundColor Red
  Write-Host "error=$Message" -ForegroundColor Red
  exit 1
}

function Quote-WindowsCommandLineArg([string]$Value) {
  if ($null -eq $Value) { return '""' }
  if ($Value.Contains('"')) { throw 'COMMAND_LINE_ARG_CONTAINS_QUOTE' }
  return '"' + $Value + '"'
}

function Start-NativeVisible([string]$Label, [string]$FilePath, [string[]]$ArgumentList) {
  Write-Host "==> $Label" -ForegroundColor Cyan
  $p = Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -Wait -PassThru -NoNewWindow
  Write-Host "${Label}_EXIT=$($p.ExitCode)"
  return [int]$p.ExitCode
}

function Assert-ExactLocalState {
  Set-Location $RepoRoot
  $top = (& git rev-parse --show-toplevel).Trim()
  if ((Resolve-Path -LiteralPath $top).Path -ne (Resolve-Path -LiteralPath $RepoRoot).Path) { Fail 'REPO_ROOT_MISMATCH' }

  $dirty = @(& git status --porcelain=v1 --untracked-files=all)
  if ($dirty.Count -gt 0) { Fail ('WORKTREE_NOT_CLEAN:' + ($dirty -join ' | ')) }

  $head = (& git rev-parse HEAD).Trim()
  if ($head -ne $ExpectedHead) { Fail "HEAD_MISMATCH:expected=$ExpectedHead:actual=$head" }

  $branchNow = (& git branch --show-current).Trim()
  if ($branchNow -ne $Branch) { Fail "WRONG_BRANCH:expected=$Branch:actual=$branchNow" }
}

function Assert-SourceVideo {
  if (-not (Test-Path -LiteralPath $VideoPath -PathType Leaf)) { Fail "VIDEO_MISSING:$VideoPath" }
  $sha = (Get-FileHash -Algorithm SHA256 -LiteralPath $VideoPath).Hash.ToLowerInvariant()
  if ($sha -ne $ExpectedVideoSha) { Fail "VIDEO_SHA_MISMATCH:expected=$ExpectedVideoSha:actual=$sha" }
  Write-Host "VIDEO_SHA256=PASS $sha" -ForegroundColor Green
  Write-Host 'SOURCE_VIDEO_MUTATION=NONE'
}

function Assert-RecoveryRunner {
  if ([string]::IsNullOrWhiteSpace($RecoveryPath)) { Fail 'RECOVERY_PATH_NOT_RESOLVED' }
  if (-not (Test-Path -LiteralPath $RecoveryPath -PathType Leaf)) { Fail "RECOVERY_RUNNER_MISSING:$RecoveryPath" }
  $blob = (& git hash-object --no-filters -- $RecoveryPath).Trim()
  if ($blob -ne $ExpectedRecoveryBlob) { Fail "RECOVERY_BLOB_MISMATCH:expected=$ExpectedRecoveryBlob:actual=$blob" }
  Write-Host "RECOVERY_BLOB=PASS $blob" -ForegroundColor Green
}

function Test-WheelArchive([string]$WheelPath, [string]$PackageName, [string]$ExpectedVersion) {
  if (-not (Test-Path -LiteralPath $WheelPath -PathType Leaf)) { return $false }

  $probe = @'
import sys
import zipfile
from email.parser import Parser

path, package_name, expected_version = sys.argv[1:4]
try:
    with zipfile.ZipFile(path, "r") as zf:
        bad = zf.testzip()
        if bad:
            print("WHEEL_ARCHIVE_VERIFY=FAIL")
            print("bad_member=" + bad)
            raise SystemExit(41)
        metadata_files = [n for n in zf.namelist() if n.endswith(".dist-info/METADATA")]
        if len(metadata_files) != 1:
            print("WHEEL_ARCHIVE_VERIFY=FAIL")
            print("metadata_count=" + str(len(metadata_files)))
            raise SystemExit(42)
        metadata = Parser().parsestr(zf.read(metadata_files[0]).decode("utf-8", errors="strict"))
        actual_name = metadata.get("Name", "")
        actual_version = metadata.get("Version", "")
        if actual_name.lower() != package_name.lower():
            print("WHEEL_ARCHIVE_VERIFY=FAIL")
            print("name=" + actual_name)
            raise SystemExit(43)
        if actual_version != expected_version:
            print("WHEEL_ARCHIVE_VERIFY=FAIL")
            print("version=" + actual_version)
            raise SystemExit(44)
        print("WHEEL_ARCHIVE_VERIFY=PASS")
        print("package=" + actual_name)
        print("version=" + actual_version)
except zipfile.BadZipFile:
    print("WHEEL_ARCHIVE_VERIFY=FAIL")
    print("reason=BAD_ZIP")
    raise SystemExit(45)
'@

  $probePath = Join-Path ([System.IO.Path]::GetTempPath()) ("dc-v4-wheel-verify-{0}.py" -f ([guid]::NewGuid().ToString('N')))
  try {
    [System.IO.File]::WriteAllText($probePath, $probe, (New-Object System.Text.UTF8Encoding($false)))
    $exit = Start-NativeVisible 'V4_VERIFY_WHEEL_ARCHIVE' $PythonExe @('-B', $probePath, $WheelPath, $PackageName, $ExpectedVersion)
    return ($exit -eq 0)
  }
  finally {
    Remove-Item -LiteralPath $probePath -Force -ErrorAction SilentlyContinue
  }
}

function Get-ResumableOfficialWheel(
  [string]$Label,
  [string]$Url,
  [string]$FinalPath,
  [string]$PackageName,
  [string]$ExpectedVersion
) {
  if (Test-WheelArchive $FinalPath $PackageName $ExpectedVersion) {
    $sha = (Get-FileHash -Algorithm SHA256 -LiteralPath $FinalPath).Hash.ToLowerInvariant()
    Write-Host "${Label}_WHEEL_CACHE=VALID" -ForegroundColor Green
    Write-Host "${Label}_WHEEL_SHA256=$sha"
    return
  }

  $partPath = $FinalPath + '.part'
  Write-Host "${Label}_DOWNLOAD_SOURCE=OFFICIAL_PYTORCH_R2" -ForegroundColor Cyan
  Write-Host "${Label}_PERSISTENT_PART=$partPath"

  $downloaded = $false
  for ($attempt = 1; $attempt -le 8; $attempt++) {
    $existing = if (Test-Path -LiteralPath $partPath -PathType Leaf) { (Get-Item -LiteralPath $partPath).Length } else { 0 }
    Write-Host "${Label}_CURL_RESUME_ATTEMPT=$attempt/8 existing_bytes=$existing" -ForegroundColor Cyan

    $curlArgs = @(
      '--fail',
      '--location',
      '--http1.1',
      '--ssl-revoke-best-effort',
      '--continue-at', '-',
      '--retry', '20',
      '--retry-all-errors',
      '--retry-delay', '2',
      '--connect-timeout', '30',
      '--speed-limit', '1024',
      '--speed-time', '120',
      '--output', $partPath,
      $Url
    )

    $exit = Start-NativeVisible "${Label}_CURL_RESUMABLE_DOWNLOAD" 'curl.exe' $curlArgs
    if ($exit -eq 0) {
      if (Test-WheelArchive $partPath $PackageName $ExpectedVersion) {
        Move-Item -LiteralPath $partPath -Destination $FinalPath -Force
        $downloaded = $true
        break
      }
      Write-Host "${Label}_DOWNLOAD_COMPLETED_BUT_ARCHIVE_INVALID" -ForegroundColor Yellow
    }

    if ($attempt -lt 8) {
      $wait = [Math]::Min(30, 3 * $attempt)
      Write-Host "${Label}_OUTER_RETRY_IN=${wait}s" -ForegroundColor Yellow
      Start-Sleep -Seconds $wait
    }
  }

  if (-not $downloaded) { Fail "${Label}_OFFICIAL_WHEEL_DOWNLOAD_FAILED_AFTER_8_ATTEMPTS" }

  $finalSha = (Get-FileHash -Algorithm SHA256 -LiteralPath $FinalPath).Hash.ToLowerInvariant()
  Write-Host "${Label}_WHEEL_DOWNLOAD=PASS" -ForegroundColor Green
  Write-Host "${Label}_WHEEL_SHA256=$finalSha"
}

function Assert-TorchRuntime {
  $probe = @'
import sys
import torch
import torchvision
print("TORCH_RUNTIME_VERIFY=PASS")
print("torch=" + torch.__version__)
print("torchvision=" + torchvision.__version__)
print("cuda_available=" + str(torch.cuda.is_available()))
print("gpu=" + (torch.cuda.get_device_name(0) if torch.cuda.is_available() else "NONE"))
if not torch.__version__.startswith("2.9.1+cu128"):
    sys.exit(31)
if not torchvision.__version__.startswith("0.24.1+cu128"):
    sys.exit(32)
if not torch.cuda.is_available():
    sys.exit(33)
'@

  $probePath = Join-Path ([System.IO.Path]::GetTempPath()) ("dc-v4-torch-verify-{0}.py" -f ([guid]::NewGuid().ToString('N')))
  try {
    [System.IO.File]::WriteAllText($probePath, $probe, (New-Object System.Text.UTF8Encoding($false)))
    $exit = Start-NativeVisible 'V4_VERIFY_TORCH_CU128' $PythonExe @('-B', $probePath)
    if ($exit -ne 0) { Fail "V4_VERIFY_TORCH_CU128_FAILED:exit=$exit" }
  }
  finally {
    Remove-Item -LiteralPath $probePath -Force -ErrorAction SilentlyContinue
  }
}

try {
  if ($PlanOnly) {
    Write-Host 'P5_QA01_V4_TORCH_CURL_RESUME_RECOVERY_PLAN=PASS' -ForegroundColor Green
    Write-Host 'transport=CURL_OFFICIAL_R2_PERSISTENT_PART_RESUME'
    Write-Host 'source=download-r2.pytorch.org'
    Write-Host 'curl_continue_at=enabled'
    Write-Host 'curl_retry_all_errors=enabled'
    Write-Host 'wheel_archive_integrity=ZIP_TEST_PLUS_METADATA'
    Write-Host 'mirror_fallback=DISABLED'
    Write-Host 'video_path_scope=CALLER_SUPPLIED_UNICODE_SAFE'
    Write-Host 'resume_pipeline=ACCESS_RECOVERY_RUNNER'
    exit 0
  }

  $RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
  if ([string]::IsNullOrWhiteSpace($RecoveryPath)) {
    $RecoveryPath = Join-Path ([System.IO.Path]::GetTempPath()) 'P5_QA01_V4_ACCESS_PROBE_RECOVERY_FINAL.ps1'
  }

  Assert-ExactLocalState
  Assert-SourceVideo
  Assert-RecoveryRunner

  if (-not (Test-Path -LiteralPath $PythonExe -PathType Leaf)) { Fail "VENV_PYTHON_MISSING:$PythonExe" }
  if (-not (Test-Path -LiteralPath $UvExe -PathType Leaf)) { Fail "UV_EXE_MISSING:$UvExe" }
  if (-not (Test-Path -LiteralPath $Wheelhouse -PathType Container)) { New-Item -ItemType Directory -Path $Wheelhouse -Force | Out-Null }

  $torchWheel = Join-Path $Wheelhouse $TorchFile
  $torchVisionWheel = Join-Path $Wheelhouse $TorchVisionFile

  Write-Host '=============================================' -ForegroundColor Cyan
  Write-Host 'V4_TORCH_CURL_RESUME_RECOVERY=START' -ForegroundColor Green
  Write-Host "wheelhouse=$Wheelhouse"
  Write-Host 'transport=CURL_OFFICIAL_R2_PERSISTENT_PART_RESUME'
  Write-Host 'mirror_fallback=DISABLED'
  Write-Host '=============================================' -ForegroundColor Cyan

  Get-ResumableOfficialWheel 'TORCH' $TorchUrl $torchWheel 'torch' '2.9.1+cu128'
  Get-ResumableOfficialWheel 'TORCHVISION' $TorchVisionUrl $torchVisionWheel 'torchvision' '0.24.1+cu128'

  Write-Host '==> Install verified local wheels; no PyTorch wheel network transfer in this step' -ForegroundColor Cyan
  $installArgs = @(
    'pip', 'install',
    '--python', $PythonExe,
    '--link-mode', 'copy',
    $torchWheel,
    $torchVisionWheel
  )
  $installExit = Start-NativeVisible 'V4_INSTALL_LOCAL_TORCH_WHEELS' $UvExe $installArgs
  if ($installExit -ne 0) { Fail "V4_INSTALL_LOCAL_TORCH_WHEELS_FAILED:exit=$installExit" }

  Assert-TorchRuntime

  $env:HF_HOME = 'D:\AI\MODELS\HuggingFace'
  $env:HF_HUB_DISABLE_SYMLINKS_WARNING = '1'

  Write-Host '==> Resume validated v4 Video2Twin pipeline' -ForegroundColor Cyan
  $resumeArgumentLine = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', (Quote-WindowsCommandLineArg $RecoveryPath),
    '-RepoRoot', (Quote-WindowsCommandLineArg $RepoRoot),
    '-Branch', (Quote-WindowsCommandLineArg $Branch),
    '-ExpectedHead', (Quote-WindowsCommandLineArg $ExpectedHead),
    '-SiteId', '"drift-curio"',
    '-Sku', '"DC-ZY-SZ-31001"',
    '-VideoPath', (Quote-WindowsCommandLineArg $VideoPath)
  ) -join ' '

  $resumeProcess = Start-Process -FilePath 'powershell.exe' -ArgumentList $resumeArgumentLine -Wait -PassThru -NoNewWindow
  $resumeExit = [int]$resumeProcess.ExitCode
  Write-Host "V4_RESUME_VIDEO2TWIN_PIPELINE_EXIT=$resumeExit"
  if ($resumeExit -ne 0) { Fail "V4_RESUME_VIDEO2TWIN_PIPELINE_FAILED:exit=$resumeExit" }

  Write-Host 'P5_QA01_V4_TORCH_CURL_RESUME_RECOVERY=PASS' -ForegroundColor Green
  exit 0
}
catch {
  Fail $_.Exception.Message
}
