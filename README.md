# Visual Console

站点中立的本地 AI 视觉生产控制台。

当前状态：`G5_APPROVED / S8_FINAL_AUDIT_PASS / G6_OWNER_DECISION_REQUIRED`

Visual Console 不是 DRIFT CURIO 独享应用；DRIFT CURIO 仅作为第一个 Site Profile。

## P1 已验证闭环

已在目标 Windows + iPhone 16e 上验证：

`iPhone → Visual Console Mobile Capture → 当前 Site + SKU RAW → Desktop Source Gallery`

包括：

- 同 Wi-Fi 二维码采集；
- 12 小时 Site + SKU Session；
- iPhone 直拍、相册/文件图片、MOV；
- >32 MiB 分块上传；
- D→F size + SHA256 校验持久化；
- F RAW 自动进入 Desktop Gallery；
- 桌面 `×` 一键移入 `100_Trash\<SKU>`；
- 非法 SKU 拒绝与目录隔离。

## 当前运行边界

P1 仅支持：

- 单 Windows 工作站；
- 单操作员；
- iPhone 与电脑处于同一可信 Private LAN；
- Local API `4177`；
- Desktop UI `5173`。

当前不支持公网/Cloud Tunnel、多操作员并发、Session 重启恢复、Trash Restore UI 或 SC01/ComfyUI production integration。

## Windows 本地运行

正式仓库推荐目录：

`E:\AI_PROJECTS\VISUAL_CONSOLE`

当前 PR 合并前的开发运行分支：

`feat/p1-mobile-capture-runtime`

仓库内网络自适应启动器：

`tools\START_VISUAL_CONSOLE_P1_V4.cmd`

注意：该启动器当前硬编码拉取 feature branch，只适用于合并前开发运行；合并后不得把它当作 `main` 更新器。

完整启动、停止、Private-LAN、安全边界、Merge 后 main 切换与 rollback 规则见：

`docs/OPERATIONS_AND_ROLLBACK_P1.md`

## 已冻结原则

- 中文优先操作界面；
- 多站点 Site Profile；
- ComfyUI 作为本地 GPU 执行引擎；
- 工作流注册表驱动；
- 动态 QA；
- 视觉化素材库；
- iPhone 局域网直接采集/上传；
- 不增加日常人工 BAT/PS1 工作流操作；
- RAW 原始素材不可破坏。

## 治理状态

- P1 Mobile Capture：PASS；
- P1.3 Trash Control：PASS；
- S7 bounded repair：PASS；
- G4B rerun：PASS；
- G5 QA-3：Owner APPROVED；
- S8 final cross-functional audit：PASS；
- 当前硬停止点：`G6_OWNER_DECISION_REQUIRED`。

G6 即使通过，也只允许请求一份独立的一次性 Merge Release Decision；G6 本身不授权 Merge 或 deployment。
