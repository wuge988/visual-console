param(
  [string]$Stage = "E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\p3b\DC-ZY-SZ-31001\20261003-001219-approved-recon-eval-input",
  [string]$PythonExe = "D:\AI\TOOLS\DC_Video2Twin\venv-py310\Scripts\python.exe",
  [switch]$RunGpuSmoke,
  [switch]$ConfirmCommercialTerms
)
# Default is evidence-only preflight. Explicit RunGpuSmoke starts one isolated GPU attempt.
# Keep the user's PowerShell terminal open on all error paths.
$ErrorActionPreference = "Continue"
$Script = Join-Path $PSScriptRoot "p3b_vggt_commercial_2view_smoke.py"
$Meta = Join-Path $Stage "engine_meta_compat_20261003-160951.json"
$Helper = Join-Path $PSScriptRoot "p3b_vggt_commercial_meta_compat.py"
Write-Host "===== P3-B VGGT COMMERCIAL TWO-VIEW EVALUATION ====="
Write-Host "AUTHORITY=ISOLATED_EVALUATION_ONLY"
Write-Host "INPUT_FRAMES=0,5"
Write-Host "MAX_PROCESS_GPU_FRACTION=0.75"
Write-Host "RECONSTRUCTION=NOT_EXECUTED"
Write-Host "ARCHIVE=BLOCKED"
Write-Host "PDP=UNCHANGED"
$Ready = (
  (Test-Path -LiteralPath $Stage -PathType Container) -and
  (Test-Path -LiteralPath $Meta -PathType Leaf) -and
  (Test-Path -LiteralPath $Script -PathType Leaf) -and
  (Test-Path -LiteralPath $Helper -PathType Leaf) -and
  (Test-Path -LiteralPath $PythonExe -PathType Leaf)
)
if (!$Ready) {
  Write-Host "PREFLIGHT=FAIL_LOCAL_PREREQUISITES"
  Write-Host "STAGE_EXISTS=$(Test-Path -LiteralPath $Stage)"
  Write-Host "META_EXISTS=$(Test-Path -LiteralPath $Meta)"
  Write-Host "HELPER_EXISTS=$(Test-Path -LiteralPath $Helper)"
  Write-Host "PYTHON_EXISTS=$(Test-Path -LiteralPath $PythonExe)"
  Write-Host "TERMINAL_REMAINS_OPEN"
  return
}
if ($RunGpuSmoke -and !$ConfirmCommercialTerms) {
  Write-Host "COMMERCIAL_LICENSE_CONFIRMATION=REQUIRED_BEFORE_GPU"
  Write-Host "TERMINAL_REMAINS_OPEN"
  return
}
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$OutputDir = Join-Path $Stage "two_view_eval_$Stamp"
$Log = Join-Path $Stage "two_view_eval_$Stamp.log"
if ((Test-Path -LiteralPath $OutputDir) -or (Test-Path -LiteralPath $Log)) {
  Write-Host "OUTPUT_COLLISION=BLOCKED"
  Write-Host "TERMINAL_REMAINS_OPEN"
  return
}
Write-Host "OUTPUT=$OutputDir"
Write-Host "LOG=$Log"
if (!$RunGpuSmoke) {
  Write-Host "MODE=EVIDENCE_PREFLIGHT_ONLY"
  & $PythonExe $Script --stage $Stage --meta $Meta --out $OutputDir --preflight-only *> $Log
} else {
  Write-Host "MODE=ONE_GPU_CAMERA_SMOKE"
  & $PythonExe $Script --stage $Stage --meta $Meta --out $OutputDir --license-confirmed *> $Log
}
$Result = $LASTEXITCODE
Write-Host "===== RESULT SUMMARY ====="
if (Test-Path -LiteralPath $Log) {
  Get-Content -LiteralPath $Log |
    Select-String -Pattern "EVIDENCE_PREFLIGHT=", "SELECTED_FRAMES=", "GPU_SMOKE=", "TWO_VIEW_BASELINE_", "error_summary=", "RESULT_JSON=", "RECONSTRUCTION=", "ARCHIVE=", "PDP=" |
    ForEach-Object { Write-Host $_.Line }
}
if ($Result -ne 0) { Write-Host "RESULT=FAIL_CLOSED_LOG_PRESERVED" }
elseif (!$RunGpuSmoke) { Write-Host "RESULT=EVIDENCE_READY_GPU_NOT_RUN" }
else { Write-Host "RESULT=INSPECT_OUTPUT_JSON" }
Write-Host "TERMINAL_REMAINS_OPEN"
