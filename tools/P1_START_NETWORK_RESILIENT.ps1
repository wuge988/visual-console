$ErrorActionPreference = "Stop"

$Target = "E:\AI_PROJECTS\VISUAL_CONSOLE"
$Branch = "feat/p1-mobile-capture-runtime"
$OfficialRegistry = "https://registry.npmjs.org/"
$MirrorRegistry = "https://registry.npmmirror.com/"
$Log = Join-Path $env:TEMP "visual-console-p1-v5.log"
$script:NpmInstallExitCode = $null

function Section([string]$Text) {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor DarkGray
    Write-Host $Text -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor DarkGray
}

function Invoke-NpmInstall([string]$Registry, [string]$Label) {
    $script:NpmInstallExitCode = $null
    Write-Host ""
    Write-Host "尝试 $Label：$Registry" -ForegroundColor Yellow
    & npm.cmd install `
      --registry=$Registry `
      --fetch-retries=5 `
      --fetch-retry-factor=2 `
      --fetch-retry-mintimeout=1000 `
      --fetch-retry-maxtimeout=20000 `
      --fetch-timeout=120000
    $script:NpmInstallExitCode = [int]$LASTEXITCODE
    Write-Host "npm install 退出码：$script:NpmInstallExitCode" -ForegroundColor DarkGray
}

try {
    Start-Transcript -Path $Log -Force | Out-Null
    Section "VISUAL CONSOLE - P1 网络自适应启动器 v5"
    Write-Host "本窗口不会自动关闭。" -ForegroundColor Green
    Write-Host "日志：$Log"

    if (-not (Test-Path (Join-Path $Target ".git"))) {
        throw "未找到正式仓库：$Target。请先运行安装器完成克隆。"
    }

    Set-Location $Target

    Section "1/4 更新正式仓库"
    & git.exe fetch origin $Branch
    if ($LASTEXITCODE -ne 0) { throw "git fetch 失败，退出码 $LASTEXITCODE" }
    & git.exe checkout $Branch
    if ($LASTEXITCODE -ne 0) { throw "git checkout 失败，退出码 $LASTEXITCODE" }
    & git.exe pull --ff-only origin $Branch
    if ($LASTEXITCODE -ne 0) { throw "git pull 失败，退出码 $LASTEXITCODE" }

    Section "2/4 npm 网络诊断"
    Write-Host ("当前 npm registry : " + (& npm.cmd config get registry))
    Write-Host ("npm proxy          : " + (& npm.cmd config get proxy))
    Write-Host ("npm https-proxy    : " + (& npm.cmd config get https-proxy))
    Write-Host ""
    Write-Host "v5 不修改全局 npm 配置；镜像只在本次 install 中临时使用。"

    & npm.cmd cache verify
    if ($LASTEXITCODE -ne 0) {
        Write-Host "npm cache verify 未完成，继续安装测试。" -ForegroundColor Yellow
    }

    Section "3/4 安装依赖"
    Invoke-NpmInstall $OfficialRegistry "npm 官方源（增强重试）"

    if ($script:NpmInstallExitCode -ne 0) {
        Write-Host ""
        Write-Host "官方源仍失败，自动切换到镜像源，仅用于本次安装..." -ForegroundColor Yellow
        Invoke-NpmInstall $MirrorRegistry "npmmirror 镜像源"
    }

    if ($script:NpmInstallExitCode -ne 0) {
        throw "官方源与镜像源均安装失败。最后退出码：$script:NpmInstallExitCode"
    }

    Write-Host ""
    Write-Host "依赖安装完成。" -ForegroundColor Green

    Write-Host "正在执行 build 预检..."
    & npm.cmd run build
    $buildExit = [int]$LASTEXITCODE
    Write-Host "npm run build 退出码：$buildExit" -ForegroundColor DarkGray
    if ($buildExit -ne 0) { throw "npm run build 失败，退出码 $buildExit" }

    Section "4/4 启动 P1"
    Write-Host "电脑端：http://localhost:5173" -ForegroundColor Green
    Write-Host "Local API：http://localhost:4177/api/health" -ForegroundColor Green
    Write-Host ""
    Write-Host "启动后保持本窗口打开；Ctrl+C 才会停止服务。"
    & npm.cmd run dev
    $devExit = [int]$LASTEXITCODE
    Write-Host "npm run dev 已退出，退出码：$devExit" -ForegroundColor Yellow
}
catch {
    Write-Host ""
    Write-Host "P1 启动失败：" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "请把本窗口截图和日志发给我。" -ForegroundColor Yellow
}
finally {
    try { Stop-Transcript | Out-Null } catch {}
    Write-Host ""
    Write-Host "日志保存在：$Log" -ForegroundColor DarkGray
    Write-Host ""
    Read-Host "按 Enter 才会关闭窗口"
}
