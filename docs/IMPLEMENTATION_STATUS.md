# Implementation Status

`P1_RELEASED / P2_RELEASED / P3_RELEASED / P3_1_RELEASED / P4A_SW01_RELEASED / P4B_SD01_STYLE_RELEASED / P4C_SD01_RELEASE_CANDIDATE`

正式仓库：`wuge988/visual-console`  
当前正式 `main`：`34868242085499c36821d131c611d1823a5865cd`  
P4C PR：`#8` — release candidate  
当前分支：`feat/p4c-sd01-production`

## 已发布阶段

### P1 — Mobile Capture + RAW / Trash
- iPhone / Private-LAN 采集闭环已发布；
- RAW 写入、SHA256/size 验证、Desktop Gallery 与 Trash 安全边界已验证。

### P2 — SC01 Control Loop
- SC01 `RMBG-2.0` 透明 Master 已发布；
- frozen runtime：1024 / sensitivity 1 / mask blur 0 / offset -1 / refine foreground / Alpha；
- 单图/批量串行、版本号、journal、QA、重启恢复已验证。

### P3 / P3.1 — Gate15 + Maintenance Truth
- SC01 Gate15 真实 Windows D/E/F 已 PASS；
- F hash/size、Manifest 单条 history、D delete-last、重启恢复、F preview 与幂等已验证；
- service version truth 与 QA_FAIL review access maintenance 已发布。

### P4A — SW01 Static White Master
- `VALIDATED_LOCAL_RENDERER / executable=true`；
- `VERIFIED_SC01_ARCHIVE → #FFFFFF → same-size opaque RGB PNG`；
- Windows Gate、White visual QA、F `destinations.white`、Manifest、幂等、重启与六页面集成均已发布。

### P4B — SD01 Style Freeze
- Candidate A 已冻结并发布；
- 正式背景：`#171B20` Gallery Surface；
- Pure Black 明确拒绝；
- v1 不允许 relight / synthetic shadow / vignette / generative inference。

## 当前 P4C — SD01 Static Dark Master

状态：`TARGET_WINDOWS_PHYSICAL_PASS / VISUAL_DARK_PASS / SIX_PAGE_INTEGRATION_COMPLETE / REGISTRY_PROMOTED / RELEASE_CANDIDATE_CI_PENDING`。

SD01 已冻结为确定性本地 renderer：

`VERIFIED SC01 Cutout on F → alpha over #171B20 → same-size opaque RGB PNG`

### 已闭环物理证据

- runtime-tested implementation HEAD：`13ff8ab453b3a7d479d920b41a25cafa30ea90a4`；
- `P4C_SD01_FINAL_PHYSICAL_SELF_CHECK=PASS`；
- `P4C_SD01_WINDOWS_GATE=PASS`；
- formal SD01 asset：`c756a0e4657ba8b9923625b2156c67cd`；
- evidence：`E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\visual-console-p2\drift-curio\evidence\P4C_SD01_20260827-214807`；
- Exact Piece / 轮廓 / 孔洞 / 细枝 / 木材颜色 / `#171B20` 人工视觉检查：PASS；
- F `destinations.dark`、hash/size、Manifest exactly-one SD01 Gate15 history、D delete-last、archive journal、F preview、归档幂等、runtime restart/reconstruction 全部通过。

### Registry truth

P4C release candidate 已提升：

- `workflow_status=VALIDATED_LOCAL_RENDERER`；
- `executable=true`；
- `execution_engine=LOCAL_RENDERER`；
- `renderer=sd01-flat-gallery-surface-rgb-v1`；
- `input=VERIFIED_SC01_ARCHIVE`；
- `background=#171B20`；
- `relight=false`；
- `synthetic_shadow=false`；
- `vignette=false`；
- `generative_inference=false`。

### 六页面集成

SD01 已进入现有六页面，不新增永久导航页：

1. `/workspace`：VERIFIED SC01 → 生成 SD01；
2. `/workflows`：validated renderer / frozen background truth；
3. `/jobs`：确定性 SD01 derivative，不冒充 ComfyUI prompt；
4. `/qa`：SC01 / SD01 并排审核；
5. `/assets`：Dark Master staging/formal truth + Gate15；
6. `/system`：renderer / background / GPU-free / F 正式资产状态。

正式证据：`docs/p4c/P4C_IMPLEMENTATION_RESULT.md`。

## 下一阶段

P4C 正式发布后，下一阶段进入 Scene Workflow Packet。场景顺序仍为：

1. `QA01` — Aquarium；
2. `QR01` — Rainforest / Paludarium；
3. `QP01` — Reptile；
4. `QC01` — Collectible；
5. 视频工作流继续后置。

场景工作流不得复用“纯背景确定性合成”假设；在独立 Packet 中重新冻结 source truth、生成模型/参数、Exact Piece 约束、QA 与正式归档语义。

## 延后维护项

- `control_root` 历史命名兼容；
- generated staging Trash/Restore；
- input derivative GC；
- 4179 → 4177 服务收敛；
- 多站点 workflow registry 的 site-scoped 可执行状态进一步规范化；
- safety branch/stash 与本地旧工作区仅在 release 后另行清理。

## 当前 P0 / P1

- P0：0；
- P1：0。
