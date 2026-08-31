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
  Write-Host 'P5_QA01_V3_GEOMETRY_LOCAL_GATE=FAIL' -ForegroundColor Red
  Write-Host "error=$Message" -ForegroundColor Red
  exit 1
}

function Read-Utf8Json([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "UTF8_JSON_FILE_MISSING:$Path"
  }
  # Windows PowerShell 5.1 treats UTF-8-without-BOM as the active ANSI code page when
  # Get-Content is used without -Encoding. The registry contains Chinese text, so that
  # implicit decode can mojibake bytes and make otherwise-valid JSON unparsable.
  # Decode explicitly and fail on malformed UTF-8 instead of silently replacing bytes.
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
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { Fail "V3_SOURCE_SC01_MISSING:$source" }
  if (-not (Test-Path -LiteralPath $base -PathType Leaf)) { Fail "V3_D53_BASE_MISSING:$base" }

  $expectedSourceSha = 'f31c77589ab71874655744f8f5dc92f2ece77fbf5b7b52f22e53476836a62399'
  $expectedBaseSha = '79c78c8ba14f168c96b112ba50ccee27dedea168b13ebb36156e51838dd99117'
  $sourceSha = (Get-FileHash -Algorithm SHA256 -LiteralPath $source).Hash.ToLowerInvariant()
  $baseSha = (Get-FileHash -Algorithm SHA256 -LiteralPath $base).Hash.ToLowerInvariant()
  if ($sourceSha -ne $expectedSourceSha) { Fail "V3_SOURCE_SC01_SHA_MISMATCH:actual=$sourceSha" }
  if ($baseSha -ne $expectedBaseSha) { Fail "V3_D53_BASE_SHA_MISMATCH:actual=$baseSha" }

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
    Fail 'V3_BLENDER_NOT_FOUND:install_or_provide_Blender_before_geometry_gate'
  }

  $versionLines = @(& $blender --version 2>&1)
  if ($LASTEXITCODE -ne 0) { Fail "V3_BLENDER_VERSION_PROBE_FAILED:exit=$LASTEXITCODE" }
  $version = ($versionLines | Select-Object -First 1).Trim()

  $controlRoot = [string]$site.control_root
  if ([string]::IsNullOrWhiteSpace($controlRoot)) { Fail 'V3_CONTROL_ROOT_MISSING' }
  $evidenceRoot = Join-Path $controlRoot 'evidence'
  New-Item -ItemType Directory -Force -Path $evidenceRoot | Out-Null
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $evidence = Join-Path $evidenceRoot ("P5_QA01_V3_GEOMETRY_{0}" -f $stamp)
  New-Item -ItemType Directory -Path $evidence | Out-Null

  $baseCopy = Join-Path $evidence 'prior_d53_backplate.png'
  $sourceCopy = Join-Path $evidence 'source_sc01.png'
  $render = Join-Path $evidence 'geometry_occlusion_proof.png'
  $blend = Join-Path $evidence 'geometry_occlusion_proof.blend'
  Copy-Item -LiteralPath $base -Destination $baseCopy
  Copy-Item -LiteralPath $source -Destination $sourceCopy

  $script = Join-Path $RepoRoot 'tools\p5_qa01_v3_geometry_occlusion_blender.py'
  if (-not (Test-Path -LiteralPath $script -PathType Leaf)) { Fail "V3_BLENDER_SCRIPT_MISSING:$script" }

  Write-Host '==> Run geometry-first Blender proof' -ForegroundColor Cyan
  Write-Host "BLENDER=$blender"
  Write-Host "BLENDER_VERSION=$version"
  & $blender -b --python $script -- `
    --base-scene $baseCopy `
    --source-sc01 $sourceCopy `
    --output $render `
    --blend-output $blend
  if ($LASTEXITCODE -ne 0) { Fail "V3_BLENDER_RENDER_FAILED:exit=$LASTEXITCODE" }
  if (-not (Test-Path -LiteralPath $render -PathType Leaf)) { Fail 'V3_RENDER_OUTPUT_MISSING' }
  if (-not (Test-Path -LiteralPath $blend -PathType Leaf)) { Fail 'V3_BLEND_OUTPUT_MISSING' }

  $renderSha = (Get-FileHash -Algorithm SHA256 -LiteralPath $render).Hash.ToLowerInvariant()
  $review = Join-Path $evidence 'review.html'
  $html = @"
<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>P5 QA01 v3 Geometry-First Review</title>
<style>body{font-family:Arial,sans-serif;background:#11161b;color:#eee;margin:24px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.card{background:#1b2229;padding:14px;border:1px solid #333;border-radius:10px;margin-bottom:18px}img{width:100%;height:auto;background:white}.warn{color:#ffcc80}.ok{color:#9fe0b3}code{color:#d5e7ff}</style></head><body>
<h1>P5 QA01 v3 — Geometry-First Occlusion Proof</h1>
<p class="warn">EVALUATION ONLY / NON-PRODUCTION / QA01 DISABLED</p>
<p class="ok">This proof uses renderer Z-order for foreground hardscape and epiphytes. No diffusion inference and no D6 mask repair.</p>
<div class="grid"><div class="card"><h2>D5.3 Aquarium backplate</h2><img src="prior_d53_backplate.png"></div><div class="card"><h2>Geometry-first proof</h2><img src="geometry_occlusion_proof.png"></div></div>
<div class="card"><h2>Exact SC01 identity source</h2><img src="source_sc01.png"></div>
<div class="card"><h2>Evidence</h2><p>Git HEAD: <code>$head</code></p><p>Blender: <code>$version</code></p><p>source SHA256: <code>$sourceSha</code></p><p>backplate SHA256: <code>$baseSha</code></p><p>render SHA256: <code>$renderSha</code></p></div>
</body></html>
"@
  Set-Content -LiteralPath $review -Value $html -Encoding UTF8

  Start-Process $review
  Write-Host 'P5_QA01_V3_GEOMETRY_LOCAL_GATE=PASS' -ForegroundColor Green
  Write-Host "git_head=$head"
  Write-Host "sku=$Sku"
  Write-Host 'qa01_enabled=false'
  Write-Host 'production_mutation=NONE'
  Write-Host "blender=$blender"
  Write-Host "blender_version=$version"
  Write-Host "render_sha256=$renderSha"
  Write-Host "review_file=$review"
  Write-Host "evidence_dir=$evidence"
  exit 0
}
catch {
  Fail $_.Exception.Message
}
