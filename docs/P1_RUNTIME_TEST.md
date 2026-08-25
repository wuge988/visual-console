# P1 Mobile Capture 真机联调

状态：`P1_RUNTIME_TEST_IN_PROGRESS`

## 目标

验证真实 Windows + iPhone 16e：

`Visual Console → QR → iPhone Safari → RAW → Desktop Source Gallery`

## 推荐本地目录

`E:\AI_PROJECTS\VISUAL_CONSOLE`

## 当前已确认

- Windows Desktop Console 已成功启动；
- Local API `4177` 正常监听；
- iPhone Safari 已成功访问 `http://192.168.3.8:4177/api/health`；
- 因此 iPhone → Windows Local API 的同 Wi‑Fi 链路已经通过；
- 目标机器的真实 WLAN 为 `192.168.3.8`；Karing TUN `10.20.0.1` 必须排除。

## P1.1 会话规则

- 二维码 Session 默认有效 **12 小时**；
- Session 绑定 `site_id + item_id + optional sku`；
- 同一 Site + Item/SKU 重新生成二维码时旧 Session 自动失效；
- 换 SKU 必须重新生成二维码；
- 手机页必须显示当前 SKU、素材将保存到该 SKU 的提示和剩余有效期。

## 真机测试顺序

### P1-A｜更新并重启

电脑端：
- 停止当前 P1 进程；
- 重新运行现有 P1 v5 启动器，让正式仓库自动 `git pull`；
- 打开 `http://localhost:5173`；
- 左下角应显示 `LAN IP = 192.168.3.8`、`LAN 接口 = WLAN`。

### P1-B｜二维码直达

电脑端：
- Site = DRIFT CURIO / 沉木站；
- SKU = `DC-ZY-SZ-31001`；
- 点击「生成手机上传二维码」。

iPhone 16e：
- 与电脑连接同一个 Wi‑Fi；
- Safari 扫码；
- 手机页必须显示相同 SKU；
- 页面必须显示约 12 小时剩余有效期；
- 页面必须明确提示所有照片和视频保存到当前 SKU。

### P1-C｜单张照片

iPhone：
- 拍摄 1 张照片并上传。

电脑：
- 工作台源素材缩略图应约 2.5 秒内自动出现；
- F 盘 `F:\1独立站\DRIFT CURIO\DRIFT_CURIO_VISUAL_PIPELINE\01_RAW\DC-ZY-SZ-31001\` 应出现原始文件。

### P1-D｜多选 + 视频

iPhone：
- 从照片中多选 3 张上传；
- 再拍一个短 MOV 视频上传。

### P1-E｜大视频

- 选择 >32 MiB 视频；
- 页面显示 8 MiB 分块进度；
- 单个网络请求失败自动重试最多 3 次。

### P1-F｜Session 隔离

- 为同一个 SKU 再次生成二维码；旧二维码应不能继续上传；
- 切换到另一个 SKU 后生成新二维码；手机页必须显示新 SKU；
- 新素材不得进入旧 SKU 目录。

## PASS 条件

- 不经过微信；
- 智能 LAN 自动选择真实 WLAN，而不是 Karing/TUN/VPN；
- Site/SKU 不需要手机再次输入；
- 12 小时 Session 行为正确；
- 同 SKU 新码使旧码失效；
- 换 SKU 必须生成并绑定新码；
- 手机上传照片成功；
- 多选成功；
- MOV/视频成功；
- >32 MiB 分块上传成功；
- RAW 原文件未转换；
- Desktop Source Gallery 自动出现；
- 浏览器不能指定任意 Windows 路径；
- P1 服务只通过局域网提供手机入口。

## 本轮暂不要求

- ComfyUI SC01 真任务；
- SQLite 持久化；
- 服务重启后的 chunk resume；
- 公网访问；
- Cloud relay；
- 原生 iOS App。
