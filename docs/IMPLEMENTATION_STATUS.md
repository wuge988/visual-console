# Implementation Status

`G4A_APPROVED / P1_MOBILE_CAPTURE_RUNTIME_TEST_REQUIRED`

## 正式仓库

`wuge988/visual-console`

当前分支：`feat/p1-mobile-capture-runtime`

Draft PR：`#1`

GitHub Actions CI 已通过，说明当前 P1 代码可以完成依赖安装与 build；目标 Windows 真机仍需完成局域网运行验证。

## 已实现到代码

- 中文优先桌面壳；
- Site Profile；
- DRIFT CURIO 首个 Profile；
- LAN Local API；
- 30 分钟二维码 Upload Session；
- iPhone Safari 直接拍照 / 录像；
- Photos / Files 多选；
- 小文件直传 + 上传进度；
- >32 MiB 文件 8 MiB chunk 分块上传；
- 单 chunk 最多 3 次客户端重试；
- RAW 原始文件不转换；
- 服务端 SHA256；
- 当前 SKU RAW 素材扫描；
- Desktop 自动刷新 Source Gallery；
- 图片预览；
- 视频 Range streaming 基础；
- 路径白名单 / 不接受任意 Windows path；
- P1 Windows Setup/Start 工具。

## 2026-08-25 P1 真机启动记录

### v3 已确认通过的环节

目标 Windows 环境已确认：
- Git `2.54.0.windows.1` 可用；
- Node.js `v24.14.1` 可用；
- npm `11.11.0` 可用；
- 正式仓库可成功克隆到 `E:\AI_PROJECTS\VISUAL_CONSOLE`；
- TCP `4177` / `5173` 在预检时均可用；
- Windows 已出现 Node 网络访问提示，用户已允许 Private Network。

### v3 首次阻塞

首次 `npm install` 从官方 `https://registry.npmjs.org/` 拉取 `@types/node` 时出现：

- `ECONNRESET`；
- `Invalid response body ... aborted`。

该阻塞属于依赖下载网络连接重置，不是 Visual Console 编译错误，也不是 Git 克隆失败或端口冲突。

### v4 网络自适应结果

v4 已验证：
1. 正式 P1 分支可更新；
2. npm registry / proxy / https-proxy 均可读取；
3. npm cache verify 正常；
4. 官方 npm registry 仍失败后，能够自动切换到 `https://registry.npmmirror.com/`；
5. 镜像源实际返回 `up to date ...` 且 npm 原生退出码为 `0`，说明依赖安装已经成功。

但是 v4 的 PowerShell helper 通过函数返回值接收 `$LASTEXITCODE` 时，同时捕获了 npm 的标准输出，导致 `$code` 变成“命令输出 + 0”的集合/字符串，并被错误判断为非零。

因此 v4 的“官方源与镜像源均安装失败”属于**启动器 false-negative**，不是 npm 镜像安装失败。

### v5 修复

`tools/P1_START_NETWORK_RESILIENT.ps1` 已修复：
- npm 标准输出继续直接显示；
- npm 原生 `$LASTEXITCODE` 单独保存到 `$script:NpmInstallExitCode`；
- 不再通过 PowerShell 函数输出流返回退出码；
- 每次 `npm install` 明确显示整数退出码；
- build / dev 退出码也单独保存为整数；
- 日志升级为 `%TEMP%\visual-console-p1-v5.log`。

## P1 真机未验证项

必须由真实 Windows + iPhone 16e 完成：
- v5 在目标 Windows 上完成 build 并启动；
- Windows 本地页面；
- Safari 扫码；
- JPG/HEIC/MOV；
- 多选；
- >32 MiB chunk 上传；
- F RAW 实际写入；
- Desktop 自动刷新。

在这些测试完成前，不标记 P1 PASS。
