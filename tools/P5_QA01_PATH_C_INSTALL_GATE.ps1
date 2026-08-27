param(
  [string]$SiteId = "drift-curio",
  [string]$ExpectedHead = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$ExpectedBranch = "feat/p5-qa01-scene-freeze"
$ModelName = "sd_xl_base_1.0.safetensors"
$ModelSize = [int64]6938078334
$ModelSha256 = "31e35c80fc4829d14f90153f4c74cd59c90b779f6afe05a74cd6120b893f7e5b"
$ModelUrl = "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors?download=true"
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
  if ($code -ne 0) { throw ("GIT_FAILED: git " + ($Args -join " ") + " :: " + (($output | ForEach-Object { [string]$_ }) -join " | ")) }
  return @($output | ForEach-Object { [string]$_ })
}

function Read-JsonUtf8([string]$Path) {
  $text = [IO.File]::ReadAllText($Path, [Text.Encoding]::UTF8)
  if ($text.Length -gt 0 -and [int][char]$text[0] -eq 0xFEFF) { $text = $text.Substring(1) }
  return $text | ConvertFrom-Json -ErrorAction Stop
}

function Test-FileIdentity([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
  $info = Get-Item -LiteralPath $Path
  if ([int64]$info.Length -ne $ModelSize) { return $false }
  $hash = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  return ($hash -eq $ModelSha256)
}

function Get-ObjectInfo {
  try {
    $response = Invoke-WebRequest -Uri ($ComfyBase + "/object_info") -UseBasicParsing -TimeoutSec 8
    if ([int]$response.StatusCode -ne 200) { return $null }
    return $response.Content | ConvertFrom-Json -ErrorAction Stop
  } catch { return $null }
}

function Has-Node($ObjectInfo, [string]$Name) {
  if ($null -eq $ObjectInfo) { return $false }
  return ($null -ne $ObjectInfo.PSObject.Properties[$Name])
}

function Get-CheckpointOptions($ObjectInfo) {
  if ($null -eq $ObjectInfo) { return @() }
  foreach ($nodeName in @("CheckpointLoaderSimple", "CheckpointLoader")) {
    $nodeProp = $ObjectInfo.PSObject.Properties[$nodeName]
    if ($null -eq $nodeProp) { continue }
    $required = $nodeProp.Value.input.required
    if ($null -eq $required) { continue }
    $ckptProp = $required.PSObject.Properties["ckpt_name"]
    if ($null -eq $ckptProp) { continue }
    $definition = @($ckptProp.Value)
    if ($definition.Count -eq 0) { continue }
    $first = $definition[0]
    if ($first -is [string]) { return @([string]$first) }
    return @($first | ForEach-Object { [string]$_ })
  }
  return @()
}

function Wait-ObjectInfo([int]$TimeoutSeconds = 150) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $info = Get-ObjectInfo
    if ($null -ne $info) { return $info }
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)
  return $null
}

function Select-ModelTargetRoot {
  $extraCandidates = @(
    (Join-Path $ComfyRoot "ComfyUI\extra_model_paths.yaml"),
    (Join-Path $ComfyRoot "extra_model_paths.yaml")
  )
  foreach ($candidate in $extraCandidates) {
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
    $text = [IO.File]::ReadAllText($candidate, [Text.Encoding]::UTF8)
    if ($text -match "D:[\\/]+AI[\\/]+MODELS[\\/]+ComfyUI") {
      return $ExternalModelRoot
    }
  }
  return $PortableModelRoot
}

function Download-Checkpoint([string]$PartPath) {
  $aria2 = $null
  $fixedAria2 = "D:\AI\TOOLS\aria2\aria2c.exe"
  if (Test-Path -LiteralPath $fixedAria2 -PathType Leaf) { $aria2 = $fixedAria2 }
  if ($null -eq $aria2) {
    $cmd = Get-Command aria2c.exe -ErrorAction SilentlyContinue
    if ($null -ne $cmd) { $aria2 = $cmd.Source }
  }

  $dir = Split-Path -Parent $PartPath
  $name = Split-Path -Leaf $PartPath
  if ($null -ne $aria2) {
    & $aria2 `
      --continue=true `
      --allow-overwrite=false `
      --auto-file-renaming=false `
      --file-allocation=none `
      --max-connection-per-server=8 `
      --split=8 `
      --min-split-size=16M `
      --dir=$dir `
      --out=$name `
      $ModelUrl
    if ($LASTEXITCODE -ne 0) { throw "MODEL_DOWNLOAD_FAILED_ARIA2" }
    return "aria2"
  }

  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  if ($null -eq $curl) { throw "NO_SUPPORTED_DOWNLOADER" }
  & $curl.Source -L --fail --retry 3 --continue-at - --output $PartPath $ModelUrl
  if ($LASTEXITCODE -ne 0) { throw "MODEL_DOWNLOAD_FAILED_CURL" }
  return "curl"
}

