# Implementation Status

`P1_PASS / P1_3_TRASH_CONTROL_PASS / S7_REPAIR_PASS / G4B_PASS / G5_REQUIRED`

正式仓库：`wuge988/visual-console`  
分支：`feat/p1-mobile-capture-runtime`  
Draft PR：`#1`

## P1 / P1.3 真机闭环

真实 Windows + iPhone 16e 已确认：

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

## 初次 G4B 与 S7 修复

初次 G4B：`docs/G4B_REVIEW_RESULT_2026-08-25.md`

初次结论：`G4B_BLOCKED / S7_REPAIR_REQUIRED / NEW_G4A_BINDING_REQUIRED`

项目 owner 已于 2026-08-26 明确批准：

`G4A-REPAIR通过，按 S7_REPAIR_PACKET_G4B_001 授权修复`

精确绑定：`docs/G4A_REPAIR_BINDING_G4B_001.md`  
修复包：`docs/S7_REPAIR_PACKET_G4B_001.md`  
实现结果：`docs/S7_REPAIR_IMPLEMENTATION_RESULT_G4B_001.md`

S7 已关闭初次 G4B 的全部 blocking findings：

1. canonical server/web entrypoints 收敛为 `index.ts` / `App.vue`；旧 `index-p1.ts` / `AppP1.vue` 删除；
2. standalone 4178 trash-service 并回 4177 Core API；
3. direct 32 MiB、chunk 8 MiB、default max source 5 GiB、精确 chunk 长度、active-upload/GC 均由服务端执行；
4. Site Profile 从 `config/sites/*.json` 发现，`drift_curio_sku_v1` 执行冻结 SKU 校验；
5. preview/trash destructive path 增加 realpath + symlink/reparse-style 防逃逸；
6. `package-lock.json` 已提交；
7. CI 使用确定性 `npm ci → npm test → npm run build`；
8. focused data-safety tests 覆盖 SKU、LAN、Session、upload/chunk limits、path/symlink、transfer/no-overwrite/hash failure、Trash audit。

## S7 后目标 Windows 回归

项目 owner 于 2026-08-26 确认全部通过：

- Console 正常启动：PASS；
- `/api/health` = `0.1.0-p1.4-repair`：PASS；
- WLAN = `192.168.3.8`：PASS；
- QR + 12 小时 SKU Session：PASS；
- iPhone 直拍 → F RAW + Gallery：PASS；
- >32 MiB 视频 chunk → F RAW：PASS；
- `×` → `100_Trash\<SKU>`：PASS；
- invalid SKU `DC-ZZ-SZ-31001` 被拒绝且不创建 RAW 目录：PASS。

## G4B rerun

正式结果：`docs/G4B_RERUN_RESULT_2026-08-26.md`

结论：

`G4B_PASS / G5_REQUIRED`

Reviewed implementation HEAD：`47bc682edeed47fe0e21f62d7295c897d7e66400`。  
CI #81：`success`（`npm ci → npm test → npm run build`）。  
G4B 结果文档提交后的 doc-only HEAD `41a3b4ed125100d00214df670529335e26c8b819` 同样通过 CI #82。

当前没有 blocking implementation finding 留在 P1/S7 scope 内。

## G5 前保留风险

以下为 G4B 非阻断、G5 必须独立评估的风险：

- QR URL 中仍包含 mobile upload token；当前仅 Private LAN；
- `/api/health` 对 LAN 可读并暴露候选 LAN metadata；
- Trash 文件移动成功后才 append `trash-index.jsonl`，index 写入失败时可能出现“文件已安全移动但 API 报错”；
- Session/chunk state 为内存态，服务重启不恢复；
- multi-user / multi-device capture-lane 尚未正式定义；
- runtime 具备用户文件移动与大文件写入能力，因此 Merge 前要求独立 G5 data-safety/risk review。

## 当前硬停止点

`G5_REQUIRED`

G5 完成前：

- PR #1 保持 Draft / Open / Unmerged；
- 不部署；
- 不进入 SC01/ComfyUI production integration；
- 不扩大公网/网络暴露；
- 不清理 D/E/F 旧 fallback 脚本。
