<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

type Site = { site_id: string; display_name: string; display_name_zh: string };
type Summary = {
  ok: boolean;
  day_key: string;
  generation: { queued: number; running: number; completed: number; failed: number };
  qa: { pending: number; passed: number; rejected: number };
  archive: { ready: number; staging?: number; archived: number };
  system: { comfyui: "ONLINE" | "OFFLINE"; worker: "BUSY" | "IDLE"; queue_depth: number };
  cloud_cost: { enabled: boolean; currency: string; today: number; month: number };
};
type EngineHealth = { ok: boolean; overall: "READY" | "DEGRADED"; engines?: { cloud?: { status: string; fail_closed?: boolean } } };
type UnifiedJob = {
  job_id: string;
  site_id: string;
  item_id: string;
  workflow_code: string;
  source_asset_id: string;
  source_filename?: string;
  generated_asset_id?: string;
  generated_filename?: string;
  generation_state: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  qa_state: "NOT_REQUIRED" | "QA_PENDING" | "QA_PASS" | "QA_FAIL";
  archive_state: "STAGING" | "ARCHIVE_READY" | "VERIFIED_ARCHIVE" | "REJECTED";
  action_required: "NONE" | "HUMAN_REVIEW" | "RETRY_AVAILABLE";
  retryable: boolean;
  legacy_state: string;
  created_at: string;
  updated_at: string;
  error?: string;
  qa_note?: string;
};
type LibraryAsset = {
  library_id: string;
  asset_id: string;
  site_id: string;
  item_id: string;
  role: "RAW_SOURCE" | "GENERATED_DERIVATIVE";
  media_type: "image" | "video" | "file" | "unknown";
  filename?: string;
  immutable_source: boolean;
  related_job_ids: string[];
  workflow_codes: string[];
  generation_state?: string;
  qa_state?: "NOT_REQUIRED" | "QA_PENDING" | "QA_PASS" | "QA_FAIL";
  archive_state?: "STAGING" | "ARCHIVE_READY" | "VERIFIED_ARCHIVE" | "REJECTED";
  last_seen_at: string;
};
type PromptEntry = {
  prompt_key: string;
  version: string;
  display_name: string;
  scene_type: string;
  status: string;
  body: string;
  exact_piece_constraints: string[];
  compatible_workflows: string[];
  compatible_models: string[];
  tags: string[];
};
type ProjectedWorkflow = {
  code: string;
  name_en: string;
  name_zh: string;
  execution_engine?: string;
  site_enabled: boolean;
  runtime_registered: boolean;
  effective_executable: boolean;
};
type ModelEntry = {
  model_key: string;
  display_name: string;
  provider: string;
  status: string;
  cloud: boolean;
  metered_cost: boolean;
  effective_status?: string;
};
type CanvasWorkflow = { workflow_id: string; title: string; current_version: number; updated_at: string };

type CopilotActionKey =
  | "ANALYZE_PIECE"
  | "DRAFT_PROMPT"
  | "SCENE_PLAN"
  | "REFERENCE_NEEDS"
  | "COMPARE_OUTPUTS"
  | "DIAGNOSE_QA"
  | "REVISE_PROMPT"
  | "RETRY_DRAFT";

type CopilotDraft = {
  action: CopilotActionKey;
  title: string;
  summary: string;
  facts: string[];
  suggestions: string[];
  blockers: string[];
  handoff?: { label: string; path: string };
  draftText?: string;
};

const P2_API = "http://127.0.0.1:4179";
const sites = ref<Site[]>([]);
const currentSite = ref("drift-curio");
const summary = ref<Summary | null>(null);
const engineHealth = ref<EngineHealth | null>(null);
const jobs = ref<UnifiedJob[]>([]);
const assets = ref<LibraryAsset[]>([]);
const prompts = ref<PromptEntry[]>([]);
const workflows = ref<ProjectedWorkflow[]>([]);
const models = ref<ModelEntry[]>([]);
const canvasWorkflows = ref<CanvasWorkflow[]>([]);
const selectedItemId = ref("");
const selectedAction = ref<CopilotActionKey>("ANALYZE_PIECE");
const draft = ref<CopilotDraft | null>(null);
const loading = ref(true);
const error = ref("");
let pollTimer: number | undefined;

