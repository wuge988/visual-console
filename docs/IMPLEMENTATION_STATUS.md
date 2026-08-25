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

### 已确认通过的环境环节

目标 Windows 环境已确认：
- Git `2.54.0.windows.1` 可用；
- Node.js `v24.14.1` 可用；
- npm `11.11.0` 可用；
- 正式仓库已克隆到 `E:\AI_PROJECTS\VISUAL_CONSOLE`；
- TCP `4177` / `5173` 在预检时均可用；
- Windows 已出现 Node 网络访问提示，用户已允许 Private Network。

### npm 网络问题与结果

首次官方 registry 安装出现 `ECONNRESET`。v4 已验证官方源失败后可以切换 `https://registry.npmmirror.com/`，镜像源实际返回 `up to date ...` 且 npm 原生退出码为 `0`，说明依赖安装已经成功。

v4 之后修复了 PowerShell 将 npm 标准输出混入函数返回值、导致成功退出码被误判的问题。

### v5 新发现：Windows PowerShell 5.1 编码兼容

目标机器运行的是 Windows PowerShell `5.1.26100.9168`。v5 外层启动器可以正常运行，但从 GitHub 拉取的 `tools/P1_START_NETWORK_RESILIENT.ps1` 是 UTF-8 无 BOM，并包含中文运行提示。Windows PowerShell 5.1 对该组合存在解析兼容问题，目标机报：

- `MissingCatchOrFinally`；
- unexpected `}` token。

仓库中的脚本结构本身包含完整 `try/catch/finally`，因此该报错属于脚本文件编码/解析问题，不是业务逻辑缺少 catch/finally。

### 当前修复

`tools/P1_START_NETWORK_RESILIENT.ps1` 已改成 **ASCII-only runtime launcher**：
- 只使用 ASCII 字符和英文终端提示；
- 保留中文 Visual Console UI，不影响产品界面；
- 避免依赖 UTF-8 BOM；
- 继续保留 npm 官方源重试 + per-command npmmirror fallback；
- 不修改用户全局 npm registry；
- 继续单独捕获 npm/build/dev 的整数退出码。

修复 commit：`49f3c130a439a34620b9a2eb11bfad3f8a014d04`。

## P1 真机未验证项

必须由真实 Windows + iPhone 16e 完成：
- ASCII-safe launcher 在目标 Windows 上完成 build 并启动；
- Windows 本地页面；
- Safari 扫码；
- JPG/HEIC/MOV；
- 多选；
- >32 MiB chunk 上传；
- F RAW 实际写入；
- Desktop 自动刷新。

在这些测试完成前，不标记 P1 PASS。
