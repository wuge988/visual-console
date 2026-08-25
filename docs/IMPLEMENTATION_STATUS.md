# Implementation Status

`G4A_APPROVED / P1_CORE_UPLOAD_PATH_PASS / P1_SESSION_ISOLATION_TEST_REQUIRED`

正式仓库：`wuge988/visual-console`

分支：`feat/p1-mobile-capture-runtime`

Draft PR：`#1`

## P1 已通过

2026-08-25 真实 Windows + iPhone 16e 已确认：

- Desktop Console 启动：PASS；
- Local API / Private LAN：PASS；
- WLAN `192.168.3.8` 智能选择：PASS；
- QR 手机采集页：PASS；
- 12 小时、Site + SKU 绑定 Session 基础行为：PASS；
- iPhone 直接拍照：PASS；
- 相册/文件图片上传：PASS；
- MOV 视频上传：PASS；
- >32 MiB chunk path：PASS（本轮 MOV 约 42.7 MB）；
- Windows D → F 跨卷安全复制：PASS；
- size + SHA256 verification：实现并用于正式 persistence path；
- F RAW 落盘：PASS；
- Desktop Source Gallery 自动刷新：PASS；
- 当前截图证据：5 RAW / 4 图片 / 1 视频，F RAW 中可见新增 2 JPG + 1 MOV。

核心闭环：

`iPhone 16e → Mobile Capture → D temp → verified D→F copy → F RAW → Desktop Gallery`

## 当前只剩 P1 Session 隔离测试

1. 同 SKU 重新生成二维码后，旧码必须失效，新码正常；
2. 切换到测试 SKU `DC-XX-YY-99999` 后，新二维码和上传目录必须严格绑定新 SKU。

详细步骤：`docs/P1_RUNTIME_TEST.md`

两项通过后：

`P1_PASS / G4B_REVIEW_REQUIRED`

## 后续阶段，不属于当前 P1 stop condition

- ComfyUI SC01 真任务；
- SQLite persistence；
- 服务重启后的 chunk resume；
- 公网 / Cloud relay；
- 原生 iOS App。
