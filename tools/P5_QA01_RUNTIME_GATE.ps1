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

function Test-FileIdentity([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
  $info = Get-Item -LiteralPath $Path
  if ([int64]$info.Length -ne $ModelSize) { return $false }
  return ((Get-FileSha256 $Path) -eq $ModelSha256)
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

function Get-ComfyJson([string]$Path, [int]$TimeoutSec = 30) {
  try {
    $response = Invoke-WebRequest -Uri ($ComfyBase + $Path) -UseBasicParsing -TimeoutSec $TimeoutSec
    if ([int]$response.StatusCode -ne 200) { return $null }
    return $response.Content | ConvertFrom-Json -ErrorAction Stop
  } catch {
    return $null
  }
}

function Test-ComfyListener {
  try {
    $listeners = @(Get-NetTCPConnection -LocalPort 8188 -State Listen -ErrorAction Stop)
    return ($listeners.Count -gt 0)
  } catch {
    return $false
  }
}

function Wait-ComfyReady([int]$TimeoutSeconds = 300) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $stats = Get-ComfyJson "/system_stats" 20
    if ($null -ne $stats) { return $stats }
    Start-Sleep -Seconds 3
  } while ((Get-Date) -lt $deadline)
  return $null
}

function Get-NodeInfo([string]$Name) {
  $response = Get-ComfyJson ("/object_info/" + [Uri]::EscapeDataString($Name)) 45
  if ($null -eq $response) { return $null }
  $prop = $response.PSObject.Properties[$Name]
  if ($null -ne $prop) { return $prop.Value }
  if ($null -ne $response.PSObject.Properties["input"]) { return $response }
  return $null
}

