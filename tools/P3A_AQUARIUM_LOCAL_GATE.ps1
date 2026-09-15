param(
  [Parameter(Mandatory=$true)][string]$Piece,
  [Parameter(Mandatory=$true)][string]$Aquarium,
  [Parameter(Mandatory=$true)][string]$PieceSha256,
  [Parameter(Mandatory=$true)][string]$AquariumSha256,
  [string]$OutputDir = "E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\p3a\DC-ZY-SZ-31001",
  [switch]$ProbeOnly
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$PythonScript = Join-Path $PSScriptRoot "p3a_aquarium_identity_baseline.py"

function Fail([string]$Code, [string]$Message) {
  Write-Host "$Code=FAIL"
  throw $Message
}

Write-Host "P3A_LOCAL_GATE=START"
Write-Host "pilot_id=P3A-QA01-DC-ZY-SZ-31001"
Write-Host "authority=EVALUATION_ONLY"
Write-Host "production_registration=false"
Write-Host "pdp_blocking=false"

if (!(Test-Path -LiteralPath $Piece -PathType Leaf)) { Fail "SOURCE_IDENTITY" "Piece file not found: $Piece" }
if (!(Test-Path -LiteralPath $Aquarium -PathType Leaf)) { Fail "FIXED_SOURCE_PACKAGE" "Aquarium plate not found: $Aquarium" }
if (!(Test-Path -LiteralPath $PythonScript -PathType Leaf)) { Fail "HARNESS" "Missing harness: $PythonScript" }

$ActualPieceSha = (Get-FileHash -Algorithm SHA256 -LiteralPath $Piece).Hash.ToLowerInvariant()
$ActualAquariumSha = (Get-FileHash -Algorithm SHA256 -LiteralPath $Aquarium).Hash.ToLowerInvariant()
if ($ActualPieceSha -ne $PieceSha256.ToLowerInvariant()) { Fail "SOURCE_IDENTITY" "Piece SHA mismatch" }
if ($ActualAquariumSha -ne $AquariumSha256.ToLowerInvariant()) { Fail "FIXED_SOURCE_PACKAGE" "Aquarium SHA mismatch" }

$Python = Get-Command python -ErrorAction SilentlyContinue
if (!$Python) { $Python = Get-Command py -ErrorAction SilentlyContinue }
if (!$Python) { Fail "PYTHON_RUNTIME" "Python not available in PATH" }

$PythonExe = $Python.Source
if ($Python.Name -eq "py.exe") {
  & $PythonExe -3 -c "from PIL import Image; print('PIL=PASS')" | Out-Host
  if ($LASTEXITCODE -ne 0) { Fail "PIL_RUNTIME" "Pillow import failed" }
} else {
  & $PythonExe -c "from PIL import Image; print('PIL=PASS')" | Out-Host
  if ($LASTEXITCODE -ne 0) { Fail "PIL_RUNTIME" "Pillow import failed" }
}

Write-Host "SOURCE_IDENTITY=PASS"
Write-Host "FIXED_SOURCE_PACKAGE=PASS"
Write-Host "piece_sha256=$ActualPieceSha"
Write-Host "aquarium_sha256=$ActualAquariumSha"

if ($ProbeOnly) {
  Write-Host "P3A_LOCAL_GATE=PROBE_PASS"
  Write-Host "next_gate=BOUNDED_ENGINE_BENCHMARK"
  exit 0
}

if (Test-Path -LiteralPath $OutputDir) {
  $Existing = Get-ChildItem -LiteralPath $OutputDir -Force -ErrorAction SilentlyContinue
  if ($Existing.Count -gt 0) { Fail "OUTPUT_BOUNDARY" "Output directory must be empty: $OutputDir" }
} else {
  New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
}

$Args = @(
  $PythonScript,
  "--piece", $Piece,
  "--aquarium", $Aquarium,
  "--piece-sha256", $PieceSha256,
  "--aquarium-sha256", $AquariumSha256,
  "--out", $OutputDir,
  "--item-id", "DC-ZY-SZ-31001"
)
if ($Python.Name -eq "py.exe") { $Args = @("-3") + $Args }

& $PythonExe @Args | Out-Host
if ($LASTEXITCODE -ne 0) { Fail "P3A_BASELINE" "Deterministic Aquarium baseline failed" }

Write-Host "P3A_LOCAL_GATE=PASS"
Write-Host "next_gate=HUMAN_VISUAL_GATE"
