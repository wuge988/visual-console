# Visual Console

站点中立、本地优先的 AI 视觉生产控制台。DRIFT CURIO 是第一个 Site Profile，但应用层不得硬编码单一站点、单一模型或单一云供应商。

## 当前状态

- 稳定 `main`：`P1 / P2 / P3 / P3.1 / P4A / P4B / P4C RELEASED`；
- 稳定 `main` HEAD：`598bb5362eeff719d4bd882412de346f12cda330`；
- Active P5：PR #9 `feat/p5-qa01-scene-freeze`，Draft / Open / Unmerged；
- QA01：仍 `NOT_REGISTERED / executable=false`，正在完成 Video2Twin Exact-SKU Identity physical gate；
- Visual Console V2：`DESIGN_FROZEN / IMPLEMENTATION_NOT_STARTED`。

V2 最终架构：`docs/VISUAL_CONSOLE_V2_FINAL_DESIGN_2026-09-12.md`。

## V2 方向

Visual Console V2 采用成熟 SaaS 控制台的任务可见性与操作模式，但保留并强化本项目的生产真值：

- 全局 Job Monitor；
- Production / Jobs / Quality / Assets / Evidence / System 六大工作区；
- Model Registry + Workflow Registry + Prompt Registry；
- Local-first / Cloud-escalation 双引擎；
- Creation Canvas 作为 Visual Production Orchestrator；
- 画布内 Visual Copilot；
- Cost Guard；
- Exact Piece Identity Gate；
- generation / QA / archive 三套独立状态机；
- RAW/source immutable；
- Manifest / journal / D-E-F provenance 继续作为现有权威链路。

V2 的 `95% local / 5% cloud` 是运营目标，不是硬 SLA。云模型只能作为受预算与 QA 约束的升级路径，不允许失败后静默切换到付费模型。

## 已验证生产闭环

### P1 — Mobile Capture + RAW / Trash

已在目标 Windows + iPhone 16e 上验证：

`iPhone → Visual Console Mobile Capture → 当前 Site + SKU RAW → Desktop Source Gallery`

包括：

- 同 Wi-Fi 二维码采集；
- Site + SKU session；
- iPhone 直拍、相册/文件图片、MOV；
- 大文件分块上传；
- size + SHA256 校验持久化；
- RAW 自动进入 Desktop Gallery；
- Trash 安全边界；
- 非法 SKU 拒绝与目录隔离。

### P2–P4C — 静态主资产

已发布：

- SC01：RMBG-2.0 透明 Master；
- Gate15 / Manifest / archive truth；
- SW01：`#FFFFFF` Static White Master；
- SD01：`#171B20` Gallery Surface Static Dark Master；
- SC01 / SW01 / SD01 的 provenance、QA、重启恢复与正式归档链路。

## 当前 P5 边界

P5 QA01 Aquarium 场景工作流继续在独立 Draft PR #9 中验证。

当前核心路径：

`existing exact-SKU video → deterministic sampling/masking → VGGT-1B-Commercial → gsplat → scene.ply + scene.splat → Human Exact-SKU Identity Gate`

在 Human Identity Gate 通过前：

- QA01 不注册；
- QA01 不进入 enabled workflows；
- 不修改 production Manifest；
- 不修改 F formal archive；
- 不 merge / deploy / enable。

## 当前运行边界

当前系统仍以单 Windows 工作站、单操作员、本地/可信 Private LAN 为主要运行边界。V2 设计不会把公网 SaaS、多租户、支付系统或云端数据库作为前置条件。

## 技术基线

- Frontend：Vue 3 + TypeScript + Vite；
- Backend：Fastify + TypeScript；
- Local generation：现有 deterministic renderer / ComfyUI 等本地引擎；
- Storage truth：现有 Manifest / journal / D-E-F 文件与证据链；
- Cloud：仅通过未来 Provider Adapter + Cost Guard 按需启用；
- Provider secrets：只允许服务器/本机持有，不进入前端或仓库。

## 已冻结原则

- 中文优先操作界面；
- 多站点 Site Profile；
- 本地优先；
- 模型无关；
- 工作流注册表驱动；
- 动态 QA；
- 视觉化素材库；
- iPhone 局域网直接采集/上传；
- 不增加日常人工 BAT/PS1 工作流操作；
- RAW 原始素材不可破坏；
- 生成成功不等于 QA 成功；
- 云调用不得绕过预算、身份与归档 Gate。

## 文档入口

- V2 最终设计：`docs/VISUAL_CONSOLE_V2_FINAL_DESIGN_2026-09-12.md`
- 实施状态：`docs/IMPLEMENTATION_STATUS.md`
- P1 运维与回滚：`docs/OPERATIONS_AND_ROLLBACK_P1.md`
- 当前 P5：GitHub PR #9
