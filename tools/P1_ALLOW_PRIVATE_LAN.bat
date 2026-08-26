@echo off
setlocal EnableExtensions
chcp 65001 >nul

echo ============================================================
echo  VISUAL CONSOLE - Allow Private LAN TCP 4177
echo ============================================================
echo.

net session >nul 2>&1
if errorlevel 1 (
  echo 正在申请管理员权限，仅用于添加 Windows Defender 防火墙规则...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

netsh advfirewall firewall delete rule name="Visual Console LAN 4177" >nul 2>&1
netsh advfirewall firewall add rule name="Visual Console LAN 4177" dir=in action=allow protocol=TCP localport=4177 profile=private
if errorlevel 1 (
  echo.
  echo [ERROR] 防火墙规则添加失败。
  pause
  exit /b 1
)

echo.
echo [PASS] 已允许 TCP 4177 在“专用网络”中访问。
echo 不开放公用网络，不创建公网端口转发。
echo.
pause
