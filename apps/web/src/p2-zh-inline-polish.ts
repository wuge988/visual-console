const replacements: Array<[string, string]> = [
  ["Local Context Advisor", "本地上下文助手"],
  ["Provider-backed Copilot", "接入服务商的视觉助手"],
  ["requires explicit adapter + Cost Guard in a later gate", "需要在后续 Gate 显式通过适配器与成本保护"],
  ["Source / Output / QA", "来源 / 输出 / QA"],
  ["Source / Output", "来源 / 输出"],
  ["Prompt Registry", "提示词注册表"],
  ["Workflow Registry", "工作流注册表"],
  ["Model Registry", "模型注册表"],
  ["Exact Piece", "产品件"],
  ["draft/suggestion", "草稿/建议"],
  ["AI Provider", "AI 服务商"],
  ["Provider Adapter", "服务商适配器"],
  ["Cost Guard", "成本保护"],
  ["Cloud Providers", "云端服务商"],
  ["Cloud disabled", "云端已关闭"],
  ["authoritative mutation", "权威写操作"],
  ["formal archive authority", "正式归档权限"],
  ["formal Archive", "正式归档"],
  ["Archive projection", "归档投影"],
  ["Archived", "已归档"],
  ["Archive", "归档"],
  ["Generated derivatives", "生成派生素材"],
  ["Generated derivative", "生成派生素材"],
  ["RAW/source", "原始素材"],
  ["RAW Source", "原始素材"],
  ["read-only projections", "只读投影"],
  ["read-only projection", "只读投影"],
  ["read only", "只读"],
  ["immutable", "不可变"],
  ["provenance", "来源证据"],
  ["blockers", "阻断项"],
  ["blocker", "阻断项"],
  ["drafts", "草稿"],
  ["draft", "草稿"],
  ["suggestions", "建议"],
  ["suggestion", "建议"],
  ["cannot self-approve", "不能自行批准"],
  ["cannot promote formal state", "不能提升正式状态"],
  ["no external model call", "不调用外部模型"],
  ["no submit", "不提交任务"],
  ["no retry mutation", "不执行重试写操作"],
  ["fail closed", "默认安全阻断"],
  ["fail-closed", "默认安全阻断"],
  ["submit adapters", "提交适配器"],
  ["submit adapter", "提交适配器"],
  ["submit path", "提交路径"],
  ["Composer", "任务编辑器"],
  ["Surface", "生成类型"],
  ["Capabilities", "可用能力"],
  ["Selected Source", "已选原图"],
  ["Cloud Cost", "云端成本"],
  ["Prompt / Template", "提示词 / 模板"],
  ["Registry-driven capability", "由注册表驱动的能力"],
  ["Truth checks", "真值检查"],
  ["TRUTH CHECKS", "真值检查"],
  ["Ready to Create Job?", "可以创建任务吗？"],
  ["Estimated cost", "预估成本"],
  ["no metered provider", "无计费服务商"],
  ["Not required", "无需"],
  ["Registries", "注册表"],
  ["Registry", "注册表"],
  ["registries", "注册表"],
  ["registry", "注册表"],
  ["Engines", "引擎"],
  ["Engine", "引擎"],
  ["engines", "引擎"],
  ["engine", "引擎"],
  ["Workflows", "工作流"],
  ["Workflow", "工作流"],
  ["workflows", "工作流"],
  ["workflow", "工作流"],
  ["Providers", "服务商"],
  ["Provider", "服务商"],
  ["providers", "服务商"],
  ["provider", "服务商"],
  ["Models", "模型"],
  ["Model", "模型"],
  ["models", "模型"],
  ["model", "模型"],
  ["Sources", "来源"],
  ["Source", "来源"],
  ["sources", "来源"],
  ["source", "来源"],
  ["Outputs", "输出"],
  ["Output", "输出"],
  ["outputs", "输出"],
  ["output", "输出"],
  ["Scenes", "场景"],
  ["Scene", "场景"],
  ["scenes", "场景"],
  ["scene", "场景"],
  ["Camera", "相机"],
  ["Lighting", "光照"],
  ["Integration", "融合"],
  ["Negative", "负面约束"],
  ["Authority", "权限"],
  ["authority", "权限"],
  ["Context", "上下文"],
  ["context", "上下文"],
  ["Actions", "操作"],
  ["ACTIONS", "操作"],
  ["Known Facts", "已知信息"],
  ["KNOWN FACTS", "已知信息"],
  ["Suggested Next Steps", "建议下一步"],
  ["SUGGESTED NEXT STEPS", "建议下一步"],
  ["Blockers / Unknowns", "阻断项 / 未知项"],
  ["BLOCKERS / UNKNOWNS", "阻断项 / 未知项"],
  ["Handoff", "下一步入口"],
  ["HANDOFF", "下一步入口"],
  ["Copy", "复制"],
  ["LOCAL RULES", "本地规则"],
  ["LOCAL FIRST", "本地优先"],
  ["NO PROVIDER", "不调用服务商"],
  ["PROVIDER COST", "服务商成本"],
  ["DRAFT OUTPUT", "草稿输出"],
  ["DRAFT ONLY", "仅草稿"],
  ["AUTHORITY GUARD", "权限保护"],
  ["CONTEXT PROOF", "上下文证据"],
  ["SUCCEEDED", "成功"],
  ["FAILED", "失败"],
  ["QUEUED", "排队中"],
  ["RUNNING", "运行中"],
  ["QA_PENDING", "待审核"],
  ["QA_PASS", "审核通过"],
  ["QA_FAIL", "审核未通过"],
  ["ARCHIVE_READY", "可归档"],
  ["VERIFIED_ARCHIVE", "已验证归档"],
  ["REJECTED", "已拒绝"],
  ["STAGING", "暂存中"],
  ["NO_JOB", "无任务"],
  ["NO_QA", "无审核记录"],
  ["NO_ARCHIVE_PROJECTION", "无归档投影"],
  ["NO_ITEM_CONTEXT", "无产品件上下文"],
  ["RAW_SOURCE_NOT_PROVEN", "原始素材尚未证明"],
  ["SCENE_WORKFLOW_NOT_EFFECTIVE", "场景工作流当前不可执行"],
  ["NO_REVIEWED_PROMPT_REGISTRY_ENTRY", "没有已审核的提示词注册项"],
];

