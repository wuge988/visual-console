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

function Get-FileSha256([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Test-FileIdentity([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
  $info = Get-Item -LiteralPath $Path
  if ([int64]$info.Length -ne $ModelSize) { return $false }
  return ((Get-FileSha256 $Path) -eq $ModelSha256)
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

function Write-DownloadLog([string]$Path, [string[]]$Lines) {
  [IO.File]::WriteAllLines($Path, @($Lines | ForEach-Object { [string]$_ }), [Text.Encoding]::UTF8)
}

function Quarantine-InvalidCompletePartial([string]$PartPath) {
  if (-not (Test-Path -LiteralPath $PartPath -PathType Leaf)) { return $null }
  $info = Get-Item -LiteralPath $PartPath
  if ([int64]$info.Length -ne $ModelSize) { return $null }
  $hash = Get-FileSha256 $PartPath
  if ($hash -eq $ModelSha256) { return $null }

  $suffix = (Get-Date -Format "yyyyMMdd-HHmmss") + "-" + $hash.Substring(0, 12)
  $quarantine = $PartPath + ".invalid-" + $suffix
  if (Test-Path -LiteralPath $quarantine) { throw "INVALID_PARTIAL_QUARANTINE_COLLISION" }
  Move-Item -LiteralPath $PartPath -Destination $quarantine

  $ariaSidecar = $PartPath + ".aria2"
  if (Test-Path -LiteralPath $ariaSidecar -PathType Leaf) {
    Move-Item -LiteralPath $ariaSidecar -Destination ($quarantine + ".aria2")
  }

  return [pscustomobject]@{
    path = $quarantine
    sha256 = $hash
    size_bytes = [int64]$info.Length
  }
}

function Invoke-CurlCheckpointDownload([string]$CurlPath, [string]$PartPath, [string]$LogPath, [bool]$Resume) {
  $args = New-Object System.Collections.Generic.List[string]
  foreach ($arg in @(
    "-L",
    "--fail",
    "--retry", "5",
    "--retry-delay", "5",
    "--retry-all-errors",
    "--connect-timeout", "30",
    "--speed-time", "60",
    "--speed-limit", "1024",
    "--keepalive-time", "30"
  )) { $args.Add([string]$arg) }
  if ($Resume) {
    $args.Add("--continue-at")
    $args.Add("-")
  }
  foreach ($arg in @(
    "--user-agent", "Mozilla/5.0",
    "--output", $PartPath,
    $ModelUrl
  )) { $args.Add([string]$arg) }

  $previous = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $output = @(& $CurlPath @($args) 2>&1)
    $code = $LASTEXITCODE
  } finally { $ErrorActionPreference = $previous }
  Write-DownloadLog $LogPath $output
  return $code
}

function Download-Checkpoint([string]$PartPath, [string]$EvidenceDir) {
  $attempts = New-Object System.Collections.Generic.List[string]
  $skipAria2 = $false
  $aria2 = $null
  $fixedAria2 = "D:\AI\TOOLS\aria2\aria2c.exe"
  if (Test-Path -LiteralPath $fixedAria2 -PathType Leaf) { $aria2 = $fixedAria2 }
  if ($null -eq $aria2) {
    $cmd = Get-Command aria2c.exe -ErrorAction SilentlyContinue
    if ($null -ne $cmd) { $aria2 = $cmd.Source }
  }

  $dir = Split-Path -Parent $PartPath
  $name = Split-Path -Leaf $PartPath
  if (Test-Path -LiteralPath $PartPath -PathType Leaf) {
    $existingLength = [int64](Get-Item -LiteralPath $PartPath).Length
    if ($existingLength -gt $ModelSize) { throw "PARTIAL_MODEL_LARGER_THAN_EXPECTED" }
    $attempts.Add("partial_before_bytes=$existingLength")
    if (Test-FileIdentity $PartPath) {
      return [pscustomobject]@{ method = "existing-partial-complete"; attempts = @($attempts) }
    }
    $invalid = Quarantine-InvalidCompletePartial $PartPath
    if ($null -ne $invalid) {
      $attempts.Add("invalid_complete_partial_sha256=$($invalid.sha256)")
      $attempts.Add("invalid_complete_partial_quarantine=$($invalid.path)")
      $attempts.Add("aria2_skipped_after_invalid_complete=true")
      $skipAria2 = $true
    } elseif ($existingLength -gt 0 -and -not (Test-Path -LiteralPath ($PartPath + ".aria2") -PathType Leaf)) {
      $attempts.Add("aria2_skipped_for_curl_partial=true")
      $skipAria2 = $true
    }
  }

  if ($null -ne $aria2 -and -not $skipAria2) {
    $ariaLog = Join-Path $EvidenceDir "download_aria2.log"
    $previous = $ErrorActionPreference
    try {
      $ErrorActionPreference = "Continue"
      $ariaOutput = @(& $aria2 `
        --continue=true `
        --allow-overwrite=false `
        --auto-file-renaming=false `
        --file-allocation=none `
        --max-connection-per-server=4 `
        --split=4 `
        --min-split-size=32M `
        --max-tries=8 `
        --retry-wait=5 `
        --connect-timeout=30 `
        --timeout=60 `
        --summary-interval=15 `
        --console-log-level=notice `
        --user-agent="Mozilla/5.0" `
        --dir=$dir `
        --out=$name `
        $ModelUrl 2>&1)
      $ariaCode = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previous }
    Write-DownloadLog $ariaLog $ariaOutput
    $attempts.Add("aria2_exit=$ariaCode")
    if (Test-FileIdentity $PartPath) {
      $method = if ($ariaCode -eq 0) { "aria2" } else { "aria2-identity-valid" }
      return [pscustomobject]@{ method = $method; attempts = @($attempts) }
    }

    $invalid = Quarantine-InvalidCompletePartial $PartPath
    if ($null -ne $invalid) {
      $attempts.Add("aria2_invalid_complete_sha256=$($invalid.sha256)")
      $attempts.Add("aria2_invalid_complete_quarantine=$($invalid.path)")
    }
  }

  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  if ($null -eq $curl) {
    $attempts.Add("curl=unavailable")
  } else {
    $maxCurlAttempts = 12
    $maxNoProgressAttempts = 3
    $noProgressAttempts = 0
    for ($curlAttempt = 1; $curlAttempt -le $maxCurlAttempts; $curlAttempt++) {
      $resume = (Test-Path -LiteralPath $PartPath -PathType Leaf)
      $bytesBeforeCurl = if ($resume) { [int64](Get-Item -LiteralPath $PartPath).Length } else { 0 }
      if ($bytesBeforeCurl -gt $ModelSize) { throw "PARTIAL_MODEL_LARGER_THAN_EXPECTED" }

      $attempts.Add("curl_attempt_${curlAttempt}_mode=" + $(if ($resume) { "resume" } else { "fresh" }))
      $attempts.Add("curl_attempt_${curlAttempt}_before_bytes=$bytesBeforeCurl")
      $curlLog = Join-Path $EvidenceDir ("download_curl_attempt_" + $curlAttempt.ToString("00") + ".log")
      $curlCode = Invoke-CurlCheckpointDownload $curl.Source $PartPath $curlLog $resume
      $attempts.Add("curl_attempt_${curlAttempt}_exit=$curlCode")

      $bytesAfterCurl = if (Test-Path -LiteralPath $PartPath -PathType Leaf) { [int64](Get-Item -LiteralPath $PartPath).Length } else { 0 }
      if ($bytesAfterCurl -gt $ModelSize) { throw "PARTIAL_MODEL_LARGER_THAN_EXPECTED" }
      $deltaBytes = $bytesAfterCurl - $bytesBeforeCurl
      $attempts.Add("curl_attempt_${curlAttempt}_after_bytes=$bytesAfterCurl")
      $attempts.Add("curl_attempt_${curlAttempt}_delta_bytes=$deltaBytes")

      if (Test-FileIdentity $PartPath) {
        $method = if ($curlAttempt -eq 1 -and -not $resume) { "curl" } else { "curl-resume-bounded" }
        return [pscustomobject]@{ method = $method; attempts = @($attempts) }
      }

      $invalid = Quarantine-InvalidCompletePartial $PartPath
      if ($null -ne $invalid) {
        $attempts.Add("curl_attempt_${curlAttempt}_invalid_complete_sha256=$($invalid.sha256)")
        $attempts.Add("curl_attempt_${curlAttempt}_invalid_complete_quarantine=$($invalid.path)")
        $noProgressAttempts = 0
        continue
      }

      if ($deltaBytes -gt 0) {
        $noProgressAttempts = 0
      } else {
        $noProgressAttempts++
        $attempts.Add("curl_no_progress_streak=$noProgressAttempts")
      }

      if ($noProgressAttempts -ge $maxNoProgressAttempts) {
        $attempts.Add("curl_stopped_after_no_progress=true")
        break
      }
      if ($curlAttempt -lt $maxCurlAttempts) { Start-Sleep -Seconds 3 }
    }
  }

  $partialBytes = if (Test-Path -LiteralPath $PartPath -PathType Leaf) { [int64](Get-Item -LiteralPath $PartPath).Length } else { 0 }
  $partialHash = if ($partialBytes -eq $ModelSize -and (Test-Path -LiteralPath $PartPath -PathType Leaf)) { Get-FileSha256 $PartPath } else { "n/a" }
  throw ("MODEL_DOWNLOAD_FAILED_ALL :: " + ($attempts -join ",") + "; partial_bytes=" + $partialBytes + "; partial_sha256=" + $partialHash + "; evidence=" + $EvidenceDir)
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
  $downloadAttempts = @()
  if (Test-Path -LiteralPath $target -PathType Leaf) {
    if (-not (Test-FileIdentity $target)) { throw "EXISTING_MODEL_IDENTITY_MISMATCH" }
  } else {
    $downloadResult = Download-Checkpoint $part $evidenceDir
    $downloadMethod = [string]$downloadResult.method
    $downloadAttempts = @($downloadResult.attempts)
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
    schema_version = "1.4"
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
      download_attempts = $downloadAttempts
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
    ("download_attempts=" + ($downloadAttempts -join ",")),
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