# Implementation Status

`P1_PASS / P1_3_TRASH_CONTROL_PASS / G4A_REPAIR_APPROVED / S7_REPAIR_IMPLEMENTED / TARGET_WINDOWS_REGRESSION_REQUIRED / G4B_RERUN_PENDING`

正式仓库：`wuge988/visual-console`  
分支：`feat/p1-mobile-capture-runtime`  
Draft PR：`#1`

## 已通过的原始真机闭环

2026-08-25 真实 Windows + iPhone 16e 已确认：

- Desktop Console / Local API / Private LAN：PASS；
- WLAN `192.168.3.8` 智能选择：PASS；
- QR 手机采集页：PASS；
- 12 小时、Site + SKU Session：PASS；
- 同 SKU 新二维码使旧 Session 失效：PASS；
- 新 SKU 绑定新目录：PASS；
- iPhone 直接拍照 / 相册文件图片 / MOV：PASS；
- >32 MiB chunk path：PASS（实测约 42.7 MB）；
- Windows D → F size + SHA256 验证持久化：PASS；
- F RAW 落盘 + Desktop Gallery 自动刷新：PASS；
- 桌面 `×` 一键进入 `100_Trash\<SKU>`：PASS；
- 无确认弹窗 + trash size/SHA256 + `trash-index.jsonl`：PASS。

因此原始行为状态保持：`P1_PASS / P1_3_TRASH_CONTROL_PASS`。

## G4B-001 与修复授权

初次 G4B：`docs/G4B_REVIEW_RESULT_2026-08-25.md`

初次结论：`G4B_BLOCKED / S7_REPAIR_REQUIRED / NEW_G4A_BINDING_REQUIRED`

项目 owner 已于 2026-08-26 明确批准：

`G4A-REPAIR通过，按 S7_REPAIR_PACKET_G4B_001 授权修复`

精确绑定记录：`docs/G4A_REPAIR_BINDING_G4B_001.md`

修复包：`docs/S7_REPAIR_PACKET_G4B_001.md`

实现结果：`docs/S7_REPAIR_IMPLEMENTATION_RESULT_G4B_001.md`

## S7 bounded repair 已完成

已关闭初次 G4B 的代码级阻断：

1. canonical server/web entrypoints 已收敛为 `index.ts` / `App.vue`，旧 `index-p1.ts` / `AppP1.vue` 已移除；
2. 4178 standalone trash-service 已并回 4177 Core API，旧 `trash-service.ts` 已移除；
3. direct 32 MiB、chunk 8 MiB、default max source 5 GiB、精确 chunk 长度和 active-upload 限制均在服务器端执行；
4. Session/abandoned chunk GC 已加入；
5. Site Profile 从 `config/sites/*.json` 发现，`drift_curio_sku_v1` 已实际验证冻结 SKU；
6. preview/trash destructive path 增加 realpath + symlink/reparse-style 防逃逸；
7. `package-lock.json` 已提交；
8. final CI 已切换为 `npm ci → npm test → npm run build`；
9. focused data-safety regression tests已加入。

## 远端验证

Repair code head：`11136c6f40d0c2c14b536e63133fdc588e5d5623`（后续仅文档提交会使 PR HEAD 前移）。

GitHub Actions CI #78：`success`。

- `npm ci`: PASS；
- focused tests: `10 / 10 PASS`；
- server TypeScript build: PASS；
- Vue/Vite build: PASS；
- npm audit during CI: `0 vulnerabilities`。

自动化覆盖：SKU adapter、LAN selection、Session invalidation/expiry、direct/file/chunk limits、path traversal、symlink escape、verified transfer、no-overwrite、verification-failure cleanup、Trash audit。

## 当前剩余硬证据

`TARGET_WINDOWS_REGRESSION_REQUIRED`

必须在 `E:\AI_PROJECTS\VISUAL_CONSOLE` 拉取当前分支后验证：

- Console 正常启动；
- health version = `0.1.0-p1.4-repair`；
- WLAN 仍选择 `192.168.3.8`；
- QR / 12 小时 SKU Session 正常；
- 1 张 iPhone 直拍照片写入 F RAW 并自动出现在 Gallery；
- 1 个 >32 MiB 视频走 chunk path 并写入 F RAW；
- 1 个可丢弃 RAW 用 `×` 移入 `100_Trash\<SKU>`；
- invalid SKU（例如 `DC-ZZ-SZ-31001`）生成手机 Session 时被拒绝，且不得创建 RAW 目录。

该真机回归完成前，不重新给出 clean G4B，不进入 G5，不 Merge，不开始 SC01/ComfyUI production phase。
