param(
  [string]$SiteId = "drift-curio",
  [string]$ExpectedHead = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$ExpectedBranch = "feat/p5-qa01-scene-freeze"
$ExternalModelRoot = "D:\AI\MODELS\ComfyUI"

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

function Get-Sha256([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Test-Identity($Model, [string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
  $info = Get-Item -LiteralPath $Path
  if ([int64]$info.Length -ne [int64]$Model.size_bytes) { return $false }
  return ((Get-Sha256 $Path) -eq ([string]$Model.sha256).ToLowerInvariant())
}

function Write-Lines([string]$Path, [object[]]$Lines) {
  $textLines = @($Lines | ForEach-Object { [string]$_ })
  [IO.File]::WriteAllLines($Path, $textLines, [Text.Encoding]::UTF8)
}

function Quarantine-Invalid([string]$Path, $Model, [string]$Reason) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
  $info = Get-Item -LiteralPath $Path
  $hash = if ([int64]$info.Length -eq [int64]$Model.size_bytes) { Get-Sha256 $Path } else { "size-mismatch" }
  $safeHash = if ($hash -eq "size-mismatch") { "size" } else { $hash.Substring(0, 12) }
  $suffix = (Get-Date -Format "yyyyMMdd-HHmmss") + "-" + $Reason + "-" + $safeHash
  $target = $Path + ".invalid-" + $suffix
  if (Test-Path -LiteralPath $target) { throw "QUARANTINE_COLLISION: $target" }
  Move-Item -LiteralPath $Path -Destination $target
  return [pscustomobject]@{ path=$target; size_bytes=[int64]$info.Length; sha256=$hash }
}

function Invoke-ResumableCurl($Model, [string]$PartPath, [string]$EvidenceDir) {
  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  if ($null -eq $curl) { throw "CURL_EXE_NOT_FOUND" }

  $attemptNotes = @()
  $maxOuterAttempts = 40
  $maxNoProgress = 4
  $noProgress = 0

  for ($attempt = 1; $attempt -le $maxOuterAttempts; $attempt++) {
    $exists = Test-Path -LiteralPath $PartPath -PathType Leaf
    $before = if ($exists) { [int64](Get-Item -LiteralPath $PartPath).Length } else { 0 }
    if ($before -gt [int64]$Model.size_bytes) {
      $q = Quarantine-Invalid $PartPath $Model "oversize"
      $attemptNotes += "quarantine_oversize=$($q.path)"
      $before = 0
      $exists = $false
    }

    if ($exists -and $before -eq [int64]$Model.size_bytes) {
      if (Test-Identity $Model $PartPath) {
        return [pscustomobject]@{ method="existing-complete-partial"; attempts=$attemptNotes }
      }
      $q = Quarantine-Invalid $PartPath $Model "badsha"
      $attemptNotes += "quarantine_badsha=$($q.path)"
      $before = 0
      $exists = $false
    }

    $mode = if ($exists -and $before -gt 0) { "resume" } else { "fresh" }
    $attemptNotes += "attempt_${attempt}_mode=$mode"
    $attemptNotes += "attempt_${attempt}_before_bytes=$before"

    $args = @(
      "-L",
      "--fail",
      "--http1.1",
      "--retry", "8",
      "--retry-delay", "5",
      "--retry-all-errors",
      "--connect-timeout", "30",
      "--speed-time", "90",
      "--speed-limit", "1024",
      "--keepalive-time", "30",
      "--user-agent", "Mozilla/5.0",
      "--output", $PartPath
    )
    if ($mode -eq "resume") { $args += @("--continue-at", "-") }
    $args += @([string]$Model.url)

    $logPath = Join-Path $EvidenceDir (([string]$Model.key) + "_curl_attempt_" + $attempt.ToString("00") + ".log")
    $previous = $ErrorActionPreference
    try {
      $ErrorActionPreference = "Continue"
      $output = @(& $curl.Source @args 2>&1)
      $exitCode = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previous }
    Write-Lines $logPath $output

    $after = if (Test-Path -LiteralPath $PartPath -PathType Leaf) { [int64](Get-Item -LiteralPath $PartPath).Length } else { 0 }
    $delta = $after - $before
    $attemptNotes += "attempt_${attempt}_exit=$exitCode"
    $attemptNotes += "attempt_${attempt}_after_bytes=$after"
    $attemptNotes += "attempt_${attempt}_delta_bytes=$delta"

    if ($after -gt [int64]$Model.size_bytes) {
      $q = Quarantine-Invalid $PartPath $Model "oversize"
      $attemptNotes += "quarantine_oversize=$($q.path)"
      $noProgress = 0
      continue
    }

    if ($after -eq [int64]$Model.size_bytes) {
      if (Test-Identity $Model $PartPath) {
        return [pscustomobject]@{ method="curl-progress-resume"; attempts=$attemptNotes }
      }
      $q = Quarantine-Invalid $PartPath $Model "badsha"
      $attemptNotes += "quarantine_badsha=$($q.path)"
      $noProgress = 0
      continue
    }

    if ($delta -gt 0) {
      $noProgress = 0
    } else {
      $noProgress++
      $attemptNotes += "no_progress_streak=$noProgress"
    }

    if ($noProgress -ge $maxNoProgress) {
      throw ("DOWNLOAD_STALLED: key=" + $Model.key + "; bytes=" + $after + "; attempts=" + ($attemptNotes -join ","))
    }
    if ($attempt -lt $maxOuterAttempts) { Start-Sleep -Seconds 3 }
  }

  $finalBytes = if (Test-Path -LiteralPath $PartPath -PathType Leaf) { [int64](Get-Item -LiteralPath $PartPath).Length } else { 0 }
  throw ("DOWNLOAD_ATTEMPTS_EXHAUSTED: key=" + $Model.key + "; bytes=" + $finalBytes + "; attempts=" + ($attemptNotes -join ","))
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
  if (@($profile.enabled_workflows) -contains "QA01") { throw "QA01_MUST_REMAIN_DISABLED_DURING_KONTEXT_DEV_EVAL_INSTALL" }

  $models = @(
    [pscustomobject]@{
      key="kontext";
      filename="flux1-dev-kontext_fp8_scaled.safetensors";
      relative_dir="diffusion_models";
      size_bytes=[int64]11904640136;
      sha256="630ba795ec64283b4230ea23cf79406c2c68b7c578229ed139f30043eadb30a2";
      url="https://huggingface.co/Comfy-Org/flux1-kontext-dev_ComfyUI/resolve/main/split_files/diffusion_models/flux1-dev-kontext_fp8_scaled.safetensors?download=true"
    },
    [pscustomobject]@{
      key="vae";
      filename="ae.safetensors";
      relative_dir="vae";
      size_bytes=[int64]335304388;
      sha256="afc8e28272cd15db3919bacdb6918ce9c1ed22e96cb12c4d5ed0fba823529e38";
      url="https://huggingface.co/Comfy-Org/Lumina_Image_2.0_Repackaged/resolve/main/split_files/vae/ae.safetensors?download=true"
    },
    [pscustomobject]@{
      key="clip_l";
      filename="clip_l.safetensors";
      relative_dir="text_encoders";
      size_bytes=[int64]246144152;
      sha256="660c6f5b1abae9dc498ac2d21e1347d2abdb0cf6c0c0c8576cd796491d9a6cdd";
      url="https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors?download=true"
    },
    [pscustomobject]@{
      key="t5_fp8";
      filename="t5xxl_fp8_e4m3fn_scaled.safetensors";
      relative_dir="text_encoders";
      size_bytes=[int64]5157348688;
      sha256="a498f0485dc9536735258018417c3fd7758dc3bccc0a645feaa472b34955557a";
      url="https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp8_e4m3fn_scaled.safetensors?download=true"
    }
  )

  $drive = Get-PSDrive -Name D -ErrorAction Stop
  $requiredBytes = [int64](($models | Measure-Object -Property size_bytes -Sum).Sum)
  $alreadyValidBytes = [int64]0
  foreach ($m in $models) {
    $candidate = Join-Path (Join-Path $ExternalModelRoot ([string]$m.relative_dir)) ([string]$m.filename)
    if (Test-Identity $m $candidate) { $alreadyValidBytes += [int64]$m.size_bytes }
  }
  $remainingBytes = $requiredBytes - $alreadyValidBytes
  $safetyReserve = [int64](5GB)
  if ([int64]$drive.Free -lt ($remainingBytes + $safetyReserve)) {
    throw ("INSUFFICIENT_D_FREE_SPACE: free=" + [int64]$drive.Free + "; remaining=" + $remainingBytes + "; reserve=" + $safetyReserve)
  }

  $evidenceRoot = Join-Path ([string]$profile.control_root) "evidence"
  New-Item -ItemType Directory -Path $evidenceRoot -Force | Out-Null
  $evidenceDir = Join-Path $evidenceRoot ("P5_QA01_V2_KONTEXT_EVAL_INSTALL_" + (Get-Date -Format "yyyyMMdd-HHmmss"))
  New-Item -ItemType Directory -Path $evidenceDir -Force | Out-Null

  $results = @()
  foreach ($m in $models) {
    $dir = Join-Path $ExternalModelRoot ([string]$m.relative_dir)
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    $target = Join-Path $dir ([string]$m.filename)
    $part = $target + ".download"

    Write-Host ("==> " + $m.key + " :: " + $m.filename) -ForegroundColor Cyan

    if (Test-Path -LiteralPath $target -PathType Leaf) {
      if (Test-Identity $m $target) {
        Write-Host "VALID_EXISTING_MODEL=PASS" -ForegroundColor Green
        $results += [pscustomobject]@{ key=$m.key; target=$target; method="existing-valid"; size_bytes=$m.size_bytes; sha256=$m.sha256 }
        continue
      }
      $q = Quarantine-Invalid $target $m "formal-bad"
      Write-Host ("QUARANTINED_INVALID_FORMAL=" + $q.path) -ForegroundColor Yellow
    }

    $download = Invoke-ResumableCurl $m $part $evidenceDir
    if (-not (Test-Identity $m $part)) { throw ("IDENTITY_NOT_VALID_AFTER_DOWNLOAD: " + $m.key) }
    if (Test-Path -LiteralPath $target) { throw ("TARGET_COLLISION_BEFORE_PROMOTE: " + $target) }
    Move-Item -LiteralPath $part -Destination $target
    if (-not (Test-Identity $m $target)) { throw ("IDENTITY_NOT_VALID_AFTER_PROMOTE: " + $m.key) }

    Write-Host ("MODEL_DOWNLOAD_PASS=" + $m.key) -ForegroundColor Green
    $results += [pscustomobject]@{ key=$m.key; target=$target; method=$download.method; size_bytes=$m.size_bytes; sha256=$m.sha256 }
  }

  $report = [ordered]@{
    schema_version="1.0"
    at=(Get-Date).ToString("o")
    site_id=$SiteId
    git_head=$head
    evaluation_only=$true
    production_authorized=$false
    qa01_enabled=$false
    license_boundary="FLUX_DEV_NON_COMMERCIAL_EVALUATION_ONLY"
    model_root=$ExternalModelRoot
    models=$results
  }
  [IO.File]::WriteAllText((Join-Path $evidenceDir "install_report.json"), ($report | ConvertTo-Json -Depth 8), (New-Object System.Text.UTF8Encoding($false)))

  $summary = @(
    "P5_QA01_V2_KONTEXT_EVAL_MODEL_INSTALL_GATE=PASS",
    ("git_head=" + $head),
    "evaluation_only=True",
    "production_authorized=False",
    "qa01_enabled=False",
    ("model_root=" + $ExternalModelRoot),
    "kontext_sha256=630ba795ec64283b4230ea23cf79406c2c68b7c578229ed139f30043eadb30a2",
    "vae_sha256=afc8e28272cd15db3919bacdb6918ce9c1ed22e96cb12c4d5ed0fba823529e38",
    "clip_l_sha256=660c6f5b1abae9dc498ac2d21e1347d2abdb0cf6c0c0c8576cd796491d9a6cdd",
    "t5_fp8_sha256=a498f0485dc9536735258018417c3fd7758dc3bccc0a645feaa472b34955557a",
    ("evidence_dir=" + $evidenceDir)
  )
  Write-Lines (Join-Path $evidenceDir "summary.txt") $summary
  if (Get-Command Set-Clipboard -ErrorAction SilentlyContinue) { try { Set-Clipboard -Value ($summary -join [Environment]::NewLine) } catch {} }
  $summary | ForEach-Object { Write-Host $_ }
  exit 0
} catch {
  $summary = @("P5_QA01_V2_KONTEXT_EVAL_MODEL_INSTALL_GATE=FAIL", ("error=" + $_.Exception.Message))
  if (Get-Command Set-Clipboard -ErrorAction SilentlyContinue) { try { Set-Clipboard -Value ($summary -join [Environment]::NewLine) } catch {} }
  $summary | ForEach-Object { Write-Host $_ -ForegroundColor Red }
  exit 1
}
