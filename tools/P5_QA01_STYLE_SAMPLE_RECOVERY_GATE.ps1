param(
  [string]$SiteId = "drift-curio",
  [string]$Sku = "DC-ZY-SZ-31001",
  [string]$ExpectedHead = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$ExpectedBranch = "feat/p5-qa01-scene-freeze"
$ComfyRoot = "D:\AI\APPS\ComfyUI_windows_portable"
$Seeds = [ordered]@{ A = [int64]41073101; B = [int64]41073102; C = [int64]41073103 }

function Invoke-Git {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
  $previous = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $output = @(& git @Args 2>&1)
    $code = $LASTEXITCODE
  } finally { $ErrorActionPreference = $previous }
  if ($code -ne 0) {
    throw ("GIT_FAILED: git " + ($Args -join " ") + " :: " + (($output | ForEach-Object { [string]$_ }) -join " | "))
  }
  return @($output | ForEach-Object { [string]$_ })
}

function Read-JsonUtf8([string]$Path) {
  $text = [IO.File]::ReadAllText($Path, [Text.Encoding]::UTF8)
  if ($text.Length -gt 0 -and [int][char]$text[0] -eq 0xFEFF) { $text = $text.Substring(1) }
  return $text | ConvertFrom-Json -ErrorAction Stop
}

function Get-FileSha256([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Assert-Inside([string]$Root, [string]$Candidate, [string]$ErrorCode) {
  $rootFull = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
  $candidateFull = [IO.Path]::GetFullPath($Candidate)
  if (-not $candidateFull.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)) {
    throw ("${ErrorCode}: root=" + $rootFull + " candidate=" + $candidateFull)
  }
}

function Invoke-Compositor([string]$Python, [string]$Source, [string]$Background, [string]$Output, [string]$Mode, [string]$Report) {
  $previous = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $lines = @(& $Python (Join-Path $RepoRoot "tools\p5_qa01_compose.py") --source $Source --background $Background --output $Output --mode $Mode --report $Report 2>&1)
    $code = $LASTEXITCODE
  } finally { $ErrorActionPreference = $previous }
  if ($code -ne 0) {
    throw ("QA01_COMPOSITOR_FAILED: mode=" + $Mode + " :: " + (($lines | ForEach-Object { [string]$_ }) -join " | "))
  }
  if (-not (Test-Path -LiteralPath $Output -PathType Leaf)) { throw "QA01_COMPOSITE_OUTPUT_MISSING" }
  if (-not (Test-Path -LiteralPath $Report -PathType Leaf)) { throw "QA01_COMPOSITE_REPORT_MISSING" }
}

