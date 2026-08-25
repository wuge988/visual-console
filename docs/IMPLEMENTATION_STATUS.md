# Implementation Status

`G4A_APPROVED / P1_PASS / P1_3_TRASH_CONTROL_RUNTIME_TEST_REQUIRED / G4B_REVIEW_DEFERRED`

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

## P1.3｜桌面控制台受控删除

用户明确要求：删除操作不弹确认框，以提高筛图效率；删除不是永久物理删除，而是立即移入站点级回收区。

DRIFT CURIO Site Profile 已新增：

`trash_root = F:\1独立站\DRIFT CURIO\DRIFT_CURIO_VISUAL_PIPELINE\100_Trash`

当前实现：

- 桌面工作台 RAW 缩略图右上角新增「删除」；
- 单击立即执行，不弹确认框；
- 删除权限仅通过桌面 localhost 路径提供，手机采集页不提供删除；
- 当前 RAW 删除后进入：`100_Trash\<SKU>\RAW\<YYYY-MM-DD>\`；
- 目标文件使用唯一前缀，禁止覆盖；
- 复制后执行 size + SHA256 校验，通过后才删除原文件；
- `100_Trash\trash-index.jsonl` 追加删除记录，保留原路径、回收路径、SKU、asset_id、size、SHA256，便于未来恢复；
- 删除成功后控制台缩略图和计数立即更新，并显示短提示，不弹确认对话框；
- 当前采用独立 localhost `trash-service`（4178）作为 P1.3 有界实现；后续 Asset Service 正式化时合并回 Core API。

未来白底图、深色图、场景图、视频和平台导出启用删除时，统一读取 Site Profile 的同一个 `trash_root`，DRIFT CURIO 所有被删除视觉素材都归入该 `100_Trash` 根目录下分类保存。

## P1.3 真机验证

更新并重启 Visual Console 后：

1. 在当前 SKU 选一张确定不要的测试图片；
2. 单击缩略图右上角「删除」；
3. 不应出现确认弹窗；
4. 素材卡应从工作台消失、计数减少；
5. 原 RAW 目录中该文件消失；
6. `F:\1独立站\DRIFT CURIO\DRIFT_CURIO_VISUAL_PIPELINE\100_Trash\<SKU>\RAW\<当天日期>\` 应出现对应文件；
7. `100_Trash\trash-index.jsonl` 应新增一行记录。

以上通过后进入：

`P1_3_TRASH_CONTROL_PASS / G4B_REVIEW_REQUIRED`

## 后续阶段

- ComfyUI SC01 真任务；
- SQLite persistence；
- 服务重启后的 chunk resume；
- Trash 恢复 UI / 批量删除；
- 公网 / Cloud relay；
- 原生 iOS App。
