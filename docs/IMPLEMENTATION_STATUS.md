# Implementation Status

`G4A_APPROVED / P1_MOBILE_CAPTURE_RUNTIME_TEST_REQUIRED`

## 正式仓库

`wuge988/visual-console`

当前分支：`feat/p1-mobile-capture-runtime`

Draft PR：`#1`

CI：GitHub Actions run `#2` 已通过（Node 24 / npm install / npm run build）。

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

## P1 真机未验证项

必须由真实 Windows + iPhone 16e 完成：
- Windows Firewall / LAN；
- Safari 扫码；
- JPG/HEIC/MOV；
- 多选；
- >32 MiB chunk 上传；
- F RAW 实际写入；
- Desktop 自动刷新。

在这些测试完成前，不标记 P1 PASS。
