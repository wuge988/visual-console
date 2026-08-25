# Implementation Status

`G4A_APPROVED / P1_PASS / P1_3_1_TRASH_REFINEMENT_RUNTIME_TEST_REQUIRED / G4B_REVIEW_DEFERRED`

正式仓库：`wuge988/visual-console`

分支：`feat/p1-mobile-capture-runtime`

Draft PR：`#1`

## P1 Mobile Capture 已通过

2026-08-25 真实 Windows + iPhone 16e 已确认：

- Desktop Console 启动：PASS；
- Local API / Private LAN：PASS；
- WLAN `192.168.3.8` 智能选择：PASS；
- QR 手机采集页：PASS；
- 12 小时、Site + SKU 绑定 Session：PASS；
- 同 SKU 重新生成二维码后旧码失效：PASS；
- 切换 SKU 后新二维码严格绑定新 SKU：PASS；
- iPhone 直接拍照：PASS；
- 相册/文件图片上传：PASS；
- MOV 视频上传：PASS；
- >32 MiB chunk path：PASS（实测 MOV 约 42.7 MB）；
- Windows D → F 跨卷安全复制：PASS；
- size + SHA256 verification：PASS；
- F RAW 落盘：PASS；
- Desktop Source Gallery 自动刷新：PASS。

核心闭环：

`iPhone 16e → Mobile Capture → D temp → verified D→F copy → F RAW → Desktop Gallery`

因此 Mobile Capture P1 正式状态：`P1_PASS`。

## P1.3 / P1.3.1｜桌面控制台受控删除

用户明确要求：删除操作不弹确认框，以提高筛图效率；删除不是永久物理删除，而是立即移入站点级回收区。

DRIFT CURIO Site Profile：

`trash_root = F:\1独立站\DRIFT CURIO\DRIFT_CURIO_VISUAL_PIPELINE\100_Trash`

P1.3 真机已经证明回收链路可工作；用户随后要求进一步简化目录和缩小删除控件，因此进入 P1.3.1 refinement。

### P1.3.1 冻结规则

- 桌面工作台素材缩略图右上角只显示紧凑的 `×`，不再显示「删除」文字；
- 单击 `×` 立即执行，不弹确认框；
- 手机采集页不提供删除权限；
- DRIFT CURIO 回收目录扁平化为：`100_Trash\<SKU>\<文件>`；
- **不再新增** `\RAW\<YYYY-MM-DD>` 子目录；
- 删除时间、素材类型、原路径等信息继续写入 `100_Trash\trash-index.jsonl`，因此不依赖目录层级保存审计信息；
- 回收文件名继续包含时间戳 + UUID 短码，目标以 `wx` 创建，禁止覆盖；
- 复制后执行 size + SHA256 校验，通过后才删除原位置文件；
- 删除成功后工作台素材卡与计数立即更新，并显示短提示；
- 当前采用 localhost `trash-service`（4178）作为 P1.3 有界实现；后续 Asset Service 正式化时合并回 Core API。

未来白底图、深色图、场景图、视频和平台导出启用删除时，统一读取 Site Profile 的同一个 `trash_root`。目录层级以 SKU 为一级隔离，不再按素材类型/日期继续嵌套；素材类型保留在索引元数据中。

### 旧回收文件兼容

已经存在于旧结构：

`100_Trash\<SKU>\RAW\<YYYY-MM-DD>\...`

的文件不会被本次代码自动移动或删除，以避免破坏已经验证的回收数据。P1.3.1 生效后，**新的删除文件**直接进入：

`100_Trash\<SKU>\...`

## P1.3.1 真机验证

更新并重启 Visual Console 后：

1. 当前 SKU 选一张确定不要的测试图片；
2. 缩略图右上角应只显示一个小 `×`；
3. 单击后不出现确认弹窗；
4. 素材卡立即消失、计数减少；
5. 原 RAW 目录中该文件消失；
6. 文件直接出现在 `F:\1独立站\DRIFT CURIO\DRIFT_CURIO_VISUAL_PIPELINE\100_Trash\<SKU>\`；
7. 不应新建 `RAW\日期` 子目录；
8. `100_Trash\trash-index.jsonl` 新增一行记录。

以上通过后进入：

`P1_3_TRASH_CONTROL_PASS / G4B_REVIEW_REQUIRED`

## 后续阶段

- ComfyUI SC01 真任务；
- SQLite persistence；
- 服务重启后的 chunk resume；
- Trash 恢复 UI / 批量删除；
- 公网 / Cloud relay；
- 原生 iOS App。
