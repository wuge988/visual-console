param(
  [Parameter(Mandatory=$true)][string]$SupportV3Dir,
  [Parameter(Mandatory=$true)][string]$OutputDir,
  [Parameter(Mandatory=$true)][string]$Checkpoint,
  [string]$PythonExe = "D:\AI\TOOLS\DC_SAM31\venv-py312\Scripts\python.exe",
  [string]$HfHome = "D:\AI\MODELS\HuggingFace",
  [string]$TextPrompt = "driftwood"
)

$ErrorActionPreference = "Continue"
$Harness = Join-Path $PSScriptRoot "p3b_sam31_six_frame_diagnostic.py"

Write-Host "P3B_SAM31_SIX_FRAME_DIAG=START"
Write-Host "authority=EVALUATION_ONLY"
Write-Host "diagnostic_only=true"
Write-Host "propagation_direction=forward"
Write-Host "max_frames=6"
Write-Host "production_registration=false"
Write-Host "pdp_blocking=false"
Write-Host "RECONSTRUCTION=BLOCKED"

if (!(Test-Path -LiteralPath $SupportV3Dir -PathType Container)) {
  Write-Host "P3B_SAM31_SIX_FRAME_DIAG=FAILED"
  Write-Host "reason=SUPPORT_V3_DIRECTORY_MISSING"
  return
}
if (!(Test-Path -LiteralPath (Join-Path $SupportV3Dir "evaluation_manifest.json") -PathType Leaf)) {
  Write-Host "P3B_SAM31_SIX_FRAME_DIAG=FAILED"
  Write-Host "reason=SUPPORT_V3_MANIFEST_MISSING"
  return
}
if (!(Test-Path -LiteralPath $Harness -PathType Leaf)) {
  Write-Host "P3B_SAM31_SIX_FRAME_DIAG=FAILED"
  Write-Host "reason=DIAGNOSTIC_SCRIPT_MISSING"
  return
}
if (!(Test-Path -LiteralPath $PythonExe -PathType Leaf)) {
  Write-Host "P3B_SAM31_SIX_FRAME_DIAG=FAILED"
  Write-Host "reason=PYTHON_RUNTIME_MISSING"
  return
}
if (!(Test-Path -LiteralPath $Checkpoint -PathType Leaf)) {
  Write-Host "P3B_SAM31_SIX_FRAME_DIAG=FAILED"
  Write-Host "reason=LOCAL_CHECKPOINT_MISSING"
  return
}
if (!(Test-Path -LiteralPath $HfHome -PathType Container)) {
  Write-Host "P3B_SAM31_SIX_FRAME_DIAG=FAILED"
  Write-Host "reason=HF_HOME_MISSING"
  return
}
if (Test-Path -LiteralPath $OutputDir) {
  $existing = @(Get-ChildItem -LiteralPath $OutputDir -Force -ErrorAction SilentlyContinue)
  if ($existing.Count -gt 0) {
    Write-Host "P3B_SAM31_SIX_FRAME_DIAG=FAILED"
    Write-Host "reason=OUTPUT_DIRECTORY_NOT_EMPTY"
    return
  }
}

$oldHfHome = $env:HF_HOME
$env:HF_HOME = $HfHome
$diagnosticExit = 1
try {
  & $PythonExe $Harness --support-v3-dir $SupportV3Dir --checkpoint $Checkpoint --out $OutputDir --text-prompt $TextPrompt --item-id "DC-ZY-SZ-31001"
  $diagnosticExit = $LASTEXITCODE
} finally {
  $env:HF_HOME = $oldHfHome
}

if ($diagnosticExit -ne 0) {
  Write-Host "P3B_SAM31_SIX_FRAME_DIAG=FAILED"
  Write-Host "RECONSTRUCTION=BLOCKED"
  Write-Host "terminal_remains_open=true"
  return
}

Write-Host "P3B_SAM31_SIX_FRAME_DIAG=COMPLETE"
Write-Host "diagnostic_manifest=$(Join-Path $OutputDir 'diagnostic_manifest.json')"
Write-Host "next_gate=REVIEW_OBJECT_TELEMETRY_NOT_HUMAN_MASK_GATE"
Write-Host "RECONSTRUCTION=BLOCKED"
Write-Host "terminal_remains_open=true"
