param(
  [string]$PythonExe = "D:\AI\TOOLS\DC_SAM31\venv-py312\Scripts\python.exe",
  [string]$Sam3Repo = "D:\AI\TOOLS\sam3",
  [string]$HfHome = "D:\AI\MODELS\HuggingFace"
)

$ErrorActionPreference = "Continue"

Write-Host "P3B_SAM31_WINDOWS_PROBE=START"
Write-Host "pilot_id=P3B-M3D01-DC-ZY-SZ-31001"
Write-Host "authority=EVALUATION_ONLY"
Write-Host "production_registration=false"
Write-Host "pdp_blocking=false"
Write-Host "separate_runtime_required=true"
Write-Host "sam2_runtime_mutation=false"

$ready = $true

Write-Host ""
Write-Host "===== SYSTEM PYTHON DISCOVERY ====="
$PyLauncher = Get-Command py -ErrorAction SilentlyContinue
if ($PyLauncher) { & py -0p 2>$null | Out-Host } else { Write-Host "PY_LAUNCHER=MISSING" }
$Conda = Get-Command conda -ErrorAction SilentlyContinue
if ($Conda) { Write-Host "CONDA=PASS"; & conda --version | Out-Host } else { Write-Host "CONDA=MISSING" }

Write-Host ""
Write-Host "===== NVIDIA ====="
$NvidiaSmi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
if ($NvidiaSmi) {
  & nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader | Out-Host
} else {
  Write-Host "NVIDIA_SMI=MISSING"
  $ready = $false
}

Write-Host ""
Write-Host "===== DEDICATED SAM31 PYTHON ====="
if (!(Test-Path -LiteralPath $PythonExe -PathType Leaf)) {
  Write-Host "SAM31_PYTHON=NOT_READY"
  Write-Host "expected_python=$PythonExe"
  $ready = $false
} else {
  Write-Host "SAM31_PYTHON=FOUND"
  Write-Host "python=$PythonExe"

  $VersionProbe = & $PythonExe -c "import sys; print('.'.join(map(str,sys.version_info[:3]))); print('PASS' if sys.version_info >= (3,12) else 'FAIL')" 2>&1
  $VersionProbe | Out-Host
  if (($VersionProbe | Select-Object -Last 1).Trim() -ne "PASS") {
    Write-Host "PYTHON_3_12_PLUS=FAIL"
    $ready = $false
  } else {
    Write-Host "PYTHON_3_12_PLUS=PASS"
  }

  $RuntimeProbe = & $PythonExe -c "import torch,torchvision,triton,psutil,sam3; from sam3.model_builder import build_sam3_multiplex_video_predictor; print('TORCH_VERSION='+torch.__version__); print('TORCHVISION_VERSION='+torchvision.__version__); print('TRITON_VERSION='+triton.__version__); print('PSUTIL_VERSION='+psutil.__version__); print('TORCH_CUDA='+str(torch.version.cuda)); print('CUDA_AVAILABLE='+str(torch.cuda.is_available())); print('GPU='+(torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'NONE')); print('VRAM_GB='+('{:.2f}'.format(torch.cuda.get_device_properties(0).total_memory/1024**3) if torch.cuda.is_available() else '0')); print('SAM3_IMPORT=PASS'); print('MULTIPLEX_BUILDER_IMPORT=PASS')" 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Host "SAM31_RUNTIME=NOT_READY"
    $RuntimeProbe | Out-Host
    $ready = $false
  } else {
    Write-Host "SAM31_RUNTIME=PASS"
    $RuntimeProbe | Out-Host
  }

  $HfProbe = & $PythonExe -c "from huggingface_hub import get_token; print('HF_LOCAL_TOKEN=' + ('PRESENT' if get_token() else 'MISSING'))" 2>&1
  if ($LASTEXITCODE -eq 0) {
    $HfProbe | Out-Host
  } else {
    Write-Host "HF_HUB_RUNTIME=NOT_READY"
    $ready = $false
  }
}

Write-Host ""
Write-Host "===== SAM3 REPO ====="
if (Test-Path -LiteralPath $Sam3Repo -PathType Container) {
  Write-Host "SAM3_REPO=FOUND"
  Write-Host "sam3_repo=$Sam3Repo"
  if (Test-Path -LiteralPath (Join-Path $Sam3Repo ".git") -PathType Container) {
    git -C $Sam3Repo rev-parse HEAD 2>$null | ForEach-Object { Write-Host "sam3_repo_head=$_" }
  }
} else {
  Write-Host "SAM3_REPO=NOT_READY"
  Write-Host "expected_repo=$Sam3Repo"
  $ready = $false
}

Write-Host ""
Write-Host "===== SAM3.1 LOCAL CHECKPOINT ====="
if (!(Test-Path -LiteralPath $HfHome -PathType Container)) {
  Write-Host "HF_HOME=NOT_READY"
  Write-Host "expected_hf_home=$HfHome"
  $ready = $false
} elseif (Test-Path -LiteralPath $PythonExe -PathType Leaf) {
  $oldHfHome = $env:HF_HOME
  $env:HF_HOME = $HfHome
  try {
    $CacheProbe = & $PythonExe -c "from huggingface_hub import hf_hub_download; p=hf_hub_download(repo_id='facebook/sam3.1', filename='sam3.1_multiplex.pt', local_files_only=True); print('SAM31_LOCAL_CACHE=PASS'); print('sam31_checkpoint='+p)" 2>&1
    if ($LASTEXITCODE -ne 0) {
      Write-Host "SAM31_LOCAL_CACHE=NOT_READY"
      $CacheProbe | Out-Host
      $ready = $false
    } else {
      $CacheProbe | Out-Host
    }
  } finally {
    $env:HF_HOME = $oldHfHome
  }
}

Write-Host ""
Write-Host "===== RESULT ====="
if ($ready) {
  Write-Host "P3B_SAM31_LOCAL_RUNTIME=READY"
  Write-Host "next_gate=SAM31_VIDEO_BENCHMARK_EXECUTION"
} else {
  Write-Host "P3B_SAM31_LOCAL_RUNTIME=NOT_READY"
  Write-Host "next_gate=SAM31_CHECKPOINT_ACCESS_OR_LOCAL_RUNTIME_REPAIR"
}
Write-Host "P3B_SAM31_WINDOWS_PROBE=COMPLETE"
