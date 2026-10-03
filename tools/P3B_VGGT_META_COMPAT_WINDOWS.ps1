param(
  [string]$Stage = "E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\p3b\DC-ZY-SZ-31001\20261003-001219-approved-recon-eval-input",
  [string]$PythonExe = "D:\AI\TOOLS\DC_Video2Twin\venv-py310\Scripts\python.exe"
)
# No throw, Stop, exit, network, installs or model forward. One output JSON.
$ErrorActionPreference = "Continue"
$Script = Join-Path $PSScriptRoot "p3b_vggt_commercial_meta_compat.py"
Write-Host "===== P3-B OFFLINE VGGT COMMERCIAL META COMPATIBILITY ====="
Write-Host "AUTHORITY=EVALUATION_ONLY"
Write-Host "GPU_MODEL_LOAD=NOT_EXECUTED"
Write-Host "RECONSTRUCTION=NOT_EXECUTED"
$Ready = (
  (Test-Path -LiteralPath $Stage -PathType Container) -and
  (Test-Path -LiteralPath (Join-Path $Stage "approved_trial_input_manifest.json") -PathType Leaf) -and
  (Test-Path -LiteralPath (Join-Path $Stage "engine_deep_probe_offline_20261003-131150.json") -PathType Leaf) -and
  (Test-Path -LiteralPath $PythonExe -PathType Leaf) -and
  (Test-Path -LiteralPath $Script -PathType Leaf)
)
if (!$Ready) {
  Write-Host "PREFLIGHT=FAIL_MISSING_LOCAL_EVIDENCE_OR_RUNTIME"
  Write-Host "STAGE_EXISTS=$(Test-Path -LiteralPath $Stage)"
  Write-Host "PYTHON_EXISTS=$(Test-Path -LiteralPath $PythonExe)"
  Write-Host "SCRIPT_EXISTS=$(Test-Path -LiteralPath $Script)"
  Write-Host "TERMINAL_REMAINS_OPEN"
  return
}
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$Out = Join-Path $Stage "engine_meta_compat_$Stamp.json"
$Log = Join-Path $Stage "engine_meta_compat_$Stamp.log"
if ((Test-Path -LiteralPath $Out) -or (Test-Path -LiteralPath $Log)) {
  Write-Host "PREFLIGHT=FAIL_OUTPUT_COLLISION"
  Write-Host "TERMINAL_REMAINS_OPEN"
  return
}
Write-Host "PREFLIGHT=PASS"
Write-Host "OUTPUT=$Out"
Write-Host "LOG=$Log"
Write-Host "CHECKPOINT_FULL_HASH=RUNNING_READ_ONLY"
& $PythonExe $Script --stage $Stage --output $Out *> $Log
$Status = $LASTEXITCODE
Write-Host "===== RESULT SUMMARY ====="
if (Test-Path -LiteralPath $Log) {
  Get-Content -LiteralPath $Log |
    Select-String -Pattern "P3B_VGGT_META_COMPAT_PROBE=", "MODEL_SOURCE_SHA256=", "COMMERCIAL_WEIGHT_SHA256=", "META_COMPATIBILITY=", "META_KEYS_MATCH=", "META_MISSING=", "META_EXTRA=", "META_SHAPE_MISMATCH=", "FP16_PARAMETER_ONLY_GIB=", "META_PROBE_JSON=", "error_type=", "error_summary=" |
    ForEach-Object { Write-Host $_.Line }
}
if ($Status -ne 0 -or !(Test-Path -LiteralPath $Out -PathType Leaf)) {
  Write-Host "META_COMPATIBILITY_GATE=FAILED"
  Write-Host "GPU_MODEL_LOAD=NOT_EXECUTED"
  Write-Host "TERMINAL_REMAINS_OPEN"
  return
}
Write-Host "META_COMPATIBILITY_GATE=CHECK_RESULT"
Write-Host "META_PROBE_JSON=$Out"
Write-Host "NEXT=INSPECT_FULL_JSON_BEFORE_OPTIONAL_TWO_VIEW_GPU_SMOKE"
Write-Host "GPU_MODEL_LOAD=NOT_EXECUTED"
Write-Host "RECONSTRUCTION=NOT_EXECUTED"
Write-Host "TERMINAL_REMAINS_OPEN"
