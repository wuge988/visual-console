param(
  [string]$RepoRoot = "E:\AI_PROJECTS\VISUAL_CONSOLE",
  [string]$Branch = "feat/p5-qa01-scene-freeze",
  [string]$Sku = "DC-ZY-SZ-31001",
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
  if ($code -ne 0) {
    throw ("GIT_FAILED: git " + ($Args -join " ") + " :: " + (($output | ForEach-Object { [string]$_ }) -join " | "))
  }
  return @($output | ForEach-Object { [string]$_ })
}

function Preserve-KnownPythonCacheDebt {
  param([string]$Root)

  $dirty = @((Invoke-Git status --porcelain=v1 --untracked-files=all) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ($dirty.Count -eq 0) { return }

  $unexpected = @($dirty | Where-Object { $_ -notmatch '^\?\? tools/__pycache__/.+\.pyc$' })
  if ($unexpected.Count -gt 0) {
    throw ("WORKTREE_NOT_CLEAN :: " + ($dirty -join " | "))
  }

  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $parent = Split-Path -Parent ([IO.Path]::GetFullPath($Root))
  $backup = Join-Path $parent ("VISUAL_CONSOLE_RECOVERY_P5_PYC_" + $stamp)
  New-Item -ItemType Directory -Force -Path $backup | Out-Null

  foreach ($row in $dirty) {
    $relative = $row.Substring(3).Replace('/', '\')
    $source = Join-Path $Root $relative
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
      throw ("PYC_DEBT_SOURCE_MISSING :: " + $relative)
    }
    $dest = Join-Path $backup ([IO.Path]::GetFileName($source))
    Move-Item -LiteralPath $source -Destination $dest
    Write-Host ("PRESERVED_PYTHON_CACHE=" + $relative)
  }

  $cacheDir = Join-Path $Root "tools\__pycache__"
  if (Test-Path -LiteralPath $cacheDir -PathType Container) {
    $remaining = @(Get-ChildItem -LiteralPath $cacheDir -Force -ErrorAction SilentlyContinue)
    if ($remaining.Count -eq 0) {
      Remove-Item -LiteralPath $cacheDir -Force -ErrorAction SilentlyContinue
    }
  }

  $after = @((Invoke-Git status --porcelain=v1 --untracked-files=all) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ($after.Count -gt 0) {
    throw ("WORKTREE_NOT_CLEAN_AFTER_PYC_RECOVERY :: " + ($after -join " | "))
  }
  Write-Host ("PYTHON_CACHE_BACKUP=" + $backup)
}

try {
  if ([string]::IsNullOrWhiteSpace($ExpectedHead)) { throw "EXPECTED_HEAD_REQUIRED" }
  Set-Location $RepoRoot
  $repo = ((Invoke-Git rev-parse --show-toplevel) -join "").Trim()
  if ([IO.Path]::GetFullPath($repo) -ne [IO.Path]::GetFullPath($RepoRoot)) { throw "REPO_ROOT_MISMATCH" }

  # A previous embedded-Python D1 attempt may have created only tools/__pycache__/*.pyc
  # before the inner fail-closed worktree check ran. Preserve that known generated debt
  # outside the repository, but stop for every other dirty path.
  Preserve-KnownPythonCacheDebt -Root $RepoRoot

  Write-Host "==> Sync exact audited P5 Kontext D1 head" -ForegroundColor Cyan
  Invoke-Git fetch origin ("+refs/heads/" + $Branch + ":refs/remotes/origin/" + $Branch) | Out-Null
  $remote = ((Invoke-Git rev-parse ("refs/remotes/origin/" + $Branch)) -join "").Trim()
  if ($remote -ne $ExpectedHead.Trim()) { throw "REMOTE_HEAD_MISMATCH: expected=$($ExpectedHead.Trim()) actual=$remote" }

  $beforeHead = ((Invoke-Git rev-parse HEAD) -join "").Trim()
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $safety = "safety/local-before-p5-kontext-d1-$stamp"
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

  Write-Host "P5_QA01_V2_KONTEXT_D1_LOCAL_PREP=PASS" -ForegroundColor Green
  Write-Host ("HEAD=" + $head)
  Write-Host "==> Launch one identity-weighted adaptive Aquarium Kontext candidate" -ForegroundColor Cyan

  $python = "D:\AI\APPS\ComfyUI_windows_portable\python_embeded\python.exe"
  if (-not (Test-Path -LiteralPath $python -PathType Leaf)) { throw "COMFYUI_EMBEDDED_PYTHON_NOT_FOUND" }
  $script = Join-Path $RepoRoot "tools\p5_qa01_kontext_d1_eval.py"
  if (-not (Test-Path -LiteralPath $script -PathType Leaf)) { throw "KONTEXT_D1_SCRIPT_NOT_FOUND" }
  $toolsDir = Join-Path $RepoRoot "tools"

  # Do not pass bootstrap source through `python -c` on Windows PowerShell 5.1.
  # Native argument quoting can strip Python string quotes before embedded Python sees them.
  # Write the tiny bootstrap to TEMP, invoke it as a real .py file, then delete it.
  $bootstrap = Join-Path $env:TEMP ("P5_QA01_D1_BOOTSTRAP_" + $ExpectedHead.Trim().Substring(0, 12) + ".py")
  $launcher = @'
import runpy
import sys
tools = sys.argv.pop(1)
script = sys.argv.pop(1)
if tools not in sys.path:
    sys.path.insert(0, tools)
sys.argv[0] = script
sys.stdout.write("P5_D1_PYTHON_BOOTSTRAP=TOOLS_DIR_INSERTED\n")
sys.stdout.flush()
runpy.run_path(script, run_name="__main__")
'@
  [IO.File]::WriteAllText($bootstrap, $launcher, (New-Object System.Text.UTF8Encoding($false)))

  $previous = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    # -B prevents embedded Python from creating tools/__pycache__/*.pyc while the
    # D1 script performs its own fail-closed worktree validation.
    $output = @(& $python -B $bootstrap $toolsDir $script --repo-root $RepoRoot --site-id drift-curio --sku $Sku --expected-head $ExpectedHead 2>&1)
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
    if (Test-Path -LiteralPath $bootstrap -PathType Leaf) {
      Remove-Item -LiteralPath $bootstrap -Force -ErrorAction SilentlyContinue
    }
  }
  $output | ForEach-Object { Write-Host ([string]$_) }
  if ($code -ne 0) { throw "P5_KONTEXT_D1_EVAL_FAILED: exit=$code" }

  if (Get-Command Set-Clipboard -ErrorAction SilentlyContinue) {
    try { Set-Clipboard -Value (($output | ForEach-Object { [string]$_ }) -join [Environment]::NewLine) } catch {}
  }
  Write-Host "P5_QA01_V2_KONTEXT_D1_LOCAL_GATE=PASS" -ForegroundColor Green
  exit 0
} catch {
  Write-Host "P5_QA01_V2_KONTEXT_D1_LOCAL_GATE=FAIL" -ForegroundColor Red
  Write-Host ("error=" + $_.Exception.Message) -ForegroundColor Red
  exit 1
}
