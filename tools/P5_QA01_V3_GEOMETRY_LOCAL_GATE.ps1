param(
  [Parameter(Mandatory=$true)][string]$RepoRoot,
  [Parameter(Mandatory=$true)][string]$Branch,
  [Parameter(Mandatory=$true)][string]$PriorEvidenceDir,
  [Parameter(Mandatory=$true)][string]$ExpectedHead,
  [string]$SiteId = 'drift-curio',
  [string]$Sku = 'DC-ZY-SZ-31001'
)

$ErrorActionPreference = 'Stop'

function Fail([string]$Message) {
  Write-Host 'P5_QA01_V32_GEOMETRY_MATERIALIZATION_LOCAL_GATE=FAIL' -ForegroundColor Red
  Write-Host "error=$Message" -ForegroundColor Red
  exit 1
}

function Read-Utf8Json([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "UTF8_JSON_FILE_MISSING:$Path"
  }
  $utf8Strict = New-Object System.Text.UTF8Encoding($false, $true)
  try {
    $text = [System.IO.File]::ReadAllText($Path, $utf8Strict)
  }
  catch {
    throw "UTF8_JSON_DECODE_FAILED:${Path}:$($_.Exception.Message)"
  }
  try {
    return ($text | ConvertFrom-Json)
  }
  catch {
    throw "UTF8_JSON_PARSE_FAILED:${Path}:$($_.Exception.Message)"
  }
}

