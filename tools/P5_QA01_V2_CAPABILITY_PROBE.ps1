param(
  [string]$SiteId = "drift-curio",
  [string]$ExpectedHead = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$ExpectedBranch = "feat/p5-qa01-scene-freeze"
$ComfyRoot = "D:\AI\APPS\ComfyUI_windows_portable"
$ExternalModelRoot = "D:\AI\MODELS\ComfyUI"
$PortableModelRoot = Join-Path $ComfyRoot "ComfyUI\models"
$ComfyBase = "http://127.0.0.1:8188"

function Invoke-Git {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
  $previous = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $output = @(& git @Args 2>&1)
    $code = $LASTEXITCODE
  } finally { $ErrorActionPreference = $previous }
  if ($code -ne 0) { throw ("GIT_FAILED: " + (($output | ForEach-Object { [string]$_ }) -join " | ")) }
  return @($output | ForEach-Object { [string]$_ })
}

function Read-JsonUtf8([string]$Path) {
  $text = [IO.File]::ReadAllText($Path, [Text.Encoding]::UTF8)
  if ($text.Length -gt 0 -and [int][char]$text[0] -eq 0xFEFF) { $text = $text.Substring(1) }
  return $text | ConvertFrom-Json -ErrorAction Stop
}

function Get-ComfyJson([string]$Path, [int]$TimeoutSec = 30) {
  try {
    $response = Invoke-WebRequest -Uri ($ComfyBase + $Path) -UseBasicParsing -TimeoutSec $TimeoutSec
    if ([int]$response.StatusCode -ne 200) { return $null }
    return $response.Content | ConvertFrom-Json -ErrorAction Stop
  } catch { return $null }
}

function Test-Node([string]$Name) {
  $response = Get-ComfyJson ("/object_info/" + [Uri]::EscapeDataString($Name)) 45
  if ($null -eq $response) { return $false }
  if ($null -ne $response.PSObject.Properties[$Name]) { return $true }
  return ($null -ne $response.PSObject.Properties["input"])
}

function Find-Models([string[]]$Roots, [string[]]$Patterns) {
  $results = New-Object System.Collections.Generic.List[string]
  foreach ($root in $Roots) {
    if (-not (Test-Path -LiteralPath $root -PathType Container)) { continue }
    foreach ($pattern in $Patterns) {
      Get-ChildItem -LiteralPath $root -Recurse -File -Filter $pattern -ErrorAction SilentlyContinue | ForEach-Object {
        $results.Add($_.FullName)
      }
    }
  }
  return @($results | Select-Object -Unique)
}