function Get-CheckpointOptions($LoaderInfo) {
  if ($null -eq $LoaderInfo) { return @() }
  $required = $LoaderInfo.input.required
  if ($null -eq $required) { return @() }
  $ckptProp = $required.PSObject.Properties["ckpt_name"]
  if ($null -eq $ckptProp) { return @() }
  $definition = @($ckptProp.Value)
  if ($definition.Count -eq 0) { return @() }
  $first = $definition[0]
  if ($first -is [string]) { return @([string]$first) }
  return @($first | ForEach-Object { [string]$_ })
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
  if (@($profile.enabled_workflows) -contains "QA01") { throw "QA01_MUST_REMAIN_DISABLED_DURING_RUNTIME_GATE" }

  $controlRoot = [string]$profile.control_root
  if ([string]::IsNullOrWhiteSpace($controlRoot)) { throw "CONTROL_ROOT_MISSING" }
  $evidenceRoot = Join-Path $controlRoot "evidence"
  New-Item -ItemType Directory -Path $evidenceRoot -Force | Out-Null
  $evidenceDir = Join-Path $evidenceRoot ("P5_QA01_RUNTIME_" + (Get-Date -Format "yyyyMMdd-HHmmss"))
  New-Item -ItemType Directory -Path $evidenceDir -Force | Out-Null

  if (-not (Test-Path -LiteralPath $ComfyRoot -PathType Container)) { throw "COMFYUI_PORTABLE_NOT_FOUND" }
  $python = Join-Path $ComfyRoot "python_embeded\python.exe"
  $mainPy = Join-Path $ComfyRoot "ComfyUI\main.py"
  if (-not (Test-Path -LiteralPath $python -PathType Leaf)) { throw "COMFYUI_PYTHON_NOT_FOUND" }
  if (-not (Test-Path -LiteralPath $mainPy -PathType Leaf)) { throw "COMFYUI_MAIN_NOT_FOUND" }

  $modelRoot = Select-ModelTargetRoot
  $target = Join-Path (Join-Path $modelRoot "checkpoints") $ModelName
  if (-not (Test-FileIdentity $target)) {
    $actual = if (Test-Path -LiteralPath $target -PathType Leaf) {
      $size = [int64](Get-Item -LiteralPath $target).Length
      $hash = if ($size -eq $ModelSize) { Get-FileSha256 $target } else { "n/a" }
      "size=$size sha256=$hash"
    } else {
      "missing"
    }
    throw ("MODEL_IDENTITY_NOT_READY :: target=" + $target + " actual=" + $actual)
  }

  $startedByGate = $false
  $comfyProcess = $null
  $listenerBefore = Test-ComfyListener
  $systemStats = Get-ComfyJson "/system_stats" 20

  if ($null -eq $systemStats -and -not $listenerBefore) {
    $stdout = Join-Path $evidenceDir "comfy_stdout.log"
    $stderr = Join-Path $evidenceDir "comfy_stderr.log"
    $args = @(
      "-s",
      "ComfyUI\main.py",
      "--windows-standalone-build",
      "--disable-auto-launch",
      "--lowvram",
      "--listen",
      "127.0.0.1"
    )
    $comfyProcess = Start-Process -FilePath $python -ArgumentList $args -WorkingDirectory $ComfyRoot -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
    $startedByGate = $true
  }

  if ($null -eq $systemStats) {
    $systemStats = Wait-ComfyReady 360
  }

  if ($null -eq $systemStats) {
    $listenerAfter = Test-ComfyListener
    $processState = if ($null -ne $comfyProcess) {
      if ($comfyProcess.HasExited) { "exited=$($comfyProcess.ExitCode)" } else { "running_pid=$($comfyProcess.Id)" }
    } else {
      "not_started_by_gate"
    }
    throw ("COMFYUI_SYSTEM_STATS_TIMEOUT :: listener_before=$listenerBefore listener_after=$listenerAfter process=$processState evidence=$evidenceDir")
  }

  $requiredNodes = @(
    "CheckpointLoaderSimple",
    "CLIPTextEncode",
    "EmptyLatentImage",
    "KSampler",
    "VAEDecode",
    "SaveImage"
  )

  $nodeInfo = @{}
  $missingNodes = New-Object System.Collections.Generic.List[string]
  foreach ($name in $requiredNodes) {
    $info = Get-NodeInfo $name
    if ($null -eq $info) {
      $missingNodes.Add($name)
    } else {
      $nodeInfo[$name] = $info
    }
  }
  if ($missingNodes.Count -gt 0) {
    throw ("MISSING_OR_UNRESPONSIVE_NATIVE_NODES :: " + ($missingNodes -join ",") + "; evidence=" + $evidenceDir)
  }

  $checkpointOptions = @(Get-CheckpointOptions $nodeInfo["CheckpointLoaderSimple"])
  $modelVisible = $false
  foreach ($option in $checkpointOptions) {
    if ([IO.Path]::GetFileName([string]$option) -ieq $ModelName) {
      $modelVisible = $true
      break
    }
  }
  if (-not $modelVisible) {
    throw ("SDXL_CHECKPOINT_NOT_VISIBLE_IN_TARGETED_OBJECT_INFO :: option_count=" + $checkpointOptions.Count + "; evidence=" + $evidenceDir)
  }

  $deviceNames = @()
  if ($null -ne $systemStats.PSObject.Properties["devices"]) {
    $deviceNames = @($systemStats.devices | ForEach-Object { [string]$_.name })
  }

  $report = [ordered]@{
    schema_version = "1.0"
    at = (Get-Date).ToString("o")
    site_id = $SiteId
    git_head = $head
    git_branch = $branch
    qa01_enabled = (@($profile.enabled_workflows) -contains "QA01")
    model = [ordered]@{
      filename = $ModelName
      target = $target
      size_bytes = $ModelSize
      sha256 = $ModelSha256
      identity_pass = $true
      visible_in_targeted_object_info = $modelVisible
      checkpoint_option_count = $checkpointOptions.Count
    }
    runtime = [ordered]@{
      comfy_base = $ComfyBase
      listener_before = $listenerBefore
      started_by_gate = $startedByGate
      launch_mode = "--windows-standalone-build --disable-auto-launch --lowvram --listen 127.0.0.1"
      readiness_endpoint = "/system_stats"
      node_endpoint_mode = "/object_info/{node_class}"
      required_native_nodes = $requiredNodes
      missing_native_nodes = @($missingNodes)
      devices = $deviceNames
    }
  }

  [IO.File]::WriteAllText(
    (Join-Path $evidenceDir "runtime_gate.json"),
    ($report | ConvertTo-Json -Depth 8),
    (New-Object System.Text.UTF8Encoding($false))
  )

  $summary = @(
    "P5_QA01_RUNTIME_GATE=PASS",
    ("git_head=" + $head),
    ("model_target=" + $target),
    ("model_sha256=" + $ModelSha256),
    ("comfy_ready=True"),
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
  Write-Host "Runtime summary copied to clipboard when Set-Clipboard is available." -ForegroundColor Yellow
  exit 0
} catch {
  $summary = @(
    "P5_QA01_RUNTIME_GATE=FAIL",
    ("error=" + $_.Exception.Message)
  )
  if (Get-Command Set-Clipboard -ErrorAction SilentlyContinue) {
    try { Set-Clipboard -Value ($summary -join [Environment]::NewLine) } catch {}
  }
  $summary | ForEach-Object { Write-Host $_ -ForegroundColor Red }
  exit 1
}
