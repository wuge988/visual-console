@echo off
setlocal
cd /d "%~dp0.."

echo ============================================================
echo  VISUAL CONSOLE - P1 iPhone LAN Runtime Setup
echo ============================================================
echo.

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo 正在申请管理员权限，仅用于添加 Private 网络 4177 端口防火墙规则...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

where node >nul 2>&1
if %errorlevel% neq 0 (
  echo [ERROR] 未检测到 Node.js。
  echo 请先安装 Node.js LTS，然后重新双击本文件。
  pause
  exit /b 1
)

where npm >nul 2>&1
if %errorlevel% neq 0 (
  echo [ERROR] 未检测到 npm。
  pause
  exit /b 1
)

echo [1/3] 配置 Windows Private 网络防火墙，仅开放本机 TCP 4177...
netsh advfirewall firewall delete rule name="Visual Console LAN 4177" >nul 2>&1
netsh advfirewall firewall add rule name="Visual Console LAN 4177" dir=in action=allow protocol=TCP localport=4177 profile=private >nul
if %errorlevel% neq 0 (
  echo [ERROR] 防火墙规则添加失败。
  pause
  exit /b 1
)

echo [2/3] 安装/校验 npm 依赖...
call npm install
if %errorlevel% neq 0 (
  echo [ERROR] npm install 失败。
  pause
  exit /b 1
)

echo [3/3] 启动 Visual Console...
echo.
echo 电脑页面： http://localhost:5173
echo 手机上传： 在电脑工作台点击“生成手机上传二维码”
echo.
echo 关闭本窗口会停止 P1 服务。
echo ============================================================
call npm run dev
pause