try {
  Set-Location $RepoRoot
  $repo = ((Invoke-Git rev-parse --show-toplevel) -join "").Trim()
  if ([IO.Path]::GetFullPath($repo) -ne [IO.Path]::GetFullPath($RepoRoot)) { throw "REPO_ROOT_MISMATCH" }
  $dirty = @((Invoke-Git status --porcelain))
  if ($dirty.Count -gt 0 -and -not [string]::IsNullOrWhiteSpace(($dirty -join ""))) { throw ("WORKTREE_NOT_CLEAN :: " + ($dirty -join " | ")) }
  $branch = ((Invoke-Git branch --show-current) -join "").Trim()
  if ($branch -ne $ExpectedBranch) { throw "WRONG_BRANCH: expected=$ExpectedBranch actual=$branch" }
  $head = ((Invoke-Git rev-parse HEAD) -join "").Trim()
  if (-not [string]::IsNullOrWhiteSpace($ExpectedHead) -and $head -ne $ExpectedHead.Trim()) {
    throw "HEAD_MISMATCH: expected=$($ExpectedHead.Trim()) actual=$head"
  }

  $profilePath = Join-Path $RepoRoot ("config\sites\" + $SiteId + ".json")
  $profile = Read-JsonUtf8 $profilePath
  if (@($profile.enabled_workflows) -contains "QA01") { throw "QA01_MUST_REMAIN_DISABLED_DURING_INSTALL_GATE" }

  $controlRoot = [string]$profile.control_root
  if ([string]::IsNullOrWhiteSpace($controlRoot)) { throw "CONTROL_ROOT_MISSING" }
  $evidenceRoot = Join-Path $controlRoot "evidence"
  New-Item -ItemType Directory -Path $evidenceRoot -Force | Out-Null
  $evidenceDir = Join-Path $evidenceRoot ("P5_QA01_PATH_C_INSTALL_" + (Get-Date -Format "yyyyMMdd-HHmmss"))
  New-Item -ItemType Directory -Path $evidenceDir -Force | Out-Null

  $drive = Get-PSDrive -Name D -ErrorAction Stop
  $freeGb = [math]::Round(([double]$drive.Free / 1GB), 2)
  if ($freeGb -lt 20) { throw "INSUFFICIENT_D_FREE_SPACE" }

  if (-not (Test-Path -LiteralPath $ComfyRoot -PathType Container)) { throw "COMFYUI_PORTABLE_NOT_FOUND" }
  $python = Join-Path $ComfyRoot "python_embeded\python.exe"
  $mainPy = Join-Path $ComfyRoot "ComfyUI\main.py"
  if (-not (Test-Path -LiteralPath $python -PathType Leaf)) { throw "COMFYUI_PYTHON_NOT_FOUND" }
  if (-not (Test-Path -LiteralPath $mainPy -PathType Leaf)) { throw "COMFYUI_MAIN_NOT_FOUND" }

  $modelRoot = Select-ModelTargetRoot
  $checkpointDir = Join-Path $modelRoot "checkpoints"
  New-Item -ItemType Directory -Path $checkpointDir -Force | Out-Null
  $target = Join-Path $checkpointDir $ModelName
  $part = $target + ".download"

  $downloaded = $false
  $downloadMethod = "existing"
  if (Test-Path -LiteralPath $target -PathType Leaf) {
    if (-not (Test-FileIdentity $target)) { throw "EXISTING_MODEL_IDENTITY_MISMATCH" }
  } else {
    $downloadMethod = Download-Checkpoint $part
    if (-not (Test-FileIdentity $part)) { throw "DOWNLOADED_MODEL_IDENTITY_MISMATCH" }
    if (Test-Path -LiteralPath $target) { throw "MODEL_TARGET_APPEARED_DURING_DOWNLOAD" }
    Move-Item -LiteralPath $part -Destination $target
    $downloaded = $true
  }
  if (-not (Test-FileIdentity $target)) { throw "FINAL_MODEL_IDENTITY_MISMATCH" }

  $objectInfo = Get-ObjectInfo
  $startedByGate = $false
  $comfyProcess = $null
  if ($null -eq $objectInfo) {
    $stdout = Join-Path $evidenceDir "comfy_stdout.log"
    $stderr = Join-Path $evidenceDir "comfy_stderr.log"
    $args = @(
      "-s",
      "ComfyUI\main.py",
      "--windows-standalone-build",
      "--lowvram",
      "--listen",
      "127.0.0.1"
    )
    $comfyProcess = Start-Process -FilePath $python -ArgumentList $args -WorkingDirectory $ComfyRoot -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
    $startedByGate = $true
    $objectInfo = Wait-ObjectInfo 180
    if ($null -eq $objectInfo) {
      $exitText = if ($null -ne $comfyProcess -and $comfyProcess.HasExited) { " exited=$($comfyProcess.ExitCode)" } else { "" }
      throw ("COMFYUI_OBJECT_INFO_TIMEOUT" + $exitText)
    }
  }

  $requiredNodes = @(
    "CheckpointLoaderSimple",
    "CLIPTextEncode",
    "EmptyLatentImage",
    "KSampler",
    "VAEDecode",
    "SaveImage"
  )
  $missingNodes = @($requiredNodes | Where-Object { -not (Has-Node $objectInfo $_) })
  if ($missingNodes.Count -gt 0) { throw ("MISSING_NATIVE_NODES: " + ($missingNodes -join ",")) }

  $checkpointOptions = @(Get-CheckpointOptions $objectInfo)
  $modelVisible = $false
  foreach ($option in $checkpointOptions) {
    if ([IO.Path]::GetFileName([string]$option) -ieq $ModelName) { $modelVisible = $true; break }
  }
  if (-not $modelVisible) { throw "SDXL_CHECKPOINT_NOT_VISIBLE_IN_OBJECT_INFO" }

  $report = [ordered]@{
    schema_version = "1.0"
    at = (Get-Date).ToString("o")
    site_id = $SiteId
    git_head = $head
    git_branch = $branch
    qa01_enabled = (@($profile.enabled_workflows) -contains "QA01")
    path = "C"
    model = [ordered]@{
      repository = "stabilityai/stable-diffusion-xl-base-1.0"
      filename = $ModelName
      size_bytes = $ModelSize
      sha256 = $ModelSha256
      target = $target
      downloaded = $downloaded
      download_method = $downloadMethod
      visible_in_object_info = $modelVisible
    }
    runtime = [ordered]@{
      comfy_base = $ComfyBase
      started_by_gate = $startedByGate
      launch_mode = "--windows-standalone-build --lowvram --listen 127.0.0.1"
      required_native_nodes = $requiredNodes
      missing_native_nodes = $missingNodes
      checkpoint_option_count = $checkpointOptions.Count
    }
    d_free_gb_after = [math]::Round(([double](Get-PSDrive -Name D).Free / 1GB), 2)
  }

  $jsonPath = Join-Path $evidenceDir "install_gate.json"
  [IO.File]::WriteAllText($jsonPath, ($report | ConvertTo-Json -Depth 8), (New-Object System.Text.UTF8Encoding($false)))

  $summary = @(
    "P5_QA01_PATH_C_INSTALL_GATE=PASS",
    ("git_head=" + $head),
    ("model=" + $ModelName),
    ("model_sha256=" + $ModelSha256),
    ("model_target=" + $target),
    ("downloaded=" + $downloaded),
    ("download_method=" + $downloadMethod),
    ("comfy_started_by_gate=" + $startedByGate),
    ("checkpoint_visible=True"),
    ("native_nodes_pass=True"),
    ("qa01_enabled=False"),
    ("evidence_dir=" + $evidenceDir)
  )
  [IO.File]::WriteAllLines((Join-Path $evidenceDir "summary.txt"), $summary, [Text.Encoding]::UTF8)
  if (Get-Command Set-Clipboard -ErrorAction SilentlyContinue) {
    try { Set-Clipboard -Value ($summary -join [Environment]::NewLine) } catch {}
  }
  $summary | ForEach-Object { Write-Host $_ }
  Write-Host "Install/runtime summary copied to clipboard when Set-Clipboard is available." -ForegroundColor Yellow
  exit 0
} catch {
  $summary = @(
    "P5_QA01_PATH_C_INSTALL_GATE=FAIL",
    ("error=" + $_.Exception.Message)
  )
  if (Get-Command Set-Clipboard -ErrorAction SilentlyContinue) {
    try { Set-Clipboard -Value ($summary -join [Environment]::NewLine) } catch {}
  }
  $summary | ForEach-Object { Write-Host $_ -ForegroundColor Red }
  exit 1
}
