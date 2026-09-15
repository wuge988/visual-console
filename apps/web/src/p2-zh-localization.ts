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
  ["ADVANCED", "高级"],
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
  ["RAW_SOURCE", "原始素材"],
  ["Generated", "生成素材"],
  ["Generated derivatives", "生成派生素材"],
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
  ["FAIL CLOSED", "安全阻断"],
  ["Fail closed", "安全阻断"],
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

  ["Visual Copilot", "视觉助手"],
  ["V2-G · VISUAL COPILOT", "V2-G · 视觉助手"],
  ["LOCAL RULES", "本地规则"],
  ["LOCAL", "本地"],
  ["LOCAL FIRST", "本地优先"],
  ["DRAFT ONLY", "仅草稿"],
  ["Draft only", "仅草稿"],
  ["NO PROVIDER", "不调用服务商"],
  ["$0 PROVIDER COST", "$0 服务商成本"],
  ["EXACT PIECE", "产品件"],
  ["JOBS", "任务"],
  ["SCENE EFFECTIVE", "可用场景工作流"],
  ["CANVAS DRAFTS", "画布草稿"],
  ["01 · ACTIONS", "01 · 操作"],
  ["What should Copilot do?", "视觉助手要做什么？"],
  ["Analyze Piece", "分析产品件"],
  ["Draft Prompt Skeleton", "生成提示词骨架"],
  ["Create Scene Plan", "生成场景计划"],
  ["Suggest Reference Needs", "建议参考素材需求"],
  ["Compare Outputs", "比较输出结果"],
  ["Diagnose QA Failure", "诊断审核失败原因"],
  ["Revise Prompt Checklist", "生成提示词修订清单"],
  ["Create Retry Draft", "生成重试建议"],
  ["02 · DRAFT OUTPUT", "02 · 草稿输出"],
  ["KNOWN FACTS", "已知信息"],
  ["SUGGESTED NEXT STEPS", "建议下一步"],
  ["BLOCKERS / UNKNOWNS", "阻断项 / 未知项"],
  ["HANDOFF", "下一步入口"],
  ["Copy", "复制"],
  ["Open →", "打开 →"],
  ["03 · AUTHORITY GUARD", "03 · 权限保护"],
  ["AUTHORITY GUARD", "权限保护"],
  ["Authority", "权限"],
  ["Provider cost", "服务商成本"],
  ["RAW/source", "原始素材"],
  ["Human Gate", "人工审核"],
  ["CONTEXT PROOF", "上下文证据"],
  ["No blocking unknown recorded for this draft.", "当前草稿没有记录到阻断项。"],
  ["Open Piece Assets", "打开产品素材"],
  ["Open Prompt Library", "打开提示词库"],
  ["Open Scene Generation", "打开场景图生成"],

  ["V2-E · PRODUCTION COMPOSER", "V2-E · 生产任务编辑器"],
  ["PRODUCTION COMPOSER", "生产任务编辑器"],
  ["Surface", "生成类型"],
  ["IMAGE", "产品图"],
  ["SCENE", "场景图"],
  ["BATCH", "批量"],
  ["Capabilities", "可用能力"],
  ["Selected Source", "已选原图"],
  ["Cloud Cost", "云端成本"],
  ["Cloud disabled / fail-closed", "云端关闭 / 默认安全阻断"],
  ["产品件 / 来源", "产品件 / 来源"],
  ["Prompt / Template", "提示词 / 模板"],
  ["Workflow does not require text prompt", "该工作流不需要文本提示词"],
  ["Registry-driven capability", "由注册表驱动的能力"],
  ["REGISTRY", "注册表"],
  ["06 · TRUTH CHECKS", "06 · 真值检查"],
  ["TRUTH CHECKS", "真值检查"],
  ["Ready to Create Job?", "可以创建任务吗？"],
  ["Not required", "无需"],
  ["Estimated cost", "预估成本"],
  ["LOCAL · no metered provider", "本地执行 · 无计费服务商"],
  ["SUBMIT READY", "可提交"],
  ["IMMUTABLE", "不可变"],
  ["Create Job", "创建任务"],
  ["创建任务", "创建任务"],
  ["Refresh", "刷新"],
  ["Provider", "服务商"],
  ["Provider Adapter", "服务商适配器"],
  ["Adapter", "适配器"],
  ["Runtime", "运行时"],
  ["Runtime Registered", "运行时已注册"],
  ["Site Enabled", "站点已启用"],
  ["Effective Executable", "当前可执行"],
  ["Registry status", "注册状态"],
  ["Effective workflows", "当前可用工作流"],
  ["CONTROL PLANE", "控制平面"],
  ["DETERMINISTIC", "确定性执行"],
  ["GENERATIVE LOCAL", "本地生成"],
  ["CLOUD ESCALATION", "云端升级"],
  ["COMFYUI DETAIL", "ComfyUI 详情"],
  ["STORAGE TRUTH", "存储真值"],
  ["MODEL REGISTRY", "模型注册表"],
  ["WORKFLOW CAPABILITY MAP", "工作流能力映射"],
  ["Active routes", "已启用路径"],
  ["Metered cost", "计费"],
  ["Media", "媒体类型"],
  ["Current blockers", "当前阻断项"],
  ["Provider enabled", "服务商已启用"],
  ["Pricing metadata", "价格元数据"],
  ["Credential configured", "凭据已配置"],
  ["Models", "模型"],
  ["LOCKED", "已锁定"],
  ["ALLOW", "允许"],
  ["BLOCKING", "阻断中"],
  ["UNAVAILABLE", "不可用"],
  ["NOT_IMPLEMENTED", "未实现"],
]);

