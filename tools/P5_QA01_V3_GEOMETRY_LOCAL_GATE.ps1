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
  $sourceSha = (Get-FileHash -Algorithm SHA256 -LiteralPath $source).Hash.ToLowerInvariant()
  $baseSha = (Get-FileHash -Algorithm SHA256 -LiteralPath $base).Hash.ToLowerInvariant()
  $materialBoardSha = (Get-FileHash -Algorithm SHA256 -LiteralPath $materialBoard).Hash.ToLowerInvariant()
  if ($sourceSha -ne $expectedSourceSha) { Fail "V32_SOURCE_SC01_SHA_MISMATCH:actual=$sourceSha" }
  if ($baseSha -ne $expectedBaseSha) { Fail "V32_D53_BASE_SHA_MISMATCH:actual=$baseSha" }
  if ($materialBoardSha -ne $expectedMaterialBoardSha) { Fail "V32_REALISM_BOARD_SHA_MISMATCH:actual=$materialBoardSha" }

  $blenderCandidates = New-Object System.Collections.Generic.List[string]
  $cmd = Get-Command blender.exe -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) { $blenderCandidates.Add($cmd.Source) }
  foreach ($root in @(
      (Join-Path $env:ProgramFiles 'Blender Foundation'),
      'D:\AI\TOOLS',
      'E:\AI_PROJECTS\TOOLS',
      'E:\AI_PROJECTS\Blender'
    )) {
    if (Test-Path -LiteralPath $root) {
      Get-ChildItem -LiteralPath $root -Filter blender.exe -File -Recurse -ErrorAction SilentlyContinue |
        ForEach-Object { $blenderCandidates.Add($_.FullName) }
    }
  }
  $blender = $blenderCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
  if (-not $blender) {
    Fail 'V32_BLENDER_NOT_FOUND:install_or_provide_Blender_before_geometry_gate'
  }

  $versionLines = @(& $blender --version 2>&1)
  if ($LASTEXITCODE -ne 0) { Fail "V32_BLENDER_VERSION_PROBE_FAILED:exit=$LASTEXITCODE" }
  $version = ($versionLines | Select-Object -First 1).Trim()

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
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $evidence = Join-Path $evidenceRoot ("P5_QA01_V31_GEOMETRY_{0}" -f $stamp)
  New-Item -ItemType Directory -Path $evidence | Out-Null

  $baseCopy = Join-Path $evidence 'prior_d53_backplate.png'
  $sourceCopy = Join-Path $evidence 'source_sc01.png'
  $foreground = Join-Path $evidence 'foreground_geometry_plate.png'
  $alphaPreview = Join-Path $evidence 'foreground_alpha.png'
  $render = Join-Path $evidence 'geometry_occlusion_proof.png'
  $blend = Join-Path $evidence 'geometry_occlusion_proof.blend'
  Copy-Item -LiteralPath $base -Destination $baseCopy
  Copy-Item -LiteralPath $source -Destination $sourceCopy

  $script = Join-Path $RepoRoot 'tools\p5_qa01_v3_geometry_occlusion_blender.py'
  $compositor = Join-Path $RepoRoot 'tools\p5_qa01_v31_composite.py'
  $materializer = Join-Path $RepoRoot 'tools\p5_qa01_v32_materialize.py'
  if (-not (Test-Path -LiteralPath $script -PathType Leaf)) { Fail "V32_BLENDER_SCRIPT_MISSING:$script" }
  if (-not (Test-Path -LiteralPath $compositor -PathType Leaf)) { Fail "V32_COMPOSITOR_MISSING:$compositor" }
  if (-not (Test-Path -LiteralPath $materializer -PathType Leaf)) { Fail "V32_MATERIALIZER_MISSING:$materializer" }

  Write-Host '==> Reproduce accepted v3.1 transparent foreground geometry plate' -ForegroundColor Cyan
  Write-Host "BLENDER=$blender"
  Write-Host "BLENDER_VERSION=$version"
  & $blender -b --python-exit-code 17 --python $script -- `
    --base-scene $baseCopy `
    --source-sc01 $sourceCopy `
    --output $foreground `
    --blend-output $blend
  if ($LASTEXITCODE -ne 0) { Fail "V32_BLENDER_RENDER_FAILED:exit=$LASTEXITCODE" }
  if (-not (Test-Path -LiteralPath $foreground -PathType Leaf)) { Fail 'V32_FOREGROUND_OUTPUT_MISSING' }
  if (-not (Test-Path -LiteralPath $blend -PathType Leaf)) { Fail 'V32_BLEND_OUTPUT_MISSING' }

  Write-Host '==> Reproduce accepted v3.1 exact-backplate composite' -ForegroundColor Cyan
  & $python $compositor `
    --base $baseCopy `
    --foreground $foreground `
    --output $render `
    --alpha-preview $alphaPreview
  if ($LASTEXITCODE -ne 0) { Fail "V32_V31_COMPOSITE_FAILED:exit=$LASTEXITCODE" }
  if (-not (Test-Path -LiteralPath $render -PathType Leaf)) { Fail 'V32_V31_COMPOSITE_OUTPUT_MISSING' }
  if (-not (Test-Path -LiteralPath $alphaPreview -PathType Leaf)) { Fail 'V32_V31_ALPHA_PREVIEW_MISSING' }

  $foregroundSha = (Get-FileHash -Algorithm SHA256 -LiteralPath $foreground).Hash.ToLowerInvariant()
  $renderSha = (Get-FileHash -Algorithm SHA256 -LiteralPath $render).Hash.ToLowerInvariant()
  if ($foregroundSha -ne $expectedV31ForegroundSha) {
    Fail "V32_ACCEPTED_V31_FOREGROUND_REPRO_MISMATCH:expected=$expectedV31ForegroundSha:actual=$foregroundSha"
  }
  if ($renderSha -ne $expectedV31RenderSha) {
    Fail "V32_ACCEPTED_V31_FINAL_REPRO_MISMATCH:expected=$expectedV31RenderSha:actual=$renderSha"
  }

  $review = Join-Path $evidence 'review.html'
  $html = @"
