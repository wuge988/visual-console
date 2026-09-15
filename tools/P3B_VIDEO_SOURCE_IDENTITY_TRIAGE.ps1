param(
  [string]$OutputDir = "",
  [string]$PythonExe = ""
)

$ErrorActionPreference = "Stop"
$PilotId = "P3B-M3D01-DC-ZY-SZ-31001"
$RejectedSha = "a322cd09820af0fe7d3092101d7660787853c7b2979c7e207c3be5e0bf4778aa"
$TriageScript = Join-Path $PSScriptRoot "p3b_video_source_identity_triage.py"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$SiteConfigPath = Join-Path $RepoRoot "config\sites\drift-curio.json"
$PreferredPython = "D:\AI\TOOLS\DC_Video2Twin\venv-py310\Scripts\python.exe"

function Fail([string]$Code, [string]$Message) {
  Write-Host "$Code=FAIL"
  throw $Message
}

Write-Host "P3B_VIDEO_SOURCE_IDENTITY_TRIAGE_GATE=START"
Write-Host "pilot_id=$PilotId"
Write-Host "authority=EVALUATION_ONLY"
Write-Host "production_registration=false"
Write-Host "pdp_blocking=false"
Write-Host "reshoot_required=false"
Write-Host "known_rejected_sha256=$RejectedSha"

if (!(Test-Path -LiteralPath $TriageScript -PathType Leaf)) { Fail "HARNESS" "Missing triage harness: $TriageScript" }
if (!(Test-Path -LiteralPath $SiteConfigPath -PathType Leaf)) { Fail "SITE_CONFIG" "Missing site config: $SiteConfigPath" }

$Site = Get-Content -LiteralPath $SiteConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$Roots = @(
  $Site.raw_root,
  $Site.asset_root,
  $Site.work_root,
  $Site.control_root,
  "D:\AI\WORK",
  "D:\AI\OUTPUT_STAGING",
  (Join-Path $env:USERPROFILE "Desktop"),
  "D:\Users\Administrator\Desktop"
) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Container) } | Sort-Object -Unique

if ($Roots.Count -eq 0) { Fail "SOURCE_ROOTS" "No bounded source roots exist" }
Write-Host "SOURCE_ROOTS=PASS"
$Roots | ForEach-Object { Write-Host "root=$_" }

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

& $PythonExe -c "import cv2; from PIL import Image; print('TRIAGE_RUNTIME=PASS')" | Out-Host
if ($LASTEXITCODE -ne 0) { Fail "TRIAGE_RUNTIME" "OpenCV/Pillow runtime is not ready" }

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
  $Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $OutputDir = "E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\p3b\DC-ZY-SZ-31001\$Timestamp-source-identity-triage"
}
if (Test-Path -LiteralPath $OutputDir) {
  $Existing = Get-ChildItem -LiteralPath $OutputDir -Force -ErrorAction SilentlyContinue
  if ($Existing.Count -gt 0) { Fail "OUTPUT_BOUNDARY" "Output directory must be empty: $OutputDir" }
}

$Args = @(
  $TriageScript,
  "--out", $OutputDir,
  "--rejected-sha", $RejectedSha,
  "--max-videos", "40",
  "--samples-per-video", "4"
)
foreach ($Root in $Roots) {
  $Args += @("--root", $Root)
}

& $PythonExe @Args | Out-Host
if ($LASTEXITCODE -ne 0) { Fail "VIDEO_SOURCE_IDENTITY_TRIAGE" "Video source identity triage failed" }

Write-Host "P3B_VIDEO_SOURCE_IDENTITY_TRIAGE_GATE=READY"
Write-Host "RECONSTRUCTION=BLOCKED"
Write-Host "next_gate=VIDEO_SOURCE_CONTENT_IDENTITY_HUMAN_GATE"
Write-Host "output_dir=$OutputDir"
