# P1 Mobile Capture 真机联调

状态：`P1_CORE_UPLOAD_PATH_PASS / P1_SESSION_ISOLATION_TEST_REQUIRED`

核心上传链路已通过。P1 仅剩以下两个隔离测试。

## 已通过证据

2026-08-25 真实 Windows + iPhone 16e：

- WLAN 自动选择 `192.168.3.8`：PASS；
- iPhone Safari QR / Local API：PASS；
- 12 小时 SKU-bound Session：PASS；
- 直接拍照：PASS；
- 相册/文件图片：PASS；
- MOV 视频：PASS；
- >32 MiB chunk path：PASS（本轮 MOV 约 42.7 MB）；
- D → F size + SHA256 verified cross-volume persistence：PASS；
- F RAW 落盘：PASS；
- Desktop Source Gallery 自动刷新：PASS；
- 当前工作台证据：5 RAW / 4 图片 / 1 视频。

核心链路：

`iPhone 16e → Mobile Capture → D temp → verified copy → F RAW → Desktop Gallery`

## P1-F1｜同 SKU 新码使旧码失效

1. 保持 `DC-ZY-SZ-31001`。
2. 手机保留当前旧采集页面。
3. 电脑再次点击「生成手机上传二维码」。
4. 不扫新码，先在旧页面上传 1 张测试图片。
5. **PASS 预期**：旧页面被拒绝；F RAW 不新增这张图片。
6. 再扫新二维码并上传 1 张测试图片。
7. **PASS 预期**：新页面上传成功到 `DC-ZY-SZ-31001`。

## P1-F2｜切换 SKU 后严格绑定新 SKU

测试 SKU：`DC-XX-YY-99999`，仅用于联调，不写入正式 SKU Master。

1. 电脑把当前 SKU / Item 改为 `DC-XX-YY-99999`。
2. 生成二维码。
3. 手机页必须显示 `DC-XX-YY-99999`。
4. 上传 1 张测试照片。
5. **PASS 预期**：文件只进入：
   `F:\1独立站\DRIFT CURIO\DRIFT_CURIO_VISUAL_PIPELINE\01_RAW\DC-XX-YY-99999\`
6. `DC-ZY-SZ-31001` 目录不得出现该测试照片。

两项通过后状态进入：

`P1_PASS / G4B_REVIEW_REQUIRED`
