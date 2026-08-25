# P1 Mobile Capture 真机联调

状态：`P1_CORE_UPLOAD_PATH_PASS / P1_SESSION_ISOLATION_TEST_REQUIRED`

## 目标

验证真实 Windows + iPhone 16e：

`Visual Console → QR → iPhone Safari → RAW → Desktop Source Gallery`

## 当前已通过

### Windows / LAN

- Desktop Console 正常启动；
- Local API `4177` 正常监听；
- 智能 LAN 自动选择真实 WLAN `192.168.3.8`；
- iPhone Safari 可访问 Local API；
- Karing TUN `10.20.0.1` 已被正确排除。

### Session 基础行为

- 手机采集二维码可正常打开；
- Session 默认有效 12 小时；
- 手机页显示当前 `DC-ZY-SZ-31001`；
- 页面明确提示所有照片/视频保存到当前 SKU。

### 上传与落盘

2026-08-25 真实 iPhone 16e 复测截图确认：

- 直接拍照上传：PASS；
- 从照片/文件选择图片上传：PASS；
- MOV 视频上传：PASS；
- >32 MiB chunk 上传：PASS；工作台显示本轮 MOV 约 42.7 MB；
- Windows D → F 跨卷安全复制：PASS；
- F RAW 文件实际存在：PASS；
- Desktop Source Gallery 自动刷新：PASS；
- 工作台显示 5 个 RAW / 4 图片 / 1 视频；
- F RAW Explorer 中可见本轮新增的 2 张 mobile JPG 与 1 个 mobile MOV；
- Desktop Gallery 可直接看到对应图片缩略图和视频素材卡。

核心链路已经闭环：

`iPhone 16e → Mobile Capture → D temp → size/SHA256 verified copy → F RAW → Desktop Gallery`

## 当前只剩两个隔离测试

### P1-F1｜同 SKU 新码使旧码失效

1. 当前 SKU 保持 `DC-ZY-SZ-31001`。
2. 手机保留当前已经打开的旧采集页面，不关闭。
3. 电脑再次点击「生成手机上传二维码」。
4. **不要立即扫新码**，先回旧手机页面拍/选 1 张测试图片尝试上传。
5. 预期：旧页面上传被拒绝，显示 Session 无效/过期相关错误；F RAW 不应新增该测试图片。
6. 再扫描新二维码，用新页面上传 1 张测试图片。
7. 预期：新页面上传成功并进入 `DC-ZY-SZ-31001`。

### P1-F2｜切换 SKU 后严格绑定新 SKU

使用一个新的、合法且不会与正式生产编号冲突的测试 SKU：

`DC-XX-YY-99999`

仅用于本次运行联调，不代表写入正式 SKU Master。

1. 电脑把当前 SKU / Item 改为 `DC-XX-YY-99999`。
2. 生成新二维码。
3. 手机扫描后，页面必须显示 `DC-XX-YY-99999`。
4. 上传 1 张测试照片。
5. 预期：自动创建/写入：
   `F:\1独立站\DRIFT CURIO\DRIFT_CURIO_VISUAL_PIPELINE\01_RAW\DC-XX-YY-99999\`
6. 原 `DC-ZY-SZ-31001` 目录不得出现这张新测试照片。
7. 测试完成后，不自动删除该测试目录；清理由后续明确的安全清理步骤处理。

## P1 PASS 条件

如果 P1-F1 + P1-F2 都符合预期，则 P1 可以正式标记：

`P1_PASS / G4B_REVIEW_REQUIRED`

## 本轮仍不要求

- ComfyUI SC01 真任务；
- SQLite 持久化；
- 服务重启后的 chunk resume；
- 公网访问；
- Cloud relay；
- 原生 iOS App。
