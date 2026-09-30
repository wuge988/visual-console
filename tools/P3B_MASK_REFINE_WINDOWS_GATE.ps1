param(
  [Parameter(Mandatory=$true)][string]$MaskDir,
  [string]$OutputDir = "",
  [string]$PythonExe = "",
  [string]$HfHome = "D:\AI\MODELS\HuggingFace",
  [switch]$ProbeOnly
)

$ErrorActionPreference = "Stop"
$RefineScript = Join-Path $PSScriptRoot "p3b_wood_mask_refine.py"
$PreferredPython = "D:\AI\TOOLS\DC_Video2Twin\venv-py310\Scripts\python.exe"
$SamRepo = "facebook/sam2.1-hiera-base-plus"
$SamCheckpointName = "sam2.1_hiera_base_plus.pt"

function Fail([string]$Code, [string]$Message) {
  Write-Host "$Code=FAIL"
  throw $Message
}

Write-Host "P3B_MASK_REFINE_WINDOWS_GATE=START"
Write-Host "pilot_id=P3B-M3D01-DC-ZY-SZ-31001"
Write-Host "authority=EVALUATION_ONLY"
Write-Host "production_registration=false"
Write-Host "pdp_blocking=false"

if (!(Test-Path -LiteralPath $MaskDir -PathType Container)) { Fail "MASK_EVIDENCE" "Mask directory not found: $MaskDir" }
$MaskManifest = Join-Path $MaskDir "evaluation_manifest.json"
if (!(Test-Path -LiteralPath $MaskManifest -PathType Leaf)) { Fail "MASK_EVIDENCE" "Mask manifest not found: $MaskManifest" }
if (!(Test-Path -LiteralPath $RefineScript -PathType Leaf)) { Fail "HARNESS" "Missing mask refinement harness: $RefineScript" }

$Mask = Get-Content -LiteralPath $MaskManifest -Raw -Encoding UTF8 | ConvertFrom-Json
if ($Mask.pilot_id -ne "P3B-M3D01-DC-ZY-SZ-31001") { Fail "MASK_EVIDENCE" "Pilot identity mismatch" }
if ($Mask.item_id -ne "DC-ZY-SZ-31001") { Fail "MASK_EVIDENCE" "Item identity mismatch" }
if ($Mask.authority -ne "EVALUATION_ONLY") { Fail "MASK_EVIDENCE" "Mask authority must remain evaluation-only" }
if ([bool]$Mask.production_registration) { Fail "MASK_EVIDENCE" "Production registration is forbidden in P3" }
if ($Mask.gate_state.FRAME_QC -ne "PASS") { Fail "MASK_EVIDENCE" "Parent Frame-QC must remain PASS" }
$AcceptedCount = [int]$Mask.masking.accepted_count
if ($AcceptedCount -lt 16) { Fail "MASK_EVIDENCE" "Parent accepted mask count is below 16: $AcceptedCount" }
Write-Host "MASK_EVIDENCE=PASS"
Write-Host "parent_accepted_masks=$AcceptedCount"
Write-Host "parent_mask_manifest=$MaskManifest"

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

& $PythonExe -c "import cv2,numpy,torch; from PIL import Image; from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator; print('MASK_REFINE_RUNTIME=PASS'); print('CUDA=' + ('PASS' if torch.cuda.is_available() else 'MISSING')); print('GPU=' + (torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'NONE'))" | Out-Host
if ($LASTEXITCODE -ne 0) { Fail "MASK_REFINE_RUNTIME" "SAM2/OpenCV/Pillow/Torch runtime is not ready" }

$CudaProbe = & $PythonExe -c "import torch; print('1' if torch.cuda.is_available() else '0')"
if (($CudaProbe | Select-Object -Last 1).Trim() -ne "1") { Fail "MASK_REFINE_RUNTIME" "CUDA is required for the bounded mask refinement gate" }

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
if ($LASTEXITCODE -ne 0) { Fail "SAM2_LOCAL_CACHE" "Pinned SAM2 checkpoint is not available in the verified local cache" }

if ($ProbeOnly) {
  Write-Host "P3B_MASK_REFINE_WINDOWS_GATE=PROBE_PASS"
  Write-Host "next_gate=WOOD_ONLY_MASK_REFINEMENT_EXECUTION"
  exit 0
}

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
  $Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $OutputDir = "E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\p3b\DC-ZY-SZ-31001\$Timestamp-wood-mask-refined"
}
if (Test-Path -LiteralPath $OutputDir) {
  $Existing = Get-ChildItem -LiteralPath $OutputDir -Force -ErrorAction SilentlyContinue
  if ($Existing.Count -gt 0) { Fail "OUTPUT_BOUNDARY" "Output directory must be empty: $OutputDir" }
}

& $PythonExe $RefineScript --mask-dir $MaskDir --out $OutputDir --item-id "DC-ZY-SZ-31001" | Out-Host
if ($LASTEXITCODE -ne 0) { Fail "WOOD_ONLY_MASK_REFINEMENT" "Bounded mask refinement failed" }

Write-Host "P3B_MASK_REFINE_WINDOWS_GATE=AUTO_CANDIDATE_READY"
Write-Host "RECONSTRUCTION=BLOCKED_UNTIL_REFINED_MASK_HUMAN_GATE_PASS"
Write-Host "next_gate=WOOD_ONLY_MASK_REFINED_HUMAN_VISUAL_GATE"
Write-Host "output_dir=$OutputDir"