<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>P5 QA01 v3.1 Frozen Baseline</title>
<style>body{font-family:Arial,sans-serif;background:#11161b;color:#eee;margin:24px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.card{background:#1b2229;padding:14px;border:1px solid #333;border-radius:10px;margin-bottom:18px}img{width:100%;height:auto}.plain img{background:white}.checker{background:#202830}.warn{color:#ffcc80}.ok{color:#9fe0b3}code{color:#d5e7ff}</style></head><body>
<h1>P5 QA01 v3.1 — Frozen accepted baseline</h1>
<p class="warn">EVALUATION ONLY / NON-PRODUCTION / QA01 DISABLED</p>
<p class="ok">Registration + renderer occlusion are frozen PASS. This page is retained only as baseline evidence for v3.2.</p>
<div class="grid"><div class="card plain"><h2>D5.3 exact backplate</h2><img src="prior_d53_backplate.png"></div><div class="card plain"><h2>v3.1 accepted proxy composite</h2><img src="geometry_occlusion_proof.png"></div></div>
<div class="grid"><div class="card checker"><h2>Transparent Blender foreground</h2><img src="foreground_geometry_plate.png"></div><div class="card plain"><h2>Foreground alpha</h2><img src="foreground_alpha.png"></div></div>
<div class="card"><p>foreground SHA256: <code>$foregroundSha</code></p><p>v3.1 final SHA256: <code>$renderSha</code></p><p>outside_foreground_pixel_exact=true</p></div>
</body></html>
"@
  Set-Content -LiteralPath $review -Value $html -Encoding UTF8

  Write-Host '==> Materialize only renderer-established foreground proxies with Kontext' -ForegroundColor Cyan
  & $python $materializer `
    --repo-root $RepoRoot `
    --site-id $SiteId `
    --sku $Sku `
    --v31-evidence-dir $evidence `
    --d53-evidence-dir $prior `
    --expected-head $ExpectedHead
  if ($LASTEXITCODE -ne 0) { Fail "V32_MATERIALIZATION_FAILED:exit=$LASTEXITCODE" }

  $materialized = Join-Path $evidence 'geometry_occlusion_materialized.png'
  $materializationReview = Join-Path $evidence 'materialization_review.html'
  $materializationMask = Join-Path $evidence 'foreground_materialization_mask.png'
  if (-not (Test-Path -LiteralPath $materialized -PathType Leaf)) { Fail 'V32_MATERIALIZED_OUTPUT_MISSING' }
  if (-not (Test-Path -LiteralPath $materializationReview -PathType Leaf)) { Fail 'V32_MATERIALIZATION_REVIEW_MISSING' }
  if (-not (Test-Path -LiteralPath $materializationMask -PathType Leaf)) { Fail 'V32_MATERIALIZATION_MASK_MISSING' }

  $materializedSha = (Get-FileHash -Algorithm SHA256 -LiteralPath $materialized).Hash.ToLowerInvariant()
  Start-Process $materializationReview

  Write-Host 'P5_QA01_V32_GEOMETRY_MATERIALIZATION_LOCAL_GATE=PASS' -ForegroundColor Green
  Write-Host "git_head=$head"
  Write-Host "sku=$Sku"
  Write-Host 'v31_human_visual_gate=PASS_REGISTRATION_AND_RENDERER_OCCLUSION'
  Write-Host 'architecture=GEOMETRY_LOCKED_FOREGROUND_MATERIALIZATION'
  Write-Host 'foreground_occupancy_decided_by_renderer_before_diffusion=true'
  Write-Host 'photographic_backplate_passed_through_blender=false'
  Write-Host 'outside_v31_foreground_pixel_exact=true'
  Write-Host 'outside_materialization_pixel_exact=true'
  Write-Host 'intact_donor_conditioned=false'
  Write-Host 'realism_material_board_conditioned=true'
  Write-Host 'evaluation_only=true'
  Write-Host 'production_authorized=false'
  Write-Host 'qa01_enabled=false'
  Write-Host 'production_mutation=NONE'
  Write-Host "blender=$blender"
  Write-Host "blender_version=$version"
  Write-Host "materializer_python=$python"
  Write-Host "accepted_v31_foreground_sha256=$foregroundSha"
  Write-Host "accepted_v31_final_sha256=$renderSha"
  Write-Host "materialized_sha256=$materializedSha"
  Write-Host "baseline_review_file=$review"
  Write-Host "review_file=$materializationReview"
  Write-Host "evidence_dir=$evidence"
  exit 0
}
catch {
  Fail $_.Exception.Message
}
