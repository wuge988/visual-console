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

### 当前阻塞点

首次 `npm install` 从官方 `https://registry.npmjs.org/` 拉取 `@types/node` 时出现：

- `ECONNRESET`；
- `Invalid response body ... aborted`。

因此当前阻塞属于依赖下载网络连接重置，不是 Visual Console 编译错误，也不是 Git 克隆失败或端口冲突。

### v4 修复

新增：
- `tools/P1_START_NETWORK_RESILIENT.ps1`；
- `tools/START_VISUAL_CONSOLE_P1_V4.cmd`。

v4 行为：
1. 更新正式 P1 分支；
2. 显示当前 npm registry / proxy / https-proxy；
3. `npm cache verify`；
4. 官方 npm registry 使用增强重试参数安装；
5. 若官方源仍失败，只对本次 install 临时切换 `https://registry.npmmirror.com/`；
6. 不修改用户全局 npm registry；
7. 安装成功后执行 `npm run build`；
8. build 通过后启动 `npm run dev`；
9. 全过程保持可见并写 `%TEMP%\visual-console-p1-v4.log`。

## P1 真机未验证项

必须由真实 Windows + iPhone 16e 完成：
- npm 依赖在目标网络成功安装；
- Windows 本地启动；
- Safari 扫码；
- JPG/HEIC/MOV；
- 多选；
- >32 MiB chunk 上传；
- F RAW 实际写入；
- Desktop 自动刷新。

在这些测试完成前，不标记 P1 PASS。
