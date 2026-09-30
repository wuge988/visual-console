param(
  [Parameter(Mandatory = $true)][string]$Video,
  [Parameter(Mandatory = $true)][string]$VideoSha256,
  [string]$OutputDir = "",
  [string]$PythonExe = ""
)

$ErrorActionPreference = "Stop"
$PilotId = "P3B-M3D01-DC-ZY-SZ-31001"
$Harness = Join-Path $PSScriptRoot "p3b_replacement_source_identity.py"
$PreferredPython = "D:\AI\TOOLS\DC_Video2Twin\venv-py310\Scripts\python.exe"

function Fail([string]$Code, [string]$Message) {
  Write-Host "$Code=FAIL"
  throw $Message
}

Write-Host "P3B_REPLACEMENT_SOURCE_IDENTITY_GATE=START"
Write-Host "pilot_id=$PilotId"
Write-Host "authority=EVALUATION_ONLY"
Write-Host "production_registration=false"
Write-Host "pdp_blocking=false"

if (!(Test-Path -LiteralPath $Video -PathType Leaf)) { Fail "VIDEO_SOURCE" "Replacement video not found: $Video" }
if (!(Test-Path -LiteralPath $Harness -PathType Leaf)) { Fail "HARNESS" "Missing replacement identity harness: $Harness" }

$ActualSha = (Get-FileHash -LiteralPath $Video -Algorithm SHA256).Hash.ToLowerInvariant()
$ExpectedSha = $VideoSha256.Trim().ToLowerInvariant()
if ($ActualSha -ne $ExpectedSha) { Fail "VIDEO_SOURCE" "SHA256 mismatch. expected=$ExpectedSha actual=$ActualSha" }
Write-Host "VIDEO_SOURCE_SHA256=PASS"
Write-Host "video_sha256=$ActualSha"

if ([string]::IsNullOrWhiteSpace($PythonExe)) {
  if (Test-Path -LiteralPath $PreferredPython -PathType Leaf) {
    $PythonExe = $PreferredPython
    Write-Host "PYTHON_SELECTION=PREFERRED_ISOLATED_VIDEO2TWIN_RUNTIME"
  } else {
    $Python = Get-Command python -ErrorAction SilentlyContinue
    if (!$Python) { $Python = Get-Command py -ErrorAction SilentlyContinue }
    if (!$Python) { Fail "PYTHON_RUNTIME" "Python not available" }
    $PythonExe = $Python.Source
    Write-Host "PYTHON_SELECTION=PATH_FALLBACK"
  }
}
if (!(Test-Path -LiteralPath $PythonExe -PathType Leaf)) { Fail "PYTHON_RUNTIME" "Python executable not found: $PythonExe" }

& $PythonExe -c "import cv2; from PIL import Image; print('SOURCE_IDENTITY_RUNTIME=PASS')" | Out-Host
if ($LASTEXITCODE -ne 0) { Fail "SOURCE_IDENTITY_RUNTIME" "OpenCV/Pillow runtime is not ready" }

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
  $Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $OutputDir = "E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\p3b\DC-ZY-SZ-31001\$Timestamp-replacement-source-identity"
}
if (Test-Path -LiteralPath $OutputDir) {
  $Existing = Get-ChildItem -LiteralPath $OutputDir -Force -ErrorAction SilentlyContinue
  if ($Existing.Count -gt 0) { Fail "OUTPUT_BOUNDARY" "Output directory must be empty: $OutputDir" }
}

& $PythonExe $Harness --video $Video --video-sha256 $ExpectedSha --out $OutputDir --samples 8 | Out-Host
if ($LASTEXITCODE -ne 0) { Fail "REPLACEMENT_SOURCE_IDENTITY" "Replacement source identity evidence generation failed" }

Write-Host "P3B_REPLACEMENT_SOURCE_IDENTITY_GATE=READY"
Write-Host "FRAME_QC=BLOCKED_UNTIL_SOURCE_CONTENT_IDENTITY_PASS"
Write-Host "RECONSTRUCTION=BLOCKED"
Write-Host "next_gate=VIDEO_SOURCE_CONTENT_IDENTITY_HUMAN_GATE"
Write-Host "output_dir=$OutputDir"
