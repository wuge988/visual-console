param(
  [Parameter(Mandatory=$true)][string]$SupportV3Dir,
  [Parameter(Mandatory=$true)][ValidateSet(1,2,3)][int]$Attempt,
  [string]$OutputDir = "",
  [string]$PythonExe = "",
  [string]$HfHome = "D:\\AI\\MODELS\\HuggingFace"
)

$ErrorActionPreference = "Stop"
$PilotId = "P3B-M3D01-DC-ZY-SZ-31001"
$Harness = Join-Path $PSScriptRoot "p3b_sam2_video_tracking_experiment.py"
$PreferredPython = "D:\\AI\\TOOLS\\DC_Video2Twin\\venv-py310\\Scripts\\python.exe"
$SamRepo = "facebook/sam2.1-hiera-base-plus"
$SamCheckpointName = "sam2.1_hiera_base_plus.pt"

function Fail([string]$Code, [string]$Message) {
  Write-Host "$Code=FAIL"
  throw $Message
}

Write-Host "P3B_SAM2_VIDEO_TRACKING_GATE=START"
Write-Host "pilot_id=$PilotId"
Write-Host "authority=EVALUATION_ONLY"
Write-Host "production_registration=false"
Write-Host "pdp_blocking=false"
Write-Host "attempt=$Attempt"
Write-Host "max_sam2_video_attempts=3"
Write-Host "sam3_1_fallback=AUTHORIZED_AFTER_THREE_HUMAN_FAILS"

if (!(Test-Path -LiteralPath $SupportV3Dir -PathType Container)) { Fail "SUPPORT_V3_EVIDENCE" "Support-v3 directory not found: $SupportV3Dir" }
$Manifest = Join-Path $SupportV3Dir "evaluation_manifest.json"
if (!(Test-Path -LiteralPath $Manifest -PathType Leaf)) { Fail "SUPPORT_V3_EVIDENCE" "Support-v3 manifest not found: $Manifest" }
if (!(Test-Path -LiteralPath $Harness -PathType Leaf)) { Fail "HARNESS" "Missing SAM2 video tracking harness: $Harness" }

$Parent = Get-Content -LiteralPath $Manifest -Raw -Encoding UTF8 | ConvertFrom-Json
if ($Parent.pilot_id -ne $PilotId) { Fail "SUPPORT_V3_EVIDENCE" "Pilot identity mismatch" }
if ($Parent.item_id -ne "DC-ZY-SZ-31001") { Fail "SUPPORT_V3_EVIDENCE" "Item identity mismatch" }
if ($Parent.authority -ne "EVALUATION_ONLY") { Fail "SUPPORT_V3_EVIDENCE" "Authority must remain evaluation-only" }
if ([bool]$Parent.production_registration) { Fail "SUPPORT_V3_EVIDENCE" "Production registration is forbidden in P3" }
if ($Parent.gate_state.FRAME_QC -ne "PASS") { Fail "SUPPORT_V3_EVIDENCE" "Parent Frame-QC must remain PASS" }

$AcceptedCount = [int]$Parent.support_suppression_v3.accepted_count
if ($AcceptedCount -lt 16) { Fail "SUPPORT_V3_EVIDENCE" "Support-v3 accepted mask count is below 16: $AcceptedCount" }
Write-Host "SUPPORT_V3_EVIDENCE=PASS"
Write-Host "parent_support_v3_masks=$AcceptedCount"
Write-Host "parent_support_v3_manifest=$Manifest"

if ([string]::IsNullOrWhiteSpace($PythonExe)) {
  if (Test-Path -LiteralPath $PreferredPython -PathType Leaf) {
    $PythonExe = $PreferredPython
    Write-Host "PYTHON_SELECTION=PREFERRED_ISOLATED_VIDEO2TWIN_RUNTIME"
  } else {
    $Python = Get-Command python -ErrorAction SilentlyContinue
    if (!$Python) { $Python = Get-Command py -ErrorAction SilentlyContinue }
    if (!$Python) { Fail "PYTHON_RUNTIME" "Python not available and preferred isolated runtime is missing" }
    $PythonExe = $Python.Source
    Write-Host "PYTHON_SELECTION=PATH_FALLBACK"
  }
}
if (!(Test-Path -LiteralPath $PythonExe -PathType Leaf)) { Fail "PYTHON_RUNTIME" "Python executable not found: $PythonExe" }
Write-Host "python=$PythonExe"

