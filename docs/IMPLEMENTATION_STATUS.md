# Implementation Status

`G4A_APPROVED / P1_CORE_UPLOAD_PATH_PASS / P1_SESSION_ISOLATION_TEST_REQUIRED`

## 正式仓库

`wuge988/visual-console`

当前分支：`feat/p1-mobile-capture-runtime`

Draft PR：`#1`

## 已实现到代码

- 中文优先桌面壳；
- Site Profile；
- DRIFT CURIO 首个 Profile；
- LAN Local API；
- 12 小时、Site + Item/SKU 绑定的二维码 Upload Session；
- 同一 Site + Item/SKU 重新生成二维码时，旧 Session 自动失效；
- 手机页持续显示当前 SKU、素材归属和剩余有效期；
- iPhone Safari 直接拍照 / 录像；
- Photos / Files 多选；
- 小文件直传 + 上传进度；
- >32 MiB 文件 8 MiB chunk 分块上传；
- 单 chunk 最多 3 次客户端重试；
- RAW 原始文件不转换；
- D → F 跨卷安全持久化：stream copy + no-overwrite + size/SHA256 verification + verified delete；
- 当前 SKU RAW 素材扫描；
- Desktop 自动刷新 Source Gallery；
- 图片预览；
- 视频 Range streaming 基础；
- 路径白名单 / 不接受任意 Windows path；
- P1 Windows Setup/Start 工具；
- LAN IP 智能选择：排除 Karing/TUN/TAP/VPN/Wintun 等虚拟接口，优先 WLAN/Wi-Fi，其次 Ethernet/以太网。

## 2026-08-25 P1 真机验证

### 已通过：运行环境与 LAN

- Git `2.54.0.windows.1`；
- Node.js `v24.14.1`；
- npm `11.11.0`；
- 正式仓库位于 `E:\AI_PROJECTS\VISUAL_CONSOLE`；
- TCP `4177` / `5173` 正常监听；
- Windows Node Private Network 已允许；
- Visual Console 桌面页面成功启动；
- 智能 LAN 自动选择 WLAN `192.168.3.8`，不再误选 Karing TUN `10.20.0.1`；
- iPhone Safari 已成功访问 Local API；
- 12 小时、绑定 `DC-ZY-SZ-31001` 的手机采集页成功打开。

### 已发现并修复：Windows 跨盘 EXDEV

真实 iPhone 上传最初已到达 D 盘临时缓存，但照片和 MOV 在最终 D → F 阶段均因 `fs.promises.rename()` 跨卷失败：

`EXDEV: cross-device link not permitted, rename D:\... -> F:\...`

P1.2 已改为：

`D temp → stream copy(wx/no-overwrite) → F RAW → size verify → SHA256 verify → delete verified D temp`

### 已通过：核心手机上传链路

2026-08-25 真实 Windows + iPhone 16e 复测截图确认：

- iPhone 直接拍照上传：PASS；
- 从照片/文件选择图片上传：PASS；
- MOV 视频上传：PASS；
- >32 MiB 分块上传：PASS：工作台显示 `IMG_1182...mov` 约 42.7 MB，高于 32 MiB direct-upload threshold；
- F RAW 实际落盘：PASS；
- Desktop Source Gallery 自动刷新：PASS；
- 工作台当前统计为 5 个 RAW 文件 / 4 图片 / 1 视频；
- F RAW Explorer 中可见本轮新增的两张 mobile JPG 与一个 mobile MOV；
- 桌面端可直接看到对应图片缩略图与视频素材卡。

核心链路已经实机闭环：

`iPhone 16e → Visual Console Mobile Capture → D temporary cache → verified D→F persistence → F RAW → Desktop Source Gallery`

## P1 剩余验证项

P1 现在只剩 Session 隔离行为需要真实操作确认：

1. 同 SKU 新码使旧码失效；
2. 切换到测试 SKU `DC-XX-YY-99999` 后，新码必须只绑定新 SKU，上传文件不得进入旧 SKU。

详细步骤见 `docs/P1_RUNTIME_TEST.md`。

完成以上两项后，可进入：

`P1_PASS / G4B_REVIEW_REQUIRED`

## 本阶段尚未要求

- ComfyUI SC01 真任务；
- SQLite 持久化；
- 服务重启后的 chunk resume；
- 公网访问；
- Cloud relay；
- 原生 iOS App。
