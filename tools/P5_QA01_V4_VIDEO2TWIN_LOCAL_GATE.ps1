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

$UvVersion = '0.12.10'
$UvSha256 = 'f65744f94072152b1f86ba2aace4d01f1124d9a8ecb235805039e3718c36cac2'
$UvUrl = "https://github.com/astral-sh/uv/releases/download/$UvVersion/uv-x86_64-pc-windows-msvc.zip"
$Recon3dRepo = 'https://github.com/jashshah999/recon3d.git'
$Recon3dCommit = '59fe356bceab74ef7d5839b68aba232bce20e14d'
$VggtRepo = 'https://github.com/facebookresearch/vggt.git'
$VggtCommit = 'a288dd0f14786c93483e45524328726ab7b1b4ce'
$VggtModel = 'facebook/VGGT-1B-Commercial'
$Sam2Repo = 'https://github.com/facebookresearch/sam2.git'
$Sam2Commit = '2b90b9f5ceec907a1c18123530e92e794ad901a4'
$Sam2Model = 'facebook/sam2.1-hiera-base-plus'
$TorchVersion = '2.9.1'
$TorchVisionVersion = '0.24.1'
$GsplatVersion = '1.5.3'

function Fail([string]$Message) {
  Write-Host 'P5_QA01_V4_VIDEO2TWIN_LOCAL_GATE=FAIL' -ForegroundColor Red
  Write-Host "error=$Message" -ForegroundColor Red
  exit 1
}

function Read-Utf8Json([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "UTF8_JSON_FILE_MISSING:$Path"
  }
  $utf8Strict = New-Object System.Text.UTF8Encoding($false, $true)
  try {
    $text = [System.IO.File]::ReadAllText($Path, $utf8Strict)
  }
  catch {
    throw "UTF8_JSON_DECODE_FAILED:${Path}:$($_.Exception.Message)"
  }
  try {
    return ($text | ConvertFrom-Json)
  }
  catch {
    throw "UTF8_JSON_PARSE_FAILED:${Path}:$($_.Exception.Message)"
  }
}

function File-Sha256([string]$Path) {
  return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

function Run-Checked([string]$Label, [string]$Exe, [string[]]$CommandArgs) {
  Write-Host "==> $Label" -ForegroundColor Cyan
  # Do not name this parameter Args: $args is a PowerShell automatic variable and
  # @args can otherwise splat the empty automatic collection instead of our payload.
  & $Exe @CommandArgs
  if ($LASTEXITCODE -ne 0) {
    throw "${Label}_FAILED:exit=$LASTEXITCODE"
  }
}

function Resolve-Python([string]$VenvRoot) {
  $candidate = Join-Path $VenvRoot 'Scripts\python.exe'
  if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
    throw "V4_VENV_PYTHON_MISSING:$candidate"
  }
  return $candidate
}

