param(
  [Parameter(Mandatory=$true)][string]$SupportV3Dir,
  [string]$OutputDir = "",
  [string]$PythonExe = "D:\AI\TOOLS\DC_SAM31\venv-py312\Scripts\python.exe",
  [string]$HfHome = "D:\AI\MODELS\HuggingFace",
  [string]$TextPrompt = "driftwood"
)

$ErrorActionPreference = "Continue"
$Harness = Join-Path $PSScriptRoot "p3b_sam31_video_benchmark.py"

Write-Host "P3B_SAM31_VIDEO_GATE=START"
Write-Host "pilot_id=P3B-M3D01-DC-ZY-SZ-31001"
Write-Host "authority=EVALUATION_ONLY"
Write-Host "production_registration=false"
Write-Host "pdp_blocking=false"
Write-Host "sam2_attempts_exhausted=true"
Write-Host "sam31_fallback_authorized=true"
Write-Host "terminal_safe_failure_mode=true"

if (!(Test-Path -LiteralPath $SupportV3Dir -PathType Container)) {
  Write-Host "SUPPORT_V3_EVIDENCE=FAIL"
  Write-Host "message=Support-v3 directory not found: $SupportV3Dir"
  Write-Host "P3B_SAM31_VIDEO_GATE=FAILED"
  return
}
if (!(Test-Path -LiteralPath $Harness -PathType Leaf)) {
  Write-Host "HARNESS=FAIL"
  Write-Host "message=SAM3.1 benchmark harness missing: $Harness"
  Write-Host "P3B_SAM31_VIDEO_GATE=FAILED"
  return
}
if (!(Test-Path -LiteralPath $PythonExe -PathType Leaf)) {
  Write-Host "SAM31_RUNTIME=FAIL"
  Write-Host "message=Dedicated SAM3.1 Python missing: $PythonExe"
  Write-Host "P3B_SAM31_VIDEO_GATE=FAILED"
  return
}

$RuntimeOutput = & $PythonExe -c "import sys,torch,torchvision,triton,psutil,sam3; from sam3.model_builder import build_sam3_multiplex_video_predictor; assert sys.version_info >= (3,12); assert torch.cuda.is_available(); print('SAM31_RUNTIME=PASS'); print('PYTHON='+sys.version.split()[0]); print('TORCH='+torch.__version__); print('TORCHVISION='+torchvision.__version__); print('TRITON='+triton.__version__); print('TORCH_CUDA='+str(torch.version.cuda)); print('GPU='+torch.cuda.get_device_name(0)); print('VRAM_GB={:.2f}'.format(torch.cuda.get_device_properties(0).total_memory/1024**3)); print('MULTIPLEX_BUILDER_IMPORT=PASS')" 2>&1
$RuntimeExit = $LASTEXITCODE
$RuntimeOutput | Out-Host
if ($RuntimeExit -ne 0) {
  Write-Host "SAM31_RUNTIME=FAIL"
  Write-Host "message=Dedicated SAM3.1 runtime is not ready"
  Write-Host "P3B_SAM31_VIDEO_GATE=FAILED"
  return
}

if (!(Test-Path -LiteralPath $HfHome -PathType Container)) {
  Write-Host "SAM31_LOCAL_CACHE=FAIL"
  Write-Host "message=HF_HOME missing: $HfHome"
  Write-Host "P3B_SAM31_VIDEO_GATE=FAILED"
  return
}

$oldHfHome = $env:HF_HOME
$env:HF_HOME = $HfHome
$gateFailed = $false
$Checkpoint = $null

try {
  $Cache = & $PythonExe -c "from huggingface_hub import hf_hub_download; p=hf_hub_download(repo_id='facebook/sam3.1', filename='sam3.1_multiplex.pt', local_files_only=True); print('SAM31_LOCAL_CACHE=PASS'); print('sam31_checkpoint='+p)" 2>&1
  $CacheExit = $LASTEXITCODE
  $Cache | Out-Host

  if ($CacheExit -ne 0) {
    Write-Host "SAM31_LOCAL_CACHE=FAIL"
    Write-Host "message=SAM3.1 checkpoint is not available locally"
    $gateFailed = $true
  }

  if (!$gateFailed) {
    $CheckpointLine = $Cache | Where-Object { "$_" -like "sam31_checkpoint=*" } | Select-Object -Last 1
    if (!$CheckpointLine) {
      Write-Host "SAM31_LOCAL_CACHE=FAIL"
      Write-Host "message=Could not resolve SAM3.1 checkpoint path"
      $gateFailed = $true
    } else {
      $Checkpoint = "$CheckpointLine".Substring("sam31_checkpoint=".Length)
    }
  }

  if (!$gateFailed) {
    if ([string]::IsNullOrWhiteSpace($OutputDir)) {
      $ts = Get-Date -Format "yyyyMMdd-HHmmss"
      $OutputDir = "E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\p3b\DC-ZY-SZ-31001\$ts-sam31-benchmark"
    }

    if (Test-Path -LiteralPath $OutputDir) {
      $Existing = @(Get-ChildItem -LiteralPath $OutputDir -Force -ErrorAction SilentlyContinue)
      if ($Existing.Count -gt 0) {
        Write-Host "OUTPUT_BOUNDARY=FAIL"
        Write-Host "message=Output directory must be empty: $OutputDir"
        $gateFailed = $true
      }
    }
  }

  if (!$gateFailed) {
    $BenchmarkOutput = & $PythonExe $Harness --support-v3-dir $SupportV3Dir --checkpoint $Checkpoint --out $OutputDir --text-prompt $TextPrompt --item-id "DC-ZY-SZ-31001" 2>&1
    $BenchmarkExit = $LASTEXITCODE
    $BenchmarkOutput | Out-Host

    if ($BenchmarkExit -ne 0) {
      Write-Host "SAM31_VIDEO_BENCHMARK=FAIL"
      Write-Host "message=SAM3.1 video benchmark failed"
      $gateFailed = $true
    }
  }
} finally {
  $env:HF_HOME = $oldHfHome
}

if ($gateFailed) {
  Write-Host "P3B_SAM31_VIDEO_GATE=FAILED"
  Write-Host "RECONSTRUCTION=BLOCKED"
  Write-Host "terminal_remains_open=true"
  return
}

Write-Host "P3B_SAM31_VIDEO_GATE=AUTO_CANDIDATE_READY"
Write-Host "RECONSTRUCTION=BLOCKED_UNTIL_SAM31_HUMAN_GATE_PASS"
Write-Host "next_gate=SAM31_VIDEO_HUMAN_VISUAL_GATE"
Write-Host "output_dir=$OutputDir"
Write-Host "terminal_remains_open=true"
