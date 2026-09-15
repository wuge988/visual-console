param(
  [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot),
  [string]$SiteId = "drift-curio",
  [string]$Sku = "DC-ZY-SZ-31001",
  [string]$ApiBase = "http://127.0.0.1:4179"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Fail([string]$Code, [string]$Message) {
  Write-Host "P3A_SOURCE_GATE=FAIL"
  Write-Host "BLOCKER=$Code"
  Write-Error $Message
  exit 1
}

try {
  $uri = [Uri]$ApiBase
} catch {
  Fail "P3A_API_BASE_INVALID" "ApiBase is not a valid URI."
}
if ($uri.Scheme -ne "http" -or $uri.Host -notin @("127.0.0.1", "localhost")) {
  Fail "P3A_API_MUST_BE_LOOPBACK" "P3-A source gate only accepts loopback HTTP API endpoints."
}

$sitePath = Join-Path $RepoRoot "config\sites\$SiteId.json"
if (-not (Test-Path -LiteralPath $sitePath -PathType Leaf)) {
  Fail "P3A_SITE_PROFILE_NOT_FOUND" "Missing site profile: $sitePath"
}
$site = Get-Content -LiteralPath $sitePath -Raw -Encoding UTF8 | ConvertFrom-Json
if ([string]$site.site_id -ne $SiteId) {
  Fail "P3A_SITE_PROFILE_MISMATCH" "Site profile id does not match requested SiteId."
}
if (@($site.enabled_workflows) -contains "QA01") {
  Fail "P3A_QA01_PREMATURELY_ENABLED" "QA01 must remain disabled during P3-A evaluation."
}

$query = "site_id=$([Uri]::EscapeDataString($SiteId))&item_id=$([Uri]::EscapeDataString($Sku))"
$readinessUri = "$($uri.GetLeftPart([UriPartial]::Authority))/api/v2/p3a/aquarium/readiness?$query"
try {
  $result = Invoke-RestMethod -Method Get -Uri $readinessUri -TimeoutSec 10
} catch {
  Fail "P3A_LOCAL_API_UNAVAILABLE" "Cannot read P3-A readiness from local Visual Console API. Start npm.cmd run dev first. $($_.Exception.Message)"
}

$timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$controlRoot = [string]$site.control_root
if ([string]::IsNullOrWhiteSpace($controlRoot)) {
  $controlRoot = Join-Path ([string]$site.manifest_root) "visual-console-p2\$SiteId"
}
$evidenceDir = Join-Path $controlRoot "evidence\p3a"
New-Item -ItemType Directory -Path $evidenceDir -Force | Out-Null
$evidencePath = Join-Path $evidenceDir "aquarium-source-readiness-$timestamp.json"

$evidence = [ordered]@{
  gate = "P3A_AQUARIUM_SOURCE_GATE"
  captured_at = (Get-Date).ToUniversalTime().ToString("o")
  site_id = $SiteId
  item_id = $Sku
  api = $readinessUri
  authority = [string]$result.authority
  execution_authorized = [bool]$result.execution_authorized
  production_registration = [bool]$result.production_registration
  source_ready = [bool]$result.source_ready
  contract_safe = [bool]$result.contract_safe
  evaluation_ready = [bool]$result.evaluation_ready
  next_gate = [string]$result.next_gate
  source = $result.source
  qa01 = $result.qa01
  candidate_routes = @($result.candidate_routes)
  blockers = @($result.blockers)
}
$evidence | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $evidencePath -Encoding UTF8

Write-Host "P3A_PILOT=$($result.pilot_id)"
Write-Host "SKU=$Sku"
Write-Host "SOURCE_READY=$($result.source_ready)"
Write-Host "CONTRACT_SAFE=$($result.contract_safe)"
Write-Host "EXECUTION_AUTHORIZED=$($result.execution_authorized)"
if ($null -ne $result.source) {
  Write-Host "SOURCE_ASSET_ID=$($result.source.asset_id)"
  Write-Host "SOURCE_PACKAGE_ID=$($result.source.source_package_id)"
  Write-Host "SOURCE_SHA256=$($result.source.sha256)"
}
Write-Host "NEXT_GATE=$($result.next_gate)"
Write-Host "EVIDENCE=$evidencePath"

if (-not [bool]$result.evaluation_ready) {
  $blockers = @($result.blockers) -join ","
  Fail "P3A_SOURCE_NOT_READY" "P3-A source readiness is blocked: $blockers"
}
if ([bool]$result.execution_authorized) {
  Fail "P3A_UNEXPECTED_EXECUTION_AUTHORITY" "P3-A source gate must never authorize execution."
}

Write-Host "P3A_SOURCE_GATE=PASS"
exit 0
