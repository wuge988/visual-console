# P1 Mobile Capture 真机联调

状态：`P1_RUNTIME_TEST_REQUIRED`

## 目标

验证真实 Windows + iPhone 16e：

`Visual Console → QR → iPhone Safari → RAW → Desktop Source Gallery`

## 推荐本地目录

`E:\AI_PROJECTS\VISUAL_CONSOLE`

## 第一次运行

1. 克隆正式仓库：
   `git clone https://github.com/wuge988/visual-console.git E:\AI_PROJECTS\VISUAL_CONSOLE`
2. 进入仓库：
   `cd /d E:\AI_PROJECTS\VISUAL_CONSOLE`
3. 切换 P1 分支：
   `git checkout feat/p1-mobile-capture-runtime`
4. 双击：
   `tools\P1_SETUP_AND_START.bat`
5. 浏览器打开：
   `http://localhost:5173`

## 真机测试顺序

### P1-A
电脑端：
- Site = DRIFT CURIO / 沉木站
- SKU = `DC-ZY-SZ-31001`
- 点击「生成手机上传二维码」

### P1-B
iPhone 16e：
- 与电脑连接同一个 Wi-Fi；
- Safari 扫码；
- 页面必须显示相同 SKU；
- 拍摄 1 张照片上传。

### P1-C
检查电脑：
- 工作台源素材缩略图自动出现；
- F 盘 `F:\1独立站\DRIFT CURIO\DRIFT_CURIO_VISUAL_PIPELINE\01_RAW\DC-ZY-SZ-31001\` 出现原始文件。

### P1-D
iPhone：
- 从照片中多选 3 张上传；
- 再拍一个短 MOV 视频上传。

### P1-E
大视频：
- 选择 >32 MiB 视频；
- 页面显示 8 MiB 分块进度；
- 单个网络请求失败自动重试最多 3 次。

## PASS 条件

- 不经过微信；
- Site/SKU 不需要手机再次输入；
- 手机上传照片成功；
- 多选成功；
- MOV/视频成功；
- RAW 原文件未转换；
- Desktop Source Gallery 自动出现；
- 浏览器不能指定任意 Windows 路径；
- P1 服务只通过 Private LAN 4177 提供手机入口。

## 本轮暂不要求

- ComfyUI SC01 真任务；
- SQLite 持久化；
- 服务重启后的 chunk resume；
- 公网访问；
- Cloud relay；
- 原生 iOS App。
