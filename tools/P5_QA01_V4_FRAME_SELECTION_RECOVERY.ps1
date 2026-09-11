param(
  [Parameter(Mandatory=$true)][string]$RepoRoot,
  [Parameter(Mandatory=$true)][string]$Branch,
  [Parameter(Mandatory=$true)][string]$ExpectedLocalHead,
  [Parameter(Mandatory=$true)][string]$VideoPath,
  [Parameter(Mandatory=$true)][string]$EvidenceDir,
  [double]$SampleFps = 8.0
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ExpectedVideoSha = 'a322cd09820af0fe7d3092101d7660787853c7b2979c7e207c3be5e0bf4778aa'
$Recon3dCommit = '59fe356bceab74ef7d5839b68aba232bce20e14d'
$VggtModel = 'facebook/VGGT-1B-Commercial'
$Sam2Model = 'facebook/sam2.1-hiera-base-plus'
$GsplatVersion = '1.5.3'
$MinimumAcceptedFrames = 16
$ToolRoot = 'D:\AI\TOOLS\DC_Video2Twin'
$PythonExe = Join-Path $ToolRoot 'venv-py310\Scripts\python.exe'

function Fail([string]$Message) {
  Write-Host 'P5_QA01_V4_FRAME_SELECTION_RECOVERY=FAIL' -ForegroundColor Red
  Write-Host "error=$Message" -ForegroundColor Red
  exit 1
}

function File-Sha256([string]$Path) {
  return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

function Read-Utf8Json([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "JSON_FILE_MISSING:$Path" }
  $utf8Strict = New-Object System.Text.UTF8Encoding($false, $true)
  $text = [System.IO.File]::ReadAllText($Path, $utf8Strict)
  return ($text | ConvertFrom-Json)
}

function Run-Checked([string]$Label, [string]$Exe, [string[]]$CommandArgs) {
  Write-Host "==> $Label" -ForegroundColor Cyan
  & $Exe @CommandArgs
  if ($LASTEXITCODE -ne 0) { throw "${Label}_FAILED:exit=$LASTEXITCODE" }
}

try {
  $RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
  $EvidenceDir = (Resolve-Path -LiteralPath $EvidenceDir).Path
  $VideoPath = (Resolve-Path -LiteralPath $VideoPath).Path

  Set-Location $RepoRoot
  $top = (& git rev-parse --show-toplevel).Trim()
  if ((Resolve-Path -LiteralPath $top).Path -ne $RepoRoot) { Fail 'REPO_ROOT_MISMATCH' }
  $branchNow = (& git branch --show-current).Trim()
  if ($branchNow -ne $Branch) { Fail "WRONG_BRANCH:expected=$Branch:actual=$branchNow" }
  $head = (& git rev-parse HEAD).Trim()
  if ($head -ne $ExpectedLocalHead) { Fail "HEAD_MISMATCH:expected=$ExpectedLocalHead:actual=$head" }
  $dirty = @(& git status --porcelain=v1 --untracked-files=all)
  if ($dirty.Count -gt 0) { Fail ('WORKTREE_NOT_CLEAN:' + ($dirty -join ' | ')) }

  if (-not (Test-Path -LiteralPath $PythonExe -PathType Leaf)) { Fail "VENV_PYTHON_MISSING:$PythonExe" }
  $videoSha = File-Sha256 $VideoPath
  if ($videoSha -ne $ExpectedVideoSha) { Fail "VIDEO_SHA_MISMATCH:expected=$ExpectedVideoSha:actual=$videoSha" }
  Write-Host "VIDEO_SHA256=PASS $videoSha" -ForegroundColor Green
  Write-Host 'SOURCE_VIDEO_MUTATION=NONE'

  if ([Math]::Abs($SampleFps - 8.0) -gt 0.000001) { Fail "RECOVERY_SAMPLE_FPS_MUST_BE_8:actual=$SampleFps" }
  Write-Host 'FRAME_SELECTION_RECOVERY_POLICY=PASS sample_fps=8 window=3 max_frames=30 minimum_accepted=16' -ForegroundColor Green

  $donor = Join-Path $EvidenceDir 'donor_recon3d'
  if (-not (Test-Path -LiteralPath (Join-Path $donor '.git'))) { Fail "DONOR_GIT_MISSING:$donor" }
  $donorHead = (& git -C $donor rev-parse HEAD).Trim()
  if ($donorHead -ne $Recon3dCommit) { Fail "DONOR_HEAD_MISMATCH:expected=$Recon3dCommit:actual=$donorHead" }

  $patchMarker = Join-Path $donor '.dc_video2twin_patch.json'
  $patch = Read-Utf8Json $patchMarker
  if ($patch.upstream_commit -ne $Recon3dCommit) { Fail 'DONOR_PATCH_UPSTREAM_MISMATCH' }
  if ($patch.commercial_model_id -ne $VggtModel) { Fail 'DONOR_PATCH_COMMERCIAL_MODEL_MISMATCH' }
  if ([double]$patch.ssim_weight -ne 0.0) { Fail 'DONOR_PATCH_SSIM_WEIGHT_MISMATCH' }
  Write-Host 'RECON3D_PATCH_PROVENANCE=PASS' -ForegroundColor Green

  $prep = Join-Path $RepoRoot 'tools\p5_qa01_v4_video2twin_prep.py'
  if (-not (Test-Path -LiteralPath $prep -PathType Leaf)) { Fail "PREP_TOOL_MISSING:$prep" }

  $prepDir = Join-Path $EvidenceDir 'prep'
  if (Test-Path -LiteralPath $prepDir) {
    $existingFiles = @(Get-ChildItem -LiteralPath $prepDir -Recurse -File -ErrorAction Stop)
    if ($existingFiles.Count -gt 0) {
      Fail "FAILED_PREP_NOT_EMPTY_REFUSE_DELETE:file_count=$($existingFiles.Count)"
    }
    Remove-Item -LiteralPath $prepDir -Recurse -Force
    Write-Host 'EMPTY_FAILED_PREP_REMOVED=PASS' -ForegroundColor Green
  }

  $reconOut = Join-Path $EvidenceDir 'recon3d_output'
  if (Test-Path -LiteralPath $reconOut) { Fail "RECON_OUTPUT_ALREADY_EXISTS_REFUSE_OVERWRITE:$reconOut" }

  $env:HF_HOME = 'D:\AI\MODELS\HuggingFace'
  $env:TORCH_HOME = 'D:\AI\MODELS\Torch'
  $env:PYTORCH_ALLOC_CONF = 'expandable_segments:True'

  Run-Checked 'V4_RECOVERY_AUTOMATIC_FRAME_MASK_PREP' $PythonExe @(
    '-B',$prep,
    '--video',$VideoPath,
    '--out',$prepDir,
    '--max-frames','30',
    '--sample-fps','8',
    '--window','3',
    '--long-edge','960',
    '--sam-model',$Sam2Model,
    '--background','127'
  )

  $manifestPath = Join-Path $prepDir 'prep_manifest.json'
  $manifest = Read-Utf8Json $manifestPath
  if ($manifest.status -ne 'PASS') { Fail "PREP_MANIFEST_NOT_PASS:status=$($manifest.status)" }
  $selectedCount = [int]$manifest.selected_count
  $acceptedCount = [int]$manifest.accepted_count
  if ($selectedCount -lt $MinimumAcceptedFrames) { Fail "SELECTED_FRAME_COUNT_TOO_LOW:$selectedCount" }
  if ($acceptedCount -lt $MinimumAcceptedFrames) { Fail "MASKED_FRAME_COUNT_TOO_LOW:$acceptedCount" }
  if ([double]$manifest.video.sample_fps -ne 8.0) { Fail "PREP_MANIFEST_SAMPLE_FPS_MISMATCH:actual=$($manifest.video.sample_fps)" }
  Write-Host "FRAME_SELECTION_RECOVERY=PASS selected=$selectedCount accepted=$acceptedCount" -ForegroundColor Green

  $maskedDir = Join-Path $prepDir 'frames_masked'
  $maskedCount = @(Get-ChildItem -LiteralPath $maskedDir -File -Filter '*.png').Count
  if ($maskedCount -ne $acceptedCount) { Fail "MASKED_FILE_MANIFEST_COUNT_MISMATCH:files=$maskedCount:manifest=$acceptedCount" }

  $env:PYTHONPATH = $donor
  Run-Checked 'V4_RECOVERY_RECON3D_IDENTITY_SPLAT' $PythonExe @(
    '-m','recon3d.cli','run',$maskedDir,
    '-o',$reconOut,
    '--pose-method','vggt',
    '--max-frames','30',
    '--steps','3500',
    '--resize','640',
    '--no-metric',
    '--no-viewer',
    '--no-factor-graph',
    '--device','cuda'
  )

  $ply = Join-Path $reconOut 'scene.ply'
  $splat = Join-Path $reconOut 'scene.splat'
  if (-not (Test-Path -LiteralPath $ply -PathType Leaf)) { Fail "SCENE_PLY_MISSING:$ply" }
  if (-not (Test-Path -LiteralPath $splat -PathType Leaf)) { Fail "SCENE_SPLAT_MISSING:$splat" }
  $plySha = File-Sha256 $ply
  $splatSha = File-Sha256 $splat

  $provenance = [ordered]@{
    schema_version = '1.0'
    status = 'P5_QA01_V4_FRAME_SELECTION_RECOVERY_PASS'
    sku = 'DC-ZY-SZ-31001'
    source_video = $VideoPath
    source_video_sha256 = $videoSha
    source_video_read_only = $true
    recovery_reason = 'ORIGINAL_SAMPLE_FPS_6_SELECTED_15_BELOW_MINIMUM_16'
    recovery_sample_fps = 8.0
    selection_window = 3
    max_frames = 30
    minimum_accepted_frames = $MinimumAcceptedFrames
    selected_frame_count = $selectedCount
    masked_frame_count = $maskedCount
    recon3d_commit = $Recon3dCommit
    vggt_model = $VggtModel
    vggt_noncommercial_fallback = $false
    sam2_model = $Sam2Model
    gsplat_version = $GsplatVersion
    scene_ply = $ply
    scene_ply_sha256 = $plySha
    scene_splat = $splat
    scene_splat_sha256 = $splatSha
    prep_manifest = $manifestPath
    qa01_enabled = $false
    production_mutation = 'NONE'
  } | ConvertTo-Json -Depth 8

  $provenancePath = Join-Path $EvidenceDir 'video2twin_frame_selection_recovery_provenance.json'
  [System.IO.File]::WriteAllText($provenancePath, $provenance, (New-Object System.Text.UTF8Encoding($false)))

  Write-Host 'P5_QA01_V4_FRAME_SELECTION_RECOVERY=PASS' -ForegroundColor Green
  Write-Host "selected_frames=$selectedCount"
  Write-Host "masked_frames=$maskedCount"
  Write-Host "scene_ply=$ply"
  Write-Host "scene_ply_sha256=$plySha"
  Write-Host "scene_splat=$splat"
  Write-Host "scene_splat_sha256=$splatSha"
  Write-Host "prep_manifest=$manifestPath"
  Write-Host "selected_frames_contact_sheet=$(Join-Path $prepDir 'selected_frames_contact_sheet.jpg')"
  Write-Host "masked_contact_sheet=$(Join-Path $prepDir 'masked_contact_sheet.jpg')"
  Write-Host "evidence_dir=$EvidenceDir"
  Write-Host "provenance=$provenancePath"
  Write-Host 'qa01_enabled=false'
  Write-Host 'production_mutation=NONE'
  exit 0
}
catch {
  Fail $_.Exception.Message
}
