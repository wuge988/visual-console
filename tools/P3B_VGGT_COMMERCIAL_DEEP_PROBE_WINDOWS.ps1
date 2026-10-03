param(
  [string]$Stage = "E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\p3b\DC-ZY-SZ-31001\20261003-001219-approved-recon-eval-input",
  [string]$PythonExe = "D:\AI\TOOLS\DC_Video2Twin\venv-py310\Scripts\python.exe"
)
# Terminal-safe, additive JSON inventory only. Never starts VGGT inference.
$ErrorActionPreference = "Continue"
$Script = Join-Path $PSScriptRoot "p3b_vggt_commercial_deep_probe.py"
Write-Host "===== P3-B VGGT COMMERCIAL OFFLINE DEEP PROBE ====="
Write-Host "AUTHORITY=EVALUATION_ONLY"
Write-Host "SOURCE_MUTATIONS=FORBIDDEN"
Write-Host "NETWORK_ACCESS=NOT_REQUIRED"
Write-Host "DOWNLOADS_AND_INSTALLS=FORBIDDEN"
Write-Host "GPU_INFERENCE=NOT_EXECUTED"
Write-Host "RECONSTRUCTION=NOT_EXECUTED"

$Ready = (
  (Test-Path -LiteralPath $Stage -PathType Container) -and
  (Test-Path -LiteralPath (Join-Path $Stage "approved_trial_input_manifest.json") -PathType Leaf) -and
  (Test-Path -LiteralPath (Join-Path $Stage "engine_probe.json") -PathType Leaf) -and
  (Test-Path -LiteralPath $PythonExe -PathType Leaf) -and
  (Test-Path -LiteralPath $Script -PathType Leaf)
)
if (!$Ready) {
  Write-Host "PREFLIGHT=FAIL_MISSING_PREREQUISITE"
  Write-Host "STAGE_EXISTS=$(Test-Path -LiteralPath $Stage)"
  Write-Host "PYTHON_EXISTS=$(Test-Path -LiteralPath $PythonExe)"
  Write-Host "PROBE_SCRIPT_EXISTS=$(Test-Path -LiteralPath $Script)"
  Write-Host "TERMINAL_REMAINS_OPEN"
  return
}
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$Out = Join-Path $Stage "engine_deep_probe_$Stamp.json"
$Log = Join-Path $Stage "engine_deep_probe_$Stamp.log"
if ((Test-Path -LiteralPath $Out) -or (Test-Path -LiteralPath $Log)) {
  Write-Host "PREFLIGHT=FAIL_OUTPUT_COLLISION"
  Write-Host "TERMINAL_REMAINS_OPEN"
  return
}
Write-Host "PREFLIGHT=PASS"
Write-Host "OUTPUT=$Out"
Write-Host "LOG=$Log"
& $PythonExe $Script --stage $Stage --output $Out *> $Log
$ProbeExit = $LASTEXITCODE
if (Test-Path -LiteralPath $Log) {
  Get-Content -LiteralPath $Log |
    Select-String -Pattern "P3B_VGGT_COMMERCIAL_DEEP_PROBE=", "INPUT_HASHED_PAIRS=", "VGGT_IMPORT=", "WEIGHT_", "FREE_VRAM_GIB=", "SOURCE_CANDIDATE_COUNT=", "DEEP_PROBE_JSON=", "error_type=", "error_summary=", "GPU_INFERENCE=", "RECONSTRUCTION=" |
    ForEach-Object { Write-Host $_.Line }
}
if ($ProbeExit -ne 0 -or !(Test-Path -LiteralPath $Out -PathType Leaf)) {
  Write-Host "DEEP_PROBE=FAILED"
  Write-Host "GPU_INFERENCE=NOT_EXECUTED"
  Write-Host "RECONSTRUCTION=NOT_EXECUTED"
  Write-Host "TERMINAL_REMAINS_OPEN"
  return
}
Write-Host "DEEP_PROBE=COMPLETE"
Write-Host "PROBE_JSON=$Out"
Write-Host "NEXT=PIN_ENGINE_ENTRYPOINT_THEN_PLAN_BOUNDED_GPU_SMOKE"
Write-Host "GPU_INFERENCE=NOT_EXECUTED"
Write-Host "RECONSTRUCTION=NOT_EXECUTED"
Write-Host "TERMINAL_REMAINS_OPEN"
