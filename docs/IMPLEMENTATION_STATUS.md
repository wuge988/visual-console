# Implementation Status

`P1_RELEASED / P2_RELEASED / P3_RELEASED / P3_1_RELEASED / P4A_RELEASED / P4B_RELEASED / P4C_RELEASED / P5_ACTIVE_DRAFT / V2_DESIGN_FROZEN / V2_A_RELEASED / V2_B_VISIBLE_CI_PASS_VISUAL_GATE_NEXT`

正式仓库：`wuge988/visual-console`  
当前 `main`：`f60d52cf889c427cde84b6e837f1f3348608e20e`（PR #10 architecture/docs + PR #11 V2-A Shell 已进入 main）  
Active P5 PR：`#9` — Draft / Open / Unmerged  
P5 branch：`feat/p5-qa01-scene-freeze`  
V2-B PR：`#12` — Draft / Open / Unmerged  
V2-B branch：`feat/v2-b-registries-health`

V2 最终设计：`docs/VISUAL_CONSOLE_V2_FINAL_DESIGN_2026-09-12.md`。  
V2-A Packet：`docs/V2_A_IMPLEMENTATION_PACKET_2026-09-12.md`。  
V2-B Packet：`docs/V2_B_IMPLEMENTATION_PACKET_2026-09-12.md`。

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
- F hash/size、Manifest history、D delete-last、重启恢复、F preview 与幂等已验证；
- service version truth 与 QA_FAIL review access maintenance 已发布。

### P4A — SW01 Static White Master
- `VALIDATED_LOCAL_RENDERER / executable=true`；
- `VERIFIED_SC01_ARCHIVE → #FFFFFF → same-size opaque RGB PNG`；
- Windows Gate、White visual QA、F `destinations.white`、Manifest、幂等、重启与六页面集成均已发布。

### P4B / P4C — SD01 Static Dark Master
- Candidate A / `#171B20` Gallery Surface 已冻结并发布；
- Pure Black 明确拒绝；
- v1 不允许 relight / synthetic shadow / vignette / generative inference；
- `VERIFIED SC01 Cutout → alpha over #171B20 → same-size opaque RGB PNG`；
- Exact Piece / 轮廓 / 孔洞 / 细枝 / 木材颜色、Gate15、Manifest、F archive、重启恢复均已 PASS；
- P4C runtime release commit：`598bb5362eeff719d4bd882412de346f12cda330`。

## 当前 P5 — QA01 Aquarium scene architecture

PR #9 当前状态：

`P5_QA01_V1_VISUAL_REJECTED / D5X_D6_KONTEXT_2D_CLOSED / LOW_TOUCH_VIDEO2TWIN_PILOT_IMPLEMENTED / HF_COMMERCIAL_ACCESS_PASS / TORCH_CU128_RUNTIME_PASS / GSPLAT_PASS / VGGT_CODE_PASS / SAM2_SOURCE_RUNTIME_PASS / RECON3D_LOCAL_CACHE_PASS / BYTE_PINNED_V3_HANDOFF_PASS / FRAME_SELECTION_RECOVERY_CI_PASS / WINDOWS_FRAME_SELECTION_RECOVERY_NEXT / QA01_DISABLED`

Pilot SKU：`DC-ZY-SZ-31001`。

当前冻结路径：

`existing exact-SKU video → deterministic sampling/masking → VGGT-1B-Commercial → gsplat → scene.ply + scene.splat → Human Exact-SKU Identity Gate`

当前物理停止点：短视频在原 6 fps / window 3 选择下只有 15 个 representative，而 identity minimum 仍为 16。恢复路径只将 temporal sampling 提高到 8 fps，不降低 identity threshold。

### P5 当前硬边界

- QA01 仍 `NOT_REGISTERED / executable=false`；
- QA01 不在 enabled workflows；
- PR #9 保持 Draft / Open / Unmerged；
- 不修改 production Manifest；
- 不修改 F formal archive；
- 不 deploy / merge / enable；
- source video read-only；
- 禁止无声降级到非商业许可的 VGGT fallback。

## Visual Console V2 — Architecture Freeze

V2 产品/架构设计已通过 PR #10 进入 `main`。冻结方向不替代或重解释现有 P1–P5 物理真值。

冻结方向：

