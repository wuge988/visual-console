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
  if ($code -ne 0) { throw ("GIT_FAILED: git " + ($Args -join " ") + " :: " + (($output | % { [string]$_ }) -join " | ")) }
  return @($output | % { [string]$_ })
}

try {
  if ([string]::IsNullOrWhiteSpace($ExpectedHead)) { throw "EXPECTED_HEAD_REQUIRED" }
  Set-Location $RepoRoot
  $dirty = @((Invoke-Git status --porcelain=v1 --untracked-files=all) | ? { -not [string]::IsNullOrWhiteSpace($_) })
  if ($dirty.Count -gt 0) { throw ("WORKTREE_NOT_CLEAN :: " + ($dirty -join " | ")) }

  Write-Host "==> Sync exact audited P5 Kontext D2 head" -ForegroundColor Cyan
  Invoke-Git fetch origin ("+refs/heads/" + $Branch + ":refs/remotes/origin/" + $Branch) | Out-Null
  $remote = ((Invoke-Git rev-parse ("refs/remotes/origin/" + $Branch)) -join "").Trim()
  if ($remote -ne $ExpectedHead.Trim()) { throw "REMOTE_HEAD_MISMATCH: expected=$($ExpectedHead.Trim()) actual=$remote" }

  $beforeHead = ((Invoke-Git rev-parse HEAD) -join "").Trim()
  $safety = "safety/local-before-p5-kontext-d2-" + (Get-Date -Format "yyyyMMdd-HHmmss")
  Invoke-Git branch $safety $beforeHead | Out-Null
  Write-Host ("SAFETY_BRANCH=" + $safety)
  Invoke-Git switch --detach $remote | Out-Null
  $prev = $ErrorActionPreference
  try { $ErrorActionPreference = "Continue"; & git show-ref --verify --quiet ("refs/heads/" + $Branch); $exists = ($LASTEXITCODE -eq 0) } finally { $ErrorActionPreference = $prev }
  if ($exists) { Invoke-Git branch -f $Branch $remote | Out-Null; Invoke-Git switch $Branch | Out-Null } else { Invoke-Git switch -c $Branch $remote | Out-Null }
  $head = ((Invoke-Git rev-parse HEAD) -join "").Trim()
  if ($head -ne $ExpectedHead.Trim()) { throw "LOCAL_HEAD_MISMATCH" }
  $dirtyAfter = @((Invoke-Git status --porcelain=v1 --untracked-files=all) | ? { -not [string]::IsNullOrWhiteSpace($_) })
  if ($dirtyAfter.Count -gt 0) { throw ("WORKTREE_NOT_CLEAN_AFTER_SYNC :: " + ($dirtyAfter -join " | ")) }

  Write-Host "P5_QA01_V2_KONTEXT_D2_LOCAL_PREP=PASS" -ForegroundColor Green
  Write-Host ("HEAD=" + $head)
  Write-Host "==> Launch one masked Identity-Core Aquarium candidate" -ForegroundColor Cyan

  $python = "D:\AI\APPS\ComfyUI_windows_portable\python_embeded\python.exe"
  $script = Join-Path $RepoRoot "tools\p5_qa01_kontext_d2_eval.py"
  if (-not (Test-Path -LiteralPath $python -PathType Leaf)) { throw "COMFYUI_EMBEDDED_PYTHON_NOT_FOUND" }
  if (-not (Test-Path -LiteralPath $script -PathType Leaf)) { throw "KONTEXT_D2_SCRIPT_NOT_FOUND" }
  $toolsDir = Join-Path $RepoRoot "tools"
  $bootstrap = Join-Path $env:TEMP ("P5_QA01_D2_BOOTSTRAP_" + $ExpectedHead.Trim().Substring(0,12) + ".py")
  $launcher = @'
import runpy
import sys
tools = sys.argv.pop(1)
script = sys.argv.pop(1)
if tools not in sys.path:
    sys.path.insert(0, tools)
sys.argv[0] = script
sys.stdout.write("P5_D2_PYTHON_BOOTSTRAP=TOOLS_DIR_INSERTED\n")
sys.stdout.flush()
runpy.run_path(script, run_name="__main__")
'@
  [IO.File]::WriteAllText($bootstrap, $launcher, (New-Object System.Text.UTF8Encoding($false)))
  $prev = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $output = @(& $python -B $bootstrap $toolsDir $script --repo-root $RepoRoot --site-id drift-curio --sku $Sku --expected-head $ExpectedHead 2>&1)
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $prev
    if (Test-Path -LiteralPath $bootstrap) { Remove-Item -LiteralPath $bootstrap -Force -ErrorAction SilentlyContinue }
  }
  $output | % { Write-Host ([string]$_) }
  if ($code -ne 0) { throw "P5_KONTEXT_D2_EVAL_FAILED: exit=$code" }
  if (Get-Command Set-Clipboard -ErrorAction SilentlyContinue) { try { Set-Clipboard -Value (($output | % { [string]$_ }) -join [Environment]::NewLine) } catch {} }
  Write-Host "P5_QA01_V2_KONTEXT_D2_LOCAL_GATE=PASS" -ForegroundColor Green
  exit 0
} catch {
  Write-Host "P5_QA01_V2_KONTEXT_D2_LOCAL_GATE=FAIL" -ForegroundColor Red
  Write-Host ("error=" + $_.Exception.Message) -ForegroundColor Red
  exit 1
}