const actions: Array<{ key: CopilotActionKey; title: string; description: string; providerFree: boolean }> = [
  { key: "ANALYZE_PIECE", title: "Analyze Piece", description: "汇总 Exact Piece 当前已证明的 Source / Output / QA 真值。", providerFree: true },
  { key: "DRAFT_PROMPT", title: "Draft Prompt Skeleton", description: "生成约束化 Prompt 骨架；不会写入 Prompt Registry。", providerFree: true },
  { key: "SCENE_PLAN", title: "Create Scene Plan", description: "依据 Workflow Registry 给出场景计划与当前 blockers。", providerFree: true },
  { key: "REFERENCE_NEEDS", title: "Suggest Reference Needs", description: "只指出需要什么参考，不虚构或下载素材。", providerFree: true },
  { key: "COMPARE_OUTPUTS", title: "Compare Outputs", description: "比较已登记派生输出的 QA / Archive 状态。", providerFree: true },
  { key: "DIAGNOSE_QA", title: "Diagnose QA Failure", description: "定位最近 QA FAIL / FAILED 的已知原因。", providerFree: true },
  { key: "REVISE_PROMPT", title: "Revise Prompt Checklist", description: "输出修订检查表；无正式 Prompt 时不伪造完整改写。", providerFree: true },
  { key: "RETRY_DRAFT", title: "Create Retry Draft", description: "只创建重试建议，不调用 retry mutation。", providerFree: true },
];

