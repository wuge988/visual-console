param(
  [Parameter(Mandatory=$true)][string]$RefinedDir,
  [string]$OutputDir = "",
  [string]$PythonExe = ""
)

$ErrorActionPreference = "Stop"
$Script = Join-Path $PSScriptRoot "p3b_support_suppression_v2.py"
$PreferredPython = "D:\AI\TOOLS\DC_Video2Twin\venv-py310\Scripts\python.exe"

function Fail([string]$Code, [string]$Message) {
  Write-Host "$Code=FAIL"
  throw $Message
}

Write-Host "P3B_SUPPORT_V2_WINDOWS_GATE=START"
Write-Host "pilot_id=P3B-M3D01-DC-ZY-SZ-31001"
Write-Host "authority=EVALUATION_ONLY"
Write-Host "production_registration=false"
Write-Host "pdp_blocking=false"

if (!(Test-Path -LiteralPath $RefinedDir -PathType Container)) { Fail "REFINED_MASK_EVIDENCE" "Refined mask directory not found: $RefinedDir" }
$Manifest = Join-Path $RefinedDir "evaluation_manifest.json"
if (!(Test-Path -LiteralPath $Manifest -PathType Leaf)) { Fail "REFINED_MASK_EVIDENCE" "Refined manifest not found: $Manifest" }
if (!(Test-Path -LiteralPath $Script -PathType Leaf)) { Fail "HARNESS" "Missing support suppression v2 harness: $Script" }

$Refined = Get-Content -LiteralPath $Manifest -Raw -Encoding UTF8 | ConvertFrom-Json
if ($Refined.pilot_id -ne "P3B-M3D01-DC-ZY-SZ-31001") { Fail "REFINED_MASK_EVIDENCE" "Pilot identity mismatch" }
if ($Refined.item_id -ne "DC-ZY-SZ-31001") { Fail "REFINED_MASK_EVIDENCE" "Item identity mismatch" }
if ($Refined.authority -ne "EVALUATION_ONLY") { Fail "REFINED_MASK_EVIDENCE" "Authority must remain evaluation-only" }
if ([bool]$Refined.production_registration) { Fail "REFINED_MASK_EVIDENCE" "Production registration is forbidden in P3" }
if ($Refined.gate_state.FRAME_QC -ne "PASS") { Fail "REFINED_MASK_EVIDENCE" "Parent Frame-QC must remain PASS" }
$AcceptedCount = [int]$Refined.refinement.accepted_count
if ($AcceptedCount -lt 16) { Fail "REFINED_MASK_EVIDENCE" "Refined accepted mask count is below 16: $AcceptedCount" }

Write-Host "REFINED_MASK_EVIDENCE=PASS"
Write-Host "parent_refined_masks=$AcceptedCount"
Write-Host "parent_refined_manifest=$Manifest"

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

& $PythonExe -c "import cv2,numpy; from PIL import Image; print('SUPPORT_V2_RUNTIME=PASS')" | Out-Host
if ($LASTEXITCODE -ne 0) { Fail "SUPPORT_V2_RUNTIME" "OpenCV/NumPy/Pillow runtime is not ready" }

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
  $Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $OutputDir = "E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\p3b\DC-ZY-SZ-31001\$Timestamp-support-v2"
}
if (Test-Path -LiteralPath $OutputDir) {
  $Existing = Get-ChildItem -LiteralPath $OutputDir -Force -ErrorAction SilentlyContinue
  if ($Existing.Count -gt 0) { Fail "OUTPUT_BOUNDARY" "Output directory must be empty: $OutputDir" }
}

& $PythonExe $Script --refined-dir $RefinedDir --out $OutputDir --item-id "DC-ZY-SZ-31001" | Out-Host
if ($LASTEXITCODE -ne 0) { Fail "SUPPORT_V2" "Deterministic support suppression v2 failed" }

Write-Host "P3B_SUPPORT_V2_WINDOWS_GATE=AUTO_CANDIDATE_READY"
Write-Host "RECONSTRUCTION=BLOCKED_UNTIL_SUPPORT_V2_HUMAN_GATE_PASS"
Write-Host "next_gate=WOOD_ONLY_MASK_SUPPORT_V2_HUMAN_VISUAL_GATE"
Write-Host "output_dir=$OutputDir"
