param(
  [Parameter(Mandatory=$true)][string]$Video,
  [Parameter(Mandatory=$true)][string]$VideoSha256,
  [string]$OutputDir = "E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\p3b\DC-ZY-SZ-31001",
  [string]$PythonExe = "",
  [switch]$ProbeOnly
)

$ErrorActionPreference = "Stop"
$FrameQcScript = Join-Path $PSScriptRoot "p3b_video_frame_qc.py"
$PreferredPython = "D:\AI\TOOLS\DC_Video2Twin\venv-py310\Scripts\python.exe"
$FrameQcSampleFps = 8.0
$FrameQcWindow = 3
$FrameQcMaxFrames = 30

function Fail([string]$Code, [string]$Message) {
  Write-Host "$Code=FAIL"
  throw $Message
}

Write-Host "P3B_WINDOWS_GATE=START"
Write-Host "pilot_id=P3B-M3D01-DC-ZY-SZ-31001"
Write-Host "authority=EVALUATION_ONLY"
Write-Host "production_registration=false"
Write-Host "pdp_blocking=false"

if (!(Test-Path -LiteralPath $Video -PathType Leaf)) { Fail "VIDEO_SOURCE" "Source video not found: $Video" }
if (!(Test-Path -LiteralPath $FrameQcScript -PathType Leaf)) { Fail "HARNESS" "Missing frame QC harness: $FrameQcScript" }

$ActualSha = (Get-FileHash -Algorithm SHA256 -LiteralPath $Video).Hash.ToLowerInvariant()
if ($ActualSha -ne $VideoSha256.ToLowerInvariant()) { Fail "VIDEO_SOURCE" "Source video SHA mismatch" }
Write-Host "VIDEO_SOURCE=PASS"
Write-Host "video_sha256=$ActualSha"

$Prefix = @()
if ([string]::IsNullOrWhiteSpace($PythonExe)) {
  if (Test-Path -LiteralPath $PreferredPython -PathType Leaf) {
    $PythonExe = $PreferredPython
    Write-Host "PYTHON_SELECTION=PREFERRED_ISOLATED_VIDEO2TWIN_RUNTIME"
  } else {
    $Python = Get-Command python -ErrorAction SilentlyContinue
    if (!$Python) { $Python = Get-Command py -ErrorAction SilentlyContinue }
    if (!$Python) { Fail "PYTHON_RUNTIME" "Python not available and preferred isolated runtime is missing" }
    $PythonExe = $Python.Source
    if ($Python.Name -eq "py.exe") { $Prefix = @("-3") }
    Write-Host "PYTHON_SELECTION=PATH_FALLBACK"
  }
}
if (!(Test-Path -LiteralPath $PythonExe -PathType Leaf)) { Fail "PYTHON_RUNTIME" "Python executable not found: $PythonExe" }
Write-Host "python=$PythonExe"

& $PythonExe @Prefix -c "import cv2, numpy; from PIL import Image; print('FRAME_QC_RUNTIME=PASS')" | Out-Host
if ($LASTEXITCODE -ne 0) { Fail "FRAME_QC_RUNTIME" "cv2/numpy/Pillow runtime is not ready" }

$Ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
$Ffprobe = Get-Command ffprobe -ErrorAction SilentlyContinue
if ($Ffmpeg) { Write-Host "FFMPEG=PASS" } else { Write-Host "FFMPEG=OPTIONAL_MISSING" }
if ($Ffprobe) { Write-Host "FFPROBE=PASS" } else { Write-Host "FFPROBE=OPTIONAL_MISSING" }

# Mask / reconstruction runtimes are probed but never auto-installed here.
& $PythonExe @Prefix -c "import importlib.util as i; print('TORCH=' + ('PASS' if i.find_spec('torch') else 'MISSING')); print('SAM2=' + ('PASS' if i.find_spec('sam2') else 'MISSING')); print('GSPLAT=' + ('PASS' if i.find_spec('gsplat') else 'MISSING'))" | Out-Host
if ($LASTEXITCODE -ne 0) { Fail "RUNTIME_PROBE" "Runtime probe failed" }
Write-Host "FRAME_QC_PROFILE=sample_fps=$FrameQcSampleFps;window=$FrameQcWindow;max_frames=$FrameQcMaxFrames;minimum=16"

if ($ProbeOnly) {
  Write-Host "P3B_WINDOWS_GATE=PROBE_PASS"
  Write-Host "next_gate=FRAME_QC_EXECUTION"
  exit 0
}

if (Test-Path -LiteralPath $OutputDir) {
  $Existing = Get-ChildItem -LiteralPath $OutputDir -Force -ErrorAction SilentlyContinue
  if ($Existing.Count -gt 0) { Fail "OUTPUT_BOUNDARY" "Output directory must be empty: $OutputDir" }
} else {
  New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
}

$Args = @(
  $FrameQcScript,
  "--video", $Video,
  "--video-sha256", $VideoSha256,
  "--out", $OutputDir,
  "--item-id", "DC-ZY-SZ-31001",
  "--sample-fps", "$FrameQcSampleFps",
  "--window", "$FrameQcWindow",
  "--max-frames", "$FrameQcMaxFrames"
)
& $PythonExe @Prefix @Args | Out-Host
if ($LASTEXITCODE -ne 0) { Fail "FRAME_QC" "Low-touch frame QC failed" }

Write-Host "P3B_WINDOWS_GATE=FRAME_QC_PASS"
Write-Host "WOOD_ONLY_MASK=PENDING_PHYSICAL_GATE"
Write-Host "RECONSTRUCTION=BLOCKED_UNTIL_MASK_HUMAN_GATE_PASS"
Write-Host "next_gate=WOOD_ONLY_MASK_WINDOWS_PHYSICAL_GATE"
