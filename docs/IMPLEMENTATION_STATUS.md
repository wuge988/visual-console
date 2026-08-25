# Implementation Status

`G4A_APPROVED / P1_MOBILE_CAPTURE_RUNTIME_TEST_REQUIRED`

## 正式仓库

`wuge988/visual-console`

当前分支：`feat/p1-mobile-capture-runtime`

Draft PR：`#1`

最新 CI：GitHub Actions run `#3` 已通过（Node 24 / npm install / npm run build）。

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
- P1 一键 Windows Setup/Start 脚本。

## 2026-08-25 启动器修复

第一次用户真机启动时，外层安装器窗口出现“一闪而过”。旧版启动链存在两个可观测性问题：

1. `P1_SETUP_AND_START.bat` 会自动申请管理员权限并退出当前窗口；如果 UAC/第二个进程没有正常留在前台，用户看不到原因；
2. 外层安装器在子脚本立即返回时没有最终保留错误界面。

已修复：
- `tools/P1_SETUP_AND_START.bat` 不再自动提权；
- 任何依赖/目录/npm 错误都会停留并显示；
- 写入 `%TEMP%\visual-console-p1-start.log`；
- 防火墙改为独立显式工具 `tools/P1_ALLOW_PRIVATE_LAN.bat`；
- 默认先启动应用，只有电脑端正常而 iPhone 无法访问时才运行防火墙辅助脚本。

当前正式启动修复 commit：`c0cc4e551220addb910818fb896e29ef689b784c`。

## P1 真机未验证项

必须由真实 Windows + iPhone 16e 完成：
- Windows 本地启动；
- Windows Firewall / LAN；
- Safari 扫码；
- JPG/HEIC/MOV；
- 多选；
- >32 MiB chunk 上传；
- F RAW 实际写入；
- Desktop 自动刷新。

在这些测试完成前，不标记 P1 PASS。
