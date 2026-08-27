# Implementation Status

`P1_RELEASED / P2_RELEASED / P3_RELEASED / P3_1_RELEASED / P4A_SW01_RELEASE_CANDIDATE`

正式仓库：`wuge988/visual-console`  
当前正式 `main`：`a3be177d602c3bbc72f22a959eb3a5273b2fa1f3`  
P4A PR：`#6` — release candidate  
当前分支：`feat/p4-static-derivatives`

## 已发布阶段

### P1 — Mobile Capture + RAW / Trash
- iPhone / Private-LAN 采集闭环已发布；
- RAW 写入、SHA256/size 验证、Desktop Gallery 与 Trash 安全边界已验证。

### P2 — SC01 Control Loop
- SC01 `RMBG-2.0` 透明 Master 已发布；
- frozen runtime：1024 / sensitivity 1 / mask blur 0 / offset -1 / refine foreground / Alpha；
- 单图/批量串行、版本号、journal、QA、重启恢复已验证。

### P3 — Gate15 Approved Asset Archive
- PR #4 已发布；
- 真实 Windows D/E/F Gate15 已 PASS；
- SC01 正式资产具备 F hash/size、Manifest 单条 history、D delete-last、重启恢复、F preview 与幂等证据。

### P3.1 — Maintenance Truth
- PR #5 已发布；
- 正式 `main` baseline：`a3be177d602c3bbc72f22a959eb3a5273b2fa1f3`；
- 修复 service version truth 与 QA_FAIL review access；
- post-merge CI：PASS。

## 当前 P4A — SW01 Static White Master

状态：`TARGET_WINDOWS_PHYSICAL_PASS / VISUAL_WHITE_PASS / SIX_PAGE_INTEGRATION_COMPLETE / REGISTRY_PROMOTED / CI_PASS`。

SW01 已冻结为确定性本地 renderer：

`VERIFIED SC01 Cutout on F → alpha over #FFFFFF → same-size opaque RGB PNG`

不重复 RMBG、不调用生成模型、不占 GPU。

### 已闭环证据

- 目标 Windows 完整 Gate：`P4_SW01_WINDOWS_GATE=PASS`；
- 物理 self-check：`P4_SW01_FINAL_PHYSICAL_SELF_CHECK=PASS`；
- evidence：`E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\visual-console-p2\drift-curio\evidence\P4_SW01_20260827-190020`；
- White Master 与 SC01 Cutout 人工视觉对比：PASS；
- F `destinations.white`、hash/size、Manifest 单条 SW01 Gate15 history、D delete-last、journal 重建、F preview、归档幂等、runtime restart 全部通过。

物理存储语义实际验证 HEAD：`1e5533492f6aeb38affe85e59e06d45b2e83863c`。

### 六页面集成

SW01 已进入现有六页面，不新增永久导航页：

1. `/workspace`：选择 VERIFIED SC01 正式 Cutout → 生成 SW01；
2. `/workflows`：显示 validated local-renderer truth；
3. `/jobs`：显示静态派生任务，不冒充 ComfyUI prompt；
4. `/qa`：Cutout / White 并排审核；
5. `/assets`：White Master staging / formal truth + Gate15 归档；
6. `/system`：SW01 renderer / 正式资产状态。

### Registry truth

`SW01` 当前 release candidate：

- `workflow_status=VALIDATED_LOCAL_RENDERER`；
- `execution_engine=LOCAL_RENDERER`；
- `renderer=sw01-flat-white-rgb-v1`；
- `input=VERIFIED_SC01_ARCHIVE`；
- `background=#FFFFFF`；
- `generative_inference=false`。

`SD01`、场景与视频仍保持 disabled / unregistered。

### 自动验证

release-candidate CI #199：PASS；50/50 tests PASS；server/web build PASS。

正式证据：`docs/p4/P4_IMPLEMENTATION_RESULT.md`。

## 下一阶段 — P4B SD01 style freeze

P4A 发布后才进入 P4B。第一步不是直接启用 SD01，而是冻结深色商品主图的视觉模板：

- 背景黑位/灰阶；
- 主体边缘与地面关系；
- 阴影/接触影语义；
- 是否允许确定性合成或需要受控 relight；
- 输出尺寸/色彩空间；
- QA 判据。

在独立 P4B Packet + Gate 通过前，`SD01 executable=false`。

## 延后维护项

- `control_root` 历史命名兼容；
- generated staging Trash/Restore；
- input derivative GC；
- 4179 → 4177 服务收敛；
- 多站点 workflow registry 的 site-scoped 可执行状态进一步规范化；
- safety branch/stash 与本地旧工作区仅在 release 后另行清理，不混入 P4A。

## 当前 P0 / P1

- P0：0；
- P1：0。
