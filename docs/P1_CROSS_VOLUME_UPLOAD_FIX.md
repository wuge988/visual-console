# P1 Windows Cross-Volume Upload Fix

Status: `FIX_IMPLEMENTED / REAL_DEVICE_RETEST_REQUIRED`

## 真机现象

2026-08-25，iPhone 16e 在手机采集页已经可以正常打开并开始上传，但以下两条路径都在服务端最终落盘阶段失败：

- 直接拍照 / 小图片上传；
- 从照片/文件选择较大 MOV，经 chunk 组装后 finalize。

两者均返回 Windows Node.js 错误：

`EXDEV: cross-device link not permitted, rename ...`

实际路径显示：

- 上传临时文件位于 `D:\AI\CACHE\visual_console_uploads\...`；
- DRIFT CURIO RAW 正式文件位于 `F:\1独立站\DRIFT CURIO\DRIFT_CURIO_VISUAL_PIPELINE\01_RAW\<SKU>\...`。

## 根因

旧实现使用 `fs.promises.rename()` 完成 `D:` 临时文件 → `F:` RAW 文件的最终持久化。

Windows 的 rename/move 不能依赖跨卷原子重命名；当源文件和目标文件位于不同盘符时会返回 `EXDEV`。

因此本次错误发生在**文件已成功上传至电脑后的最终持久化阶段**，不是 iPhone、二维码、Wi-Fi、Safari、multipart 或 chunk 上传链路失败。

## P1.2 修复

`apps/server/src/index-p1.ts` 新增 `transferVerified(source, target)`：

1. 读取 D 临时文件 size 和 SHA256；
2. 使用 Node stream 从 D 复制至 F；
3. 目标文件使用 `wx`，保持禁止覆盖；
4. 比较源/目标 size；
5. 比较源/目标 SHA256；
6. 仅在验证全部通过后删除 D 临时源文件；
7. 如果写入中途失败，只清理本次已经创建的目标残片；
8. 不再依赖跨盘 `rename()`。

该逻辑同时用于：

- `/api/mobile/upload` 小文件直传；
- `/api/mobile/uploads/:uploadId/finalize` 大文件分块上传 finalize。

因此保持原有架构：

`iPhone → D 临时缓存 → SHA256 安全复制 → F RAW → 删除已验证 D 临时文件`

没有为了绕过问题把临时缓存迁移到 F，也没有破坏 D/F 已冻结的职责分工。

## 下一真机验证

更新并重启 Visual Console 后重新测试：

1. 拍摄 1 张照片；
2. 从照片中选择图片；
3. 选择一个 MOV 视频；
4. 检查手机页显示“已完成”；
5. 检查 F RAW 出现对应原文件；
6. 检查桌面 Source Gallery 自动刷新。

以上通过后再继续 >32 MiB 大视频和 Session 隔离测试。