function File-Sha256([string]$Path) {
  return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

try {
  $RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
  Set-Location $RepoRoot

  $top = (& git rev-parse --show-toplevel).Trim()
  if ((Resolve-Path -LiteralPath $top).Path -ne $RepoRoot) { Fail 'REPO_ROOT_MISMATCH' }
  $dirty = @(& git status --porcelain=v1 --untracked-files=all)
  if ($dirty.Count -gt 0) { Fail ('WORKTREE_NOT_CLEAN:' + ($dirty -join ' | ')) }
  $head = (& git rev-parse HEAD).Trim()
  if ($head -ne $ExpectedHead) { Fail "HEAD_MISMATCH:expected=$ExpectedHead:actual=$head" }
  $branchNow = (& git branch --show-current).Trim()
  if ($branchNow -ne $Branch) { Fail "WRONG_BRANCH:expected=$Branch:actual=$branchNow" }

  $registryPath = Join-Path $RepoRoot 'config\workflows\registry.json'
  $registry = Read-Utf8Json $registryPath
  $qa01 = @($registry.workflows | Where-Object { $_.code -eq 'QA01' })
  if ($qa01.Count -ne 1 -or $qa01[0].workflow_status -ne 'NOT_REGISTERED' -or [bool]$qa01[0].executable) {
    Fail 'QA01_REGISTRY_MUST_REMAIN_FAIL_CLOSED'
  }
  $sitePath = Join-Path $RepoRoot ("config\sites\{0}.json" -f $SiteId)
  $site = Read-Utf8Json $sitePath
  if (@($site.enabled_workflows) -contains 'QA01') { Fail 'QA01_MUST_REMAIN_DISABLED' }

  $prior = (Resolve-Path -LiteralPath $PriorEvidenceDir).Path
  $source = Join-Path $prior 'source_sc01.png'
  $base = Join-Path $prior 'candidate.png'
  $materialBoard = Join-Path $prior 'realism_material_board.png'
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { Fail "V32_SOURCE_SC01_MISSING:$source" }
  if (-not (Test-Path -LiteralPath $base -PathType Leaf)) { Fail "V32_D53_BASE_MISSING:$base" }
  if (-not (Test-Path -LiteralPath $materialBoard -PathType Leaf)) { Fail "V32_REALISM_MATERIAL_BOARD_MISSING:$materialBoard" }

  $expectedSourceSha = 'f31c77589ab71874655744f8f5dc92f2ece77fbf5b7b52f22e53476836a62399'
  $expectedBaseSha = '79c78c8ba14f168c96b112ba50ccee27dedea168b13ebb36156e51838dd99117'
  $expectedMaterialBoardSha = '53be649505d76cce1980b97ae77996af410a5b08844f0316a5e124c3c7c17f3c'
  $expectedV31ForegroundSha = '726220184280d7a1ee1b3c9097063ef34e4ead950c68b7b7b09783bd25998308'
  $expectedV31RenderSha = '66a3ef87e1ba80cebe6782a0f0735cc8c763db385870d0db68c690430c17c1ff'

  $sourceSha = File-Sha256 $source
  $baseSha = File-Sha256 $base
  $materialBoardSha = File-Sha256 $materialBoard
  if ($sourceSha -ne $expectedSourceSha) { Fail "V32_SOURCE_SC01_SHA_MISMATCH:actual=$sourceSha" }
  if ($baseSha -ne $expectedBaseSha) { Fail "V32_D53_BASE_SHA_MISMATCH:actual=$baseSha" }
  if ($materialBoardSha -ne $expectedMaterialBoardSha) { Fail "V32_REALISM_BOARD_SHA_MISMATCH:actual=$materialBoardSha" }

  $pythonCandidates = New-Object System.Collections.Generic.List[string]
  foreach ($candidate in @(
      'D:\AI\APPS\ComfyUI_windows_portable\python_embeded\python.exe',
      'D:\AI\APPS\ComfyUI_windows_portable\python_embedded\python.exe'
    )) {
    if (Test-Path -LiteralPath $candidate -PathType Leaf) { $pythonCandidates.Add($candidate) }
  }
  $pythonCmd = Get-Command python.exe -ErrorAction SilentlyContinue
  if ($pythonCmd -and $pythonCmd.Source) { $pythonCandidates.Add($pythonCmd.Source) }
  $python = $null
  foreach ($candidate in $pythonCandidates) {
    & $candidate -c "from PIL import Image" 2>$null
    if ($LASTEXITCODE -eq 0) { $python = $candidate; break }
  }
  if (-not $python) { Fail 'V32_PILLOW_RUNTIME_NOT_FOUND' }

  $controlRoot = [string]$site.control_root
  if ([string]::IsNullOrWhiteSpace($controlRoot)) { Fail 'V32_CONTROL_ROOT_MISSING' }
  $evidenceRoot = Join-Path $controlRoot 'evidence'
  New-Item -ItemType Directory -Force -Path $evidenceRoot | Out-Null

  # v3.1 is a HUMAN-APPROVED immutable artifact. Do not ask Eevee to reproduce it.
  # Renderer output can vary at the byte/pixel level even with the same script and
  # explicit random seeds. v3.2 therefore discovers the exact accepted artifact by
  # the two frozen hashes and reuses those bytes directly.
  Write-Host '==> Locate immutable Human-PASS v3.1 artifacts by frozen SHA256' -ForegroundColor Cyan
  $accepted = $null
  $candidates = @(
    Get-ChildItem -LiteralPath $evidenceRoot -Directory -Filter 'P5_QA01_V31_GEOMETRY_*' -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -notmatch '_V32_' } |
      Sort-Object LastWriteTime -Descending
  )
  foreach ($candidateDir in $candidates) {
    $candidateSource = Join-Path $candidateDir.FullName 'source_sc01.png'
    $candidateBackplate = Join-Path $candidateDir.FullName 'prior_d53_backplate.png'
    $candidateForeground = Join-Path $candidateDir.FullName 'foreground_geometry_plate.png'
    $candidateAlpha = Join-Path $candidateDir.FullName 'foreground_alpha.png'
    $candidateFinal = Join-Path $candidateDir.FullName 'geometry_occlusion_proof.png'
    $required = @($candidateSource, $candidateBackplate, $candidateForeground, $candidateAlpha, $candidateFinal)
    if (@($required | Where-Object { -not (Test-Path -LiteralPath $_ -PathType Leaf) }).Count -gt 0) { continue }

    if ((File-Sha256 $candidateForeground) -ne $expectedV31ForegroundSha) { continue }
    if ((File-Sha256 $candidateFinal) -ne $expectedV31RenderSha) { continue }
    if ((File-Sha256 $candidateSource) -ne $expectedSourceSha) { continue }
    if ((File-Sha256 $candidateBackplate) -ne $expectedBaseSha) { continue }

    $accepted = $candidateDir.FullName
    break
  }
  if (-not $accepted) {
    Fail "V32_ACCEPTED_V31_EVIDENCE_NOT_FOUND:foreground=$expectedV31ForegroundSha:final=$expectedV31RenderSha"
  }

  Write-Host "ACCEPTED_V31_EVIDENCE=$accepted" -ForegroundColor Green
  Write-Host "ACCEPTED_V31_FOREGROUND_SHA256=$expectedV31ForegroundSha"
  Write-Host "ACCEPTED_V31_FINAL_SHA256=$expectedV31RenderSha"

  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  # Keep the V31 prefix because the materializer validates that its baseline input
  # is an accepted v3.1 evidence shape; the V32 suffix makes the new evaluation
  # output distinct and prevents it from being rediscovered as the human-approved source.
  $evidence = Join-Path $evidenceRoot ("P5_QA01_V31_GEOMETRY_V32_MATERIALIZATION_{0}" -f $stamp)
  New-Item -ItemType Directory -Path $evidence | Out-Null

  foreach ($name in @(
      'source_sc01.png',
      'prior_d53_backplate.png',
      'foreground_geometry_plate.png',
      'foreground_alpha.png',
      'geometry_occlusion_proof.png'
    )) {
    Copy-Item -LiteralPath (Join-Path $accepted $name) -Destination (Join-Path $evidence $name)
  }
  [System.IO.File]::WriteAllText(
    (Join-Path $evidence 'accepted_v31_provenance.txt'),
    ("accepted_v31_evidence={0}`nforeground_sha256={1}`nfinal_sha256={2}`n" -f $accepted, $expectedV31ForegroundSha, $expectedV31RenderSha),
    (New-Object System.Text.UTF8Encoding($false))
  )

  $materializer = Join-Path $RepoRoot 'tools\p5_qa01_v32_materialize.py'
  if (-not (Test-Path -LiteralPath $materializer -PathType Leaf)) { Fail "V32_MATERIALIZER_MISSING:$materializer" }

  # ComfyUI's Windows embeddable Python uses an isolated ._pth layout and does not
  # reliably add the script directory to sys.path. D5.3 already proved the required
  # launch contract: explicitly insert repo/tools before runpy executes sibling-module imports.
  $toolsDir = Join-Path $RepoRoot 'tools'
  $bootstrap = Join-Path $env:TEMP ("P5_QA01_V32_BOOTSTRAP_" + $ExpectedHead.Trim().Substring(0,12) + ".py")
  $launcher = @'
import runpy
import sys
tools = sys.argv.pop(1)
script = sys.argv.pop(1)
if tools not in sys.path:
    sys.path.insert(0, tools)
sys.argv[0] = script
sys.stdout.write("P5_V32_PYTHON_BOOTSTRAP=TOOLS_DIR_INSERTED\n")
sys.stdout.flush()
runpy.run_path(script, run_name="__main__")
'@
  [System.IO.File]::WriteAllText($bootstrap, $launcher, (New-Object System.Text.UTF8Encoding($false)))

  Write-Host '==> Materialize only immutable renderer-established foreground proxies with Kontext' -ForegroundColor Cyan
  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $materializerOutput = @(
      & $python -B $bootstrap $toolsDir $materializer `
        --repo-root $RepoRoot `
        --site-id $SiteId `
        --sku $Sku `
        --v31-evidence-dir $evidence `
        --d53-evidence-dir $prior `
        --expected-head $ExpectedHead 2>&1
    )
    $materializerCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousPreference
    if (Test-Path -LiteralPath $bootstrap) {
      Remove-Item -LiteralPath $bootstrap -Force -ErrorAction SilentlyContinue
    }
  }
  $materializerOutput | ForEach-Object { Write-Host ([string]$_) }
  if ($materializerCode -ne 0) { Fail "V32_MATERIALIZATION_FAILED:exit=$materializerCode" }

  $materialized = Join-Path $evidence 'geometry_occlusion_materialized.png'
  $materializationReview = Join-Path $evidence 'materialization_review.html'
  $materializationMask = Join-Path $evidence 'foreground_materialization_mask.png'
  if (-not (Test-Path -LiteralPath $materialized -PathType Leaf)) { Fail 'V32_MATERIALIZED_OUTPUT_MISSING' }
  if (-not (Test-Path -LiteralPath $materializationReview -PathType Leaf)) { Fail 'V32_MATERIALIZATION_REVIEW_MISSING' }
  if (-not (Test-Path -LiteralPath $materializationMask -PathType Leaf)) { Fail 'V32_MATERIALIZATION_MASK_MISSING' }

  $materializedSha = File-Sha256 $materialized
  Start-Process $materializationReview

  Write-Host 'P5_QA01_V32_GEOMETRY_MATERIALIZATION_LOCAL_GATE=PASS' -ForegroundColor Green
  Write-Host "git_head=$head"
  Write-Host "sku=$Sku"
  Write-Host 'v31_human_visual_gate=PASS_REGISTRATION_AND_RENDERER_OCCLUSION'
  Write-Host 'v31_baseline_mode=IMMUTABLE_ACCEPTED_ARTIFACT_REUSE'
  Write-Host "accepted_v31_evidence_dir=$accepted"
  Write-Host "accepted_v31_foreground_sha256=$expectedV31ForegroundSha"
  Write-Host "accepted_v31_final_sha256=$expectedV31RenderSha"
  Write-Host 'architecture=GEOMETRY_LOCKED_FOREGROUND_MATERIALIZATION'
  Write-Host 'foreground_occupancy_decided_by_renderer_before_diffusion=true'
  Write-Host 'blender_invoked_for_v32=false'
  Write-Host 'embedded_python_tools_bootstrap=true'
  Write-Host 'outside_materialization_pixel_exact=true'
  Write-Host 'intact_donor_conditioned=false'
  Write-Host 'realism_material_board_conditioned=true'
  Write-Host 'evaluation_only=true'
  Write-Host 'production_authorized=false'
  Write-Host 'qa01_enabled=false'
  Write-Host 'production_mutation=NONE'
  Write-Host "materializer_python=$python"
  Write-Host "materialized_sha256=$materializedSha"
  Write-Host "review_file=$materializationReview"
  Write-Host "evidence_dir=$evidence"
  exit 0
}
catch {
  Fail $_.Exception.Message
}
