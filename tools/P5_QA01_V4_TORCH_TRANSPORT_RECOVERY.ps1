param(
  [string]$RepoRoot = 'E:\AI_PROJECTS\VISUAL_CONSOLE',
  [string]$Branch = 'feat/p5-qa01-scene-freeze',
  [string]$ExpectedHead = 'ed216ac6bcd2f703ac6826631b9984dd43320172',
  [string]$VideoPath = 'F:\1独立站\DRIFT CURIO\DRIFT_CURIO_VISUAL_PIPELINE\100_Trash\DC-ZY-SZ-31001\20260826033235967_7ebeda73__VID_20260826_104257__mobile_2026-08-26T02-43-40-826Z.mp4',
  [string]$RecoveryPath = '',
  [switch]$PlanOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ToolRoot = 'D:\AI\TOOLS\DC_Video2Twin'
$VenvRoot = "$ToolRoot\venv-py310"
$PythonExe = "$VenvRoot\Scripts\python.exe"
$UvExe = "$ToolRoot\uv-0.12.10\uv.exe"
$UvCache = "$ToolRoot\uv-cache"
$ExpectedRecoveryBlob = '5601155de9c09cc1e2ee45fbf147e21410d714a5'
$ExpectedVideoSha = 'a322cd09820af0fe7d3092101d7660787853c7b2979c7e207c3be5e0bf4778aa'

function Fail([string]$Message) {
  Write-Host 'P5_QA01_V4_TORCH_TRANSPORT_RECOVERY=FAIL' -ForegroundColor Red
  Write-Host "error=$Message" -ForegroundColor Red
  exit 1
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
  if ([string]::IsNullOrWhiteSpace($RecoveryPath)) {
    $RecoveryPath = Join-Path ([System.IO.Path]::GetTempPath()) 'P5_QA01_V4_ACCESS_PROBE_RECOVERY_FINAL.ps1'
  }
  if (-not (Test-Path -LiteralPath $RecoveryPath -PathType Leaf)) { Fail "RECOVERY_RUNNER_MISSING:$RecoveryPath" }
  $blob = (& git hash-object --no-filters -- $RecoveryPath).Trim()
  if ($blob -ne $ExpectedRecoveryBlob) { Fail "RECOVERY_BLOB_MISMATCH:expected=$ExpectedRecoveryBlob:actual=$blob" }
  Write-Host "RECOVERY_BLOB=PASS $blob" -ForegroundColor Green
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
    Write-Host 'P5_QA01_V4_TORCH_TRANSPORT_RECOVERY_PLAN=PASS' -ForegroundColor Green
    Write-Host 'transport=UV_PIP_CACHE_RESILIENT'
    Write-Host 'torch_backend=cu128'
    Write-Host 'uv_http_retries=20'
    Write-Host 'uv_http_timeout=180'
    Write-Host 'uv_concurrent_downloads=1'
    Write-Host 'uv_link_mode=copy'
    Write-Host 'native_stream_mode=START_PROCESS_INHERITED_CONSOLE'
    Write-Host 'pip_system_temp_path=NOT_USED_FOR_TORCH_DOWNLOAD'
    exit 0
  }

  $RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
  Assert-ExactLocalState
  Assert-SourceVideo
  Assert-RecoveryRunner

  if (-not (Test-Path -LiteralPath $PythonExe -PathType Leaf)) { Fail "VENV_PYTHON_MISSING:$PythonExe" }
  if (-not (Test-Path -LiteralPath $UvExe -PathType Leaf)) { Fail "UV_EXE_MISSING:$UvExe" }
  if (-not (Test-Path -LiteralPath $UvCache -PathType Container)) { New-Item -ItemType Directory -Path $UvCache -Force | Out-Null }

  # Avoid the pip WinError 32 failure mode seen after repeated interruption of the
  # 2.86 GB torch wheel in the Windows system temp directory. uv uses its own
  # persistent cache and supports explicit HTTP retry/timeout controls.
  $env:UV_CACHE_DIR = $UvCache
  $env:UV_HTTP_RETRIES = '20'
  $env:UV_HTTP_TIMEOUT = '180'
  $env:UV_HTTP_CONNECT_TIMEOUT = '30'
  $env:UV_CONCURRENT_DOWNLOADS = '1'
  $env:UV_LINK_MODE = 'copy'
  $env:UV_TORCH_BACKEND = 'cu128'

  Write-Host '=============================================' -ForegroundColor Cyan
  Write-Host 'V4_TORCH_TRANSPORT_RECOVERY=START' -ForegroundColor Green
  Write-Host "uv_cache=$UvCache"
  Write-Host 'transport=UV_PIP_CACHE_RESILIENT'
  Write-Host 'torch_backend=cu128'
  Write-Host 'uv_http_retries=20'
  Write-Host 'uv_http_timeout=180'
  Write-Host 'uv_concurrent_downloads=1'
  Write-Host 'uv_link_mode=copy'
  Write-Host 'pip_system_temp_path=NOT_USED_FOR_TORCH_DOWNLOAD'
  Write-Host '=============================================' -ForegroundColor Cyan

  $torchArgs = @(
    'pip', 'install',
    '--python', $PythonExe,
    '--link-mode', 'copy',
    '--torch-backend', 'cu128',
    'torch==2.9.1',
    'torchvision==0.24.1'
  )

  $installed = $false
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    Write-Host "V4_TORCH_UV_ATTEMPT=$attempt/3" -ForegroundColor Cyan
    $exit = Start-NativeVisible 'V4_INSTALL_TORCH_CU128_UV' $UvExe $torchArgs
    if ($exit -eq 0) {
      $installed = $true
      break
    }
    if ($attempt -lt 3) {
      $wait = 5 * $attempt
      Write-Host "V4_TORCH_UV_RETRY_IN=${wait}s" -ForegroundColor Yellow
      Start-Sleep -Seconds $wait
    }
  }
  if (-not $installed) { Fail 'V4_INSTALL_TORCH_CU128_UV_FAILED_AFTER_3_ATTEMPTS' }

  Assert-TorchRuntime

  # Re-enter the already validated recovery runner. The original pip torch step is
  # now a cheap Requirement-already-satisfied check, then the pipeline continues to
  # gsplat / VGGT / SAM2 / automatic prep / reconstruction.
  $env:HF_HOME = 'D:\AI\MODELS\HuggingFace'
  $env:HF_HUB_DISABLE_SYMLINKS_WARNING = '1'

  Write-Host '==> Resume validated v4 recovery pipeline' -ForegroundColor Cyan
  $resumeArgs = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', $RecoveryPath,
    '-RepoRoot', $RepoRoot,
    '-Branch', $Branch,
    '-ExpectedHead', $ExpectedHead,
    '-SiteId', 'drift-curio',
    '-Sku', 'DC-ZY-SZ-31001',
    '-VideoPath', $VideoPath
  )
  $resumeExit = Start-NativeVisible 'V4_RESUME_VIDEO2TWIN_PIPELINE' 'powershell.exe' $resumeArgs
  if ($resumeExit -ne 0) { Fail "V4_RESUME_VIDEO2TWIN_PIPELINE_FAILED:exit=$resumeExit" }

  Write-Host 'P5_QA01_V4_TORCH_TRANSPORT_RECOVERY=PASS' -ForegroundColor Green
  exit 0
}
catch {
  Fail $_.Exception.Message
}
