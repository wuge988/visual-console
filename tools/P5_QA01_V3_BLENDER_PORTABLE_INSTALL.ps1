param(
  [string]$InstallRoot = 'D:\AI\TOOLS\Blender',
  [string]$Version = '5.2.1'
)

$ErrorActionPreference = 'Stop'

function Fail([string]$Message) {
  Write-Host 'P5_QA01_V3_BLENDER_PORTABLE_INSTALL=FAIL' -ForegroundColor Red
  Write-Host "error=$Message" -ForegroundColor Red
  exit 1
}

try {
  if (-not [Environment]::Is64BitOperatingSystem) {
    Fail 'BLENDER_PORTABLE_REQUIRES_64BIT_WINDOWS'
  }

  $fileName = "blender-$Version-windows-x64.zip"
  $baseUrl = 'https://download.blender.org/release/Blender5.2'
  $zipUrl = "$baseUrl/$fileName"
  $shaUrl = "$baseUrl/blender-$Version.sha256"
  $downloadRoot = Join-Path $InstallRoot '_downloads'
  $zipPath = Join-Path $downloadRoot $fileName
  $shaPath = Join-Path $downloadRoot "blender-$Version.sha256"
  $expectedDir = Join-Path $InstallRoot "blender-$Version-windows-x64"
  $expectedExe = Join-Path $expectedDir 'blender.exe'

  New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null
  New-Item -ItemType Directory -Force -Path $downloadRoot | Out-Null

  if (Test-Path -LiteralPath $expectedExe -PathType Leaf) {
    $versionLines = @(& $expectedExe --version 2>&1)
    if ($LASTEXITCODE -eq 0 -and ($versionLines | Select-Object -First 1) -match ([regex]::Escape($Version))) {
      Write-Host 'P5_QA01_V3_BLENDER_PORTABLE_INSTALL=PASS' -ForegroundColor Green
      Write-Host 'install_action=ALREADY_PRESENT'
      Write-Host "blender=$expectedExe"
      Write-Host "blender_version=$(($versionLines | Select-Object -First 1).Trim())"
      exit 0
    }
    Fail "EXISTING_BLENDER_VERSION_PROBE_FAILED:${expectedExe}"
  }

  Write-Host '==> Download official Blender SHA256 manifest' -ForegroundColor Cyan
  Invoke-WebRequest -UseBasicParsing -Uri $shaUrl -OutFile $shaPath
  if (-not (Test-Path -LiteralPath $shaPath -PathType Leaf)) {
    Fail 'BLENDER_SHA256_MANIFEST_DOWNLOAD_MISSING'
  }

  $shaText = [IO.File]::ReadAllText($shaPath, [Text.Encoding]::UTF8)
  $match = [regex]::Match($shaText, "(?im)^([0-9a-f]{64})\s+\*?" + [regex]::Escape($fileName) + "\s*$")
  if (-not $match.Success) {
    Fail "BLENDER_SHA256_ENTRY_NOT_FOUND:${fileName}"
  }
  $expectedSha = $match.Groups[1].Value.ToLowerInvariant()

  if (-not (Test-Path -LiteralPath $zipPath -PathType Leaf)) {
    Write-Host '==> Download official Blender 5.2.1 LTS portable ZIP (~405 MB)' -ForegroundColor Cyan
    Invoke-WebRequest -UseBasicParsing -Uri $zipUrl -OutFile $zipPath
  }

  if (-not (Test-Path -LiteralPath $zipPath -PathType Leaf)) {
    Fail 'BLENDER_ZIP_DOWNLOAD_MISSING'
  }
  $zipInfo = Get-Item -LiteralPath $zipPath
  if ($zipInfo.Length -lt 300000000) {
    Fail "BLENDER_ZIP_SIZE_IMPLAUSIBLE:bytes=$($zipInfo.Length)"
  }

  Write-Host '==> Verify official SHA256' -ForegroundColor Cyan
  $actualSha = (Get-FileHash -Algorithm SHA256 -LiteralPath $zipPath).Hash.ToLowerInvariant()
  if ($actualSha -ne $expectedSha) {
    Fail "BLENDER_SHA256_MISMATCH:expected=$expectedSha:actual=$actualSha"
  }

  Write-Host '==> Extract Blender portable package' -ForegroundColor Cyan
  Expand-Archive -LiteralPath $zipPath -DestinationPath $InstallRoot -Force
  if (-not (Test-Path -LiteralPath $expectedExe -PathType Leaf)) {
    Fail "BLENDER_EXE_MISSING_AFTER_EXTRACT:${expectedExe}"
  }

  $versionLines = @(& $expectedExe --version 2>&1)
  if ($LASTEXITCODE -ne 0) {
    Fail "BLENDER_VERSION_PROBE_FAILED:exit=$LASTEXITCODE"
  }
  $versionLine = ($versionLines | Select-Object -First 1).Trim()
  if ($versionLine -notmatch ([regex]::Escape($Version))) {
    Fail "BLENDER_VERSION_MISMATCH:expected=$Version:actual=$versionLine"
  }

  Remove-Item -LiteralPath $zipPath -Force

  Write-Host 'P5_QA01_V3_BLENDER_PORTABLE_INSTALL=PASS' -ForegroundColor Green
  Write-Host 'install_action=DOWNLOADED_VERIFIED_EXTRACTED'
  Write-Host "source=$zipUrl"
  Write-Host "sha256=$actualSha"
  Write-Host "blender=$expectedExe"
  Write-Host "blender_version=$versionLine"
  Write-Host 'next_gate=tools\P5_QA01_V3_GEOMETRY_LOCAL_GATE.ps1'
  exit 0
}
catch {
  Fail $_.Exception.Message
}
