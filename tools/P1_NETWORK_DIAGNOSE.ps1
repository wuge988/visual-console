$ErrorActionPreference = "Continue"

Write-Host "============================================================" -ForegroundColor DarkGray
Write-Host "VISUAL CONSOLE - P1 LAN DIAGNOSTICS" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor DarkGray
Write-Host ""

Write-Host "[1] Active IPv4 interfaces" -ForegroundColor Cyan
$configs = Get-NetIPConfiguration | Where-Object { $_.IPv4Address -and $_.NetAdapter.Status -eq "Up" }
foreach ($cfg in $configs) {
    $profile = Get-NetConnectionProfile -InterfaceIndex $cfg.InterfaceIndex -ErrorAction SilentlyContinue
    $gateway = if ($cfg.IPv4DefaultGateway) { $cfg.IPv4DefaultGateway.NextHop } else { "-" }
    $category = if ($profile) { $profile.NetworkCategory } else { "Unknown" }
    Write-Host ""
    Write-Host ("Interface : " + $cfg.InterfaceAlias)
    Write-Host ("Desc      : " + $cfg.NetAdapter.InterfaceDescription)
    Write-Host ("IPv4      : " + $cfg.IPv4Address.IPAddress)
    Write-Host ("Gateway   : " + $gateway)
    Write-Host ("Category  : " + $category)
    Write-Host ("IfIndex   : " + $cfg.InterfaceIndex)
}

Write-Host ""
Write-Host "[2] Recommended phone-reachable IPv4" -ForegroundColor Cyan
$virtualPattern = "Hyper-V|VMware|VirtualBox|WSL|Docker|Tailscale|ZeroTier|WireGuard|Wintun|TAP|TUN|VPN|Loopback|Bluetooth"
$candidates = @()
foreach ($cfg in $configs) {
    $profile = Get-NetConnectionProfile -InterfaceIndex $cfg.InterfaceIndex -ErrorAction SilentlyContinue
    $ip = $cfg.IPv4Address.IPAddress
    $hasGateway = [bool]$cfg.IPv4DefaultGateway
    $isVirtual = ($cfg.InterfaceAlias -match $virtualPattern) -or ($cfg.NetAdapter.InterfaceDescription -match $virtualPattern)
    $score = 0
    if ($hasGateway) { $score += 100 }
    if ($profile -and $profile.NetworkCategory -eq "Private") { $score += 40 }
    if ($cfg.InterfaceAlias -match "Wi-Fi|WLAN|Wireless") { $score += 35 }
    if ($cfg.InterfaceAlias -match "Ethernet") { $score += 25 }
    if ($ip -match "^192\.168\.") { $score += 20 }
    elseif ($ip -match "^172\.(1[6-9]|2[0-9]|3[0-1])\.") { $score += 15 }
    elseif ($ip -match "^10\.") { $score += 10 }
    if ($isVirtual) { $score -= 200 }
    $candidates += [pscustomobject]@{ Score=$score; Interface=$cfg.InterfaceAlias; IPv4=$ip; Gateway=$hasGateway; Category=if($profile){$profile.NetworkCategory}else{"Unknown"}; Virtual=$isVirtual }
}
$candidates = $candidates | Sort-Object Score -Descending
$candidates | Format-Table -AutoSize

$best = $candidates | Select-Object -First 1
if ($best) {
    Write-Host ""
    Write-Host ("RECOMMENDED_IP = " + $best.IPv4) -ForegroundColor Green
    Write-Host ("Test on iPhone Safari: http://" + $best.IPv4 + ":4177/api/health") -ForegroundColor Green
}

Write-Host ""
Write-Host "[3] Listening ports" -ForegroundColor Cyan
foreach ($port in 4177,5173) {
    $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($listener) {
        Write-Host ("Port " + $port + " : LISTENING, PID=" + (($listener | Select-Object -First 1).OwningProcess)) -ForegroundColor Green
    } else {
        Write-Host ("Port " + $port + " : NOT LISTENING") -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "[4] Network profiles" -ForegroundColor Cyan
Get-NetConnectionProfile | Select-Object Name,InterfaceAlias,InterfaceIndex,NetworkCategory,IPv4Connectivity | Format-Table -AutoSize

Write-Host ""
Write-Host "Do not change anything yet. Send a screenshot of this window." -ForegroundColor Yellow
Write-Host ""
Read-Host "Press Enter to close"