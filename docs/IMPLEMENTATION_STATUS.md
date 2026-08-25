# Implementation Status

`P1_PASS / P1_3_TRASH_CONTROL_PASS / G4B_BLOCKED / G4A_REBIND_REQUIRED`

正式仓库：`wuge988/visual-console`  
分支：`feat/p1-mobile-capture-runtime`  
Draft PR：`#1`

## 已通过的真实运行闭环

2026-08-25 真实 Windows + iPhone 16e 已确认：

- Desktop Console 启动：PASS；
- Local API / Private LAN：PASS；
- WLAN `192.168.3.8` 智能选择：PASS；
- QR 手机采集页：PASS；
- 12 小时、Site + SKU 绑定 Session：PASS；
- 同 SKU 新二维码使旧 Session 失效：PASS；
- 新 SKU 二维码绑定新 SKU 目录：PASS；
- iPhone 直接拍照：PASS；
- 相册/文件图片上传：PASS；
- MOV 视频上传：PASS；
- >32 MiB chunk path：PASS（实测约 42.7 MB）；
- Windows D → F 跨卷 size + SHA256 验证持久化：PASS；
- F RAW 落盘：PASS；
- Desktop Source Gallery 自动刷新：PASS；
- 桌面 `×` 一键移入 `100_Trash\<SKU>`：PASS；
- 无删除确认弹窗：PASS；
- trash size + SHA256 验证和 `trash-index.jsonl`：PASS。

因此：

- `P1_PASS`
- `P1_3_TRASH_CONTROL_PASS`

上述运行结论不因 G4B 阻断而撤销。

## G4B 结论

正式审查记录：`docs/G4B_REVIEW_RESULT_2026-08-25.md`

结论：

`G4B_BLOCKED / S7_REPAIR_REQUIRED / NEW_G4A_BINDING_REQUIRED`

主要阻断项：

1. **G4A binding 不完整/已因仓库与实施工具状态变化失效**：原 G4A 发生在正式 `wuge988/visual-console` 仓库建立之前；JZ-v0.4 要求 repository/branch/worktree/scope/tool/executor 等精确绑定，G4B 本身不能授予修复编辑权。
2. **存在可执行的旧实现副本**：`apps/server/src/index.ts` 与 `apps/web/src/App.vue` 保留已废弃的 30 分钟/旧 LAN/跨盘 rename 等逻辑，而当前运行分别使用 `index-p1.ts` 与 `AppP1.vue`。
3. **上传限制未在服务器端完整执行**：direct 32 MiB / chunk 8 MiB 主要由客户端选择；服务端仍存在 1 GiB body/file 上限、未验证精确 chunk 长度、无明确单文件硬上限。
4. **CI 只有 install + build，没有数据安全回归测试**。
5. **无 `package-lock.json`，CI 使用 `npm install`，依赖不可重复锁定**。
6. **4178 trash-service 只在开发组合启动中存在，`start` 契约不完整**；应并回 Core API 或建立单一正式启动契约。
7. **site-neutral 仍不完整**：sites 响应硬编码 `drift-curio`，`item_adapter` 尚未实际验证 DRIFT CURIO SKU。
8. **文件系统安全边界仍以 lexical path 为主**：预览/Trash 需要补 realpath/symlink/reparse-point 防逃逸。

## 已准备的有界修复包

`docs/S7_REPAIR_PACKET_G4B_001.md`

该 Packet 已冻结：

- canonical runtime entrypoints；
- trash 合并 Core API；
- server-side upload/file/chunk hard limits；
- Site Profile discovery + DRIFT CURIO SKU adapter；
- filesystem realpath/symlink hardening；
- package-lock + `npm ci`；
- focused automated tests；
- 保留现有 P1/P1.3 真实行为不变。

明确 Non-Scope：SC01/ComfyUI 生产接入、SQLite、Trash Restore、批量删除、公网、部署、Merge 等。

## 当前 Gate

`G4A_REBIND_REQUIRED`

在新的精确 G4A 通过之前：

- 不修改生产代码；
- 不进入 G5；
- 不合并 PR；
- 不开始 SC01/ComfyUI 下一阶段。

新 G4A 后执行 bounded S7 repair；修复完成必须重新运行 G4B。只有 clean G4B 才能进入独立风险分级 G5。
