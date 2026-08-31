param(
  [string]$RepoRoot = "E:\AI_PROJECTS\VISUAL_CONSOLE",
  [string]$Branch = "feat/p5-qa01-scene-freeze",
  [string]$ExpectedHead
)

$ErrorActionPreference = "Stop"
$ComfyRoot = "D:\AI\APPS\ComfyUI_windows_portable"
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

function Get-ComfyJson([string]$Path, [int]$TimeoutSec = 30) {
  try {
    $response = Invoke-WebRequest -Uri ($ComfyBase + $Path) -UseBasicParsing -TimeoutSec $TimeoutSec
    if ([int]$response.StatusCode -ne 200) { return $null }
    return $response.Content | ConvertFrom-Json -ErrorAction Stop
  } catch {
    return $null
  }
}

function Get-NodeInfo([string]$Name) {
  $response = Get-ComfyJson ("/object_info/" + [Uri]::EscapeDataString($Name)) 45
  if ($null -eq $response) { return $null }
  $prop = $response.PSObject.Properties[$Name]
  if ($null -ne $prop) { return $prop.Value }
  if ($null -ne $response.PSObject.Properties["input"]) { return $response }
  return $null
}

function Wait-ComfyReady([int]$TimeoutSeconds = 360) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $stats = Get-ComfyJson "/system_stats" 20
    if ($null -ne $stats) { return $stats }
    Start-Sleep -Seconds 3
  } while ((Get-Date) -lt $deadline)
  return $null
}

