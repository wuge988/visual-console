param(
  [string]$SiteId = "drift-curio",
  [string]$ComfyBase = "http://127.0.0.1:8188"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$ExpectedBranch = "feat/p5-qa01-scene-freeze"

function Read-JsonUtf8([string]$Path) {
  $text = [IO.File]::ReadAllText($Path, [Text.Encoding]::UTF8)
  if ($text.Length -gt 0 -and [int][char]$text[0] -eq 0xFEFF) { $text = $text.Substring(1) }
  return $text | ConvertFrom-Json -ErrorAction Stop
}

function Invoke-Git {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
  $previous = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $output = @(& git @Args 2>&1)
    $code = $LASTEXITCODE
  } finally { $ErrorActionPreference = $previous }
  if ($code -ne 0) { throw ("GIT_FAILED: git " + ($Args -join " ") + " :: " + (($output | ForEach-Object { [string]$_ }) -join " | ")) }
  return @($output | ForEach-Object { [string]$_ })
}

function Get-FileNames([string]$Path, [int]$Limit = 80) {
  if (-not (Test-Path -LiteralPath $Path -PathType Container)) { return @() }
  return @(Get-ChildItem -LiteralPath $Path -File -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -match '^\.(safetensors|ckpt|pt|pth|bin|gguf)$' } |
    Sort-Object FullName |
    Select-Object -First $Limit |
    ForEach-Object { $_.FullName })
}

function Get-ChildDirNames([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Container)) { return @() }
  return @(Get-ChildItem -LiteralPath $Path -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name |
    ForEach-Object { $_.Name })
}

function Try-ObjectInfo([string]$Base) {
  try {
    $response = Invoke-WebRequest -Uri ($Base.TrimEnd('/') + '/object_info') -UseBasicParsing -TimeoutSec 8
    if ([int]$response.StatusCode -ne 200) { return $null }
    return $response.Content | ConvertFrom-Json -ErrorAction Stop
  } catch { return $null }
}

function Has-ObjectInfoNode($ObjectInfo, [string[]]$Names) {
  if ($null -eq $ObjectInfo) { return $false }
  foreach ($name in $Names) {
    if ($null -ne $ObjectInfo.PSObject.Properties[$name]) { return $true }
  }
  return $false
}

function Find-MatchingNames([string[]]$Values, [string[]]$Patterns) {
  $out = New-Object System.Collections.Generic.List[string]
  foreach ($value in $Values) {
    foreach ($pattern in $Patterns) {
      if ($value -match $pattern) { $out.Add($value); break }
    }
  }
  return @($out)
}

