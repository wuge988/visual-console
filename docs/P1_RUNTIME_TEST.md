# P1 Mobile Capture 真机联调

状态：`P1_PASS / P1_3_TRASH_CONTROL_RUNTIME_TEST_REQUIRED`

## P1 Mobile Capture 已通过

2026-08-25 真实 Windows + iPhone 16e：

- WLAN 自动选择 `192.168.3.8`：PASS；
- iPhone Safari QR / Local API：PASS；
- 12 小时 SKU-bound Session：PASS；
- 同 SKU 新二维码使旧码失效：PASS；
- 切换 SKU 后严格绑定新 SKU：PASS；
- 直接拍照：PASS；
- 相册/文件图片：PASS；
- MOV 视频：PASS；
- >32 MiB chunk path：PASS（实测 MOV 约 42.7 MB）；
- D → F size + SHA256 verified cross-volume persistence：PASS；
- F RAW 落盘：PASS；
- Desktop Source Gallery 自动刷新：PASS。

核心链路：

`iPhone 16e → Mobile Capture → D temp → verified copy → F RAW → Desktop Gallery`

因此 Mobile Capture P1 正式判定：`PASS`。

## P1.3｜桌面一键移入回收区

DRIFT CURIO 回收区：

`F:\1独立站\DRIFT CURIO\DRIFT_CURIO_VISUAL_PIPELINE\100_Trash`

规则：

- 桌面控制台 RAW 素材卡右上角有「删除」；
- 单击立即执行，不弹确认框；
- 文件不永久删除，而是移入 `100_Trash`；
- 当前结构：`100_Trash\<SKU>\RAW\<YYYY-MM-DD>\`；
- `100_Trash\trash-index.jsonl` 记录原位置与回收位置；
- 手机采集页没有删除权限。

### P1.3-A｜单张图片删除

1. 更新并重启 Visual Console；
2. 在 `DC-ZY-SZ-31001` 找一张确定不要的测试图片；
3. 单击缩略图右上角「删除」；
4. **不得出现删除确认弹窗**；
5. 控制台卡片立即消失，素材数量 -1；
6. `01_RAW\DC-ZY-SZ-31001\` 中原文件消失；
7. `100_Trash\DC-ZY-SZ-31001\RAW\2026-08-25\` 中出现该文件；
8. `100_Trash\trash-index.jsonl` 新增对应 JSONL 记录。

### P1.3-B｜安全边界

- 删除失败时原文件必须继续留在 RAW；
- 回收区已有同名文件不得被覆盖；
- 删除成功后回收文件 SHA256 必须与原文件一致；
- iPhone Mobile Capture 页面不出现删除功能。

P1.3-A 通过即可完成当前人工验收；P1.3-B 由实现逻辑 + 后续自动测试覆盖。

通过后：

`P1_3_TRASH_CONTROL_PASS / G4B_REVIEW_REQUIRED`