const phraseReplacements: Array<[RegExp, string]> = [
  [/^Piece analysis · /, "产品件分析 · "],
  [/^Prompt skeleton · /, "提示词骨架 · "],
  [/^Scene plan · /, "场景计划 · "],
  [/^RAW Source: /, "原始素材："],
  [/^Generated derivatives: /, "生成派生素材："],
  [/^Jobs: /, "任务："],
  [/^Latest Generation: /, "最近生成状态："],
  [/^Latest QA: /, "最近审核状态："],
  [/^Latest Archive projection: /, "最近归档投影："],
  [/^Registered prompts visible to site: /, "站点可见已注册提示词："],
  [/^Active models: /, "当前启用模型："],
  [/^Scene registry entries: /, "场景工作流注册项："],
  [/^Effective scene workflows: /, "当前可用场景工作流："],
  [/^Prompt Registry entries: /, "提示词注册项："],
  [/^Engine overall: /, "引擎整体状态："],
  [/^(\d+) submit adapter$/, "$1 个提交适配器"],
  [/^LOCAL · /, "本地 · "],
  [/^read only · immutable$/, "只读 · 不可变"],
  [/^read only · /, "只读 · "],
  [/^latest /, "最近："],
];

const attributeNames = ["placeholder", "title", "aria-label"] as const;

function translateValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return value;
  const exact = exactMap.get(trimmed);
  if (exact) return value.replace(trimmed, exact);
  for (const [pattern, replacement] of phraseReplacements) {
    if (pattern.test(trimmed)) return value.replace(trimmed, trimmed.replace(pattern, replacement));
  }
  return value;
}

function translateTextNode(node: Text) {
  const raw = node.nodeValue ?? "";
  const translated = translateValue(raw);
  if (translated !== raw) node.nodeValue = translated;
}

function translateElementAttributes(element: Element) {
  for (const name of attributeNames) {
    const value = element.getAttribute(name);
    if (!value) continue;
    const translated = translateValue(value);
    if (translated !== value) element.setAttribute(name, translated);
  }
  if (element instanceof HTMLInputElement && (element.readOnly || element.disabled)) {
    const translated = translateValue(element.value);
    if (translated !== element.value) element.value = translated;
  }
}

function translateTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root as Text);
    return;
  }
  if (root instanceof Element) translateElementAttributes(root);
  if (!(root instanceof Element) && !(root instanceof DocumentFragment)) return;

  const textWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let textNode: Node | null = textWalker.nextNode();
  while (textNode) {
    const parent = textNode.parentElement;
    if (parent && !["SCRIPT", "STYLE", "CODE", "PRE", "TEXTAREA"].includes(parent.tagName)) translateTextNode(textNode as Text);
    textNode = textWalker.nextNode();
  }

  if (root instanceof Element) {
    translateElementAttributes(root);
    root.querySelectorAll("*").forEach(translateElementAttributes);
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