try {
  if ([string]::IsNullOrWhiteSpace($ExpectedHead)) { throw "EXPECTED_HEAD_REQUIRED" }
  Set-Location $RepoRoot
  $repo = ((Invoke-Git rev-parse --show-toplevel) -join "").Trim()
  if ([IO.Path]::GetFullPath($repo) -ne [IO.Path]::GetFullPath($RepoRoot)) { throw "REPO_ROOT_MISMATCH" }

  $dirty = @((Invoke-Git status --porcelain=v1 --untracked-files=all) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ($dirty.Count -gt 0) { throw ("WORKTREE_NOT_CLEAN :: " + ($dirty -join " | ")) }

  Write-Host "==> Sync exact audited P5 D2 mask-capability head" -ForegroundColor Cyan
  Invoke-Git fetch origin ("+refs/heads/" + $Branch + ":refs/remotes/origin/" + $Branch) | Out-Null
  $remote = ((Invoke-Git rev-parse ("refs/remotes/origin/" + $Branch)) -join "").Trim()
  if ($remote -ne $ExpectedHead.Trim()) { throw "REMOTE_HEAD_MISMATCH: expected=$($ExpectedHead.Trim()) actual=$remote" }

  $beforeHead = ((Invoke-Git rev-parse HEAD) -join "").Trim()
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $safety = "safety/local-before-p5-d2-mask-capability-$stamp"
  Invoke-Git branch $safety $beforeHead | Out-Null
  Write-Host ("SAFETY_BRANCH=" + $safety)

  Invoke-Git switch --detach $remote | Out-Null
  $localExists = $false
  $previous = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    & git show-ref --verify --quiet ("refs/heads/" + $Branch)
    $localExists = ($LASTEXITCODE -eq 0)
  } finally { $ErrorActionPreference = $previous }
  if ($localExists) {
    Invoke-Git branch -f $Branch $remote | Out-Null
    Invoke-Git switch $Branch | Out-Null
  } else {
    Invoke-Git switch -c $Branch $remote | Out-Null
  }

  $head = ((Invoke-Git rev-parse HEAD) -join "").Trim()
  if ($head -ne $ExpectedHead.Trim()) { throw "LOCAL_HEAD_MISMATCH: expected=$($ExpectedHead.Trim()) actual=$head" }
  $dirtyAfter = @((Invoke-Git status --porcelain=v1 --untracked-files=all) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ($dirtyAfter.Count -gt 0) { throw ("WORKTREE_NOT_CLEAN_AFTER_SYNC :: " + ($dirtyAfter -join " | ")) }

  $profile = Read-JsonUtf8 (Join-Path $RepoRoot "config\sites\drift-curio.json")
  if (@($profile.enabled_workflows) -contains "QA01") { throw "QA01_MUST_REMAIN_DISABLED_DURING_D2_CAPABILITY_GATE" }
  $registry = Read-JsonUtf8 (Join-Path $RepoRoot "config\workflows\registry.json")
  $qa01 = @($registry.workflows | Where-Object { $_.code -eq "QA01" }) | Select-Object -First 1
  if ($null -eq $qa01 -or [bool]$qa01.executable -ne $false -or [string]$qa01.workflow_status -ne "NOT_REGISTERED") {
    throw "QA01_REGISTRY_MUST_REMAIN_FAIL_CLOSED"
  }

  $controlRoot = [string]$profile.control_root
  $evidenceDir = Join-Path (Join-Path $controlRoot "evidence") ("P5_QA01_V2_D2_MASK_CAPABILITY_" + (Get-Date -Format "yyyyMMdd-HHmmss"))
  New-Item -ItemType Directory -Path $evidenceDir -Force | Out-Null

  $systemStats = Get-ComfyJson "/system_stats" 20
  $startedByGate = $false
  if ($null -eq $systemStats) {
    $python = Join-Path $ComfyRoot "python_embeded\python.exe"
    $mainPy = Join-Path $ComfyRoot "ComfyUI\main.py"
    if (-not (Test-Path -LiteralPath $python -PathType Leaf)) { throw "COMFYUI_PYTHON_NOT_FOUND" }
    if (-not (Test-Path -LiteralPath $mainPy -PathType Leaf)) { throw "COMFYUI_MAIN_NOT_FOUND" }
    $stdout = Join-Path $evidenceDir "comfy_stdout.log"
    $stderr = Join-Path $evidenceDir "comfy_stderr.log"
    $args = @(
      "-s",
      "ComfyUI\main.py",
      "--windows-standalone-build",
      "--disable-auto-launch",
      "--lowvram",
      "--cpu-vae",
      "--listen",
      "127.0.0.1"
    )
    Start-Process -FilePath $python -ArgumentList $args -WorkingDirectory $ComfyRoot -RedirectStandardOutput $stdout -RedirectStandardError $stderr | Out-Null
    $startedByGate = $true
    $systemStats = Wait-ComfyReady 420
  }
  if ($null -eq $systemStats) { throw ("COMFYUI_SYSTEM_STATS_TIMEOUT :: evidence=" + $evidenceDir) }

  $requiredBase = @(
    "UNETLoader", "DualCLIPLoader", "VAELoader", "LoadImage", "CLIPTextEncode",
    "ReferenceLatent", "FluxGuidance", "ConditioningZeroOut", "KSampler", "VAEDecode", "PreviewImage"
  )
  $missingBase = New-Object System.Collections.Generic.List[string]
  foreach ($name in $requiredBase) {
    if ($null -eq (Get-NodeInfo $name)) { $missingBase.Add($name) }
  }
  if ($missingBase.Count -gt 0) { throw ("D2_BASE_NODES_MISSING :: " + ($missingBase -join ",")) }

  $hasVaeInpaint = ($null -ne (Get-NodeInfo "VAEEncodeForInpaint"))
  $hasSetNoiseMask = ($null -ne (Get-NodeInfo "SetLatentNoiseMask"))
  $hasVaeEncode = ($null -ne (Get-NodeInfo "VAEEncode"))
  $hasInpaintConditioning = ($null -ne (Get-NodeInfo "InpaintModelConditioning"))

  $preferredMode = "NONE"
  if ($hasVaeInpaint) {
    $preferredMode = "VAEEncodeForInpaint"
  } elseif ($hasVaeEncode -and $hasSetNoiseMask) {
    $preferredMode = "VAEEncode_PLUS_SetLatentNoiseMask"
  } elseif ($hasInpaintConditioning) {
    $preferredMode = "InpaintModelConditioning"
  }

  $maskRuntimeReady = ($preferredMode -ne "NONE")
  $report = [ordered]@{
    schema_version = "1.0"
    at = (Get-Date).ToString("o")
    git_head = $head
    qa01_enabled = $false
    probe_mode = "READ_ONLY"
    production_mutation = "NONE"
    comfy_ready = $true
    comfy_started_by_gate = $startedByGate
    required_base_nodes = $requiredBase
    missing_base_nodes = @($missingBase)
    mask_nodes = [ordered]@{
      VAEEncodeForInpaint = $hasVaeInpaint
      VAEEncode = $hasVaeEncode
      SetLatentNoiseMask = $hasSetNoiseMask
      InpaintModelConditioning = $hasInpaintConditioning
    }
    preferred_mask_runtime = $preferredMode
    mask_runtime_ready = $maskRuntimeReady
    planned_d2_architecture = "SC01 alpha -> protected core + integration band -> masked environment generation -> deterministic protected-core reassertion"
  }
  $reportPath = Join-Path $evidenceDir "report.json"
  $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $reportPath -Encoding UTF8

  Write-Host "P5_QA01_V2_D2_MASK_CAPABILITY_GATE=PASS" -ForegroundColor Green
  Write-Host ("git_head=" + $head)
  Write-Host "comfy_ready=True"
  Write-Host ("comfy_started_by_gate=" + $startedByGate)
  Write-Host ("vae_encode_for_inpaint=" + $hasVaeInpaint)
  Write-Host ("set_latent_noise_mask=" + $hasSetNoiseMask)
  Write-Host ("inpaint_model_conditioning=" + $hasInpaintConditioning)
  Write-Host ("preferred_mask_runtime=" + $preferredMode)
  Write-Host ("mask_runtime_ready=" + $maskRuntimeReady)
  Write-Host "qa01_enabled=False"
  Write-Host "probe_mode=READ_ONLY"
  Write-Host "production_mutation=NONE"
  Write-Host ("evidence_dir=" + $evidenceDir)

  $summary = @(
    "P5_QA01_V2_D2_MASK_CAPABILITY_GATE=PASS",
    "git_head=$head",
    "comfy_ready=True",
    "comfy_started_by_gate=$startedByGate",
    "vae_encode_for_inpaint=$hasVaeInpaint",
    "set_latent_noise_mask=$hasSetNoiseMask",
    "inpaint_model_conditioning=$hasInpaintConditioning",
    "preferred_mask_runtime=$preferredMode",
    "mask_runtime_ready=$maskRuntimeReady",
    "qa01_enabled=False",
    "probe_mode=READ_ONLY",
    "production_mutation=NONE",
    "evidence_dir=$evidenceDir"
  ) -join [Environment]::NewLine
  if (Get-Command Set-Clipboard -ErrorAction SilentlyContinue) {
    try { Set-Clipboard -Value $summary } catch {}
  }
  Write-Host "P5_QA01_V2_D2_MASK_CAPABILITY_LOCAL_GATE=PASS" -ForegroundColor Green
  exit 0
} catch {
  Write-Host "P5_QA01_V2_D2_MASK_CAPABILITY_LOCAL_GATE=FAIL" -ForegroundColor Red
  Write-Host ("error=" + $_.Exception.Message) -ForegroundColor Red
  exit 1
}
