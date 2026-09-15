param(
  [Parameter(Mandatory=$true)][string]$FrameQcDir,
  [string]$OutputDir = "",
  [string]$PythonExe = "",
  [string]$HfHome = "D:\AI\MODELS\HuggingFace",
  [switch]$ProbeOnly
)

$ErrorActionPreference = "Stop"
$MaskScript = Join-Path $PSScriptRoot "p3b_wood_only_mask.py"
$PreferredPython = "D:\AI\TOOLS\DC_Video2Twin\venv-py310\Scripts\python.exe"
$SamRepo = "facebook/sam2.1-hiera-base-plus"
$SamCheckpointName = "sam2.1_hiera_base_plus.pt"

function Fail([string]$Code, [string]$Message) {
  Write-Host "$Code=FAIL"
  throw $Message
}

Write-Host "P3B_MASK_WINDOWS_GATE=START"
Write-Host "pilot_id=P3B-M3D01-DC-ZY-SZ-31001"
Write-Host "authority=EVALUATION_ONLY"
Write-Host "production_registration=false"
Write-Host "pdp_blocking=false"

if (!(Test-Path -LiteralPath $FrameQcDir -PathType Container)) { Fail "FRAME_QC_EVIDENCE" "Frame-QC directory not found: $FrameQcDir" }
$FrameQcManifest = Join-Path $FrameQcDir "evaluation_manifest.json"
if (!(Test-Path -LiteralPath $FrameQcManifest -PathType Leaf)) { Fail "FRAME_QC_EVIDENCE" "Frame-QC manifest not found: $FrameQcManifest" }
if (!(Test-Path -LiteralPath $MaskScript -PathType Leaf)) { Fail "HARNESS" "Missing wood-only mask harness: $MaskScript" }

$Qc = Get-Content -LiteralPath $FrameQcManifest -Raw -Encoding UTF8 | ConvertFrom-Json
if ($Qc.pilot_id -ne "P3B-M3D01-DC-ZY-SZ-31001") { Fail "FRAME_QC_EVIDENCE" "Pilot identity mismatch" }
if ($Qc.item_id -ne "DC-ZY-SZ-31001") { Fail "FRAME_QC_EVIDENCE" "Item identity mismatch" }
if ($Qc.authority -ne "EVALUATION_ONLY") { Fail "FRAME_QC_EVIDENCE" "Frame-QC authority must remain evaluation-only" }
if ([bool]$Qc.production_registration) { Fail "FRAME_QC_EVIDENCE" "Production registration is forbidden in P3" }
if ($Qc.gate_state.FRAME_QC -ne "PASS") { Fail "FRAME_QC_EVIDENCE" "Frame-QC must pass before masking" }
$SelectedCount = @($Qc.frame_qc.rows).Count
if ($SelectedCount -lt 16) { Fail "FRAME_QC_EVIDENCE" "Frame-QC selected frame count is below 16: $SelectedCount" }
Write-Host "FRAME_QC_EVIDENCE=PASS"
Write-Host "selected_frames=$SelectedCount"
Write-Host "frame_qc_manifest=$FrameQcManifest"

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

& $PythonExe -c "import cv2,numpy,torch; from PIL import Image; from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator; print('MASK_RUNTIME=PASS'); print('CUDA=' + ('PASS' if torch.cuda.is_available() else 'MISSING')); print('GPU=' + (torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'NONE'))" | Out-Host
if ($LASTEXITCODE -ne 0) { Fail "MASK_RUNTIME" "SAM2/OpenCV/Pillow/Torch runtime is not ready" }

$CudaProbe = & $PythonExe -c "import torch; print('1' if torch.cuda.is_available() else '0')"
if (($CudaProbe | Select-Object -Last 1).Trim() -ne "1") { Fail "MASK_RUNTIME" "CUDA is required for the current bounded SAM2 mask gate" }

# This bounded physical gate is intentionally offline-first. Historical P5 already
# used D:\AI\MODELS\HuggingFace as the model cache. Re-bind that local cache rather
# than depending on ambient user OAuth state or live Hugging Face availability.
if (!(Test-Path -LiteralPath $HfHome -PathType Container)) { Fail "SAM2_LOCAL_CACHE" "Hugging Face cache root not found: $HfHome" }
$env:HF_HOME = $HfHome
$env:HF_HUB_OFFLINE = "1"
$env:HF_TOKEN = ""
$env:HUGGING_FACE_HUB_TOKEN = ""
Write-Host "HF_HOME=$HfHome"
Write-Host "HF_HUB_OFFLINE=1"

$CacheProbe = @"
from huggingface_hub import hf_hub_download
p = hf_hub_download(repo_id='$SamRepo', filename='$SamCheckpointName', local_files_only=True)
print('SAM2_LOCAL_CACHE=PASS')
print('sam_checkpoint=' + p)
"@
& $PythonExe -c $CacheProbe | Out-Host
if ($LASTEXITCODE -ne 0) { Fail "SAM2_LOCAL_CACHE" "Pinned SAM2 checkpoint is not available in the verified local cache; live network/token access is not accepted by this gate" }

if ($ProbeOnly) {
  Write-Host "P3B_MASK_WINDOWS_GATE=PROBE_PASS"
  Write-Host "next_gate=WOOD_ONLY_MASK_EXECUTION"
  exit 0
}

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
  $Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $OutputDir = "E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\p3b\DC-ZY-SZ-31001\$Timestamp-wood-mask"
}
if (Test-Path -LiteralPath $OutputDir) {
  $Existing = Get-ChildItem -LiteralPath $OutputDir -Force -ErrorAction SilentlyContinue
  if ($Existing.Count -gt 0) { Fail "OUTPUT_BOUNDARY" "Output directory must be empty: $OutputDir" }
}

& $PythonExe $MaskScript `
  --frame-qc-dir $FrameQcDir `
  --out $OutputDir `
  --item-id "DC-ZY-SZ-31001" | Out-Host
if ($LASTEXITCODE -ne 0) { Fail "WOOD_ONLY_MASK" "Automatic wood-only mask candidate generation failed" }

Write-Host "P3B_MASK_WINDOWS_GATE=AUTO_CANDIDATE_READY"
Write-Host "RECONSTRUCTION=BLOCKED_UNTIL_MASK_HUMAN_GATE_PASS"
Write-Host "next_gate=WOOD_ONLY_MASK_HUMAN_VISUAL_GATE"
Write-Host "output_dir=$OutputDir"