const attributeNames = ["placeholder", "title", "aria-label"] as const;

function replaceAllKnown(value: string) {
  let next = value;
  for (const [from, to] of replacements) {
    if (next.includes(from)) next = next.split(from).join(to);
  }
  return next;
}

function polishTextNode(node: Text) {
  const parent = node.parentElement;
  if (parent && ["SCRIPT", "STYLE", "CODE", "PRE", "TEXTAREA"].includes(parent.tagName)) return;
  const raw = node.nodeValue ?? "";
  const next = replaceAllKnown(raw);
  if (next !== raw) node.nodeValue = next;
}

function polishElement(element: Element) {
  for (const name of attributeNames) {
    const raw = element.getAttribute(name);
    if (!raw) continue;
    const next = replaceAllKnown(raw);
    if (next !== raw) element.setAttribute(name, next);
  }
  if (element instanceof HTMLInputElement && (element.readOnly || element.disabled)) {
    const next = replaceAllKnown(element.value);
    if (next !== element.value) element.value = next;
  }
}

function polishTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    polishTextNode(root as Text);
    return;
  }
  if (!(root instanceof Element) && !(root instanceof DocumentFragment)) return;
  if (root instanceof Element) polishElement(root);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    polishTextNode(node as Text);
    node = walker.nextNode();
  }

  if (root instanceof Element) root.querySelectorAll("*").forEach(polishElement);
}

export function installP2ChineseInlinePolish() {
  if (!window.location.pathname.startsWith("/v2")) return;
  polishTree(document.body);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "characterData") polishTree(record.target);
      else record.addedNodes.forEach(polishTree);
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
}