const itemIds = computed(() => Array.from(new Set(assets.value.map((row) => row.item_id))).sort());
const itemAssets = computed(() => assets.value.filter((row) => row.item_id === selectedItemId.value));
const itemJobs = computed(() => jobs.value.filter((row) => row.item_id === selectedItemId.value).sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
const rawAssets = computed(() => itemAssets.value.filter((row) => row.role === "RAW_SOURCE"));
const generatedAssets = computed(() => itemAssets.value.filter((row) => row.role === "GENERATED_DERIVATIVE"));
const latestJob = computed(() => itemJobs.value[0] ?? null);
const latestFailedJob = computed(() => itemJobs.value.find((row) => row.generation_state === "FAILED" || row.qa_state === "QA_FAIL") ?? null);
const retryableJob = computed(() => itemJobs.value.find((row) => row.retryable) ?? null);
const effectiveWorkflows = computed(() => workflows.value.filter((row) => row.effective_executable));
const sceneWorkflows = computed(() => workflows.value.filter((row) => ["QA01", "QR01", "QP01", "QC01"].includes(row.code)));
const activeModels = computed(() => models.value.filter((row) => (row.effective_status ?? row.status) === "ACTIVE"));
const cloudDisabled = computed(() => summary.value ? !summary.value.cloud_cost.enabled : true);

function go(path: string) { window.location.assign(path); }

async function p2Fetch<T>(path: string): Promise<T> {
  const response = await fetch(`${P2_API}${path}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `HTTP_${response.status}`);
  return body as T;
}

async function loadSites() {
  sites.value = await fetch("/api/sites").then((response) => response.json()).catch(() => []);
  if (sites.value.length && !sites.value.some((site) => site.site_id === currentSite.value)) currentSite.value = sites.value[0].site_id;
}

async function refresh() {
  error.value = "";
  try {
    const site = encodeURIComponent(currentSite.value);
    const [summaryData, healthData, jobsData, assetsData, promptsData, workflowsData, modelsData, canvasData] = await Promise.all([
      p2Fetch<Summary>(`/api/v2/summary?site_id=${site}`),
      p2Fetch<EngineHealth>(`/api/v2/engines/health?site_id=${site}`),
      p2Fetch<{ jobs: UnifiedJob[] }>(`/api/v2/jobs?site_id=${site}`),
      p2Fetch<{ assets: LibraryAsset[] }>(`/api/v2/assets?site_id=${site}&limit=1000`),
      p2Fetch<{ prompts: PromptEntry[] }>(`/api/v2/registries/prompts?site_id=${site}`),
      p2Fetch<{ workflows: ProjectedWorkflow[] }>(`/api/v2/registries/workflows?site_id=${site}`),
      p2Fetch<{ models: ModelEntry[] }>(`/api/v2/registries/models?site_id=${site}`),
      p2Fetch<{ workflows: CanvasWorkflow[] }>(`/api/v2/canvas/workflows?site_id=${site}`),
    ]);
    summary.value = summaryData;
    engineHealth.value = healthData;
    jobs.value = jobsData.jobs ?? [];
    assets.value = assetsData.assets ?? [];
    prompts.value = promptsData.prompts ?? [];
    workflows.value = workflowsData.workflows ?? [];
    models.value = modelsData.models ?? [];
    canvasWorkflows.value = canvasData.workflows ?? [];
    if (!selectedItemId.value || !itemIds.value.includes(selectedItemId.value)) selectedItemId.value = itemIds.value[0] ?? "";
    runAction(selectedAction.value);
  } catch (caught: any) {
    error.value = caught?.message ?? String(caught);
  } finally {
    loading.value = false;
  }
}

function formatTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function runAction(action: CopilotActionKey) {
  selectedAction.value = action;
  if (!selectedItemId.value) {
    draft.value = {
      action,
      title: "No Exact Piece context",
      summary: "当前 Asset projection 中没有可选择的 Item。Copilot 不会猜测 SKU。",
      facts: [],
      suggestions: ["先从 Production Pieces / Piece Assets 建立或确认真实资产引用。"],
      blockers: ["NO_ITEM_CONTEXT"],
      handoff: { label: "Open Piece Assets", path: "/v2/assets" },
    };
    return;
  }

  const item = selectedItemId.value;
  const raw = rawAssets.value;
  const generated = generatedAssets.value;
  const latest = latestJob.value;
  const failed = latestFailedJob.value;
  const sceneEffective = sceneWorkflows.value.filter((row) => row.effective_executable);

  if (action === "ANALYZE_PIECE") {
    draft.value = {
      action,
      title: `Piece analysis · ${item}`,
      summary: `当前只基于 V2 read-only projections 汇总 ${item}；不读取未登记磁盘内容，也不推断缺失 provenance。`,
      facts: [
        `RAW Source: ${raw.length}`,
        `Generated derivatives: ${generated.length}`,
        `Jobs: ${itemJobs.value.length}`,
        `Latest Generation: ${latest?.generation_state ?? "NO_JOB"}`,
        `Latest QA: ${latest?.qa_state ?? "NO_QA"}`,
        `Latest Archive projection: ${latest?.archive_state ?? "NO_ARCHIVE_PROJECTION"}`,
      ],
      suggestions: [
        raw.length ? "保留 RAW/source immutable；后续所有生成继续作为 derivative。" : "缺少 journal-referenced RAW source；先补真实源资产。",
        generated.some((row) => row.qa_state === "QA_PASS") ? "已有 QA PASS derivative，但仍只可视为 STAGING，不能推断正式归档。" : "尚无 QA PASS derivative；优先完成可验证输出。",
      ],
      blockers: raw.length ? [] : ["RAW_SOURCE_NOT_PROVEN"],
      handoff: { label: "Open Piece Assets", path: "/v2/assets" },
    };
    return;
  }

  if (action === "DRAFT_PROMPT") {
    const skeleton = [
      `[Exact Piece] ${item}`,
      `Preserve exact-piece geometry, branch count, holes, silhouette and identifiable surface features.`,
      `[Source] Use only proven RAW/source or verified derivatives as declared by the selected workflow.`,
      `[Scene] <describe environment and composition>`,
      `[Camera] <focal length / angle / crop>`,
      `[Lighting] <direction / softness / color temperature>`,
      `[Integration] Maintain physically plausible contact, shadow, water/material interaction and scale.`,
      `[Negative] no geometry drift; no extra branches; no removed holes; no identity substitution; no unreadable evidence text.`,
      `[Authority] DRAFT ONLY — requires Prompt Registry review and workflow compatibility before production use.`,
    ].join("\n");
    draft.value = {
      action,
      title: `Prompt skeleton · ${item}`,
      summary: "这是 deterministic skeleton，不是模型生成结果，也不会写入 Prompt Registry。",
      facts: [`Registered prompts visible to site: ${prompts.value.length}`, `RAW Source: ${raw.length}`, `Active models: ${activeModels.value.length}`],
      suggestions: ["补齐 Scene / Camera / Lighting 后再进行人工审查。", "正式使用前绑定兼容 Workflow / Model，并保留 Exact Piece constraints。"],
      blockers: prompts.value.length ? [] : ["NO_REVIEWED_PROMPT_REGISTRY_ENTRY"],
      draftText: skeleton,
      handoff: { label: "Open Prompt Library", path: "/v2/prompts" },
    };
    return;
  }

  if (action === "SCENE_PLAN") {
    draft.value = {
      action,
      title: `Scene plan · ${item}`,
      summary: sceneEffective.length
        ? "已存在 effective scene workflow，可继续做输入/Prompt/Engine truth check。"
        : "Scene workflows 目前未形成 effective executable capability，因此只输出计划，不提交任务。",
      facts: [
        `Scene registry entries: ${sceneWorkflows.value.length}`,
        `Effective scene workflows: ${sceneEffective.map((row) => row.code).join(", ") || "none"}`,
        `Prompt Registry entries: ${prompts.value.length}`,
        `Engine overall: ${engineHealth.value?.overall ?? "UNKNOWN"}`,
      ],
      suggestions: [
        "1. 选择/验证 Exact Piece source。",
        "2. 使用已审核 Prompt Template 或先建立 draft skeleton。",
        "3. 核对 scene workflow 的 site_enabled + runtime_registered + effective_executable。",
        "4. 本地生成后进入独立 QA / Human Visual Gate。",
        "5. QA PASS 仍只进入 STAGING，等待 formal archive authority。",
      ],
      blockers: sceneEffective.length ? [] : ["SCENE_WORKFLOW_NOT_EFFECTIVE"],
      handoff: { label: "Open Scene Generation", path: "/v2/production/scene" },
    };
    return;
  }

  if (action === "REFERENCE_NEEDS") {
    draft.value = {
      action,
      title: `Reference needs · ${item}`,
      summary: "V2-G 不虚构 reference，也不联网抓取素材。这里只给出当前任务可能需要补齐的 reference 类型。",
      facts: [`Reference Library route: deferred`, `Material Board route: deferred`, `Current canvas drafts: ${canvasWorkflows.value.length}`],
      suggestions: [
        "优先准备材质/光照 reference，而不是完整 donor scene，降低复制痕迹。",
        "Aquarium：补水体散射、植物密度、底床颗粒尺度、鱼体尺度 reference。",
        "所有 reference 必须是 context-only，不能替代 Exact Piece identity。",
      ],
      blockers: ["REFERENCE_LIBRARY_NOT_BOUND", "MATERIAL_BOARD_LIBRARY_NOT_BOUND"],
      handoff: { label: "Open Creation Canvas", path: "/v2/canvas" },
    };
    return;
  }

  if (action === "COMPARE_OUTPUTS") {
    const passed = generated.filter((row) => row.qa_state === "QA_PASS").length;
    const failedCount = generated.filter((row) => row.qa_state === "QA_FAIL").length;
    const pending = generated.filter((row) => row.qa_state === "QA_PENDING").length;
    draft.value = {
      action,
      title: `Output comparison · ${item}`,
      summary: generated.length ? "按已登记 derivative 的 QA / Archive 投影比较；不根据文件名猜测视觉质量。" : "当前没有已登记 generated derivative 可比较。",
      facts: [`Generated: ${generated.length}`, `QA PASS: ${passed}`, `QA FAIL: ${failedCount}`, `QA PENDING: ${pending}`],
      suggestions: generated.length > 1 ? ["进入 Human Visual Gate 进行视觉对比；Copilot 不代替人工视觉判定。"] : ["至少需要两个已登记候选，才有有意义的横向比较。"],
      blockers: generated.length > 1 ? [] : ["INSUFFICIENT_REGISTERED_OUTPUTS"],
      handoff: { label: "Open Human Visual Gate", path: "/qa" },
    };
    return;
  }

  if (action === "DIAGNOSE_QA") {
    draft.value = {
      action,
      title: `QA diagnosis · ${item}`,
      summary: failed ? "找到最近一个失败/QA FAIL 记录；以下仅复述 durable job truth 与保守诊断。" : "当前没有失败/QA FAIL 记录，Copilot 不制造失败原因。",
      facts: failed ? [
        `Job: ${failed.job_id}`,
        `Workflow: ${failed.workflow_code}`,
        `Generation: ${failed.generation_state}`,
        `QA: ${failed.qa_state}`,
        `QA note: ${failed.qa_note || "none recorded"}`,
        `Error: ${failed.error || "none recorded"}`,
      ] : [],
      suggestions: failed ? [
        "先确认失败是 runtime/capture 还是 identity/visual QA；不要用 Prompt 修复基础运行错误。",
        "若属于 identity drift，优先收紧 source/cutout/geometry constraints，而不是继续抽卡。",
      ] : ["无需 QA failure diagnosis；可转到 Analyze Piece 或 Compare Outputs。"],
      blockers: failed ? [] : ["NO_RECORDED_QA_FAILURE"],
      handoff: { label: "Open Failed / Retry", path: "/v2/jobs/failed" },
    };
    return;
  }

  if (action === "REVISE_PROMPT") {
    draft.value = {
      action,
      title: `Prompt revision checklist · ${item}`,
      summary: "当前只生成修订检查表；没有审核过的 Prompt body 时不会伪造“修订后正式 Prompt”。",
      facts: [`Registered prompts: ${prompts.value.length}`, `Latest QA: ${latest?.qa_state ?? "NO_QA"}`, `Latest workflow: ${latest?.workflow_code ?? "NO_JOB"}`],
      suggestions: [
        "Identity：明确禁止新增/删除枝杈、孔洞、轮廓与关键纹理漂移。",
        "Composition：把环境设计与主体身份约束拆开描述。",
        "Lighting：定义主光方向、软硬度与环境反射，避免靠重绘主体获得融合。",
        "Physics：补接触阴影、浸水/干燥状态、尺度关系与材质响应。",
        "Negative：移除互相冲突的风格指令，避免同时要求写实与强风格化。",
      ],
      blockers: prompts.value.length ? [] : ["NO_REVIEWED_PROMPT_BODY_TO_REVISE"],
      handoff: { label: "Open Prompt Library", path: "/v2/prompts" },
    };
    return;
  }

  const retry = retryableJob.value;
  draft.value = {
    action,
    title: `Retry draft · ${item}`,
    summary: retry ? "已定位可重试 job；此处只形成 handoff，不调用 retry mutation。" : "当前没有 retryable job。",
    facts: retry ? [`Job: ${retry.job_id}`, `Workflow: ${retry.workflow_code}`, `Generation: ${retry.generation_state}`, `QA: ${retry.qa_state}`] : [],
    suggestions: retry ? ["进入 Failed / Retry，人工确认后由 V2-C 既有 mutation 创建新 job；原记录保持不变。"] : ["不要为了测试 Copilot 人工制造失败任务。"],
    blockers: retry ? [] : ["NO_RETRYABLE_JOB"],
    handoff: { label: "Open Failed / Retry", path: "/v2/jobs/failed" },
  };
}

async function copyDraft() {
  if (!draft.value) return;
  const text = [draft.value.title, draft.value.summary, ...draft.value.facts, ...draft.value.suggestions, ...draft.value.blockers.map((row) => `BLOCKER: ${row}`), draft.value.draftText ?? ""].filter(Boolean).join("\n");
  await navigator.clipboard?.writeText(text).catch(() => undefined);
}

watch(currentSite, () => void refresh());
watch(selectedItemId, () => runAction(selectedAction.value));
onMounted(async () => {
  await loadSites();
  await refresh();
  pollTimer = window.setInterval(() => void refresh(), 20_000);
});
onUnmounted(() => { if (pollTimer) window.clearInterval(pollTimer); });
</script>

<template>
  <div class="v2-shell v2g-shell">
    <aside class="v2-sidebar">
      <div class="v2-brand"><div class="v2-brand-mark">VC</div><div><strong>Visual Console</strong><span>V2 · LOCAL FIRST</span></div></div>
      <button class="v2-dashboard-link" @click="go('/v2')"><span class="v2-nav-icon">⌂</span><span>首页</span></button>
      <div class="v2-nav-scroll">
        <section class="v2-nav-group"><h4>生产 PRODUCTION</h4><button class="v2-nav-item" @click="go('/workspace')"><span>Production Pieces</span><span class="v2-nav-arrow">›</span></button><button class="v2-nav-item" @click="go('/v2/production/image')"><span>Image Generation</span><span class="v2-nav-arrow">›</span></button><button class="v2-nav-item" @click="go('/v2/production/scene')"><span>Scene Generation</span><span class="v2-nav-arrow">›</span></button><button class="v2-nav-item" @click="go('/v2/production/batch')"><span>Batch Generation</span><span class="v2-nav-arrow">›</span></button><button class="v2-nav-item" @click="go('/v2/canvas')"><span>Creation Canvas</span><span class="v2-nav-arrow">›</span></button><button class="v2-nav-item active"><span>Visual Copilot</span><b>LOCAL</b></button></section>
        <section class="v2-nav-group"><h4>任务 JOBS</h4><button class="v2-nav-item" @click="go('/v2/jobs')"><span>任务队列</span><b>{{ summary?.system.queue_depth ?? 0 }}</b></button><button class="v2-nav-item" @click="go('/v2/jobs/history')"><span>任务历史</span><span class="v2-nav-arrow">›</span></button><button class="v2-nav-item" @click="go('/v2/jobs/failed')"><span>失败 / 重试</span><b>{{ summary?.generation.failed ?? 0 }}</b></button></section>
        <section class="v2-nav-group"><h4>质量 QUALITY</h4><button class="v2-nav-item" @click="go('/qa')"><span>Human Visual Gate</span><b>{{ summary?.qa.pending ?? 0 }}</b></button></section>
        <section class="v2-nav-group"><h4>资产 ASSETS</h4><button class="v2-nav-item" @click="go('/v2/assets')"><span>Piece Assets</span><b>{{ assets.length }}</b></button><button class="v2-nav-item" @click="go('/v2/prompts')"><span>Prompt Library</span><span class="v2-nav-arrow">›</span></button></section>
        <section class="v2-nav-group"><h4>证据 EVIDENCE</h4><button class="v2-nav-item" @click="go('/assets')"><span>Archive</span><span class="v2-nav-arrow">›</span></button></section>
        <section class="v2-nav-group"><h4>系统 SYSTEM</h4><button class="v2-nav-item" @click="go('/v2/system')"><span>ComfyUI / Local Engines</span><span class="v2-nav-arrow">›</span></button><button class="v2-nav-item" @click="go('/v2/models')"><span>Model Registry</span><span class="v2-nav-arrow">›</span></button><button class="v2-nav-item" @click="go('/v2/workflows')"><span>Workflow Registry</span><span class="v2-nav-arrow">›</span></button></section>
      </div>
      <div class="v2-sidebar-footer"><label>Site Profile</label><select v-model="currentSite"><option v-for="site in sites" :key="site.site_id" :value="site.site_id">{{ site.display_name_zh || site.display_name }}</option></select><div class="v2-runtime-mini"><span><i :class="{ online: Boolean(summary) }"></i> Core API</span><span><i :class="{ online: summary?.system.comfyui === 'ONLINE' }"></i> ComfyUI</span></div></div>
    </aside>

    <main class="v2-main">
      <header class="v2-monitor">
        <div class="v2-today"><span>TODAY</span><b>{{ summary?.day_key ?? '—' }}</b></div>
        <div class="v2-monitor-group"><strong>生成</strong><span>待生成 <b>{{ summary?.generation.queued ?? 0 }}</b></span><span class="warm">生成中 <b>{{ summary?.generation.running ?? 0 }}</b></span><span class="good">已完成 <b>{{ summary?.generation.completed ?? 0 }}</b></span><span class="bad">失败 <b>{{ summary?.generation.failed ?? 0 }}</b></span></div>
        <div class="v2-monitor-group"><strong>QA</strong><span>待审核 <b>{{ summary?.qa.pending ?? 0 }}</b></span><span class="good">通过 <b>{{ summary?.qa.passed ?? 0 }}</b></span><span class="bad">拒绝 <b>{{ summary?.qa.rejected ?? 0 }}</b></span></div>
        <div class="v2-monitor-group compact"><strong>归档</strong><span>Staging <b>{{ summary?.archive.staging ?? 0 }}</b></span><span>待归档 <b>{{ summary?.archive.ready ?? 0 }}</b></span><span class="good">今日归档 <b>{{ summary?.archive.archived ?? 0 }}</b></span></div>
        <div class="v2-monitor-group compact system"><strong>系统</strong><span :class="engineHealth?.overall === 'READY' ? 'good' : 'bad'">● {{ engineHealth?.overall ?? 'UNKNOWN' }}</span><span>{{ summary?.system.worker === 'BUSY' ? 'Worker 忙碌' : 'Worker 空闲' }}</span><span>Queue <b>{{ summary?.system.queue_depth ?? 0 }}</b></span></div>
        <div class="v2-cloud-pill"><span>CLOUD COST</span><b>{{ cloudDisabled ? '未启用' : `${summary?.cloud_cost.currency} ${summary?.cloud_cost.today.toFixed(2)}` }}</b></div>
      </header>

      <div class="v2-toolbar"><div class="v2-tabs"><button @click="go('/v2')">首页</button><button @click="go('/workspace')">Production Pieces</button><button @click="go('/v2/canvas')">Creation Canvas</button><button class="active">Visual Copilot <span>×</span></button></div><div class="v2-search-wrap"><div class="v2-search"><span>⌕</span><input :value="selectedItemId" readonly placeholder="Exact Piece context"/><kbd>V2-G</kbd></div></div></div>

      <section class="v2g-content">
        <div class="v2g-head">
          <div><span class="v2-eyebrow">V2-G · VISUAL COPILOT</span><h1>Visual Copilot</h1><p>Local Context Advisor：读取现有真值、输出 draft/suggestion；不假装存在尚未接入的 AI Provider。</p></div>
          <div class="v2g-badges"><span>LOCAL RULES</span><span>READ ONLY</span><span>$0 PROVIDER COST</span></div>
        </div>

        <div v-if="error" class="v2-alert"><b>Copilot context 暂不可用</b><span>{{ error }}</span></div>

        <div class="v2g-contextbar">
          <div><label>Exact Piece</label><select v-model="selectedItemId"><option v-if="!itemIds.length" value="">No item context</option><option v-for="item in itemIds" :key="item" :value="item">{{ item }}</option></select></div>
          <article><span>RAW</span><b>{{ rawAssets.length }}</b></article>
          <article><span>Generated</span><b>{{ generatedAssets.length }}</b></article>
          <article><span>Jobs</span><b>{{ itemJobs.length }}</b></article>
          <article><span>Scene Effective</span><b>{{ sceneWorkflows.filter((row) => row.effective_executable).length }}</b></article>
          <article><span>Prompts</span><b>{{ prompts.length }}</b></article>
          <article><span>Canvas Drafts</span><b>{{ canvasWorkflows.length }}</b></article>
        </div>

        <div class="v2g-grid">
          <aside class="v2g-actions">
            <div class="v2g-section-title"><div><span>01 · ACTIONS</span><h2>What should Copilot do?</h2></div><b>NO PROVIDER</b></div>
            <button v-for="action in actions" :key="action.key" :class="{ active: selectedAction === action.key }" @click="runAction(action.key)"><div><strong>{{ action.title }}</strong><span>{{ action.description }}</span></div><em>→</em></button>
          </aside>

          <article class="v2g-draft">
            <div class="v2g-section-title"><div><span>02 · DRAFT OUTPUT</span><h2>{{ draft?.title ?? 'Select an action' }}</h2></div><button @click="copyDraft">Copy</button></div>
            <template v-if="draft">
              <p class="v2g-summary">{{ draft.summary }}</p>
              <div class="v2g-columns">
                <section><h3>Known facts</h3><ul><li v-for="fact in draft.facts" :key="fact">{{ fact }}</li><li v-if="!draft.facts.length" class="muted">No proven facts for this action.</li></ul></section>
                <section><h3>Suggested next steps</h3><ul><li v-for="suggestion in draft.suggestions" :key="suggestion">{{ suggestion }}</li></ul></section>
              </div>
              <section v-if="draft.draftText" class="v2g-text-draft"><h3>Draft text</h3><pre>{{ draft.draftText }}</pre></section>
              <section class="v2g-blockers"><h3>Blockers / unknowns</h3><div v-if="draft.blockers.length"><span v-for="blocker in draft.blockers" :key="blocker">{{ blocker }}</span></div><p v-else>No blocking unknown recorded for this draft.</p></section>
              <div class="v2g-handoff" v-if="draft.handoff"><div><span>Handoff</span><b>{{ draft.handoff.label }}</b></div><button @click="go(draft.handoff.path)">Open →</button></div>
            </template>
            <div v-else class="v2g-empty">Select a local action. No model call will be made.</div>
          </article>

          <aside class="v2g-guard">
            <div class="v2g-section-title"><div><span>03 · AUTHORITY GUARD</span><h2>Draft only</h2></div><b>LOCKED</b></div>
            <div class="v2g-guard-card"><span>Authority</span><strong>DRAFT_SUGGESTION_ONLY</strong><p>Copilot output is advisory context. It is not Registry truth, QA truth, archive truth or an execution command.</p></div>
            <ul>
              <li><i>✓</i><div><b>Provider cost</b><span>$0 · no external model call</span></div></li>
              <li><i>✓</i><div><b>RAW/source</b><span>read only · immutable</span></div></li>
              <li><i>✓</i><div><b>Jobs</b><span>no submit / no retry mutation</span></div></li>
              <li><i>✓</i><div><b>Human Gate</b><span>cannot self-approve</span></div></li>
              <li><i>✓</i><div><b>Archive</b><span>cannot promote formal state</span></div></li>
              <li><i>✓</i><div><b>Cloud</b><span>disabled / fail closed</span></div></li>
            </ul>
            <div class="v2g-context-proof"><span>Context proof</span><b>{{ selectedItemId || 'NO_ITEM' }}</b><small>latest {{ formatTime(latestJob?.updated_at) }} · {{ effectiveWorkflows.length }} effective workflow(s) · {{ activeModels.length }} active model(s)</small></div>
          </aside>
        </div>

        <footer class="v2g-footer"><span>V2-G preview: deterministic local advice only.</span><span>Provider-backed Copilot requires explicit adapter + Cost Guard in a later gate.</span></footer>
      </section>
    </main>
  </div>
</template>