function Find-RecoverableEvidence([string]$EvidenceRoot) {
  $dirs = @(Get-ChildItem -LiteralPath $EvidenceRoot -Directory -Filter "P5_QA01_STYLE_SAMPLE_*" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
  foreach ($dir in $dirs) {
    $source = Join-Path $dir.FullName "source_sc01.png"
    $a = Join-Path $dir.FullName "background_A.png"
    $b = Join-Path $dir.FullName "background_B.png"
    $c = Join-Path $dir.FullName "background_C.png"
    if ((Test-Path -LiteralPath $source -PathType Leaf) -and
        (Test-Path -LiteralPath $a -PathType Leaf) -and
        (Test-Path -LiteralPath $b -PathType Leaf) -and
        (Test-Path -LiteralPath $c -PathType Leaf)) {
      return $dir.FullName
    }
  }
  throw "NO_RECOVERABLE_STYLE_SAMPLE_EVIDENCE"
}

try {
  Set-Location $RepoRoot
  $repo = ((Invoke-Git rev-parse --show-toplevel) -join "").Trim()
  if ([IO.Path]::GetFullPath($repo) -ne [IO.Path]::GetFullPath($RepoRoot)) { throw "REPO_ROOT_MISMATCH" }
  $dirty = @((Invoke-Git status --porcelain) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ($dirty.Count -gt 0) { throw ("WORKTREE_NOT_CLEAN :: " + ($dirty -join " | ")) }
  $branch = ((Invoke-Git branch --show-current) -join "").Trim()
  if ($branch -ne $ExpectedBranch) { throw "WRONG_BRANCH: expected=$ExpectedBranch actual=$branch" }
  $head = ((Invoke-Git rev-parse HEAD) -join "").Trim()
  if (-not [string]::IsNullOrWhiteSpace($ExpectedHead) -and $head -ne $ExpectedHead.Trim()) {
    throw "HEAD_MISMATCH: expected=$($ExpectedHead.Trim()) actual=$head"
  }

  $profile = Read-JsonUtf8 (Join-Path $RepoRoot ("config\sites\" + $SiteId + ".json"))
  if (@($profile.enabled_workflows) -contains "QA01") { throw "QA01_MUST_REMAIN_DISABLED_DURING_STYLE_RECOVERY" }
  $controlRoot = [string]$profile.control_root
  if ([string]::IsNullOrWhiteSpace($controlRoot)) { throw "CONTROL_ROOT_MISSING" }
  $evidenceRoot = Join-Path $controlRoot "evidence"
  $evidenceDir = Find-RecoverableEvidence $evidenceRoot
  Assert-Inside $evidenceRoot $evidenceDir "RECOVERY_EVIDENCE_OUTSIDE_CONTROL_ROOT"

  $manifestPath = Join-Path ([string]$profile.manifest_root) ($Sku + ".json")
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw "STYLE_SAMPLE_MANIFEST_NOT_FOUND" }
  $manifest = Read-JsonUtf8 $manifestPath
  $declaredSku = [string]$manifest.sku
  if (-not [string]::IsNullOrWhiteSpace($declaredSku) -and $declaredSku -ne $Sku) { throw "STYLE_SAMPLE_MANIFEST_SKU_MISMATCH" }

  $entries = @($manifest.archive_history | Where-Object {
    [string]$_.gate -eq "15" -and
    [string]$_.workflow_code -eq "SC01" -and
    [string]$_.destination_key -eq "cutout" -and
    [string]$_.result -eq "VERIFIED_ARCHIVE"
  } | Sort-Object { [string]$_.archived_at } -Descending)
  if ($entries.Count -lt 1) { throw "VERIFIED_SC01_ARCHIVE_HISTORY_NOT_FOUND" }
  $sourceEntry = $entries[0]
  $sourcePath = [IO.Path]::GetFullPath([string]$sourceEntry.destination_path)
  Assert-Inside ([string]$profile.asset_root) $sourcePath "SC01_SOURCE_OUTSIDE_ASSET_ROOT"
  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) { throw "VERIFIED_SC01_SOURCE_MISSING" }
  $expectedSize = [int64]$sourceEntry.size_bytes
  $expectedSha = ([string]$sourceEntry.sha256).ToLowerInvariant()
  $sourceInfo = Get-Item -LiteralPath $sourcePath
  if ([int64]$sourceInfo.Length -ne $expectedSize) { throw "VERIFIED_SC01_SIZE_MISMATCH" }
  $sourceSha = Get-FileSha256 $sourcePath
  if ($sourceSha -ne $expectedSha) { throw "VERIFIED_SC01_SHA256_MISMATCH" }

  $sourceCopy = Join-Path $evidenceDir "source_sc01.png"
  if ((Get-FileSha256 $sourceCopy) -ne $sourceSha) { throw "RECOVERY_SC01_COPY_SHA256_MISMATCH" }

  $python = Join-Path $ComfyRoot "python_embeded\python.exe"
  if (-not (Test-Path -LiteralPath $python -PathType Leaf)) { throw "COMFYUI_PYTHON_NOT_FOUND" }
  if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot "tools\p5_qa01_compose.py") -PathType Leaf)) { throw "QA01_COMPOSITOR_SCRIPT_NOT_FOUND" }

  # Use ordinary PowerShell arrays intentionally. Windows PowerShell 5.1 can throw
  # "Argument types do not match" when @() materializes List[object].
  $backgrounds = @()
  foreach ($pair in $Seeds.GetEnumerator()) {
    $label = [string]$pair.Key
    $backgroundPath = Join-Path $evidenceDir ("background_" + $label + ".png")
    if (-not (Test-Path -LiteralPath $backgroundPath -PathType Leaf)) { throw ("RECOVERY_BACKGROUND_MISSING:" + $label) }
    if ([int64](Get-Item -LiteralPath $backgroundPath).Length -lt 1024) { throw ("RECOVERY_BACKGROUND_TOO_SMALL:" + $label) }
    $backgrounds += [pscustomobject]@{
      label = $label
      seed = [int64]$pair.Value
      prompt_id = "legacy-failed-run-not-persisted"
      path = $backgroundPath
      sha256 = Get-FileSha256 $backgroundPath
      size_bytes = [int64](Get-Item -LiteralPath $backgroundPath).Length
      recovered = $true
    }
  }

  $candidates = @()
  foreach ($background in $backgrounds) {
    foreach ($placement in @(
      [pscustomobject]@{ suffix = "1"; mode = "natural"; name = "Natural" },
      [pscustomobject]@{ suffix = "2"; mode = "hero"; name = "Hero" }
    )) {
      $candidateLabel = [string]$background.label + [string]$placement.suffix
      Write-Host ("==> Recover composite " + $candidateLabel) -ForegroundColor Cyan
      $output = Join-Path $evidenceDir ("candidate_" + $candidateLabel + ".png")
      $report = Join-Path $evidenceDir ("candidate_" + $candidateLabel + ".json")
      Invoke-Compositor $python $sourceCopy ([string]$background.path) $output ([string]$placement.mode) $report
      $detail = Read-JsonUtf8 $report
      $candidates += [pscustomobject]@{
        label = $candidateLabel
        background = [string]$background.label
        seed = [int64]$background.seed
        placement = [string]$placement.name
        mode = [string]$placement.mode
        path = $output
        sha256 = Get-FileSha256 $output
        size_bytes = [int64](Get-Item -LiteralPath $output).Length
        transform = $detail.transform
      }
    }
  }

  if ($candidates.Count -ne 6) { throw ("RECOVERY_CANDIDATE_COUNT_MISMATCH:" + $candidates.Count) }

  $reportObject = [ordered]@{
    schema_version = "1.1-recovery"
    at = (Get-Date).ToString("o")
    site_id = $SiteId
    sku = $Sku
    git_head = $head
    qa01_enabled = $false
    production_mutation = "NONE"
    recovery = [ordered]@{
      reason = "WINDOWS_POWERSHELL_5_1_GENERIC_LIST_ARRAY_MATERIALIZATION"
      backgrounds_reused = $true
      reran_sdxl = $false
      original_prompt_ids_persisted = $false
      note = "Style-only recovery. Fixed seed mapping is retained; no production provenance is claimed."
    }
    source = [ordered]@{
      archive_asset_id = [string]$sourceEntry.asset_id
      archived_at = [string]$sourceEntry.archived_at
      destination_path = $sourcePath
      size_bytes = $expectedSize
      sha256 = $sourceSha
      evidence_copy = $sourceCopy
    }
    generation = [ordered]@{
      canvas = "1024x1024"
      steps = 28
      cfg = 6.0
      sampler = "dpmpp_2m"
      scheduler = "karras"
      seeds = [ordered]@{ A = [int64]41073101; B = [int64]41073102; C = [int64]41073103 }
      backgrounds = $backgrounds
    }
    candidates = $candidates
  }
  [IO.File]::WriteAllText((Join-Path $evidenceDir "style_sample_gate.json"), ($reportObject | ConvertTo-Json -Depth 12), (New-Object System.Text.UTF8Encoding($false)))

  $cards = New-Object System.Text.StringBuilder
  foreach ($candidate in $candidates) {
    $null = $cards.AppendLine(("<article class='card'><h3>" + $candidate.label + " · " + $candidate.placement + "</h3><img src='candidate_" + $candidate.label + ".png' alt='QA01 candidate " + $candidate.label + "'><p>Background " + $candidate.background + " · seed " + $candidate.seed + "</p></article>"))
  }

  $html = @"
