param(
  [string]$ManifestPath = "E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\p3b\DC-ZY-SZ-31001\20261002-224710-sam31-30frame-evaluation-object-verified\evaluation_manifest.json",
  [string]$PythonExe = "D:\AI\TOOLS\DC_Video2Twin\venv-py310\Scripts\python.exe",
  [string]$OutputDir = ""
)

# Explicit owner approval in the current chat authorizes an isolated evaluation
# only. This gate never starts reconstruction, edits source files, or uses network.
# Keep VS Code's PowerShell terminal alive on ALL failure paths.
$ErrorActionPreference = "Continue"
$ItemRoot = "E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\p3b\DC-ZY-SZ-31001"
$StageScript = Join-Path $PSScriptRoot "p3b_sam31_approved_recon_input.py"
$ProbeScript = Join-Path $PSScriptRoot "p3b_reconstruction_engine_probe.py"

Write-Host "===== P3-B APPROVED MASKS -> ISOLATED 3D STAGE ====="
Write-Host "AUTHORIZATION=OWNER_EXPLICIT_APPROVAL_EVALUATION_ONLY"
Write-Host "RECONSTRUCTION=NOT_EXECUTED"
Write-Host "SOURCE_MUTATIONS=FORBIDDEN"
Write-Host "PRODUCTION_REGISTRATION=FORBIDDEN"
Write-Host "NETWORK_ACCESS=NOT_REQUIRED"
Write-Host "PDP=UNCHANGED"

$Ready = (
  (Test-Path -LiteralPath $ManifestPath -PathType Leaf) -and
  (Test-Path -LiteralPath $PythonExe -PathType Leaf) -and
  (Test-Path -LiteralPath $StageScript -PathType Leaf) -and
  (Test-Path -LiteralPath $ProbeScript -PathType Leaf) -and
  (Test-Path -LiteralPath $ItemRoot -PathType Container)
)
if (!$Ready) {
  Write-Host "PREFLIGHT=FAIL_MISSING_LOCAL_PREREQUISITE"
  Write-Host "MANIFEST_EXISTS=$(Test-Path -LiteralPath $ManifestPath)"
  Write-Host "PYTHON_EXISTS=$(Test-Path -LiteralPath $PythonExe)"
  Write-Host "STAGE_SCRIPT_EXISTS=$(Test-Path -LiteralPath $StageScript)"
  Write-Host "PROBE_SCRIPT_EXISTS=$(Test-Path -LiteralPath $ProbeScript)"
  Write-Host "TERMINAL_REMAINS_OPEN"
  return
}

$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
if ([string]::IsNullOrWhiteSpace($OutputDir)) {
  $OutputDir = Join-Path $ItemRoot "$Stamp-approved-recon-eval-input"
}
if (Test-Path -LiteralPath $OutputDir) {
  Write-Host "PREFLIGHT=FAIL_OUTPUT_ALREADY_EXISTS"
  Write-Host "OUTPUT=$OutputDir"
  Write-Host "TERMINAL_REMAINS_OPEN"
  return
}

$StageLog = Join-Path $ItemRoot "$Stamp-approved-recon-stage.log"
$ProbeLog = Join-Path $ItemRoot "$Stamp-reconstruction-runtime-probe.log"

Write-Host "PREFLIGHT=PASS"
Write-Host "OUTPUT=$OutputDir"
Write-Host "STAGE_LOG=$StageLog"
Write-Host "PROBE_LOG=$ProbeLog"
Write-Host "INPUT_STAGE=RUNNING"
& $PythonExe $StageScript --manifest $ManifestPath --out $OutputDir *> $StageLog
$StageExit = $LASTEXITCODE

if (Test-Path -LiteralPath $StageLog) {
  Get-Content -LiteralPath $StageLog |
    Select-String -Pattern "P3B_HUMAN_GATE=", "STAGED_IMAGE_MASK_PAIRS=", "TRIAL_INPUT_STAGE=", "TRIAL_RECEIPT=", "error_type=", "error_summary=" |
    ForEach-Object { Write-Host $_.Line }
}

if ($StageExit -ne 0) {
  Write-Host "STAGE=FAILED_NO_ENGINE_PROBE"
  Write-Host "RECONSTRUCTION=NOT_EXECUTED"
  Write-Host "TERMINAL_REMAINS_OPEN"
  return
}

Write-Host "RECON_ENGINE_PROBE=RUNNING"
& $PythonExe $ProbeScript --stage $OutputDir *> $ProbeLog
$ProbeExit = $LASTEXITCODE
if (Test-Path -LiteralPath $ProbeLog) {
  Get-Content -LiteralPath $ProbeLog |
    Select-String -Pattern "P3B_RECON_ENGINE_PROBE=", "VERIFIED_STAGED_PAIRS=", "TORCH_CUDA=", "PACKAGE_", "VGGT_SOURCE_CANDIDATES=", "MODEL_FOLDER_CANDIDATES=", "ENGINE_PROBE_JSON=", "error_type=", "error_summary=" |
    ForEach-Object { Write-Host $_.Line }
}
if ($ProbeExit -ne 0) {
  Write-Host "PROBE=FAILED_STAGE_PRESERVED"
  Write-Host "RECONSTRUCTION=NOT_EXECUTED"
  Write-Host "TERMINAL_REMAINS_OPEN"
  return
}
Write-Host "RECON_INPUT_AND_ENGINE_DISCOVERY=COMPLETE"
Write-Host "RECEIPT=$(Join-Path $OutputDir 'approved_trial_input_manifest.json')"
Write-Host "PROBE_JSON=$(Join-Path $OutputDir 'engine_probe.json')"
Write-Host "NEXT=VALIDATE_SPECIFIC_EXISTING_ENGINE_ENTRYPOINT_AND_GPU_BUDGET"
Write-Host "RECONSTRUCTION=NOT_EXECUTED"
Write-Host "TERMINAL_REMAINS_OPEN"
