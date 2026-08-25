# Implementation Status

`G4A_APPROVED / P1_MOBILE_CAPTURE_RUNTIME_TEST_IN_PROGRESS`

## 正式仓库

`wuge988/visual-console`

当前分支：`feat/p1-mobile-capture-runtime`

Draft PR：`#1`

## 已实现到代码

- 中文优先桌面壳；
- Site Profile；
- DRIFT CURIO 首个 Profile；
- LAN Local API；
- **12 小时、Site + Item/SKU 绑定的二维码 Upload Session**；
- 同一 Site + Item/SKU 重新生成二维码时，旧 Session 自动失效；
- 手机页持续显示当前 SKU、素材归属和剩余有效期；
- iPhone Safari 直接拍照 / 录像；
- Photos / Files 多选；
- 小文件直传 + 上传进度；
- >32 MiB 文件 8 MiB chunk 分块上传；
- 单 chunk 最多 3 次客户端重试；
- RAW 原始文件不转换；
- 服务端 SHA256；
- 当前 SKU RAW 素材扫描；
- Desktop 自动刷新 Source Gallery；
- 图片预览；
- 视频 Range streaming 基础；
- 路径白名单 / 不接受任意 Windows path；
- P1 Windows Setup/Start 工具；
- **LAN IP 智能选择：排除 Karing/TUN/TAP/VPN/Wintun 等虚拟接口，优先 WLAN/Wi-Fi，其次 Ethernet/以太网。**
- **P1.2 Windows 跨卷持久化：D 临时文件流式复制到 F RAW，size + SHA256 双校验通过后才删除 D 源文件；禁止覆盖。**

## 2026-08-25 P1 真机记录

### Windows 运行环境已确认

- Git `2.54.0.windows.1`；
- Node.js `v24.14.1`；
- npm `11.11.0`；
- 正式仓库位于 `E:\AI_PROJECTS\VISUAL_CONSOLE`；
- TCP `4177` / `5173` 正常监听；
- Windows Node Private Network 已允许；
- Visual Console 桌面页面已成功启动。

### npm / PowerShell 启动问题

- 官方 npm registry 首次出现 `ECONNRESET`；
- npmmirror 已成功完成依赖安装；
- 修复了 PowerShell 将 npm 标准输出误判为退出码的问题；
- 修复了 Windows PowerShell 5.1 对 GitHub UTF-8 无 BOM + 中文 `.ps1` 的解析兼容问题；
- runtime launcher 已改为 ASCII-safe。

### LAN 真机诊断已确认

目标 Windows 同时存在：

- 以太网：`192.168.1.2`；
- Karing TUN Network Adapter：`10.20.0.1`；
- WLAN / Intel Wi-Fi 6 AX201：`192.168.3.8`。

旧后端只是读取“第一个非回环 IPv4”，因此错误选择了 `10.20.0.1` 作为二维码地址。

诊断工具推荐 WLAN `192.168.3.8`。iPhone Safari 已成功访问：

`http://192.168.3.8:4177/api/health`

并收到 `ok: true / service: visual-console`，因此 **iPhone → Windows Local API 的同 Wi-Fi 局域网链路已验证通过**。

### P1.1 会话与 LAN 修复

1. `SESSION_TTL_MS` 从 30 分钟改为 **12 小时**；
2. Session 严格绑定 `site_id + item_id + optional sku`；
3. 同一 Item/SKU 重新生成二维码会使旧 Session 失效；
4. 手机端显示当前 SKU、素材归属和剩余有效期；
5. LAN 选择排除 Karing / TUN / TAP / VPN / Wintun / Tailscale / ZeroTier / WireGuard / VMware / VirtualBox / Hyper-V / Docker / WSL 等虚拟接口；
6. 优先真实 `WLAN / Wi-Fi / Wireless`，其次 `Ethernet / 以太网`；
7. `/api/health` 返回 `lan_ip`、`lan_interface`、候选接口和 `session_ttl_hours`；
8. 支持 `VISUAL_CONSOLE_LAN_IP` 环境变量作为人工兜底覆盖，但正常操作不需要使用。

当前真机地址已正确使用：`192.168.3.8`（WLAN）。

### P1.2 真机发现：Windows 跨卷 EXDEV

iPhone 16e 已成功打开手机采集页，并实际尝试：

- 直接拍照上传 `image.jpg`；
- 从照片 / 文件选择 `IMG_1182.mov` 上传。

两条链路都已把数据上传到 D 盘临时目录，但在最终写入 F RAW 时失败，Safari 返回：

`EXDEV: cross-device link not permitted, rename ... D:\... -> F:\...`

根因：旧实现使用 `fs.promises.rename()` 将 D 盘临时文件移动到 F 盘。Windows 不支持依赖 rename 完成跨卷移动。

因此该错误不是二维码、Safari、Wi-Fi、multipart 或 chunk 传输失败，而是**服务端最后一步跨磁盘持久化失败**。

P1.2 已修复：

- 不再使用跨盘 `rename()`；
- D 临时文件继续保留，不改变已冻结的 D/F 职责；
- 使用 Node stream 以 `wx` 模式复制到 F，保持 no-overwrite；
- 比较源/目标 size；
- 比较源/目标 SHA256；
- 仅在目标验证成功后删除 D 临时源文件；
- 写入失败时只清理本次已创建的目标残片；
- 同一逻辑同时覆盖小文件直传和大文件 chunk finalize。

详细记录：`docs/P1_CROSS_VOLUME_UPLOAD_FIX.md`。

## P1 下一验证项

必须继续由真实 Windows + iPhone 16e 完成：

- 更新到 P1.2 并重启；
- 拍摄 1 张照片上传成功；
- 从照片中选择图片上传成功；
- MOV 视频上传成功；
- F RAW 实际出现对应原文件；
- Desktop Source Gallery 自动刷新；
- >32 MiB chunk 上传；
- 同 SKU 重新生成二维码后旧码失效；
- 切换 SKU 后新二维码绑定新 SKU。

以上未完成前，不标记 P1 PASS。
