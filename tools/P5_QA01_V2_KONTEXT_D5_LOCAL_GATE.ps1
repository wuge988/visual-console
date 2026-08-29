param(
  [string]$RepoRoot = "E:\AI_PROJECTS\VISUAL_CONSOLE",
  [string]$Branch = "feat/p5-qa01-scene-freeze",
  [string]$Sku = "DC-ZY-SZ-31001",
  [string]$PriorEvidenceDir = "E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\visual-console-p2\drift-curio\evidence\P5_QA01_V2_KONTEXT_D4_20260828-233428",
  [string]$SceneReferencePath = "",
  [string]$ExpectedHead
)

$ErrorActionPreference = "Stop"

function Invoke-Git {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
  $previous = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $output = @(& git @Args 2>&1)
    $code = $LASTEXITCODE
  } finally { $ErrorActionPreference = $previous }
  if ($code -ne 0) { throw ("GIT_FAILED: git " + ($Args -join " ") + " :: " + (($output | % { [string]$_ }) -join " | ")) }
  return @($output | % { [string]$_ })
}

function Resolve-SceneReference {
  param([string]$InitialPath)
  if (-not [string]::IsNullOrWhiteSpace($InitialPath)) {
    if (-not (Test-Path -LiteralPath $InitialPath -PathType Leaf)) { throw "SCENE_REFERENCE_PATH_NOT_FOUND" }
    return (Resolve-Path -LiteralPath $InitialPath).Path
  }

  Write-Host "WAITING_FOR_SCENE_REFERENCE_PICKER=TRUE" -ForegroundColor Yellow
  Write-Host "If no dialog is visible, use Alt+Tab once; the picker is forced TopMost." -ForegroundColor Yellow

  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.Application]::EnableVisualStyles()

  $owner = New-Object System.Windows.Forms.Form
  $owner.Text = "D5 scene reference picker owner"
  $owner.TopMost = $true
  $owner.ShowInTaskbar = $false
  $owner.StartPosition = "CenterScreen"
  $owner.Width = 1
  $owner.Height = 1

  $dialog = New-Object System.Windows.Forms.OpenFileDialog
  $dialog.Title = "Select approved Aquarium realism reference for D5 evaluation"
  $dialog.Filter = "Image files (*.png;*.jpg;*.jpeg;*.webp)|*.png;*.jpg;*.jpeg;*.webp|All files (*.*)|*.*"
  $dialog.Multiselect = $false
  $dialog.CheckFileExists = $true
  $dialog.CheckPathExists = $true
  $dialog.RestoreDirectory = $true

  try {
    $owner.Show()
    $owner.Activate()
    $result = $dialog.ShowDialog($owner)
  } finally {
    $owner.Close()
    $owner.Dispose()
  }

  if ($result -ne [System.Windows.Forms.DialogResult]::OK) { throw "SCENE_REFERENCE_REQUIRED" }
  Write-Host "SCENE_REFERENCE_PICKER=SELECTED" -ForegroundColor Green
  return $dialog.FileName
}

