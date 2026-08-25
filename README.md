# Visual Console

站点中立的本地 AI 视觉生产控制台。

当前状态：`G4A_APPROVED / P1_MOBILE_CAPTURE_RUNTIME_TEST_REQUIRED`

Visual Console 不是 DRIFT CURIO 独享应用；DRIFT CURIO 仅作为第一个 Site Profile。

## P1 当前目标

取消：

`iPhone → 微信 → 电脑微信 → 另存 → 找目录 → 拖入控制台`

改成：

`iPhone → Visual Console Mobile Capture → 当前 Site + SKU RAW → Desktop Source Gallery`

## Windows 第一次运行

推荐目录：

`E:\AI_PROJECTS\VISUAL_CONSOLE`

```powershell
git clone https://github.com/wuge988/visual-console.git E:\AI_PROJECTS\VISUAL_CONSOLE
cd E:\AI_PROJECTS\VISUAL_CONSOLE
git checkout feat/p1-mobile-capture-runtime
```

然后双击：

`tools\P1_SETUP_AND_START.bat`

电脑页面：

`http://localhost:5173`

在工作台点击「生成手机上传二维码」，iPhone 16e 与电脑连接同一个 Wi‑Fi 后扫码。

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

详细真机测试见：`docs/P1_RUNTIME_TEST.md`。
