const exactMap = new Map<string, string>([
  ["Visual Console", "视觉生产控制台"],
  ["V2 · LOCAL FIRST", "V2 · 本地优先"],
  ["TODAY", "今日"],
  ["CLOUD COST", "云端成本"],
  ["ACTIVE JOBS", "活动任务"],
  ["HUMAN VISUAL GATE", "人工视觉审核"],
  ["VISUAL PRODUCTION CONTROL PLANE", "视觉生产控制平面"],
  ["Image Generation", "产品图生成"],
  ["Scene Generation", "场景图生成"],
  ["Batch Generation", "批量生成"],
  ["3D Models", "3D 模型"],
  ["Production Pieces", "产品件"],
  ["Piece Assets", "产品素材"],
  ["Prompt Library", "提示词库"],
  ["Prompts", "提示词库"],
  ["Archive", "归档"],
  ["Review", "审核"],
  ["Library", "资产库"],
  ["Settings", "设置"],
  ["Production", "生产"],
  ["Create", "创建"],
  ["Engines", "引擎"],
  ["Models", "模型"],
  ["Budget", "预算"],
  ["Storage", "存储"],
  ["Advanced", "高级设置"],
  ["Model Registry", "模型注册表"],
  ["Workflow Registry", "工作流注册表"],
  ["ENGINE HEALTH", "引擎健康状态"],
  ["Engine Health", "引擎健康状态"],
  ["SYSTEM", "系统"],
  ["System", "系统"],
  ["Cloud", "云端"],
  ["Cloud Providers", "云端服务商"],
  ["Budget & Providers", "预算与服务商"],
  ["Provider Registry", "服务商注册表"],
  ["PROVIDER REGISTRY", "服务商注册表"],
  ["EXECUTION AUTHORITY", "执行权限"],
  ["COST GUARD", "成本保护"],
  ["Cost Guard", "成本保护"],
  ["Actual Spend", "实际支出"],
  ["Cloud Mode", "云端模式"],
  ["Configured Providers", "已配置服务商"],
  ["Provider calls", "服务商调用"],
  ["Paid generation adapter", "付费生成适配器"],
  ["Actual spend tracking", "实际支出跟踪"],
  ["Silent cloud fallback", "静默云端回退"],
  ["RAW Source", "原始素材"],
  ["Generated", "生成素材"],
  ["Queue", "队列"],
  ["History", "历史"],
  ["Failed / QA Fail", "失败 / 审核未通过"],
  ["Human Review", "人工审核"],
  ["Retry available", "可重试"],
  ["Source", "来源"],
  ["Workflow", "工作流"],
  ["Engine", "引擎"],
  ["Prompt", "提示词"],
  ["Submission Adapter", "提交适配器"],
  ["Exact Piece / Source", "产品件 / 来源"],
  ["Local $0 · Cloud disabled", "本地 $0 · 云端关闭"],
  ["NOT REGISTERED", "未注册"],
  ["REGISTERED", "已注册"],
  ["EXECUTABLE", "可执行"],
  ["BLOCKED", "已阻断"],
  ["READY", "就绪"],
  ["DEGRADED", "降级"],
  ["ONLINE", "在线"],
  ["OFFLINE", "离线"],
  ["DISABLED", "已关闭"],
  ["ENABLED", "已启用"],
  ["READ ONLY", "只读"],
  ["FAIL CLOSED", "默认阻断"],
  ["PLANNED MVP", "计划中的 MVP"],
  ["PDP NON-BLOCKING", "不阻塞 PDP"],
  ["NO SILENT FALLBACK", "禁止静默回退"],
  ["NON-BLOCKING", "非阻塞增强"],
  ["Release boundary", "发布边界"],
  ["Capture", "采集"],
  ["Frame QC", "画面质检"],
  ["Wood-only Mask", "仅木材遮罩"],
  ["Reconstruction", "三维重建"],
  ["Mesh / Texture Cleanup", "网格 / 纹理清理"],
  ["Scale Calibration", "尺寸标定"],
  ["GLB / Web Asset", "GLB / 网页模型"],
  ["3D QA", "3D 质检"],
]);

function translateTextNode(node: Text) {
  const raw = node.nodeValue ?? "";
  const trimmed = raw.trim();
  if (!trimmed) return;
  const translated = exactMap.get(trimmed);
  if (!translated || translated === trimmed) return;
  const leading = raw.match(/^\s*/)?.[0] ?? "";
  const trailing = raw.match(/\s*$/)?.[0] ?? "";
  node.nodeValue = `${leading}${translated}${trailing}`;
}

function translateTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root as Text);
    return;
  }
  if (!(root instanceof Element) && !(root instanceof DocumentFragment)) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    if (parent && !["SCRIPT", "STYLE", "CODE", "PRE", "TEXTAREA"].includes(parent.tagName)) translateTextNode(node as Text);
    node = walker.nextNode();
  }
}

export function installP2ChineseLocalization() {
  if (!window.location.pathname.startsWith("/v2")) return;
  document.documentElement.lang = "zh-CN";
  translateTree(document.body);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "characterData") translateTree(record.target);
      else record.addedNodes.forEach((node) => translateTree(node));
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
}