try {
  if ([string]::IsNullOrWhiteSpace($ExpectedHead)) { throw "EXPECTED_HEAD_REQUIRED" }
  if ([string]::IsNullOrWhiteSpace($PriorEvidenceDir)) { throw "PRIOR_EVIDENCE_DIR_REQUIRED" }
  Set-Location $RepoRoot

  $dirty = @((Invoke-Git status --porcelain=v1 --untracked-files=all) | ? { -not [string]::IsNullOrWhiteSpace($_) })
  if ($dirty.Count -gt 0) { throw ("WORKTREE_NOT_CLEAN :: " + ($dirty -join " | ")) }

  Write-Host "==> Sync exact audited P5 Kontext D5 head" -ForegroundColor Cyan
  Invoke-Git fetch origin ("+refs/heads/" + $Branch + ":refs/remotes/origin/" + $Branch) | Out-Null
  $remote = ((Invoke-Git rev-parse ("refs/remotes/origin/" + $Branch)) -join "").Trim()
  if ($remote -ne $ExpectedHead.Trim()) { throw "REMOTE_HEAD_MISMATCH: expected=$($ExpectedHead.Trim()) actual=$remote" }

  $beforeHead = ((Invoke-Git rev-parse HEAD) -join "").Trim()
  $safety = "safety/local-before-p5-kontext-d5-" + (Get-Date -Format "yyyyMMdd-HHmmss")
  Invoke-Git branch $safety $beforeHead | Out-Null
  Write-Host ("SAFETY_BRANCH=" + $safety)

  Invoke-Git switch --detach $remote | Out-Null
  $prev = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    & git show-ref --verify --quiet ("refs/heads/" + $Branch)
    $exists = ($LASTEXITCODE -eq 0)
  } finally { $ErrorActionPreference = $prev }
  if ($exists) {
    Invoke-Git branch -f $Branch $remote | Out-Null
    Invoke-Git switch $Branch | Out-Null
  } else {
    Invoke-Git switch -c $Branch $remote | Out-Null
  }

  $head = ((Invoke-Git rev-parse HEAD) -join "").Trim()
  if ($head -ne $ExpectedHead.Trim()) { throw "LOCAL_HEAD_MISMATCH" }
  $dirtyAfter = @((Invoke-Git status --porcelain=v1 --untracked-files=all) | ? { -not [string]::IsNullOrWhiteSpace($_) })
  if ($dirtyAfter.Count -gt 0) { throw ("WORKTREE_NOT_CLEAN_AFTER_SYNC :: " + ($dirtyAfter -join " | ")) }

  if (-not (Test-Path -LiteralPath $PriorEvidenceDir -PathType Container)) { throw "PRIOR_D4_EVIDENCE_DIR_NOT_FOUND" }
  $resolvedScene = Resolve-SceneReference -InitialPath $SceneReferencePath

  Write-Host "P5_QA01_V2_KONTEXT_D5_LOCAL_PREP=PASS" -ForegroundColor Green
  Write-Host ("HEAD=" + $head)
  Write-Host ("PRIOR_EVIDENCE_DIR=" + $PriorEvidenceDir)
  Write-Host ("SCENE_REFERENCE_PATH=" + $resolvedScene)
  Write-Host "==> Launch real-reference-guided multi-reference Aquarium evaluation" -ForegroundColor Cyan

  $python = "D:\AI\APPS\ComfyUI_windows_portable\python_embeded\python.exe"
  $script = Join-Path $RepoRoot "tools\p5_qa01_kontext_d5_eval.py"
  if (-not (Test-Path -LiteralPath $python -PathType Leaf)) { throw "COMFYUI_EMBEDDED_PYTHON_NOT_FOUND" }
  if (-not (Test-Path -LiteralPath $script -PathType Leaf)) { throw "KONTEXT_D5_SCRIPT_NOT_FOUND" }

  $toolsDir = Join-Path $RepoRoot "tools"
  $bootstrap = Join-Path $env:TEMP ("P5_QA01_D5_BOOTSTRAP_" + $ExpectedHead.Trim().Substring(0,12) + ".py")
  $launcher = @'
import runpy
import sys
tools = sys.argv.pop(1)
script = sys.argv.pop(1)
if tools not in sys.path:
    sys.path.insert(0, tools)
sys.argv[0] = script
sys.stdout.write("P5_D5_PYTHON_BOOTSTRAP=TOOLS_DIR_INSERTED\n")
sys.stdout.flush()
runpy.run_path(script, run_name="__main__")
'@
  [IO.File]::WriteAllText($bootstrap, $launcher, (New-Object System.Text.UTF8Encoding($false)))

  $prev = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $output = @(
      & $python -B $bootstrap $toolsDir $script `
        --repo-root $RepoRoot `
        --site-id drift-curio `
        --sku $Sku `
        --prior-evidence-dir $PriorEvidenceDir `
        --scene-reference-path $resolvedScene `
        --expected-head $ExpectedHead 2>&1
    )
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $prev
    if (Test-Path -LiteralPath $bootstrap) { Remove-Item -LiteralPath $bootstrap -Force -ErrorAction SilentlyContinue }
  }

  $output | % { Write-Host ([string]$_) }
  if ($code -ne 0) { throw "P5_KONTEXT_D5_EVAL_FAILED: exit=$code" }

  $reviewLine = @($output | % { [string]$_ } | ? { $_ -like "review_file=*" }) | Select-Object -Last 1
  if ($null -ne $reviewLine) {
    $review = $reviewLine.Substring("review_file=".Length)
    if (Test-Path -LiteralPath $review -PathType Leaf) { Start-Process $review }
  }

  if (Get-Command Set-Clipboard -ErrorAction SilentlyContinue) {
    try { Set-Clipboard -Value (($output | % { [string]$_ }) -join [Environment]::NewLine) } catch {}
  }

  Write-Host "P5_QA01_V2_KONTEXT_D5_LOCAL_GATE=PASS" -ForegroundColor Green
  exit 0
} catch {
  Write-Host "P5_QA01_V2_KONTEXT_D5_LOCAL_GATE=FAIL" -ForegroundColor Red
  Write-Host ("error=" + $_.Exception.Message) -ForegroundColor Red
  exit 1
}