function Test-CommercialModelAccess([string]$PythonExe) {
  $probe = @'
from huggingface_hub import hf_hub_download
import sys
try:
    p = hf_hub_download(repo_id="facebook/VGGT-1B-Commercial", filename="config.json")
    print("V4_VGGT_COMMERCIAL_ACCESS=PASS")
    print("config=" + p)
except Exception as exc:
    print("V4_VGGT_COMMERCIAL_ACCESS=FAIL")
    print(type(exc).__name__ + ":" + str(exc))
    sys.exit(23)
'@
  $probePath = Join-Path $env:TEMP ("dc-v4-hf-probe-{0}.py" -f ([guid]::NewGuid().ToString('N')))
  [System.IO.File]::WriteAllText($probePath, $probe, (New-Object System.Text.UTF8Encoding($false)))
  try {
    & $PythonExe -B $probePath
    return $LASTEXITCODE
  }
  finally {
    Remove-Item -LiteralPath $probePath -Force -ErrorAction SilentlyContinue
  }
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

  $registry = Read-Utf8Json (Join-Path $RepoRoot 'config\workflows\registry.json')
  $qa01 = @($registry.workflows | Where-Object { $_.code -eq 'QA01' })
  if ($qa01.Count -ne 1 -or $qa01[0].workflow_status -ne 'NOT_REGISTERED' -or [bool]$qa01[0].executable) {
    Fail 'QA01_REGISTRY_MUST_REMAIN_FAIL_CLOSED'
  }

  $sitePath = Join-Path $RepoRoot ("config\sites\{0}.json" -f $SiteId)
  $site = Read-Utf8Json $sitePath
  if (@($site.enabled_workflows) -contains 'QA01') { Fail 'QA01_MUST_REMAIN_DISABLED' }

  $rawRoot = [string]$site.raw_root
  $controlRoot = [string]$site.control_root
  if (-not (Test-Path -LiteralPath $rawRoot -PathType Container)) { Fail "V4_RAW_ROOT_MISSING:$rawRoot" }
  if (-not (Test-Path -LiteralPath $controlRoot -PathType Container)) {
    New-Item -ItemType Directory -Path $controlRoot -Force | Out-Null
  }

  if ([string]::IsNullOrWhiteSpace($VideoPath)) {
    Write-Host '==> Auto-discover existing SKU video in RAW (read-only)' -ForegroundColor Cyan
    $extensions = @('.mp4','.mov','.mkv','.avi','.webm')
    $matches = @(
      Get-ChildItem -LiteralPath $rawRoot -File -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $extensions -contains $_.Extension.ToLowerInvariant() -and $_.FullName -like "*$Sku*" } |
        Sort-Object LastWriteTime -Descending
    )
    if ($matches.Count -eq 0) {
      $fallback = @(
        Get-ChildItem -LiteralPath $rawRoot -File -Recurse -ErrorAction SilentlyContinue |
          Where-Object { $extensions -contains $_.Extension.ToLowerInvariant() } |
          Sort-Object LastWriteTime -Descending |
          Select-Object -First 8
      )
      Write-Host 'candidate_videos=' -ForegroundColor Yellow
      $fallback | ForEach-Object { Write-Host ('  ' + $_.FullName) -ForegroundColor Yellow }
      Fail "V4_VIDEO_NOT_FOUND_FOR_SKU:$Sku"
    }
    $VideoPath = $matches[0].FullName
  }

  $VideoPath = (Resolve-Path -LiteralPath $VideoPath).Path
  $videoExt = [System.IO.Path]::GetExtension($VideoPath).ToLowerInvariant()
  if (@('.mp4','.mov','.mkv','.avi','.webm') -notcontains $videoExt) { Fail "V4_VIDEO_EXTENSION_UNSUPPORTED:$videoExt" }
  $videoSha = File-Sha256 $VideoPath
  Write-Host "VIDEO=$VideoPath"
  Write-Host "VIDEO_SHA256=$videoSha"
  Write-Host 'RAW_MUTATION=NONE'

  $toolRoot = 'D:\AI\TOOLS\DC_Video2Twin'
  $cacheRoot = 'D:\AI\MODELS'
  $hfHome = Join-Path $cacheRoot 'HuggingFace'
  $torchHome = Join-Path $cacheRoot 'Torch'
  foreach ($p in @($toolRoot, $hfHome, $torchHome)) {
    if (-not (Test-Path -LiteralPath $p -PathType Container)) { New-Item -ItemType Directory -Path $p -Force | Out-Null }
  }
  $env:HF_HOME = $hfHome
  $env:TORCH_HOME = $torchHome
  $env:PYTORCH_CUDA_ALLOC_CONF = 'expandable_segments:True'

  # Install audited portable uv without touching system Python.
  $uvRoot = Join-Path $toolRoot ("uv-$UvVersion")
  $uvExe = Join-Path $uvRoot 'uv.exe'
  if (-not (Test-Path -LiteralPath $uvExe -PathType Leaf)) {
    $downloadDir = Join-Path $toolRoot 'downloads'
    if (-not (Test-Path -LiteralPath $downloadDir)) { New-Item -ItemType Directory -Path $downloadDir -Force | Out-Null }
    $zip = Join-Path $downloadDir ("uv-$UvVersion-windows-x64.zip")
    if (-not (Test-Path -LiteralPath $zip -PathType Leaf) -or (File-Sha256 $zip) -ne $UvSha256) {
      Write-Host "==> Download audited uv $UvVersion from official GitHub release" -ForegroundColor Cyan
      Invoke-WebRequest -Uri $UvUrl -OutFile $zip -UseBasicParsing
    }
    $actualUvSha = File-Sha256 $zip
    if ($actualUvSha -ne $UvSha256) { Fail "V4_UV_SHA256_MISMATCH:expected=$UvSha256:actual=$actualUvSha" }
    if (Test-Path -LiteralPath $uvRoot) { Fail "V4_UV_ROOT_EXISTS_BUT_INVALID:$uvRoot" }
    New-Item -ItemType Directory -Path $uvRoot | Out-Null
    Expand-Archive -LiteralPath $zip -DestinationPath $uvRoot
  }
  if (-not (Test-Path -LiteralPath $uvExe -PathType Leaf)) { Fail "V4_UV_EXE_MISSING:$uvExe" }

  $venv = Join-Path $toolRoot 'venv-py310'
  if (-not (Test-Path -LiteralPath (Join-Path $venv 'Scripts\python.exe') -PathType Leaf)) {
    Run-Checked 'V4_UV_PYTHON_INSTALL' $uvExe @('python','install','3.10')
    Run-Checked 'V4_UV_VENV_CREATE' $uvExe @('venv','--python','3.10','--seed',$venv)
  }
  $python = Resolve-Python $venv

  # Cheap access probe comes before multi-gigabyte model/runtime installs.
  Run-Checked 'V4_LIGHTWEIGHT_HF_CLIENT' $python @('-m','pip','install','--disable-pip-version-check','huggingface_hub>=0.34,<2')
  $accessExit = Test-CommercialModelAccess $python
  if ($accessExit -ne 0) {
    Write-Host 'commercial_model=facebook/VGGT-1B-Commercial' -ForegroundColor Yellow
    Write-Host 'fallback_to_noncommercial_model=false' -ForegroundColor Yellow
    Fail 'V4_VGGT_COMMERCIAL_ACCESS_REQUIRED'
  }

  Write-Host '==> Commercial model access confirmed; prepare isolated GPU runtime' -ForegroundColor Cyan
  $runtimeMarker = Join-Path $toolRoot 'runtime-py310-pt291-cu128-v1.json'
  if (-not (Test-Path -LiteralPath $runtimeMarker -PathType Leaf)) {
    Run-Checked 'V4_INSTALL_TORCH_CU128' $python @('-m','pip','install','--disable-pip-version-check',"torch==$TorchVersion","torchvision==$TorchVisionVersion",'--index-url','https://download.pytorch.org/whl/cu128')
    Run-Checked 'V4_INSTALL_GSPLAT_OFFICIAL_WHEEL' $python @('-m','pip','install','--disable-pip-version-check',"gsplat==$GsplatVersion",'--index-url','https://docs.gsplat.studio/whl/pt29cu128','--extra-index-url','https://pypi.org/simple')
    Run-Checked 'V4_INSTALL_VGGT_PINNED' $python @('-m','pip','install','--disable-pip-version-check',"git+$VggtRepo@$VggtCommit")
    $env:SAM2_BUILD_CUDA = '0'
    Run-Checked 'V4_INSTALL_SAM2_PINNED' $python @('-m','pip','install','--disable-pip-version-check',"git+$Sam2Repo@$Sam2Commit")

    $runtime = [ordered]@{
      schema_version='1.0'
      python='3.10'
      torch=$TorchVersion
      torchvision=$TorchVisionVersion
      cuda_wheel='cu128'
      gsplat=$GsplatVersion
      vggt_code_commit=$VggtCommit
      vggt_model=$VggtModel
      sam2_commit=$Sam2Commit
      sam2_model=$Sam2Model
    } | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText($runtimeMarker, $runtime, (New-Object System.Text.UTF8Encoding($false)))
  }

  $verify = 'import torch, gsplat; from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator; from vggt.models.vggt import VGGT; print("runtime_imports=PASS"); print("torch="+torch.__version__); print("cuda="+str(torch.cuda.is_available())); print("gpu="+(torch.cuda.get_device_name(0) if torch.cuda.is_available() else "NONE")); print("gsplat="+getattr(gsplat,"__version__","unknown"))'
  Run-Checked 'V4_VERIFY_GPU_RUNTIME' $python @('-c',$verify)

  $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $evidence = Join-Path $controlRoot ("evidence\P5_QA01_V4_VIDEO2TWIN_{0}" -f $timestamp)
  if (Test-Path -LiteralPath $evidence) { Fail "V4_EVIDENCE_ALREADY_EXISTS:$evidence" }
  New-Item -ItemType Directory -Path $evidence -Force | Out-Null

  # Every pilot gets a fresh donor clone. Do not reset/reuse a modified donor worktree.
  $donor = Join-Path $evidence 'donor_recon3d'
  Run-Checked 'V4_CLONE_RECON3D_PINNED' 'git' @('clone','--no-checkout',$Recon3dRepo,$donor)
  Run-Checked 'V4_CHECKOUT_RECON3D_PINNED' 'git' @('-C',$donor,'checkout','--detach',$Recon3dCommit)
  $donorHead = (& git -C $donor rev-parse HEAD).Trim()
  if ($donorHead -ne $Recon3dCommit) { Fail "V4_RECON3D_DONOR_HEAD_MISMATCH:actual=$donorHead" }

  $patcher = Join-Path $RepoRoot 'tools\p5_qa01_v4_patch_recon3d.py'
  $prep = Join-Path $RepoRoot 'tools\p5_qa01_v4_video2twin_prep.py'
  foreach ($p in @($patcher,$prep)) { if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { Fail "V4_TOOL_MISSING:$p" } }

  Run-Checked 'V4_PATCH_RECON3D_COMMERCIAL_MASKED' $python @('-B',$patcher,'--repo',$donor)
  Run-Checked 'V4_INSTALL_PATCHED_RECON3D' $python @('-m','pip','install','--disable-pip-version-check','--no-deps','-e',$donor)
  Run-Checked 'V4_INSTALL_RECON3D_BASE_DEPS' $python @('-m','pip','install','--disable-pip-version-check','numpy<2','opencv-python>=4.8','Pillow>=10','tqdm>=4.60','safetensors>=0.4','einops>=0.7','plyfile>=1.0','viser>=0.2.0','tyro>=0.7','click>=8.0','scipy>=1.10','scikit-learn>=1.3')

  $prepDir = Join-Path $evidence 'prep'
  Run-Checked 'V4_AUTOMATIC_FRAME_MASK_PREP' $python @('-B',$prep,'--video',$VideoPath,'--out',$prepDir,'--max-frames','30','--sample-fps','6','--window','3','--long-edge','960','--sam-model',$Sam2Model,'--background','127')

  $maskedDir = Join-Path $prepDir 'frames_masked'
  $maskedCount = @(Get-ChildItem -LiteralPath $maskedDir -File -Filter '*.png').Count
  if ($maskedCount -lt 16) { Fail "V4_MASKED_FRAME_COUNT_TOO_LOW:$maskedCount" }

  $reconOut = Join-Path $evidence 'recon3d_output'
  $env:PYTHONPATH = $donor
  Run-Checked 'V4_RECON3D_IDENTITY_SPLAT' $python @('-m','recon3d.cli','run',$maskedDir,'-o',$reconOut,'--pose-method','vggt','--max-frames','30','--steps','3500','--resize','640','--no-metric','--no-viewer','--no-factor-graph','--device','cuda')

  $ply = Join-Path $reconOut 'scene.ply'
  $splat = Join-Path $reconOut 'scene.splat'
  if (-not (Test-Path -LiteralPath $ply -PathType Leaf)) { Fail "V4_SCENE_PLY_MISSING:$ply" }
  if (-not (Test-Path -LiteralPath $splat -PathType Leaf)) { Fail "V4_SCENE_SPLAT_MISSING:$splat" }
  $plySha = File-Sha256 $ply

  $provenance = [ordered]@{
    schema_version='1.0'
    status='P5_QA01_V4_VIDEO2TWIN_LOCAL_GATE_PASS'
    site_id=$SiteId
    sku=$Sku
    source_video=$VideoPath
    source_video_sha256=$videoSha
    source_video_read_only=$true
    masked_frame_count=$maskedCount
    recon3d_commit=$Recon3dCommit
    photo_to_mesh_frame_selector_commit='6a1697e839113e12802b52d5cc6951044a4abe47'
    vggt_code_commit=$VggtCommit
    vggt_model=$VggtModel
    vggt_noncommercial_fallback=$false
    sam2_commit=$Sam2Commit
    sam2_model=$Sam2Model
    gsplat_version=$GsplatVersion
    uv_version=$UvVersion
    scene_ply=$ply
    scene_ply_sha256=$plySha
    scene_splat=$splat
    qa01_enabled=$false
    production_mutation='NONE'
  } | ConvertTo-Json -Depth 8
  $provenancePath = Join-Path $evidence 'video2twin_provenance.json'
  [System.IO.File]::WriteAllText($provenancePath, $provenance, (New-Object System.Text.UTF8Encoding($false)))

  Write-Host 'P5_QA01_V4_VIDEO2TWIN_LOCAL_GATE=PASS' -ForegroundColor Green
  Write-Host 'architecture=LOW_TOUCH_VIDEO_TO_MASKED_VGGT_COMMERCIAL_TO_GSPLAT'
  Write-Host "video_sha256=$videoSha"
  Write-Host "masked_frames=$maskedCount"
  Write-Host "commercial_model=$VggtModel"
  Write-Host 'fallback_to_noncommercial_model=false'
  Write-Host "scene_ply=$ply"
  Write-Host "scene_ply_sha256=$plySha"
  Write-Host "scene_splat=$splat"
  Write-Host "prep_manifest=$(Join-Path $prepDir 'prep_manifest.json')"
  Write-Host "selected_frames_contact_sheet=$(Join-Path $prepDir 'selected_frames_contact_sheet.jpg')"
  Write-Host "masked_contact_sheet=$(Join-Path $prepDir 'masked_contact_sheet.jpg')"
  Write-Host "evidence_dir=$evidence"
  Write-Host "provenance=$provenancePath"
  Write-Host 'qa01_enabled=false'
  Write-Host 'production_mutation=NONE'
  exit 0
}
catch {
  Fail $_.Exception.Message
}