<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QA01 Aquarium Style Gate</title><style>
:root{color-scheme:dark;font-family:Inter,"Segoe UI","Microsoft YaHei",sans-serif;background:#0e1114;color:#f3f1ec}body{margin:0;padding:28px;background:#0e1114}.wrap{max-width:1500px;margin:auto}.meta{background:#171b20;border:1px solid #2d333a;border-radius:14px;padding:18px 20px;margin-bottom:20px;line-height:1.65}.source{display:grid;grid-template-columns:minmax(280px,520px) 1fr;gap:22px;align-items:start;margin-bottom:24px}.checker{background-color:#171b20;background-image:linear-gradient(45deg,#20252b 25%,transparent 25%),linear-gradient(-45deg,#20252b 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#20252b 75%),linear-gradient(-45deg,transparent 75%,#20252b 75%);background-size:28px 28px;background-position:0 0,0 14px,14px -14px,-14px 0;border:1px solid #2d333a;border-radius:14px;padding:10px}.checker img{display:block;width:100%;height:auto}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.card{background:#171b20;border:1px solid #2d333a;border-radius:14px;padding:12px}.card h3{margin:4px 4px 10px;font-size:18px}.card img{width:100%;height:auto;display:block;border-radius:9px;background:#20252b}.card p{margin:10px 4px 2px;color:#b9b7b1}.warn{color:#e8c98e}.accept{font-size:18px}.small{color:#aaa7a0;font-size:14px}@media(max-width:1000px){.grid{grid-template-columns:1fr 1fr}.source{grid-template-columns:1fr}}@media(max-width:650px){.grid{grid-template-columns:1fr}body{padding:14px}}
</style></head><body><main class="wrap"><h1>QA01 Aquarium · 首轮隔离场景视觉 Gate</h1><section class="meta"><div><strong>STYLE ONLY / 非生产资产</strong> · QA01 仍 disabled · 不写 Manifest / F / 生产 journal</div><div class="warn">已复用上一轮成功生成的 A/B/C 背景；本次只修复 PowerShell 5.1 类型兼容并重新合成，没有再次运行 SDXL。</div></section><section class="source"><div class="checker"><img src="source_sc01.png" alt="Verified SC01 source"></div><div class="meta accept"><strong>人工审核标准</strong><br>① 必须还是同一块沉木：枝杈、孔洞、外轮廓和比例不变。<br>② Aquarium 背景中央不能出现另一块假沉木/树根/木头。<br>③ 前景不能遮挡主体。<br>④ 尺寸和落地位置要自然。<br>⑤ 风格应偏真实、高级、克制的水族场景，不要奇幻 CGI 感。<br><br><strong>请只选一个：</strong> A1 / A2 / B1 / B2 / C1 / C2；如果都不合格，直接说“全部拒绝 + 原因”。<br><span class="small">1 = Natural placement，2 = Hero placement。</span></div></section><section class="grid">$($cards.ToString())</section></main></body></html>
"@
  $reviewHtml = Join-Path $evidenceDir "review.html"
  [IO.File]::WriteAllText($reviewHtml, $html, (New-Object System.Text.UTF8Encoding($false)))
  Start-Process $reviewHtml

  $summary = @(
    "P5_QA01_STYLE_SAMPLE_RECOVERY_GATE=PASS",
    ("git_head=" + $head),
    ("sku=" + $Sku),
    ("source_sc01_sha256=" + $sourceSha),
    ("backgrounds_reused=True"),
    ("reran_sdxl=False"),
    ("candidate_labels=A1,A2,B1,B2,C1,C2"),
    ("qa01_enabled=False"),
    ("production_mutation=NONE"),
    ("review_file=" + $reviewHtml),
    ("evidence_dir=" + $evidenceDir)
  )
  [IO.File]::WriteAllLines((Join-Path $evidenceDir "summary.txt"), $summary, [Text.Encoding]::UTF8)
  if (Get-Command Set-Clipboard -ErrorAction SilentlyContinue) {
    try { Set-Clipboard -Value ($summary -join [Environment]::NewLine) } catch {}
  }
  $summary | ForEach-Object { Write-Host $_ }
  Write-Host "Recovered review page opened. No SDXL rerun was performed." -ForegroundColor Yellow
  exit 0
} catch {
  $summary = @(
    "P5_QA01_STYLE_SAMPLE_RECOVERY_GATE=FAIL",
    ("error=" + $_.Exception.Message)
  )
  if (Get-Command Set-Clipboard -ErrorAction SilentlyContinue) {
    try { Set-Clipboard -Value ($summary -join [Environment]::NewLine) } catch {}
  }
  $summary | ForEach-Object { Write-Host $_ -ForegroundColor Red }
  exit 1
}