1. SaaS-class shell：Sidebar + Global Job Monitor + workspace tabs + global search；
2. IA：Production / Jobs / Quality / Assets / Evidence / System；
3. Model Registry + Workflow Registry + Prompt Registry；
4. Local-first / Cloud-escalation 双引擎；
5. Cost Guard：cloud 默认关闭，调用前估价与预算授权；
6. Unified Job model，同时保持 generation / QA / archive 三套独立状态；
7. Creation Canvas = Visual Production Orchestrator，不复制底层 ComfyUI graph；
8. Visual Copilot 只能创建 draft/suggestion，不能绕过云成本授权、Human Gate 或 formal archive；
9. Exact Piece identity 在本地与云输出上执行同一 Gate；
10. RAW/source immutable；现有 Manifest / journal / D-E-F provenance 继续保持 authority。

运营目标：大多数生成本地完成，付费云模型只用于高价值升级路径；`95% local / 5% cloud` 是目标，不是硬 SLA。

## V2-A — Shell｜已发布到 main

状态：`HUMAN_VISUAL_PASS / EXACT_HEAD_CI_514_PASS / SQUASH_MERGED`。

- final reviewed head：`114ab7d65bc5267298c4c90d6100ac76803e37bf`；
- PR #11：squash merged；
- main merge commit：`f60d52cf889c427cde84b6e837f1f3348608e20e`；
- `/v2` 保持 preview，不替代 legacy 默认入口；
- 最终 Sidebar 只展示当前已可操作入口，未来阶段 placeholder 不占运行时高度；
- Global Job Monitor、Dashboard、`/api/v2/summary`、搜索、Human Gate、Engine/Cost Guard shell 已进入 main；
- V2 CSS 仅 `/v2` 动态加载，不污染 legacy console。

## 当前 V2-B — Registries + Engine Health

状态：`VISIBLE_SURFACES_IMPLEMENTED / RUNTIME_CODE_CI_519_PASS / DOC_SYNC_PARENT_CI_522_PASS / WINDOWS_LOCAL_BROWSER_VISUAL_GATE_NEXT / NOT_MERGED`。

PR #12 backend foundation head：`0ada28df9963c29ec80c49c718a0f0c4c3ab4e67`，CI #516 PASS。  
PR #12 visible runtime code head：`ecb052896cbc51ea66b1dbc4f4c18f7ded93ad07`，CI #519 PASS。  
Documentation-sync parent head：`a910ae2f8e640901a254195a07179a78595230f4`，CI #522 PASS。

V2-B 已实现：

- `config/models/registry.json`：当前只声明真实已有的本地 `RMBG-2.0` metadata；
- `GET /api/v2/registries/workflows`：分离 `site_enabled / runtime_registered / effective_executable`；
- `GET /api/v2/registries/models`：模型只有通过 effective workflow 才进入 ACTIVE；
- `GET /api/v2/engines/health`：Core / deterministic local renderer / ComfyUI / storage / Cloud truth；
- ComfyUI 只有在当前 effective workflow 依赖它时，离线才将 overall health 降为 DEGRADED；
- Cloud 继续 `DISABLED / fail_closed=true`；
- `/v2/system`：系统、ComfyUI、Local Renderer、Cloud 与 Storage truth；
- `/v2/models`：Model Registry；
- `/v2/workflows`：Workflow Registry truth matrix；
- Global Search 已可搜索当前 V2 Workflow / Model；
- Sidebar 仅新增三个真正可操作的 V2-B System 入口；Storage 合并到 `/v2/system`，避免再次造成侧栏拥挤。

### V2-B 当前硬 Gate

目标 Windows 本地浏览器需要完成一次 V2-B bounded Human Visual Gate。Gate 至少覆盖：

1. `/v2/system`；
2. `/v2/models`；
3. `/v2/workflows`；
4. Sidebar 增量密度是否仍可接受；
5. ComfyUI offline/online 与 System overall 的视觉表达是否会误导。

Gate 前 PR #12 保持 Draft / Open / Unmerged。

### V2-B 未越过的边界

- 不改变 P5 PR #9；
- 不改变 production Manifest / journal / F formal archive；
- 不注册或启用新 workflow；
- 不执行 QA01；
- 不接入付费 Provider/API；
- 不存储 Provider secret；
- Cloud 保持关闭；
- 不 deploy；
- 不将 `/v2` 设为默认路由。

## V2 后续计划

- V2-C：Unified Jobs / Queue / History / Retry；
- V2-D：Asset Library + Prompt Library；
- V2-E：Image / Scene / Batch Composer；
- V2-F：Creation Canvas；
- V2-G：Visual Copilot；
- V2-H：Cloud Provider Adapter + Cost Guard。
