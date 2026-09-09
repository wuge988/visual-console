param(
  [Parameter(Mandatory=$true)][string]$RepoRoot,
  [Parameter(Mandatory=$true)][string]$Branch,
  [Parameter(Mandatory=$true)][string]$ExpectedHead,
  [string]$SiteId = 'drift-curio',
  [string]$Sku = 'DC-ZY-SZ-31001',
  [string]$VideoPath = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Fail([string]$Message) {
  Write-Host 'P5_QA01_V4_VIDEO_DISCOVERY=FAIL' -ForegroundColor Red
  Write-Host "error=$Message" -ForegroundColor Red
  exit 1
}

function Add-Root([System.Collections.Generic.List[string]]$Roots, [System.Collections.Generic.HashSet[string]]$Seen, [string]$Path) {
  if ([string]::IsNullOrWhiteSpace($Path)) { return }
  if (-not (Test-Path -LiteralPath $Path -PathType Container)) { return }
  try { $resolved = (Resolve-Path -LiteralPath $Path).Path } catch { return }
  if ($Seen.Add($resolved)) { $Roots.Add($resolved) }
}

function Video-Extension([string]$Extension) {
  return @('.mp4','.mov','.mkv','.avi','.webm') -contains $Extension.ToLowerInvariant()
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

  $sitePath = Join-Path $RepoRoot ("config\sites\{0}.json" -f $SiteId)
  if (-not (Test-Path -LiteralPath $sitePath -PathType Leaf)) { Fail "SITE_CONFIG_MISSING:$sitePath" }
  $site = Get-Content -LiteralPath $sitePath -Raw -Encoding UTF8 | ConvertFrom-Json

  if ([string]::IsNullOrWhiteSpace($VideoPath)) {
    Write-Host '==> Bounded read-only discovery for existing SKU video' -ForegroundColor Cyan
    Write-Host 'VIDEO_DISCOVERY_MUTATION=NONE'

    $roots = New-Object 'System.Collections.Generic.List[string]'
    $seenRoots = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)

    Add-Root $roots $seenRoots ([string]$site.raw_root)
    Add-Root $roots $seenRoots ([string]$site.asset_root)
    Add-Root $roots $seenRoots ([string]$site.work_root)
    Add-Root $roots $seenRoots ([string]$site.control_root)

    $assetParent = Split-Path -Parent ([string]$site.asset_root)
    Add-Root $roots $seenRoots $assetParent
    Add-Root $roots $seenRoots 'D:\AI\WORK'

    $projectRoot = Split-Path -Parent $RepoRoot
    if (Test-Path -LiteralPath $projectRoot -PathType Container) {
      Get-ChildItem -LiteralPath $projectRoot -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '(?i)(drift|curio|3d|scan|reality|photogram|splat)' } |
        ForEach-Object { Add-Root $roots $seenRoots $_.FullName }
    }

    Add-Root $roots $seenRoots (Join-Path $env:USERPROFILE 'Desktop')
    Add-Root $roots $seenRoots 'D:\Users\Administrator\Desktop'

    Write-Host 'VIDEO_DISCOVERY_ROOTS=' -ForegroundColor Yellow
    $roots | ForEach-Object { Write-Host ('  ' + $_) -ForegroundColor Yellow }

    $seenFiles = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
    $candidates = New-Object 'System.Collections.Generic.List[object]'
    foreach ($root in $roots) {
      Get-ChildItem -LiteralPath $root -File -Recurse -ErrorAction SilentlyContinue |
        Where-Object { Video-Extension $_.Extension } |
        ForEach-Object {
          if ($seenFiles.Add($_.FullName)) { $candidates.Add($_) }
        }
    }

    $skuCompact = ($Sku -replace '[^A-Za-z0-9]','').ToLowerInvariant()
    $skuSerial = ($Sku -split '-')[-1]
    $identityMatches = @(
      $candidates |
        Where-Object {
          $pathCompact = ($_.FullName -replace '[^A-Za-z0-9]','').ToLowerInvariant()
          $_.FullName -like "*$Sku*" -or
          $pathCompact.Contains($skuCompact) -or
          $_.FullName -like "*$skuSerial*"
        } |
        Sort-Object LastWriteTime -Descending
    )

    if ($identityMatches.Count -gt 0) {
      Write-Host 'VIDEO_DISCOVERY_MODE=IDENTITY_PATH_MATCH' -ForegroundColor Green
      Write-Host 'identity_video_candidates=' -ForegroundColor Yellow
      $identityMatches | Select-Object -First 8 | ForEach-Object {
        Write-Host ("  MODIFIED={0} SIZE_MB={1:N1} PATH={2}" -f $_.LastWriteTime.ToString('s'), ($_.Length / 1MB), $_.FullName) -ForegroundColor Yellow
      }
      $VideoPath = $identityMatches[0].FullName
      Write-Host "VIDEO_DISCOVERY_SELECTED=$VideoPath" -ForegroundColor Green
    }
    else {
      $ranked = @(
        $candidates |
          ForEach-Object {
            $score = 0
            if ($_.FullName -match '(?i)(3d|scan|reality|turntable|capture|video2twin|photogram|gaussian|splat|旋转|转盘|扫描)') { $score += 100 }
            [pscustomobject]@{
              Score = $score
              LastWriteTime = $_.LastWriteTime
              Length = $_.Length
              FullName = $_.FullName
            }
          } |
          Sort-Object @{Expression='Score';Descending=$true}, @{Expression='LastWriteTime';Descending=$true} |
          Select-Object -First 20
      )

      if ($ranked.Count -eq 0) {
        Fail "V4_VIDEO_NOT_FOUND_IN_BOUNDED_DISCOVERY_ROOTS:$Sku"
      }

      Write-Host 'VIDEO_DISCOVERY_MODE=EXPLICIT_SELECTION_REQUIRED' -ForegroundColor Yellow
      Write-Host 'candidate_videos=' -ForegroundColor Yellow
      $index = 0
      foreach ($row in $ranked) {
        $index += 1
        Write-Host ("  INDEX={0} SCORE={1} MODIFIED={2} SIZE_MB={3:N1} PATH={4}" -f $index, $row.Score, $row.LastWriteTime.ToString('s'), ($row.Length / 1MB), $row.FullName) -ForegroundColor Yellow
      }
      Fail "V4_VIDEO_SELECTION_REQUIRED:$Sku"
    }
  }
  else {
    $VideoPath = (Resolve-Path -LiteralPath $VideoPath).Path
    if (-not (Video-Extension ([System.IO.Path]::GetExtension($VideoPath)))) { Fail "V4_VIDEO_EXTENSION_UNSUPPORTED:$VideoPath" }
    Write-Host 'VIDEO_DISCOVERY_MODE=EXPLICIT_PATH' -ForegroundColor Green
    Write-Host "VIDEO_DISCOVERY_SELECTED=$VideoPath" -ForegroundColor Green
  }

  $gate = Join-Path $RepoRoot 'tools\P5_QA01_V4_VIDEO2TWIN_LOCAL_GATE.ps1'
  if (-not (Test-Path -LiteralPath $gate -PathType Leaf)) { Fail "V4_GATE_MISSING:$gate" }

  Write-Host '==> Run v4 Video2Twin Gate with resolved read-only source video' -ForegroundColor Cyan
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $gate `
    -RepoRoot $RepoRoot `
    -Branch $Branch `
    -ExpectedHead $ExpectedHead `
    -SiteId $SiteId `
    -Sku $Sku `
    -VideoPath $VideoPath
  exit $LASTEXITCODE
}
catch {
  Fail $_.Exception.Message
}
