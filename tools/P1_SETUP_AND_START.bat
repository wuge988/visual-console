@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0.."

set "LOG=%TEMP%\visual-console-p1-start.log"

echo ============================================================
echo  VISUAL CONSOLE - P1 iPhone LAN Runtime
echo ============================================================
echo.
echo 启动日志：%LOG%
echo 当前目录：%CD%
echo.

> "%LOG%" echo [%date% %time%] Visual Console P1 start
>> "%LOG%" echo Repo=%CD%

if not exist "package.json" (
  echo [ERROR] 当前目录不是 Visual Console 仓库，找不到 package.json。
  >> "%LOG%" echo ERROR missing package.json
  goto :fail
)

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] 未检测到 Node.js。
  echo 请安装 Node.js LTS 后重新运行。
  >> "%LOG%" echo ERROR node not found
  goto :fail
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] 未检测到 npm。
  >> "%LOG%" echo ERROR npm not found
  goto :fail
)

for /f "delims=" %%v in ('node --version') do set "NODE_VER=%%v"
for /f "delims=" %%v in ('npm --version') do set "NPM_VER=%%v"
echo Node.js：%NODE_VER%
echo npm：%NPM_VER%
>> "%LOG%" echo Node=%NODE_VER% npm=%NPM_VER%

echo.
echo [1/3] 检查本机目录...
for %%D in ("D:\AI" "E:\AI_PROJECTS" "F:\1独立站\DRIFT CURIO\DRIFT_CURIO_VISUAL_PIPELINE") do (
  if exist %%D (
    echo   PASS %%~D
  ) else (
    echo   WARN %%~D 不存在
    >> "%LOG%" echo WARN missing %%~D
  )
)

echo.
echo [2/3] 安装 / 校验 npm 依赖...
call npm install
if errorlevel 1 (
  echo.
  echo [ERROR] npm install 失败。
  >> "%LOG%" echo ERROR npm install failed
  goto :fail
)

echo.
echo [3/3] 启动 Visual Console...
echo ------------------------------------------------------------
echo 电脑端：http://localhost:5173
echo Local API：http://localhost:4177/api/health
echo.
echo 注意：本版本不再自动申请管理员权限。
echo 第一次运行时如果 Windows 弹出“Windows Defender 防火墙”提示，
echo 只勾选“专用网络”，然后点“允许访问”。
echo.
echo 如果电脑页面正常但 iPhone 无法扫码访问，
echo 再运行 tools\P1_ALLOW_PRIVATE_LAN.bat 配置 4177 专用网络规则。
echo ------------------------------------------------------------
echo.
>> "%LOG%" echo Starting npm run dev
call npm run dev
set "RC=%errorlevel%"

echo.
echo Visual Console 已停止，退出代码：%RC%
>> "%LOG%" echo Stopped rc=%RC%
goto :end

:fail
echo.
echo ============================================================
echo P1 启动失败。窗口会保持打开，不会自动消失。
echo 日志：%LOG%
echo ============================================================
set "RC=1"

:end
echo.
pause
exit /b %RC%
