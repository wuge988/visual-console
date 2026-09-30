param(
  [Parameter(Mandatory=$true)][string]$SupportV2Dir,
  [string]$OutputDir = "",
  [string]$PythonExe = ""
)

$ErrorActionPreference = "Stop"
$Script = Join-Path $PSScriptRoot "p3b_support_suppression_v3.py"
$PreferredPython = "D:\AI\TOOLS\DC_Video2Twin\venv-py310\Scripts\python.exe"

function Fail([string]$Code, [string]$Message) {
  Write-Host "$Code=FAIL"
  throw $Message
}

Write-Host "P3B_SUPPORT_V3_WINDOWS_GATE=START"
Write-Host "pilot_id=P3B-M3D01-DC-ZY-SZ-31001"
Write-Host "authority=EVALUATION_ONLY"
Write-Host "production_registration=false"
Write-Host "pdp_blocking=false"

if (!(Test-Path -LiteralPath $SupportV2Dir -PathType Container)) { Fail "SUPPORT_V2_EVIDENCE" "Support-v2 directory not found: $SupportV2Dir" }
$Manifest = Join-Path $SupportV2Dir "evaluation_manifest.json"
if (!(Test-Path -LiteralPath $Manifest -PathType Leaf)) { Fail "SUPPORT_V2_EVIDENCE" "Support-v2 manifest not found: $Manifest" }
if (!(Test-Path -LiteralPath $Script -PathType Leaf)) { Fail "HARNESS" "Missing support suppression v3 harness: $Script" }

$Parent = Get-Content -LiteralPath $Manifest -Raw -Encoding UTF8 | ConvertFrom-Json
if ($Parent.pilot_id -ne "P3B-M3D01-DC-ZY-SZ-31001") { Fail "SUPPORT_V2_EVIDENCE" "Pilot identity mismatch" }
if ($Parent.item_id -ne "DC-ZY-SZ-31001") { Fail "SUPPORT_V2_EVIDENCE" "Item identity mismatch" }
if ($Parent.authority -ne "EVALUATION_ONLY") { Fail "SUPPORT_V2_EVIDENCE" "Authority must remain evaluation-only" }
if ([bool]$Parent.production_registration) { Fail "SUPPORT_V2_EVIDENCE" "Production registration is forbidden in P3" }
if ($Parent.gate_state.FRAME_QC -ne "PASS") { Fail "SUPPORT_V2_EVIDENCE" "Parent Frame-QC must remain PASS" }
$AcceptedCount = [int]$Parent.support_suppression_v2.accepted_count
if ($AcceptedCount -lt 16) { Fail "SUPPORT_V2_EVIDENCE" "Support-v2 accepted mask count is below 16: $AcceptedCount" }

Write-Host "SUPPORT_V2_EVIDENCE=PASS"
Write-Host "parent_support_v2_masks=$AcceptedCount"
Write-Host "parent_support_v2_manifest=$Manifest"

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

& $PythonExe -c "import cv2,numpy; from PIL import Image; print('SUPPORT_V3_RUNTIME=PASS')" | Out-Host
if ($LASTEXITCODE -ne 0) { Fail "SUPPORT_V3_RUNTIME" "OpenCV/NumPy/Pillow runtime is not ready" }

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
  $Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $OutputDir = "E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\p3b\DC-ZY-SZ-31001\$Timestamp-support-v3"
}
if (Test-Path -LiteralPath $OutputDir) {
  $Existing = Get-ChildItem -LiteralPath $OutputDir -Force -ErrorAction SilentlyContinue
  if ($Existing.Count -gt 0) { Fail "OUTPUT_BOUNDARY" "Output directory must be empty: $OutputDir" }
}

& $PythonExe $Script --support-v2-dir $SupportV2Dir --out $OutputDir --item-id "DC-ZY-SZ-31001" | Out-Host
if ($LASTEXITCODE -ne 0) { Fail "SUPPORT_V3" "Residual support suppression v3 failed" }

Write-Host "P3B_SUPPORT_V3_WINDOWS_GATE=AUTO_CANDIDATE_READY"
Write-Host "RECONSTRUCTION=BLOCKED_UNTIL_SUPPORT_V3_HUMAN_GATE_PASS"
Write-Host "next_gate=WOOD_ONLY_MASK_SUPPORT_V3_HUMAN_VISUAL_GATE"
Write-Host "output_dir=$OutputDir"
