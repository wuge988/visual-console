param(
  [string]$RepoRoot = 'E:\AI_PROJECTS\VISUAL_CONSOLE',
  [string]$Branch = 'feat/p5-qa01-scene-freeze',
  [string]$ExpectedHead = 'ed216ac6bcd2f703ac6826631b9984dd43320172',
  [string]$VideoPath = '',
  [string]$RecoveryPath = '',
  [switch]$PlanOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ToolRoot = 'D:\AI\TOOLS\DC_Video2Twin'
$PythonExe = "$ToolRoot\venv-py310\Scripts\python.exe"
$UvExe = "$ToolRoot\uv-0.12.10\uv.exe"
$RuntimeMarker = "$ToolRoot\runtime-py310-pt291-cu128-v1.json"
$ExpectedRecoveryBlob = '5601155de9c09cc1e2ee45fbf147e21410d714a5'
$ExpectedVideoSha = 'a322cd09820af0fe7d3092101d7660787853c7b2979c7e207c3be5e0bf4778aa'

$Sam2Commit = '2b90b9f5ceec907a1c18123530e92e794ad901a4'
$Sam2Repo = 'https://github.com/facebookresearch/sam2.git'
$Sam2ArchiveUrl = "https://codeload.github.com/facebookresearch/sam2/zip/$Sam2Commit"
$Sam2ArchiveRootName = "sam2-$Sam2Commit"
$Sam2ArchiveDir = "$ToolRoot\source-archives"
$Sam2Archive = "$Sam2ArchiveDir\sam2-$Sam2Commit.zip"
$Sam2Part = "$Sam2Archive.part"
$Sam2SourceRoot = "$ToolRoot\vendor\sam2-$Sam2Commit"
$Sam2OfficialTree = '64becbca23f880e0056449377496da248a74da43'

$Sam2CriticalBlobs = [ordered]@{
  'setup.py' = '78a634cddb19615c45601681ffbcd1f29af66f47'
  'sam2\automatic_mask_generator.py' = '065e469e27c2d3af40d51d072031e828692c799b'
  'sam2\build_sam.py' = '3a3bef1e566d86c3ba0fd75f425530bc6505e9bf'
  'sam2\modeling\sam2_base.py' = 'd9f4e515b0d161942bf2bb64560056b3efbe6dac'
  'LICENSE' = '261eeb9e9f8b2b4b0d119366dda99c6fd7d35c64'
}

$Recon3dRepo = 'https://github.com/jashshah999/recon3d.git'
$Recon3dCommit = '59fe356bceab74ef7d5839b68aba232bce20e14d'
$Recon3dCache = "$ToolRoot\git-cache\recon3d.git"

function Fail([string]$Message) {
  Write-Host 'P5_QA01_V4_SAM2_SOURCE_RECOVERY=FAIL' -ForegroundColor Red
  Write-Host "error=$Message" -ForegroundColor Red
  exit 1
}

function Quote-WindowsCommandLineArg([string]$Value) {
  if ($null -eq $Value) { return '""' }
  if ($Value.Contains('"')) { throw 'COMMAND_LINE_ARG_CONTAINS_QUOTE' }
  return '"' + $Value + '"'
}

function Start-NativeVisible([string]$Label, [string]$FilePath, [string[]]$ArgumentList) {
  Write-Host "==> $Label" -ForegroundColor Cyan
  $p = Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -Wait -PassThru -NoNewWindow
  Write-Host "${Label}_EXIT=$($p.ExitCode)"
  return [int]$p.ExitCode
}

function Assert-ExactLocalState {
  $resolvedRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
  Set-Location $resolvedRoot
  $top = (& git rev-parse --show-toplevel).Trim()
  if ((Resolve-Path -LiteralPath $top).Path -ne $resolvedRoot) { Fail 'REPO_ROOT_MISMATCH' }

  $dirty = @(& git status --porcelain=v1 --untracked-files=all)
  if ($dirty.Count -gt 0) { Fail ('WORKTREE_NOT_CLEAN:' + ($dirty -join ' | ')) }

  $head = (& git rev-parse HEAD).Trim()
  if ($head -ne $ExpectedHead) { Fail "HEAD_MISMATCH:expected=$ExpectedHead:actual=$head" }

  $branchNow = (& git branch --show-current).Trim()
  if ($branchNow -ne $Branch) { Fail "WRONG_BRANCH:expected=$Branch:actual=$branchNow" }
}

function Assert-SourceVideo {
  if ([string]::IsNullOrWhiteSpace($VideoPath)) { Fail 'VIDEO_PATH_REQUIRED' }
  if (-not (Test-Path -LiteralPath $VideoPath -PathType Leaf)) { Fail "VIDEO_MISSING:$VideoPath" }
  $sha = (Get-FileHash -Algorithm SHA256 -LiteralPath $VideoPath).Hash.ToLowerInvariant()
  if ($sha -ne $ExpectedVideoSha) { Fail "VIDEO_SHA_MISMATCH:expected=$ExpectedVideoSha:actual=$sha" }
  Write-Host "VIDEO_SHA256=PASS $sha" -ForegroundColor Green
  Write-Host 'SOURCE_VIDEO_MUTATION=NONE'
}

function Assert-RecoveryRunner {
  if ([string]::IsNullOrWhiteSpace($RecoveryPath)) {
    $script:RecoveryPath = Join-Path ([System.IO.Path]::GetTempPath()) 'P5_QA01_V4_ACCESS_PROBE_RECOVERY_FINAL.ps1'
  }
  if (-not (Test-Path -LiteralPath $RecoveryPath -PathType Leaf)) { Fail "RECOVERY_RUNNER_MISSING:$RecoveryPath" }
  $blob = (& git hash-object --no-filters -- $RecoveryPath).Trim()
  if ($blob -ne $ExpectedRecoveryBlob) { Fail "RECOVERY_BLOB_MISMATCH:expected=$ExpectedRecoveryBlob:actual=$blob" }
  Write-Host "RECOVERY_BLOB=PASS $blob" -ForegroundColor Green
}

function Assert-CriticalSam2Blobs([string]$Root) {
  foreach ($relative in $Sam2CriticalBlobs.Keys) {
    $path = Join-Path $Root $relative
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { Fail "SAM2_CRITICAL_FILE_MISSING:$relative" }
    $actual = (& git hash-object --no-filters -- $path).Trim()
    $expected = [string]$Sam2CriticalBlobs[$relative]
    if ($actual -ne $expected) { Fail "SAM2_CRITICAL_BLOB_MISMATCH:$relative:expected=$expected:actual=$actual" }
  }
  Write-Host 'SAM2_CRITICAL_BLOBS=PASS' -ForegroundColor Green
  Write-Host "sam2_official_commit=$Sam2Commit"
  Write-Host "sam2_official_tree=$Sam2OfficialTree"
}

function Test-ZipArchive([string]$ZipPath, [string]$ExpectedRootName) {
  if (-not (Test-Path -LiteralPath $ZipPath -PathType Leaf)) { return $false }
  $probe = @'
import sys
import zipfile
path, expected_root = sys.argv[1:3]
try:
    with zipfile.ZipFile(path, "r") as zf:
        bad = zf.testzip()
        if bad:
            print("SAM2_ARCHIVE_VERIFY=FAIL")
            print("bad_member=" + bad)
            raise SystemExit(31)
        names = zf.namelist()
        prefix = expected_root.rstrip("/") + "/"
        if not names or any(not n.startswith(prefix) for n in names):
            print("SAM2_ARCHIVE_VERIFY=FAIL")
            print("reason=ROOT_PREFIX_MISMATCH")
            raise SystemExit(32)
        print("SAM2_ARCHIVE_VERIFY=PASS")
        print("members=" + str(len(names)))
except zipfile.BadZipFile:
    print("SAM2_ARCHIVE_VERIFY=FAIL")
    print("reason=BAD_ZIP")
    raise SystemExit(33)
'@
  $probePath = Join-Path ([System.IO.Path]::GetTempPath()) ("dc-v4-sam2-zip-verify-{0}.py" -f ([guid]::NewGuid().ToString('N')))
  try {
    [System.IO.File]::WriteAllText($probePath, $probe, (New-Object System.Text.UTF8Encoding($false)))
    $exit = Start-NativeVisible 'V4_VERIFY_SAM2_ARCHIVE' $PythonExe @('-B', $probePath, $ZipPath, $ExpectedRootName)
    return ($exit -eq 0)
  }
  finally {
    Remove-Item -LiteralPath $probePath -Force -ErrorAction SilentlyContinue
  }
}

function Ensure-Sam2Source {
  if (Test-Path -LiteralPath $Sam2SourceRoot -PathType Container) {
    Assert-CriticalSam2Blobs $Sam2SourceRoot
    Write-Host "SAM2_SOURCE_CACHE=VALID $Sam2SourceRoot" -ForegroundColor Green
    return
  }

  foreach ($dir in @($Sam2ArchiveDir, (Split-Path -Parent $Sam2SourceRoot))) {
    if (-not (Test-Path -LiteralPath $dir -PathType Container)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  }

  if (-not (Test-ZipArchive $Sam2Archive $Sam2ArchiveRootName)) {
    Write-Host 'SAM2_DOWNLOAD_SOURCE=OFFICIAL_GITHUB_CODELOAD_EXACT_COMMIT' -ForegroundColor Cyan
    $downloaded = $false
    for ($attempt = 1; $attempt -le 8; $attempt++) {
      $existing = if (Test-Path -LiteralPath $Sam2Part -PathType Leaf) { (Get-Item -LiteralPath $Sam2Part).Length } else { 0 }
      Write-Host "SAM2_CURL_RESUME_ATTEMPT=$attempt/8 existing_bytes=$existing" -ForegroundColor Cyan
      $curlArgs = @(
        '--fail', '--location', '--http1.1', '--ssl-revoke-best-effort',
        '--continue-at', '-', '--retry', '20', '--retry-all-errors', '--retry-delay', '2',
        '--connect-timeout', '30', '--speed-limit', '1024', '--speed-time', '120',
        '--output', $Sam2Part, $Sam2ArchiveUrl
      )
      $exit = Start-NativeVisible 'V4_DOWNLOAD_SAM2_CODELOAD' 'curl.exe' $curlArgs
      if ($exit -eq 0 -and (Test-ZipArchive $Sam2Part $Sam2ArchiveRootName)) {
        Move-Item -LiteralPath $Sam2Part -Destination $Sam2Archive -Force
        $downloaded = $true
        break
      }
      if ($exit -eq 33) {
        Write-Host 'SAM2_CODELOAD_RANGE_UNSUPPORTED_RESTART_PART=YES' -ForegroundColor Yellow
        Remove-Item -LiteralPath $Sam2Part -Force -ErrorAction SilentlyContinue
      }
      if ($attempt -lt 8) { Start-Sleep -Seconds ([Math]::Min(30, 3 * $attempt)) }
    }
    if (-not $downloaded) { Fail 'SAM2_CODELOAD_DOWNLOAD_FAILED_AFTER_8_ATTEMPTS' }
  }

  if (-not (Test-ZipArchive $Sam2Archive $Sam2ArchiveRootName)) { Fail 'SAM2_ARCHIVE_FINAL_INVALID' }
  $archiveSha = (Get-FileHash -Algorithm SHA256 -LiteralPath $Sam2Archive).Hash.ToLowerInvariant()
  Write-Host "SAM2_ARCHIVE_SHA256=$archiveSha"

  $stage = Join-Path $Sam2ArchiveDir ("extract-{0}" -f ([guid]::NewGuid().ToString('N')))
  New-Item -ItemType Directory -Path $stage -Force | Out-Null
  try {
    Expand-Archive -LiteralPath $Sam2Archive -DestinationPath $stage -Force
    $extracted = Join-Path $stage $Sam2ArchiveRootName
    if (-not (Test-Path -LiteralPath $extracted -PathType Container)) { Fail "SAM2_EXTRACTED_ROOT_MISSING:$extracted" }
    Assert-CriticalSam2Blobs $extracted
    if (Test-Path -LiteralPath $Sam2SourceRoot) { Fail "SAM2_SOURCE_DESTINATION_ALREADY_EXISTS:$Sam2SourceRoot" }
    Move-Item -LiteralPath $extracted -Destination $Sam2SourceRoot
  }
  finally {
    Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
  }

  Assert-CriticalSam2Blobs $Sam2SourceRoot
  Write-Host "SAM2_SOURCE_MATERIALIZE=PASS $Sam2SourceRoot" -ForegroundColor Green
}

function Install-And-VerifySam2 {
  $env:SAM2_BUILD_CUDA = '0'
  $env:SAM2_BUILD_ALLOW_ERRORS = '0'
  $env:PIP_RETRIES = '20'
  $env:PIP_TIMEOUT = '180'

  $installExit = Start-NativeVisible 'V4_INSTALL_SAM2_FROM_VERIFIED_LOCAL_SOURCE' $UvExe @(
    'pip', 'install', '--python', $PythonExe, '--link-mode', 'copy', $Sam2SourceRoot
  )
  if ($installExit -ne 0) { Fail "V4_INSTALL_SAM2_LOCAL_FAILED:exit=$installExit" }

  $probe = @'
import importlib.metadata as md
import torch
import torchvision
import gsplat
from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator
from vggt.models.vggt import VGGT
print("SAM2_RUNTIME_VERIFY=PASS")
print("sam2_dist=" + md.version("SAM-2"))
print("vggt_dist=" + md.version("vggt"))
print("gsplat_dist=" + md.version("gsplat"))
print("torch=" + torch.__version__)
print("torchvision=" + torchvision.__version__)
print("cuda_available=" + str(torch.cuda.is_available()))
if md.version("SAM-2") != "1.0": raise SystemExit(41)
if md.version("vggt") != "0.0.1": raise SystemExit(42)
if md.version("gsplat") != "1.5.3": raise SystemExit(43)
if not torch.__version__.startswith("2.9.1+cu128"): raise SystemExit(44)
if not torchvision.__version__.startswith("0.24.1+cu128"): raise SystemExit(45)
if not torch.cuda.is_available(): raise SystemExit(46)
'@
  $probePath = Join-Path ([System.IO.Path]::GetTempPath()) ("dc-v4-sam2-runtime-verify-{0}.py" -f ([guid]::NewGuid().ToString('N')))
  try {
    [System.IO.File]::WriteAllText($probePath, $probe, (New-Object System.Text.UTF8Encoding($false)))
    $exit = Start-NativeVisible 'V4_VERIFY_SAM2_AND_GPU_RUNTIME' $PythonExe @('-B', $probePath)
    if ($exit -ne 0) { Fail "V4_VERIFY_SAM2_AND_GPU_RUNTIME_FAILED:exit=$exit" }
  }
  finally {
    Remove-Item -LiteralPath $probePath -Force -ErrorAction SilentlyContinue
  }
}

function Ensure-RuntimeMarker {
  $expected = [ordered]@{
    schema_version='1.0'
    python='3.10'
    torch='2.9.1'
    torchvision='0.24.1'
    cuda_wheel='cu128'
    gsplat='1.5.3'
    vggt_code_commit='a288dd0f14786c93483e45524328726ab7b1b4ce'
    vggt_model='facebook/VGGT-1B-Commercial'
    sam2_commit=$Sam2Commit
    sam2_model='facebook/sam2.1-hiera-base-plus'
    recovery='SAM2_OFFICIAL_CODELOAD_EXACT_COMMIT'
  }

  if (Test-Path -LiteralPath $RuntimeMarker -PathType Leaf) {
    try { $current = Get-Content -LiteralPath $RuntimeMarker -Raw -Encoding UTF8 | ConvertFrom-Json }
    catch { Fail "RUNTIME_MARKER_PARSE_FAILED:$($_.Exception.Message)" }
    foreach ($name in @('schema_version','python','torch','torchvision','cuda_wheel','gsplat','vggt_code_commit','vggt_model','sam2_commit','sam2_model')) {
      if ([string]$current.$name -ne [string]$expected[$name]) { Fail "RUNTIME_MARKER_MISMATCH:$name" }
    }
    Write-Host 'RUNTIME_MARKER=VALID_EXISTING' -ForegroundColor Green
    return
  }

  $json = $expected | ConvertTo-Json -Depth 5
  [System.IO.File]::WriteAllText($RuntimeMarker, $json, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "RUNTIME_MARKER=CREATED $RuntimeMarker" -ForegroundColor Green
}

function Ensure-Recon3dLocalCache {
  $cacheParent = Split-Path -Parent $Recon3dCache
  if (-not (Test-Path -LiteralPath $cacheParent -PathType Container)) { New-Item -ItemType Directory -Path $cacheParent -Force | Out-Null }

  if (-not (Test-Path -LiteralPath $Recon3dCache -PathType Container)) {
    $initExit = Start-NativeVisible 'V4_INIT_RECON3D_BARE_CACHE' 'git' @('init','--bare',$Recon3dCache)
    if ($initExit -ne 0) { Fail "RECON3D_CACHE_INIT_FAILED:exit=$initExit" }
  }

  $setUrlExit = Start-NativeVisible 'V4_SET_RECON3D_CACHE_REMOTE' 'git' @('-C',$Recon3dCache,'remote','set-url','origin',$Recon3dRepo)
  if ($setUrlExit -ne 0) {
    $addExit = Start-NativeVisible 'V4_ADD_RECON3D_CACHE_REMOTE' 'git' @('-C',$Recon3dCache,'remote','add','origin',$Recon3dRepo)
    if ($addExit -ne 0) { Fail "RECON3D_CACHE_REMOTE_FAILED:exit=$addExit" }
  }

  $hasCommit = (Start-NativeVisible 'V4_CHECK_RECON3D_CACHE_COMMIT' 'git' @('-C',$Recon3dCache,'cat-file','-e',"$Recon3dCommit^{commit}")) -eq 0
  if (-not $hasCommit) {
    $fetched = $false
    for ($attempt = 1; $attempt -le 12; $attempt++) {
      Write-Host "RECON3D_FETCH_ATTEMPT=$attempt/12" -ForegroundColor Cyan
      $fetchExit = Start-NativeVisible 'V4_FETCH_RECON3D_PINNED' 'git' @(
        '-c','http.version=HTTP/1.1',
        '-c','http.maxRequests=1',
        '-c','http.lowSpeedLimit=1',
        '-c','http.lowSpeedTime=600',
        '-C',$Recon3dCache,
        'fetch','--no-tags','--depth=1','origin',$Recon3dCommit
      )
      if ($fetchExit -eq 0) { $fetched = $true; break }
      if ($attempt -lt 12) { Start-Sleep -Seconds ([Math]::Min(30, 3 * $attempt)) }
    }
    if (-not $fetched) { Fail 'RECON3D_PINNED_FETCH_FAILED_AFTER_12_ATTEMPTS' }
  }

  $verifyExit = Start-NativeVisible 'V4_VERIFY_RECON3D_CACHE_COMMIT' 'git' @('-C',$Recon3dCache,'cat-file','-e',"$Recon3dCommit^{commit}")
  if ($verifyExit -ne 0) { Fail 'RECON3D_CACHE_COMMIT_MISSING_AFTER_FETCH' }

  $refExit = Start-NativeVisible 'V4_PIN_RECON3D_LOCAL_REF' 'git' @('-C',$Recon3dCache,'update-ref','refs/heads/dc-pinned',$Recon3dCommit)
  if ($refExit -ne 0) { Fail 'RECON3D_LOCAL_REF_FAILED' }
  $headExit = Start-NativeVisible 'V4_SET_RECON3D_CACHE_HEAD' 'git' @('-C',$Recon3dCache,'symbolic-ref','HEAD','refs/heads/dc-pinned')
  if ($headExit -ne 0) { Fail 'RECON3D_CACHE_HEAD_FAILED' }

  $cacheUrl = 'file:///D:/AI/TOOLS/DC_Video2Twin/git-cache/recon3d.git'
  $env:GIT_CONFIG_COUNT = '2'
  $env:GIT_CONFIG_KEY_0 = "url.$cacheUrl.insteadOf"
  $env:GIT_CONFIG_VALUE_0 = $Recon3dRepo
  $env:GIT_CONFIG_KEY_1 = 'protocol.file.allow'
  $env:GIT_CONFIG_VALUE_1 = 'always'

  $out = Join-Path ([System.IO.Path]::GetTempPath()) ("dc-v4-recon3d-lsremote-{0}.txt" -f ([guid]::NewGuid().ToString('N')))
  $err = "$out.err"
  try {
    $p = Start-Process -FilePath 'git' -ArgumentList @('ls-remote',$Recon3dRepo,'refs/heads/dc-pinned') -Wait -PassThru -NoNewWindow -RedirectStandardOutput $out -RedirectStandardError $err
    $stdout = if (Test-Path -LiteralPath $out) { [System.IO.File]::ReadAllText($out) } else { '' }
    $stderr = if (Test-Path -LiteralPath $err) { [System.IO.File]::ReadAllText($err) } else { '' }
    if ($stdout) { Write-Host $stdout.TrimEnd() }
    if ($stderr) { Write-Host $stderr.TrimEnd() }
    if ($p.ExitCode -ne 0 -or $stdout -notmatch [regex]::Escape($Recon3dCommit)) { Fail 'RECON3D_LOCAL_URL_REWRITE_VERIFY_FAILED' }
  }
  finally {
    Remove-Item -LiteralPath $out,$err -Force -ErrorAction SilentlyContinue
  }

  Write-Host "RECON3D_LOCAL_CACHE=PASS $Recon3dCache" -ForegroundColor Green
  Write-Host 'recon3d_clone_transport=PROCESS_SCOPED_LOCAL_URL_REWRITE'
}

try {
  if ($PlanOnly) {
    Write-Host 'P5_QA01_V4_SAM2_SOURCE_RECOVERY_PLAN=PASS' -ForegroundColor Green
    Write-Host 'sam2_source=OFFICIAL_GITHUB_CODELOAD_EXACT_COMMIT'
    Write-Host "sam2_commit=$Sam2Commit"
    Write-Host "sam2_tree=$Sam2OfficialTree"
    Write-Host 'sam2_integrity=ZIP_CRC_PLUS_CRITICAL_GIT_BLOBS'
    Write-Host 'sam2_cuda_extension=DISABLED'
    Write-Host 'runtime_marker=ONLY_AFTER_RUNTIME_IMPORT_VERIFY'
    Write-Host 'recon3d_source=PERSISTENT_PINNED_LOCAL_GIT_CACHE'
    Write-Host 'recon3d_clone=PROCESS_SCOPED_URL_REWRITE'
    Write-Host 'qa01_enabled=false'
    Write-Host 'production_mutation=NONE'
    exit 0
  }

  $RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
  Assert-ExactLocalState
  Assert-SourceVideo
  Assert-RecoveryRunner

  if (-not (Test-Path -LiteralPath $PythonExe -PathType Leaf)) { Fail "VENV_PYTHON_MISSING:$PythonExe" }
  if (-not (Test-Path -LiteralPath $UvExe -PathType Leaf)) { Fail "UV_EXE_MISSING:$UvExe" }

  Write-Host '=============================================' -ForegroundColor Cyan
  Write-Host 'V4_SAM2_SOURCE_RECOVERY=START' -ForegroundColor Green
  Write-Host 'sam2_network_git_clone=BYPASSED'
  Write-Host 'recon3d_network_clone=PRESEEDED_LOCAL_CACHE'
  Write-Host '=============================================' -ForegroundColor Cyan

  Ensure-Sam2Source
  Install-And-VerifySam2
  Ensure-RuntimeMarker
  Ensure-Recon3dLocalCache

  $env:HF_HOME = 'D:\AI\MODELS\HuggingFace'
  $env:HF_HUB_DISABLE_SYMLINKS_WARNING = '1'

  Write-Host '==> Resume validated Video2Twin pipeline with verified local source caches' -ForegroundColor Cyan
  $resumeArgumentLine = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', (Quote-WindowsCommandLineArg $RecoveryPath),
    '-RepoRoot', (Quote-WindowsCommandLineArg $RepoRoot),
    '-Branch', (Quote-WindowsCommandLineArg $Branch),
    '-ExpectedHead', (Quote-WindowsCommandLineArg $ExpectedHead),
    '-SiteId', '"drift-curio"',
    '-Sku', '"DC-ZY-SZ-31001"',
    '-VideoPath', (Quote-WindowsCommandLineArg $VideoPath)
  ) -join ' '

  $resume = Start-Process -FilePath 'powershell.exe' -ArgumentList $resumeArgumentLine -Wait -PassThru -NoNewWindow
  $resumeExit = [int]$resume.ExitCode
  Write-Host "V4_RESUME_VIDEO2TWIN_PIPELINE_EXIT=$resumeExit"
  if ($resumeExit -ne 0) { Fail "V4_RESUME_VIDEO2TWIN_PIPELINE_FAILED:exit=$resumeExit" }

  Write-Host 'P5_QA01_V4_SAM2_SOURCE_RECOVERY=PASS' -ForegroundColor Green
  Write-Host 'qa01_enabled=false'
  Write-Host 'production_mutation=NONE'
  exit 0
}
catch {
  Fail $_.Exception.Message
}
