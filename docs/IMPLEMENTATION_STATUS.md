# Implementation Status

`P1_RELEASED / P2_RELEASED / P3_RELEASED / POST_MERGE_CI_PASS / P3_1_MAINTENANCE_IN_PROGRESS`

正式仓库：`wuge988/visual-console`  
正式基线：`main @ 9aebb17e626117c2f561b26295ffb4a6412d9a48`  
P3 PR：`#4` — `Closed / Merged`  
当前维护分支：`chore/p3-1-maintenance-truth`

## 已发布阶段

### P1 — Mobile Capture + RAW / Trash
- iPhone / Private-LAN 采集闭环已发布；
- RAW 写入、SHA256/size 验证、Desktop Gallery 与 Trash 安全边界已验证；
- canonical runtime 与 deterministic CI 已建立。

### P2 — SC01 Control Loop
- SC01 `RMBG-2.0` 透明 Master 已发布；
- frozen runtime：1024 / sensitivity 1 / mask blur 0 / offset -1 / refine foreground / Alpha；
- 单图与批量串行、版本号、任务 journal、QA、重启恢复均已验证。

### P3 — Gate15 Approved Asset Archive
- PR #4 已 squash merge；
- 新 `main` baseline：`9aebb17e626117c2f561b26295ffb4a6412d9a48`；
- post-merge CI：PASS；
- 真实 Windows D/E/F Gate15：PASS；
- `DC-ZY-SZ-31001` 的 SC01 `v001/v002/v003` 均已正式归档；
- F SHA256/size、Manifest 单条 `VERIFIED_ARCHIVE`、legacy history 保留、D delete-last、重启恢复、F preview、重复归档幂等均通过；
- `SC01 v003` 透明大图视觉检查：PASS。

正式证据：`docs/p3/P3_IMPLEMENTATION_RESULT.md`。

## 当前 P3.1 maintenance convergence

目标是先清理会影响下一阶段判断的 truth / maintenance debt，再进入新 Workflow。

本 slice 已确认并修复：
- `/health` 已报告 `0.3.0-p3`，但 `/api/system/status` 仍遗留 `0.2.0-p2`；现统一为 `0.3.0-p3`；
- 新增回归测试，阻止 health/system version 再次漂移；
- 本状态文档从 P1 旧分支/旧 Gate 状态更新为当前 P3 released baseline。

继续保留、不要混入本 slice 的维护项：
- `QA_FAIL` UI 行为：先独立复现后再修，不按旧聊天记录直接改；
- `control_root` 历史命名兼容；
- generated staging Trash/Restore；
- input derivative GC；
- 4179 → 4177 服务收敛；
- branch cleanup / local workstation cutover。

## 下一阶段：P4 Static Derivatives

P3.1 收敛后，优先顺序冻结为：

1. `SW01` — Static White Master / 白底商品主图；
2. `SD01` — Static Dark Master / 深色商品主图；
3. 场景工作流 `QA01/QR01/QP01/QC01` 后置；
4. 视频工作流继续后置。

P4 的默认输入应复用 **P3 已验证的 SC01 archive truth**，不得重新从未经批准的 RAW 或任意浏览器路径生成正式派生资产。

P4 必须继续保持：
- source identity server-side；
- Manifest / Site Profile 路径边界；
- versioned no-overwrite output；
- SHA256 + byte-size evidence；
- 正式资产与 staging 状态可重建；
- 不因新增白/深色派生图而放宽 Gate15 fail-closed 语义。

## 当前 P0 / P1

- P0：0；
- P1：0；
- 当前 maintenance finding：service version truth 已有界修复，等待 CI/PR 审核。