try {
  Set-Location $RepoRoot
  $repo = ((Invoke-Git rev-parse --show-toplevel) -join '').Trim()
  if ([IO.Path]::GetFullPath($repo) -ne [IO.Path]::GetFullPath($RepoRoot)) { throw "REPO_ROOT_MISMATCH" }
  $dirty = @((Invoke-Git status --porcelain))
  if ($dirty.Count -gt 0 -and -not [string]::IsNullOrWhiteSpace(($dirty -join ''))) { throw ("WORKTREE_NOT_CLEAN :: " + ($dirty -join ' | ')) }
  $branch = ((Invoke-Git branch --show-current) -join '').Trim()
  if ($branch -ne $ExpectedBranch) { throw "WRONG_BRANCH: expected=$ExpectedBranch actual=$branch" }
  $head = ((Invoke-Git rev-parse HEAD) -join '').Trim()

  $profilePath = Join-Path $RepoRoot ("config\sites\" + $SiteId + ".json")
  $profile = Read-JsonUtf8 $profilePath
  if (@($profile.enabled_workflows) -contains 'QA01') { throw "QA01_MUST_REMAIN_DISABLED_DURING_PROBE" }

  $controlRoot = [string]$profile.control_root
  if ([string]::IsNullOrWhiteSpace($controlRoot)) { throw "CONTROL_ROOT_MISSING" }
  $evidenceRoot = Join-Path $controlRoot 'evidence'
  New-Item -ItemType Directory -Path $evidenceRoot -Force | Out-Null
  $evidenceDir = Join-Path $evidenceRoot ("P5_QA01_CAPABILITY_" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  New-Item -ItemType Directory -Path $evidenceDir -Force | Out-Null

  $comfyRoot = 'D:\AI\APPS\ComfyUI_windows_portable'
  $modelRoot = 'D:\AI\MODELS\ComfyUI'
  $customNodeCandidates = @(
    (Join-Path $comfyRoot 'ComfyUI\custom_nodes'),
    'D:\AI\APPS\ComfyUI\custom_nodes'
  )
  $customNodesRoot = @($customNodeCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Container } | Select-Object -First 1)
  $customNodes = if ($customNodesRoot.Count) { Get-ChildDirNames $customNodesRoot[0] } else { @() }

  $checkpointFiles = Get-FileNames (Join-Path $modelRoot 'checkpoints')
  $controlNetFiles = Get-FileNames (Join-Path $modelRoot 'controlnet')
  $ipAdapterFiles = Get-FileNames (Join-Path $modelRoot 'ipadapter')
  $clipVisionFiles = Get-FileNames (Join-Path $modelRoot 'clip_vision')
  $vaeFiles = Get-FileNames (Join-Path $modelRoot 'vae')

  $sdxlFiles = Find-MatchingNames $checkpointFiles @('sdxl','xl[_\-. ]','juggernaut.*xl','realvis.*xl','dreamshaper.*xl')
  $ipNodeFolders = Find-MatchingNames $customNodes @('ipadapter','ip.adapter')
  $controlNodeFolders = Find-MatchingNames $customNodes @('controlnet','control.net')

  $objectInfo = Try-ObjectInfo $ComfyBase
  $comfyOnline = ($null -ne $objectInfo)
  $hasCheckpointLoader = Has-ObjectInfoNode $objectInfo @('CheckpointLoaderSimple','CheckpointLoader')
  $hasKSampler = Has-ObjectInfoNode $objectInfo @('KSampler','KSamplerAdvanced')
  $hasVaeEncodeInpaint = Has-ObjectInfoNode $objectInfo @('VAEEncodeForInpaint','InpaintModelConditioning')
  $hasIpAdapterNode = Has-ObjectInfoNode $objectInfo @('IPAdapterAdvanced','IPAdapter','IPAdapterUnifiedLoader','IPAdapterModelLoader')
  $hasControlNetNode = Has-ObjectInfoNode $objectInfo @('ControlNetLoader','ControlNetApply','ControlNetApplyAdvanced')

  $gpuLines = @()
  if (Get-Command nvidia-smi.exe -ErrorAction SilentlyContinue) {
    $gpuLines = @(& nvidia-smi.exe --query-gpu=name,memory.total,memory.free,driver_version --format=csv,noheader,nounits 2>$null | ForEach-Object { [string]$_ })
  }

  $drive = Get-PSDrive -Name D -ErrorAction SilentlyContinue
  $driveFreeGb = if ($null -ne $drive) { [math]::Round(([double]$drive.Free / 1GB), 2) } else { $null }

  $report = [ordered]@{
    schema_version = '1.0'
    at = (Get-Date).ToString('o')
    site_id = $SiteId
    git_head = $head
    git_branch = $branch
    qa01_enabled = (@($profile.enabled_workflows) -contains 'QA01')
    gpu = $gpuLines
    d_free_gb = $driveFreeGb
    comfy = [ordered]@{
      base = $ComfyBase
      online_object_info = $comfyOnline
      install_root_present = (Test-Path -LiteralPath $comfyRoot -PathType Container)
      model_root_present = (Test-Path -LiteralPath $modelRoot -PathType Container)
      checkpoint_loader = $hasCheckpointLoader
      ksampler = $hasKSampler
      vae_inpaint = $hasVaeEncodeInpaint
      ipadapter_node = $hasIpAdapterNode
      controlnet_node = $hasControlNetNode
    }
    inventory = [ordered]@{
      checkpoint_files = $checkpointFiles
      sdxl_like_checkpoints = $sdxlFiles
      controlnet_files = $controlNetFiles
      ipadapter_files = $ipAdapterFiles
      clip_vision_files = $clipVisionFiles
      vae_files = $vaeFiles
      custom_nodes_root = if ($customNodesRoot.Count) { $customNodesRoot[0] } else { $null }
      ipadapter_node_folders = $ipNodeFolders
      controlnet_node_folders = $controlNodeFolders
    }
  }

  $jsonPath = Join-Path $evidenceDir 'capability.json'
  $textPath = Join-Path $evidenceDir 'summary.txt'
  [IO.File]::WriteAllText($jsonPath, ($report | ConvertTo-Json -Depth 8), (New-Object System.Text.UTF8Encoding($false)))

  $summary = @(
    'P5_QA01_CAPABILITY_PROBE=PASS',
    ('git_head=' + $head),
    ('gpu=' + ($(if($gpuLines.Count){$gpuLines -join ' | '}else{'UNKNOWN'}))),
    ('d_free_gb=' + $driveFreeGb),
    ('comfy_online_object_info=' + $comfyOnline),
    ('sdxl_like_checkpoint_count=' + @($sdxlFiles).Count),
    ('all_checkpoint_count=' + @($checkpointFiles).Count),
    ('ipadapter_node=' + $hasIpAdapterNode),
    ('ipadapter_model_count=' + @($ipAdapterFiles).Count),
    ('clip_vision_model_count=' + @($clipVisionFiles).Count),
    ('controlnet_node=' + $hasControlNetNode),
    ('controlnet_model_count=' + @($controlNetFiles).Count),
    ('vae_inpaint_node=' + $hasVaeEncodeInpaint),
    ('evidence_dir=' + $evidenceDir)
  )
  [IO.File]::WriteAllLines($textPath, $summary, [Text.Encoding]::UTF8)
  if (Get-Command Set-Clipboard -ErrorAction SilentlyContinue) {
    try { Set-Clipboard -Value ($summary -join [Environment]::NewLine) } catch {}
  }
  $summary | ForEach-Object { Write-Host $_ }
  Write-Host 'Capability summary copied to clipboard when Set-Clipboard is available.' -ForegroundColor Yellow
  exit 0
} catch {
  $summary = @(
    'P5_QA01_CAPABILITY_PROBE=FAIL',
    ('error=' + $_.Exception.Message)
  )
  if (Get-Command Set-Clipboard -ErrorAction SilentlyContinue) {
    try { Set-Clipboard -Value ($summary -join [Environment]::NewLine) } catch {}
  }
  $summary | ForEach-Object { Write-Host $_ -ForegroundColor Red }
  exit 1
}
