param(
  [string]$SiteId = "drift-curio",
  [string]$Sku = "DC-ZY-SZ-31001",
  [string]$ExpectedHead = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$ExpectedBranch = "feat/p5-qa01-scene-freeze"
$ModelName = "sd_xl_base_1.0.safetensors"
$ModelSize = [int64]6938078334
$ModelSha256 = "31e35c80fc4829d14f90153f4c74cd59c90b779f6afe05a74cd6120b893f7e5b"
$ComfyRoot = "D:\AI\APPS\ComfyUI_windows_portable"
$ComfyBase = "http://127.0.0.1:8188"
$CanvasWidth = 1024
$CanvasHeight = 1024
$Steps = 28
$Cfg = 6.0
$Sampler = "dpmpp_2m"
$Scheduler = "karras"
$Seeds = [ordered]@{ A = [int64]41073101; B = [int64]41073102; C = [int64]41073103 }
$PositivePrompt = "photorealistic premium freshwater aquascape aquarium, straight-on product display viewpoint, fully underwater scene, dark charcoal aquarium glass background, restrained warm-neutral aquarium lighting, clean fine sand substrate, subtle water caustics, natural river stones and low aquatic plants kept around the outer edges and lower corners, broad unobstructed central foreground and midground reserved for one sculptural display object, realistic water depth, refined editorial aquarium photography, calm negative space, physically plausible glass and substrate, no central object"
$NegativePrompt = "driftwood, wood, wooden, root, roots, branch, branches, log, stump, tree, central sculpture, central object, foreground obstruction, dense plants in center, large rock in center, fish crossing center, animal crossing center, bubbles obscuring center, text, logo, watermark, fantasy, illustration, painting, cartoon, oversaturated, extreme teal, warped glass, fisheye, duplicate objects"

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

function Get-ComfyJson([string]$Path, [int]$TimeoutSec = 45) {
  try {
    $response = Invoke-WebRequest -Uri ($ComfyBase + $Path) -UseBasicParsing -TimeoutSec $TimeoutSec
    if ([int]$response.StatusCode -ne 200) { return $null }
    return $response.Content | ConvertFrom-Json -ErrorAction Stop
  } catch {
    return $null
  }
}

function Get-NodeInfo([string]$Name) {
  $response = Get-ComfyJson ("/object_info/" + [Uri]::EscapeDataString($Name)) 60
  if ($null -eq $response) { return $null }
  $prop = $response.PSObject.Properties[$Name]
  if ($null -ne $prop) { return $prop.Value }
  if ($null -ne $response.PSObject.Properties["input"]) { return $response }
  return $null
}

function Get-EnumOptions($NodeInfo, [string]$InputName) {
  if ($null -eq $NodeInfo) { return @() }
  $required = $NodeInfo.input.required
  if ($null -eq $required) { return @() }
  $prop = $required.PSObject.Properties[$InputName]
  if ($null -eq $prop) { return @() }
  $definition = @($prop.Value)
  if ($definition.Count -eq 0) { return @() }
  $first = $definition[0]
  if ($first -is [string]) { return @([string]$first) }
  return @($first | ForEach-Object { [string]$_ })
}

function Find-VerifiedModel {
  $candidates = @(
    "D:\AI\MODELS\ComfyUI\checkpoints\$ModelName",
    (Join-Path $ComfyRoot ("ComfyUI\models\checkpoints\" + $ModelName))
  )
  foreach ($candidate in $candidates) {
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
    $info = Get-Item -LiteralPath $candidate
    if ([int64]$info.Length -ne $ModelSize) { continue }
    if ((Get-FileSha256 $candidate) -eq $ModelSha256) { return $candidate }
  }
  throw "FROZEN_SDXL_MODEL_IDENTITY_NOT_FOUND"
}

function Post-ComfyPrompt($Workflow, [string]$ClientId) {
  $payload = [ordered]@{ prompt = $Workflow; client_id = $ClientId }
  $json = $payload | ConvertTo-Json -Depth 30 -Compress
  try {
    $response = Invoke-WebRequest -Uri ($ComfyBase + "/prompt") -Method Post -ContentType "application/json" -Body $json -UseBasicParsing -TimeoutSec 90
    if ([int]$response.StatusCode -ne 200) { throw ("PROMPT_HTTP_" + [int]$response.StatusCode) }
    $parsed = $response.Content | ConvertFrom-Json -ErrorAction Stop
    $promptId = [string]$parsed.prompt_id
    if ([string]::IsNullOrWhiteSpace($promptId)) { throw "PROMPT_ID_MISSING" }
    return $promptId
  } catch {
    throw ("COMFY_PROMPT_SUBMIT_FAILED :: " + $_.Exception.Message)
  }
}

function Wait-ComfyImage([string]$PromptId, [int]$TimeoutSeconds = 1200) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $history = Get-ComfyJson ("/history/" + [Uri]::EscapeDataString($PromptId)) 45
    if ($null -ne $history) {
      $row = $null
      $prop = $history.PSObject.Properties[$PromptId]
      if ($null -ne $prop) { $row = $prop.Value }
      elseif ($null -ne $history.PSObject.Properties["outputs"]) { $row = $history }

      if ($null -ne $row) {
        $outputs = $row.outputs
        if ($null -ne $outputs) {
          $preview = $outputs.PSObject.Properties["7"]
          if ($null -ne $preview -and $null -ne $preview.Value.images -and @($preview.Value.images).Count -gt 0) {
            return @($preview.Value.images)[0]
          }
        }
        if ($null -ne $row.status -and $row.status.completed -eq $true) {
          $statusJson = $row.status | ConvertTo-Json -Depth 8 -Compress
          throw ("COMFY_PROMPT_COMPLETED_WITHOUT_PREVIEW :: " + $statusJson)
        }
      }
    }
    Start-Sleep -Seconds 3
  } while ((Get-Date) -lt $deadline)
  throw ("COMFY_PROMPT_TIMEOUT :: prompt_id=" + $PromptId)
}

function Download-ComfyImage($ImageInfo, [string]$Destination) {
  $filename = [string]$ImageInfo.filename
  $subfolder = [string]$ImageInfo.subfolder
  $type = [string]$ImageInfo.type
  if ([string]::IsNullOrWhiteSpace($filename)) { throw "COMFY_PREVIEW_FILENAME_MISSING" }
  if ([string]::IsNullOrWhiteSpace($type)) { $type = "temp" }
  $url = $ComfyBase + "/view?filename=" + [Uri]::EscapeDataString($filename) + "&subfolder=" + [Uri]::EscapeDataString($subfolder) + "&type=" + [Uri]::EscapeDataString($type)
  Invoke-WebRequest -Uri $url -OutFile $Destination -UseBasicParsing -TimeoutSec 180
  if (-not (Test-Path -LiteralPath $Destination -PathType Leaf)) { throw "COMFY_PREVIEW_DOWNLOAD_MISSING" }
  if ([int64](Get-Item -LiteralPath $Destination).Length -lt 1024) { throw "COMFY_PREVIEW_DOWNLOAD_TOO_SMALL" }
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

function New-Workflow([int64]$Seed) {
  return [ordered]@{
    "1" = [ordered]@{
      class_type = "CheckpointLoaderSimple"
      inputs = [ordered]@{ ckpt_name = $ModelName }
    }
    "2" = [ordered]@{
      class_type = "CLIPTextEncode"
      inputs = [ordered]@{ text = $PositivePrompt; clip = @("1", 1) }
    }
    "3" = [ordered]@{
      class_type = "CLIPTextEncode"
      inputs = [ordered]@{ text = $NegativePrompt; clip = @("1", 1) }
    }
    "4" = [ordered]@{
      class_type = "EmptyLatentImage"
      inputs = [ordered]@{ width = $CanvasWidth; height = $CanvasHeight; batch_size = 1 }
    }
    "5" = [ordered]@{
      class_type = "KSampler"
      inputs = [ordered]@{
        seed = $Seed
        steps = $Steps
        cfg = $Cfg
        sampler_name = $Sampler
        scheduler = $Scheduler
        denoise = 1.0
        model = @("1", 0)
        positive = @("2", 0)
        negative = @("3", 0)
        latent_image = @("4", 0)
      }
    }
    "6" = [ordered]@{
      class_type = "VAEDecode"
      inputs = [ordered]@{ samples = @("5", 0); vae = @("1", 2) }
    }
    "7" = [ordered]@{
      class_type = "PreviewImage"
      inputs = [ordered]@{ images = @("6", 0) }
    }
  }
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

  $profilePath = Join-Path $RepoRoot ("config\sites\" + $SiteId + ".json")
  $profile = Read-JsonUtf8 $profilePath
  if (@($profile.enabled_workflows) -contains "QA01") { throw "QA01_MUST_REMAIN_DISABLED_DURING_STYLE_SAMPLE" }

  $controlRoot = [string]$profile.control_root
  if ([string]::IsNullOrWhiteSpace($controlRoot)) { throw "CONTROL_ROOT_MISSING" }
  $evidenceDir = Join-Path (Join-Path $controlRoot "evidence") ("P5_QA01_STYLE_SAMPLE_" + (Get-Date -Format "yyyyMMdd-HHmmss"))
  New-Item -ItemType Directory -Path $evidenceDir -Force | Out-Null

  $manifestPath = Join-Path ([string]$profile.manifest_root) ($Sku + ".json")
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw "STYLE_SAMPLE_MANIFEST_NOT_FOUND" }
  $manifest = Read-JsonUtf8 $manifestPath
  $declaredSku = [string]($manifest.sku)
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
  $sourceInfo = Get-Item -LiteralPath $sourcePath
  $expectedSize = [int64]$sourceEntry.size_bytes
  $expectedSha = ([string]$sourceEntry.sha256).ToLowerInvariant()
  if ([int64]$sourceInfo.Length -ne $expectedSize) { throw "VERIFIED_SC01_SIZE_MISMATCH" }
  $sourceSha = Get-FileSha256 $sourcePath
  if ($sourceSha -ne $expectedSha) { throw "VERIFIED_SC01_SHA256_MISMATCH" }

  $sourceCopy = Join-Path $evidenceDir "source_sc01.png"
  Copy-Item -LiteralPath $sourcePath -Destination $sourceCopy
  if ((Get-FileSha256 $sourceCopy) -ne $sourceSha) { throw "SC01_EVIDENCE_COPY_SHA256_MISMATCH" }

  $modelTarget = Find-VerifiedModel
  $python = Join-Path $ComfyRoot "python_embeded\python.exe"
  if (-not (Test-Path -LiteralPath $python -PathType Leaf)) { throw "COMFYUI_PYTHON_NOT_FOUND" }
  if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot "tools\p5_qa01_compose.py") -PathType Leaf)) { throw "QA01_COMPOSITOR_SCRIPT_NOT_FOUND" }

  $stats = Get-ComfyJson "/system_stats" 20
  if ($null -eq $stats) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "tools\P5_QA01_RUNTIME_GATE.ps1") -ExpectedHead $head
    if ($LASTEXITCODE -ne 0) { throw "QA01_STYLE_RUNTIME_RECOVERY_FAILED" }
    $stats = Get-ComfyJson "/system_stats" 30
  }
  if ($null -eq $stats) { throw "COMFYUI_NOT_READY_FOR_STYLE_SAMPLE" }

  $requiredNodes = @("CheckpointLoaderSimple", "CLIPTextEncode", "EmptyLatentImage", "KSampler", "VAEDecode", "PreviewImage")
  $nodeInfo = @{}
  foreach ($nodeName in $requiredNodes) {
    $info = Get-NodeInfo $nodeName
    if ($null -eq $info) { throw ("STYLE_SAMPLE_NODE_UNAVAILABLE:" + $nodeName) }
    $nodeInfo[$nodeName] = $info
  }
  $checkpointOptions = @(Get-EnumOptions $nodeInfo["CheckpointLoaderSimple"] "ckpt_name")
  if (-not (@($checkpointOptions | Where-Object { [IO.Path]::GetFileName([string]$_) -ieq $ModelName }).Count -gt 0)) {
    throw "STYLE_SAMPLE_CHECKPOINT_NOT_VISIBLE"
  }
  $samplerOptions = @(Get-EnumOptions $nodeInfo["KSampler"] "sampler_name")
  $schedulerOptions = @(Get-EnumOptions $nodeInfo["KSampler"] "scheduler")
  if (-not ($samplerOptions -contains $Sampler)) { throw ("FROZEN_SAMPLER_UNAVAILABLE:" + $Sampler) }
  if (-not ($schedulerOptions -contains $Scheduler)) { throw ("FROZEN_SCHEDULER_UNAVAILABLE:" + $Scheduler) }

  $clientId = [Guid]::NewGuid().ToString("N")
  $backgrounds = New-Object System.Collections.Generic.List[object]
  foreach ($pair in $Seeds.GetEnumerator()) {
    $label = [string]$pair.Key
    $seed = [int64]$pair.Value
    Write-Host ("==> Generate Aquarium background " + $label + " seed=" + $seed) -ForegroundColor Cyan
    $promptId = Post-ComfyPrompt (New-Workflow $seed) $clientId
    $imageInfo = Wait-ComfyImage $promptId 1200
    $backgroundPath = Join-Path $evidenceDir ("background_" + $label + ".png")
    Download-ComfyImage $imageInfo $backgroundPath
    $backgrounds.Add([pscustomobject]@{
      label = $label
      seed = $seed
      prompt_id = $promptId
      path = $backgroundPath
      sha256 = Get-FileSha256 $backgroundPath
      size_bytes = [int64](Get-Item -LiteralPath $backgroundPath).Length
    })
  }

  $candidates = New-Object System.Collections.Generic.List[object]
  foreach ($background in $backgrounds) {
    foreach ($placement in @(
      [pscustomobject]@{ suffix = "1"; mode = "natural"; name = "Natural" },
      [pscustomobject]@{ suffix = "2"; mode = "hero"; name = "Hero" }
    )) {
      $candidateLabel = [string]$background.label + [string]$placement.suffix
      $output = Join-Path $evidenceDir ("candidate_" + $candidateLabel + ".png")
      $report = Join-Path $evidenceDir ("candidate_" + $candidateLabel + ".json")
      Invoke-Compositor $python $sourceCopy ([string]$background.path) $output ([string]$placement.mode) $report
      $detail = Read-JsonUtf8 $report
      $candidates.Add([pscustomobject]@{
        label = $candidateLabel
        background = [string]$background.label
        seed = [int64]$background.seed
        placement = [string]$placement.name
        mode = [string]$placement.mode
        path = $output
        sha256 = Get-FileSha256 $output
        size_bytes = [int64](Get-Item -LiteralPath $output).Length
        transform = $detail.transform
      })
    }
  }

  $reportObject = [ordered]@{
    schema_version = "1.0"
    at = (Get-Date).ToString("o")
    site_id = $SiteId
    sku = $Sku
    git_head = $head
    qa01_enabled = $false
    production_mutation = "NONE"
    source = [ordered]@{
      archive_asset_id = [string]$sourceEntry.asset_id
      archived_at = [string]$sourceEntry.archived_at
      destination_path = $sourcePath
      size_bytes = $expectedSize
      sha256 = $sourceSha
      evidence_copy = $sourceCopy
    }
    model = [ordered]@{
      filename = $ModelName
      target = $modelTarget
      size_bytes = $ModelSize
      sha256 = $ModelSha256
    }
    generation = [ordered]@{
      canvas = "1024x1024"
      steps = $Steps
      cfg = $Cfg
      sampler = $Sampler
      scheduler = $Scheduler
      denoise = 1.0
      positive_prompt = $PositivePrompt
      negative_prompt = $NegativePrompt
      output_node = "PreviewImage"
      backgrounds = @($backgrounds)
    }
    candidates = @($candidates)
  }
  [IO.File]::WriteAllText((Join-Path $evidenceDir "style_sample_gate.json"), ($reportObject | ConvertTo-Json -Depth 12), (New-Object System.Text.UTF8Encoding($false)))

  $candidateCards = New-Object System.Text.StringBuilder
  foreach ($candidate in $candidates) {
    $null = $candidateCards.AppendLine(("<article class='card'><h3>" + $candidate.label + " · " + $candidate.placement + "</h3><img src='candidate_" + $candidate.label + ".png' alt='QA01 candidate " + $candidate.label + "'><p>Background " + $candidate.background + " · seed " + $candidate.seed + "</p></article>"))
  }
  $html = @"
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>QA01 Aquarium Style Gate</title>
<style>
:root{color-scheme:dark;font-family:Inter,"Segoe UI","Microsoft YaHei",sans-serif;background:#0e1114;color:#f3f1ec}body{margin:0;padding:28px;background:#0e1114}.wrap{max-width:1500px;margin:auto}.meta{background:#171b20;border:1px solid #2d333a;border-radius:14px;padding:18px 20px;margin-bottom:20px;line-height:1.65}.source{display:grid;grid-template-columns:minmax(280px,520px) 1fr;gap:22px;align-items:start;margin-bottom:24px}.checker{background-color:#171b20;background-image:linear-gradient(45deg,#20252b 25%,transparent 25%),linear-gradient(-45deg,#20252b 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#20252b 75%),linear-gradient(-45deg,transparent 75%,#20252b 75%);background-size:28px 28px;background-position:0 0,0 14px,14px -14px,-14px 0;border:1px solid #2d333a;border-radius:14px;padding:10px}.checker img{display:block;width:100%;height:auto}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.card{background:#171b20;border:1px solid #2d333a;border-radius:14px;padding:12px}.card h3{margin:4px 4px 10px;font-size:18px}.card img{width:100%;height:auto;display:block;border-radius:9px;background:#20252b}.card p{margin:10px 4px 2px;color:#b9b7b1}.warn{color:#e8c98e}.accept{font-size:18px}.small{color:#aaa7a0;font-size:14px}@media(max-width:1000px){.grid{grid-template-columns:1fr 1fr}.source{grid-template-columns:1fr}}@media(max-width:650px){.grid{grid-template-columns:1fr}body{padding:14px}}
</style>
</head>
<body><main class="wrap">
<h1>QA01 Aquarium · 首轮隔离场景视觉 Gate</h1>
<section class="meta">
<div><strong>STYLE ONLY / 非生产资产</strong> · QA01 仍 disabled · 不写 Manifest / F / 生产 journal</div>
<div>模型：SDXL Base 1.0 · 1024×1024 · 28 steps · CFG 6.0 · dpmpp_2m / karras</div>
<div class="warn">主体始终来自下方 VERIFIED SC01 Cutout；AI 只生成 Aquarium 背景。主体没有重绘、补画、变形、重打光或生成阴影。</div>
</section>
<section class="source"><div class="checker"><img src="source_sc01.png" alt="Verified SC01 source"></div><div class="meta accept"><strong>人工审核标准</strong><br>① 必须还是同一块沉木：枝杈、孔洞、外轮廓和比例不变。<br>② Aquarium 背景中央不能出现另一块假沉木/树根/木头。<br>③ 前景不能遮挡主体。<br>④ 尺寸和落地位置要自然。<br>⑤ 风格应偏真实、高级、克制的水族场景，不要奇幻 CGI 感。<br><br><strong>请只选一个：</strong> A1 / A2 / B1 / B2 / C1 / C2；如果都不合格，直接说“全部拒绝 + 原因”。<br><span class="small">1 = Natural placement，2 = Hero placement。三个字母代表三个固定 seed 的背景方向。</span></div></section>
<section class="grid">
$($candidateCards.ToString())
</section>
</main></body></html>
"@
  $reviewHtml = Join-Path $evidenceDir "review.html"
  [IO.File]::WriteAllText($reviewHtml, $html, (New-Object System.Text.UTF8Encoding($false)))
  Start-Process $reviewHtml

  $summary = @(
    "P5_QA01_STYLE_SAMPLE_GATE=PASS",
    ("git_head=" + $head),
    ("sku=" + $Sku),
    ("source_sc01_sha256=" + $sourceSha),
    ("model_sha256=" + $ModelSha256),
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
  Write-Host "Review page opened. Choose one candidate or reject all." -ForegroundColor Yellow
  exit 0
} catch {
  $summary = @(
    "P5_QA01_STYLE_SAMPLE_GATE=FAIL",
    ("error=" + $_.Exception.Message)
  )
  if (Get-Command Set-Clipboard -ErrorAction SilentlyContinue) {
    try { Set-Clipboard -Value ($summary -join [Environment]::NewLine) } catch {}
  }
  $summary | ForEach-Object { Write-Host $_ -ForegroundColor Red }
  exit 1
}
