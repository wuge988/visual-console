param(
  [Parameter(Mandatory=$true)][string]$SupportV3Dir,
  [string]$OutputDir = "",
  [string]$PythonExe = "D:\AI\TOOLS\DC_SAM31\venv\Scripts\python.exe",
  [string]$HfHome = "D:\AI\MODELS\HuggingFace",
  [string]$TextPrompt = "driftwood"
)

$ErrorActionPreference = "Stop"
$Harness = Join-Path $PSScriptRoot "p3b_sam31_video_benchmark.py"

function Fail([string]$Code, [string]$Message) { Write-Host "$Code=FAIL"; throw $Message }

Write-Host "P3B_SAM31_VIDEO_GATE=START"
Write-Host "pilot_id=P3B-M3D01-DC-ZY-SZ-31001"
Write-Host "authority=EVALUATION_ONLY"
Write-Host "production_registration=false"
Write-Host "pdp_blocking=false"
Write-Host "sam2_attempts_exhausted=true"
Write-Host "sam31_fallback_authorized=true"

if (!(Test-Path -LiteralPath $SupportV3Dir -PathType Container)) { Fail "SUPPORT_V3_EVIDENCE" "Support-v3 directory not found: $SupportV3Dir" }
if (!(Test-Path -LiteralPath $Harness -PathType Leaf)) { Fail "HARNESS" "SAM3.1 benchmark harness missing: $Harness" }
if (!(Test-Path -LiteralPath $PythonExe -PathType Leaf)) { Fail "SAM31_RUNTIME" "Dedicated SAM3.1 Python missing: $PythonExe" }

& $PythonExe -c "import sys,torch,sam3; from sam3.model_builder import build_sam3_multiplex_video_predictor; assert sys.version_info >= (3,12); assert torch.cuda.is_available(); print('SAM31_RUNTIME=PASS'); print('PYTHON='+sys.version.split()[0]); print('TORCH='+torch.__version__); print('TORCH_CUDA='+str(torch.version.cuda)); print('GPU='+torch.cuda.get_device_name(0)); print('VRAM_GB={:.2f}'.format(torch.cuda.get_device_properties(0).total_memory/1024**3))" | Out-Host
if ($LASTEXITCODE -ne 0) { Fail "SAM31_RUNTIME" "Dedicated SAM3.1 runtime is not ready" }

if (!(Test-Path -LiteralPath $HfHome -PathType Container)) { Fail "SAM31_LOCAL_CACHE" "HF_HOME missing: $HfHome" }
$oldHfHome=$env:HF_HOME
$env:HF_HOME=$HfHome
try {
  $Cache = & $PythonExe -c "from huggingface_hub import hf_hub_download; p=hf_hub_download(repo_id='facebook/sam3.1', filename='sam3.1_multiplex.pt', local_files_only=True); print('SAM31_LOCAL_CACHE=PASS'); print('sam31_checkpoint='+p)"
  $Cache | Out-Host
  if ($LASTEXITCODE -ne 0) { Fail "SAM31_LOCAL_CACHE" "SAM3.1 checkpoint is not available locally" }
  $CheckpointLine=$Cache | Where-Object { $_ -like "sam31_checkpoint=*" } | Select-Object -Last 1
  if (!$CheckpointLine) { Fail "SAM31_LOCAL_CACHE" "Could not resolve SAM3.1 checkpoint path" }
  $Checkpoint=$CheckpointLine.Substring("sam31_checkpoint=".Length)

  if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $ts=Get-Date -Format "yyyyMMdd-HHmmss"
    $OutputDir="E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\p3b\DC-ZY-SZ-31001\$ts-sam31-benchmark"
  }
  if (Test-Path -LiteralPath $OutputDir) {
    $Existing=Get-ChildItem -LiteralPath $OutputDir -Force -ErrorAction SilentlyContinue
    if ($Existing.Count -gt 0) { Fail "OUTPUT_BOUNDARY" "Output directory must be empty: $OutputDir" }
  }

  & $PythonExe $Harness --support-v3-dir $SupportV3Dir --checkpoint $Checkpoint --out $OutputDir --text-prompt $TextPrompt --item-id "DC-ZY-SZ-31001" | Out-Host
  if ($LASTEXITCODE -ne 0) { Fail "SAM31_VIDEO_BENCHMARK" "SAM3.1 video benchmark failed" }
} finally {
  $env:HF_HOME=$oldHfHome
}

Write-Host "P3B_SAM31_VIDEO_GATE=AUTO_CANDIDATE_READY"
Write-Host "RECONSTRUCTION=BLOCKED_UNTIL_SAM31_HUMAN_GATE_PASS"
Write-Host "next_gate=SAM31_VIDEO_HUMAN_VISUAL_GATE"
Write-Host "output_dir=$OutputDir"