try {
  Set-Location $RepoRoot
  $repo = ((Invoke-Git rev-parse --show-toplevel) -join "").Trim()
  if ([IO.Path]::GetFullPath($repo) -ne [IO.Path]::GetFullPath($RepoRoot)) { throw "REPO_ROOT_MISMATCH" }

  $dirty = @((Invoke-Git status --porcelain=v1 --untracked-files=all) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ($dirty.Count -gt 0) { throw ("WORKTREE_NOT_CLEAN :: " + ($dirty -join " | ")) }
  $branch = ((Invoke-Git branch --show-current) -join "").Trim()
  if ($branch -ne $ExpectedBranch) { throw "WRONG_BRANCH: expected=$ExpectedBranch actual=$branch" }
  $head = ((Invoke-Git rev-parse HEAD) -join "").Trim()
  if (-not [string]::IsNullOrWhiteSpace($ExpectedHead) -and $head -ne $ExpectedHead.Trim()) {
    throw "HEAD_MISMATCH: expected=$($ExpectedHead.Trim()) actual=$head"
  }

  $profile = Read-JsonUtf8 (Join-Path $RepoRoot ("config\sites\" + $SiteId + ".json"))
  if (@($profile.enabled_workflows) -contains "QA01") { throw "QA01_MUST_REMAIN_DISABLED_DURING_V2_PROBE" }

  $evidenceRoot = Join-Path ([string]$profile.control_root) "evidence"
  New-Item -ItemType Directory -Path $evidenceRoot -Force | Out-Null
  $evidenceDir = Join-Path $evidenceRoot ("P5_QA01_V2_CAPABILITY_" + (Get-Date -Format "yyyyMMdd-HHmmss"))
  New-Item -ItemType Directory -Path $evidenceDir -Force | Out-Null

  $stats = Get-ComfyJson "/system_stats" 30
  $comfyReady = ($null -ne $stats)
  $requiredNodes = @(
    "UNETLoader",
    "DualCLIPLoader",
    "VAELoader",
    "LoadImage",
    "VAEEncode",
    "ReferenceLatent",
    "FluxGuidance",
    "FluxKontextImageScale",
    "KSampler",
    "VAEDecode",
    "SaveImage"
  )

  $nodeState = [ordered]@{}
  if ($comfyReady) {
    foreach ($node in $requiredNodes) { $nodeState[$node] = Test-Node $node }
    $missingNodes = @($requiredNodes | Where-Object { -not [bool]$nodeState[$_] })
    $unknownNodes = @()
    $nodeProbeStatus = "COMPLETE"
  } else {
    foreach ($node in $requiredNodes) { $nodeState[$node] = "UNKNOWN_OFFLINE" }
    $missingNodes = @()
    $unknownNodes = @($requiredNodes)
    $nodeProbeStatus = "NOT_RUN_OFFLINE"
  }

  $modelRoots = @($ExternalModelRoot, $PortableModelRoot)
  $kontext = @(Find-Models $modelRoots @("*flux*kontext*.safetensors", "*flux*kontext*.gguf"))
  $clipL = @(Find-Models $modelRoots @("clip_l.safetensors"))
  $t5 = @(Find-Models $modelRoots @("t5xxl*fp8*.safetensors", "t5xxl*.gguf"))
  $ae = @(Find-Models $modelRoots @("ae.safetensors", "ae.safetensor"))

  $nativeKontextCoreReady = ($comfyReady -and $missingNodes.Count -eq 0)
  $modelSetReady = ($kontext.Count -gt 0 -and $clipL.Count -gt 0 -and $t5.Count -gt 0 -and $ae.Count -gt 0)

  $devices = @()
  if ($comfyReady -and $null -ne $stats.PSObject.Properties["devices"]) {
    $devices = @($stats.devices | ForEach-Object { [ordered]@{ name=[string]$_.name; vram_total=[int64]$_.vram_total; vram_free=[int64]$_.vram_free } })
  }

  $report = [ordered]@{
    schema_version = "1.1"
    at = (Get-Date).ToString("o")
    site_id = $SiteId
    git_head = $head
    qa01_enabled = $false
    probe_mode = "READ_ONLY"
    comfy_ready = $comfyReady
    node_probe_status = $nodeProbeStatus
    native_kontext_core_ready = $nativeKontextCoreReady
    missing_nodes = $missingNodes
    unknown_nodes = $unknownNodes
    node_state = $nodeState
    model_set_ready = $modelSetReady
    model_roots_scanned = $modelRoots
    models = [ordered]@{
      kontext = $kontext
      clip_l = $clipL
      t5_fp8_or_gguf = $t5
      ae = $ae
    }
    devices = $devices
  }

  [IO.File]::WriteAllText((Join-Path $evidenceDir "v2_capability.json"), ($report | ConvertTo-Json -Depth 10), (New-Object System.Text.UTF8Encoding($false)))

  $summary = @(
    "P5_QA01_V2_CAPABILITY_PROBE=PASS",
    ("git_head=" + $head),
    ("comfy_ready=" + $comfyReady),
    ("node_probe_status=" + $nodeProbeStatus),
    ("native_kontext_core_ready=" + $nativeKontextCoreReady),
    ("missing_nodes=" + ($missingNodes -join ",")),
    ("unknown_nodes=" + ($unknownNodes -join ",")),
    ("kontext_model_count=" + $kontext.Count),
    ("clip_l_count=" + $clipL.Count),
    ("t5_fp8_or_gguf_count=" + $t5.Count),
    ("ae_count=" + $ae.Count),
    ("model_set_ready=" + $modelSetReady),
    ("qa01_enabled=False"),
    ("probe_mode=READ_ONLY"),
    ("evidence_dir=" + $evidenceDir)
  )
  [IO.File]::WriteAllLines((Join-Path $evidenceDir "summary.txt"), $summary, [Text.Encoding]::UTF8)
  if (Get-Command Set-Clipboard -ErrorAction SilentlyContinue) { try { Set-Clipboard -Value ($summary -join [Environment]::NewLine) } catch {} }
  $summary | ForEach-Object { Write-Host $_ }
  exit 0
} catch {
  $summary = @("P5_QA01_V2_CAPABILITY_PROBE=FAIL", ("error=" + $_.Exception.Message))
  if (Get-Command Set-Clipboard -ErrorAction SilentlyContinue) { try { Set-Clipboard -Value ($summary -join [Environment]::NewLine) } catch {} }
  $summary | ForEach-Object { Write-Host $_ -ForegroundColor Red }
  exit 1
}