& $PythonExe -c "import cv2,numpy,torch; from PIL import Image; from sam2.build_sam import build_sam2_video_predictor; print('SAM2_VIDEO_RUNTIME=PASS'); print('CUDA=' + ('PASS' if torch.cuda.is_available() else 'MISSING')); print('GPU=' + (torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'NONE'))" | Out-Host
if ($LASTEXITCODE -ne 0) { Fail "SAM2_VIDEO_RUNTIME" "SAM2VideoPredictor/OpenCV/Pillow/Torch runtime is not ready" }

$CudaProbe = & $PythonExe -c "import torch; print('1' if torch.cuda.is_available() else '0')"
if (($CudaProbe | Select-Object -Last 1).Trim() -ne "1") { Fail "SAM2_VIDEO_RUNTIME" "CUDA is required for SAM2 video tracking" }

if (!(Test-Path -LiteralPath $HfHome -PathType Container)) { Fail "SAM2_LOCAL_CACHE" "Hugging Face cache root not found: $HfHome" }
$env:HF_HOME = $HfHome
$env:HF_HUB_OFFLINE = "1"
$env:HF_TOKEN = ""
$env:HUGGING_FACE_HUB_TOKEN = ""

$CacheProbe = @"
from huggingface_hub import hf_hub_download
p = hf_hub_download(repo_id='facebook/sam2.1-hiera-base-plus', filename='sam2.1_hiera_base_plus.pt', local_files_only=True)
print('SAM2_LOCAL_CACHE=PASS')
print('sam_checkpoint=' + p)
"@
$CacheOutput = & $PythonExe -c $CacheProbe
$CacheOutput | Out-Host
if ($LASTEXITCODE -ne 0) { Fail "SAM2_LOCAL_CACHE" "Pinned SAM2 checkpoint is not available in the verified local cache" }
$CheckpointLine = $CacheOutput | Where-Object { $_ -like "sam_checkpoint=*" } | Select-Object -Last 1
if (!$CheckpointLine) { Fail "SAM2_LOCAL_CACHE" "Could not resolve local SAM2 checkpoint path" }
$Checkpoint = $CheckpointLine.Substring("sam_checkpoint=".Length)

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
  $Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $OutputDir = "E:\\AI_PROJECTS\\DRIFT_CURIO_VISUAL\\p3b\\DC-ZY-SZ-31001\\$Timestamp-sam2-video-attempt-$Attempt"
}
if (Test-Path -LiteralPath $OutputDir) {
  $Existing = Get-ChildItem -LiteralPath $OutputDir -Force -ErrorAction SilentlyContinue
  if ($Existing.Count -gt 0) { Fail "OUTPUT_BOUNDARY" "Output directory must be empty: $OutputDir" }
}

& $PythonExe $Harness --support-v3-dir $SupportV3Dir --checkpoint $Checkpoint --out $OutputDir --attempt $Attempt --item-id "DC-ZY-SZ-31001" | Out-Host
if ($LASTEXITCODE -ne 0) { Fail "SAM2_VIDEO_TRACKING" "SAM2 VideoPredictor experiment failed" }

Write-Host "P3B_SAM2_VIDEO_TRACKING_GATE=AUTO_CANDIDATE_READY"
Write-Host "RECONSTRUCTION=BLOCKED_UNTIL_SAM2_VIDEO_TRACKING_HUMAN_GATE_PASS"
Write-Host "next_gate=SAM2_VIDEO_TRACKING_HUMAN_VISUAL_GATE"
Write-Host "output_dir=$OutputDir"
