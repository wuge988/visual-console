# Implementation Status

`P1_RELEASED / P2_RELEASED / P3_RELEASED / P3_1_RELEASED / P4A_RELEASED / P4B_RELEASED / P4C_RELEASED / P5_ACTIVE_DRAFT / V2_DESIGN_FROZEN / V2_A_CI_PASS_VISUAL_GATE_NEXT`

正式仓库：`wuge988/visual-console`  
当前 `main`：`9ce301bb64d7062195e833a0229ba6530de4ccd1`（V2 architecture/docs freeze；P1–P4C runtime 未改变）  
Active P5 PR：`#9` — Draft / Open / Unmerged  
P5 branch：`feat/p5-qa01-scene-freeze`  
V2-A PR：`#11` — Draft / Open / Unmerged  
V2-A branch：`feat/v2-a-shell`

V2 最终设计：`docs/VISUAL_CONSOLE_V2_FINAL_DESIGN_2026-09-12.md`。  
V2-A Packet：`docs/V2_A_IMPLEMENTATION_PACKET_2026-09-12.md`。

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

## 当前 V2-A — Shell

状态：`IMPLEMENTED_IN_DRAFT / EXACT_HEAD_CI_PASS / WINDOWS_LOCAL_BROWSER_VISUAL_GATE_NEXT / NOT_RELEASED`。

PR #11 exact code head：`8d34879865019030f1c2b11b660ae0f2dfa8451a`。CI #510：PASS。

V2-A 已完成：

- `/v2` 独立 preview shell；legacy routes 仍为默认入口；
- 约 210 px 深色 Sidebar 与 Production / Jobs / Quality / Assets / Evidence / System 分组；
- Global Job Monitor；
- server-derived `/api/v2/summary`；
- active/backlog counters 跨午夜保留，daily outcome 使用 latest state timestamp；
- Dashboard：active jobs / failures / Human Visual Gate / engine health / Cost Guard；
- current route/job 搜索；
- V2 stylesheet 仅 `/v2` 动态加载，不注入 legacy console；
- Cloud 明确 disabled，未接入任何付费 Provider Adapter。

代码/CI 已闭环，但尚未完成目标 Windows 本地浏览器 Human Visual Gate，因此 PR #11 必须保持 Draft，不得 merge/release。

### V2-A 未越过的边界

- 不改变 P5 PR #9；
- 不改变 production Manifest；
- 不改变 F formal archive mutation；
- 不启用新 workflow；
- 不启用云调用；
- 不将 V2 preview 设为默认路由；
- 未经 Human Visual Gate 不进入 merge decision。

## V2 后续计划

- V2-B：Registries + engine/server health；
- V2-C：Unified Jobs；
- V2-D：Asset + Prompt Library；
- V2-E：Production Composer；
- V2-F：Creation Canvas；
- V2-G：Visual Copilot；
- V2-H：Cloud Provider Adapters + Cost Guard。

V2 各阶段必须以独立 Packet/branch 推进，不得把 UI 重构混入 active P5 physical Gate。

## 延后维护项

- `control_root` 历史命名兼容；
- generated staging Trash/Restore；
- input derivative GC；
- 4179 → 4177 服务收敛；
- 多站点 workflow registry 的 site-scoped 可执行状态进一步规范化；
- safety branch/stash 与本地旧工作区只在对应 release 后清理；
- V2 metadata index 若引入 SQLite，只能作为可重建查询索引，除非另行 Gate 授权，否则不得替代 Manifest/journal authority。

## 当前 P0 / P1

针对已发布 P1–P4C runtime：P0=0 / P1=0。  
P5 与 V2-A 各自仍受独立物理/视觉 Gate 约束，不能用该数字宣称 P5/V2 已发布。
