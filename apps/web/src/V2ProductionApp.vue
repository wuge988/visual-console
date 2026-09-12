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
type EngineHealth = {
  ok: boolean;
  overall: "READY" | "DEGRADED";
  engines: {
    local_renderer: { status: string; workflow_codes?: string[] };
    comfyui: { status: "ONLINE" | "OFFLINE"; required_by_current_workflows: boolean; queue_running: number; queue_pending: number };
    cloud: { status: "DISABLED"; fail_closed: boolean; reason: string };
  };
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
  workflow_codes: string[];
  related_job_ids: string[];
  qa_state?: string;
  archive_state?: string;
};
type AssetsResponse = { ok: boolean; total: number; assets: LibraryAsset[] };
type PromptEntry = {
  prompt_key: string;
  version: string;
  display_name: string;
  scene_type: string;
  status: string;
  compatible_workflows: string[];
  compatible_models: string[];
  tags: string[];
};
type PromptResponse = { ok: boolean; total: number; prompts: PromptEntry[] };
type ModelEntry = {
  model_key: string;
  display_name: string;
  provider: string;
  media_type: string;
  workflow_codes: string[];
  active_workflow_codes?: string[];
  effective_status?: string;
  status: string;
  cloud: boolean;
  metered_cost: boolean;
};
type ModelsResponse = { ok: boolean; models: ModelEntry[] };
type ComposerSurface = "IMAGE" | "SCENE" | "BATCH";
type ProductionCapability = {
  workflow_code: string;
  display_name: string;
  mode: string;
  surfaces: ComposerSurface[];
  execution_engine: string;
  required_source_role: string;
  prompt_required: boolean;
  max_batch: number;
  effective_executable: boolean;
  submission_adapter: string | null;
  submit_path: string | null;
  source_projection: string;
  block_reason: string | null;
  cost: { cloud: false; currency: "USD"; estimated_amount: 0; basis: string };
};
type CapabilityResponse = {
  ok: boolean;
  site_id: string;
  source: string;
  cloud_enabled: boolean;
  cloud_fail_closed: boolean;
  capabilities: ProductionCapability[];
};

const P2_API = "http://127.0.0.1:4179";
const sites = ref<Site[]>([]);
const currentSite = ref("drift-curio");
const currentPath = ref(window.location.pathname);
const summary = ref<Summary | null>(null);
const engineHealth = ref<EngineHealth | null>(null);
const assetsResponse = ref<AssetsResponse | null>(null);
const promptResponse = ref<PromptResponse | null>(null);
const modelsResponse = ref<ModelsResponse | null>(null);
const capabilityResponse = ref<CapabilityResponse | null>(null);
const loading = ref(true);
const error = ref("");
const submitMessage = ref("");
const submitting = ref(false);
const currentSku = ref("");
const selectedWorkflowCode = ref("");
const selectedAssetIds = ref<string[]>([]);
const selectedPromptKey = ref("");
let pollTimer: number | undefined;

const surface = computed<ComposerSurface>(() => {
  if (currentPath.value.startsWith("/v2/production/scene")) return "SCENE";
  if (currentPath.value.startsWith("/v2/production/batch")) return "BATCH";
  return "IMAGE";
});

const pageTitle = computed(() => ({ IMAGE: "Image Generation", SCENE: "Scene Generation", BATCH: "Batch Generation" })[surface.value]);
const pageDescription = computed(() => ({
  IMAGE: "单件视觉任务 Composer：先验证 Exact Piece、Workflow、Engine 与成本，再创建任务。",
  SCENE: "场景生成只展示当前真实可执行能力；未注册 Scene Workflow 时保持阻断，不静默切换云模型。",
  BATCH: "同一 SKU 的批量任务 Composer；首批只复用现有 SC01 authoritative batch mutation。",
})[surface.value]);

const allAssets = computed(() => assetsResponse.value?.assets ?? []);
const rawAssets = computed(() => allAssets.value.filter((row) => row.role === "RAW_SOURCE" && row.media_type === "image"));
const skuOptions = computed(() => [...new Set(rawAssets.value.map((row) => row.item_id))].sort());
const skuAssets = computed(() => rawAssets.value.filter((row) => row.item_id === currentSku.value));
const capabilities = computed(() => (capabilityResponse.value?.capabilities ?? []).filter((row) => row.surfaces.includes(surface.value)));
const selectedCapability = computed(() => capabilities.value.find((row) => row.workflow_code === selectedWorkflowCode.value) ?? capabilities.value[0] ?? null);
const models = computed(() => modelsResponse.value?.models ?? []);
const compatibleModels = computed(() => {
  const code = selectedCapability.value?.workflow_code;
  if (!code) return [];
  return models.value.filter((row) => row.workflow_codes.includes(code));
});
const prompts = computed(() => promptResponse.value?.prompts ?? []);
const compatiblePrompts = computed(() => {
  const code = selectedCapability.value?.workflow_code;
  if (!code) return [];
  return prompts.value.filter((row) => row.compatible_workflows.length === 0 || row.compatible_workflows.includes(code));
});
const selectedPrompt = computed(() => compatiblePrompts.value.find((row) => `${row.prompt_key}@${row.version}` === selectedPromptKey.value) ?? null);

const selectedAssets = computed(() => skuAssets.value.filter((row) => selectedAssetIds.value.includes(row.asset_id)));
const selectedCount = computed(() => selectedAssets.value.length);
const comfyOnline = computed(() => engineHealth.value?.engines.comfyui.status === "ONLINE");
const engineReady = computed(() => {
  const engine = selectedCapability.value?.execution_engine;
  if (!engine) return false;
  if (engine === "COMFYUI") return comfyOnline.value;
  if (engine === "LOCAL_RENDERER") return engineHealth.value?.engines.local_renderer.status === "ONLINE";
  return false;
});
const promptReady = computed(() => {
  if (!selectedCapability.value?.prompt_required) return true;
  return Boolean(selectedPrompt.value);
});
const sourceReady = computed(() => {
  if (surface.value === "SCENE") return false;
  if (surface.value === "IMAGE") return selectedCount.value === 1;
  return selectedCount.value >= 1 && selectedCount.value <= (selectedCapability.value?.max_batch ?? 0);
});
const adapterReady = computed(() => Boolean(selectedCapability.value?.submission_adapter && selectedCapability.value?.submit_path));
const canSubmit = computed(() => Boolean(
  selectedCapability.value?.effective_executable &&
  adapterReady.value &&
  sourceReady.value &&
  promptReady.value &&
  engineReady.value &&
  !capabilityResponse.value?.cloud_enabled,
));

const blockReason = computed(() => {
  const capability = selectedCapability.value;
  if (!capability) return "当前页面没有匹配的 Workflow capability。";
  if (capability.block_reason) return blockReasonText(capability.block_reason);
  if (!sourceReady.value) {
    if (surface.value === "SCENE") return "Scene Composer 需要 VERIFIED_CUTOUT source projection；当前尚未绑定。";
    if (surface.value === "IMAGE") return "请选择 1 张当前 SKU 的 RAW Source。";
    return `请选择 1–${capability.max_batch} 张同一 SKU 的 RAW Source。`;
  }
  if (!promptReady.value) return "该 Workflow 要求 Prompt，但当前未选择兼容的 Prompt Registry entry。";
  if (!engineReady.value) return `${capability.execution_engine} 当前不可用；V2-E 不会静默切换到 Cloud。`;
  if (!adapterReady.value) return "当前 Workflow 没有已批准的 Composer submission adapter。";
  return "";
});

const validationRows = computed(() => [
  { label: "Exact Piece / Source", ok: sourceReady.value, value: sourceReady.value ? `${currentSku.value} · ${selectedCount.value} source` : "未满足" },
  { label: "Prompt", ok: promptReady.value, value: selectedCapability.value?.prompt_required ? (selectedPrompt.value?.display_name ?? "Required") : "Not required" },
  { label: "Workflow", ok: Boolean(selectedCapability.value?.effective_executable && !selectedCapability.value?.block_reason), value: selectedCapability.value?.workflow_code ?? "—" },
  { label: "Engine", ok: engineReady.value, value: selectedCapability.value?.execution_engine ?? "—" },
  { label: "Cost Guard", ok: capabilityResponse.value?.cloud_enabled === false, value: "Local $0 · Cloud disabled" },
  { label: "Submission Adapter", ok: adapterReady.value, value: selectedCapability.value?.submission_adapter ?? "Not bound" },
]);

function blockReasonText(value: string) {
  const map: Record<string, string> = {
    WORKFLOW_NOT_EFFECTIVELY_EXECUTABLE: "Workflow 尚未同时满足 Site enablement 与 runtime registration。",
    VERIFIED_CUTOUT_PROJECTION_NOT_BOUND: "该 Workflow 需要 VERIFIED_CUTOUT，但 V2-E 首批尚未绑定 formal source projection。",
    SCENE_SUBMISSION_ADAPTER_NOT_BOUND: "Scene Workflow 尚未绑定可审计的 submission adapter。",
    COMPOSER_ADAPTER_NOT_IMPLEMENTED: "该 Workflow 尚未实现 Composer adapter。",
  };
  return map[value] ?? value;
}

function routeSurface(next: ComposerSurface) {
  const path = next === "SCENE" ? "/v2/production/scene" : next === "BATCH" ? "/v2/production/batch" : "/v2/production/image";
  if (window.location.pathname !== path) window.history.pushState({}, "", path);
  currentPath.value = path;
  resetSelections();
  window.scrollTo({ top: 0, behavior: "auto" });
}

function go(path: string) {
  window.location.assign(path);
}

async function p2Fetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${P2_API}${path}`, init);
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
    const [summaryData, healthData, assetData, promptsData, modelsData, capabilityData] = await Promise.all([
      p2Fetch<Summary>(`/api/v2/summary?site_id=${site}`),
      p2Fetch<EngineHealth>(`/api/v2/engines/health?site_id=${site}`),
      p2Fetch<AssetsResponse>(`/api/v2/assets?site_id=${site}&limit=1000`),
      p2Fetch<PromptResponse>(`/api/v2/registries/prompts?site_id=${site}`),
      p2Fetch<ModelsResponse>(`/api/v2/registries/models?site_id=${site}`),
      p2Fetch<CapabilityResponse>(`/api/v2/production/capabilities?site_id=${site}`),
    ]);
    summary.value = summaryData;
    engineHealth.value = healthData;
    assetsResponse.value = assetData;
    promptResponse.value = promptsData;
    modelsResponse.value = modelsData;
    capabilityResponse.value = capabilityData;
    normalizeSelections();
  } catch (caught: any) {
    error.value = caught?.message ?? String(caught);
  } finally {
    loading.value = false;
  }
}

function normalizeSelections() {
  if (!skuOptions.value.includes(currentSku.value)) currentSku.value = skuOptions.value[0] ?? "";
  if (!capabilities.value.some((row) => row.workflow_code === selectedWorkflowCode.value)) {
    selectedWorkflowCode.value = capabilities.value.find((row) => row.submission_adapter)?.workflow_code ?? capabilities.value[0]?.workflow_code ?? "";
  }
  const availableIds = new Set(skuAssets.value.map((row) => row.asset_id));
  selectedAssetIds.value = selectedAssetIds.value.filter((id) => availableIds.has(id));
  if (surface.value === "IMAGE" && selectedAssetIds.value.length !== 1 && skuAssets.value[0]) selectedAssetIds.value = [skuAssets.value[0].asset_id];
  if (surface.value === "SCENE") selectedAssetIds.value = [];
  if (!compatiblePrompts.value.some((row) => `${row.prompt_key}@${row.version}` === selectedPromptKey.value)) selectedPromptKey.value = "";
}

function resetSelections() {
  submitMessage.value = "";
  selectedAssetIds.value = [];
  selectedWorkflowCode.value = "";
  selectedPromptKey.value = "";
  normalizeSelections();
}

function chooseAsset(assetId: string) {
  submitMessage.value = "";
  if (surface.value === "IMAGE") {
    selectedAssetIds.value = [assetId];
    return;
  }
  if (surface.value !== "BATCH") return;
  if (selectedAssetIds.value.includes(assetId)) selectedAssetIds.value = selectedAssetIds.value.filter((id) => id !== assetId);
  else if (selectedAssetIds.value.length < (selectedCapability.value?.max_batch ?? 20)) selectedAssetIds.value = [...selectedAssetIds.value, assetId];
}

function selectAllForSku() {
  if (surface.value !== "BATCH") return;
  const max = selectedCapability.value?.max_batch ?? 20;
  selectedAssetIds.value = skuAssets.value.slice(0, max).map((row) => row.asset_id);
}

async function submit() {
  const capability = selectedCapability.value;
  if (!canSubmit.value || !capability?.submit_path) return;
  const assetIds = surface.value === "IMAGE" ? selectedAssetIds.value.slice(0, 1) : selectedAssetIds.value;
  const accepted = window.confirm(
    `创建 ${capability.workflow_code} ${surface.value === "BATCH" ? "批量" : "单件"}任务？\n\nSKU: ${currentSku.value}\nSource: ${assetIds.length}\nEngine: ${capability.execution_engine}\nCloud: DISABLED`,
  );
  if (!accepted) return;
  submitting.value = true;
  submitMessage.value = "";
  try {
    const result = await p2Fetch<{ ok: boolean; jobs: Array<{ job_id: string }> }>(capability.submit_path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        site_id: currentSite.value,
        item_id: currentSku.value,
        workflow_code: capability.workflow_code,
        asset_ids: assetIds,
      }),
    });
    submitMessage.value = `已通过 authoritative P2 queue 创建 ${result.jobs.length} 个任务。`;
    await refresh();
  } catch (caught: any) {
    submitMessage.value = `创建失败：${caught?.message ?? String(caught)}`;
  } finally {
    submitting.value = false;
  }
}

function handlePopstate() {
  currentPath.value = window.location.pathname;
  resetSelections();
}

watch(currentSite, () => {
  currentSku.value = "";
  resetSelections();
  void refresh();
});
watch(currentSku, () => {
  selectedAssetIds.value = [];
  normalizeSelections();
});
watch(selectedWorkflowCode, () => {
  selectedPromptKey.value = "";
  if (surface.value === "IMAGE") normalizeSelections();
});

onMounted(async () => {
  window.addEventListener("popstate", handlePopstate);
  await loadSites();
  await refresh();
  pollTimer = window.setInterval(() => void refresh(), 10_000);
});
onUnmounted(() => {
  window.removeEventListener("popstate", handlePopstate);
  if (pollTimer) window.clearInterval(pollTimer);
});
</script>

<template>
  <div class="v2-shell">
    <aside class="v2-sidebar">
      <div class="v2-brand"><div class="v2-brand-mark">VC</div><div><strong>Visual Console</strong><span>V2 · LOCAL FIRST</span></div></div>
      <button class="v2-dashboard-link active-soft" @click="go('/v2')"><span class="v2-nav-icon">⌂</span><span>首页</span></button>
      <div class="v2-nav-scroll">
        <section class="v2-nav-group">
          <h4>生产 PRODUCTION</h4>
          <button class="v2-nav-item" @click="go('/workspace')"><span>Production Pieces</span><span class="v2-nav-arrow">›</span></button>
          <button class="v2-nav-item" :class="{ active: surface === 'IMAGE' }" @click="routeSurface('IMAGE')"><span>Image Generation</span><span class="v2-nav-arrow">›</span></button>
          <button class="v2-nav-item" :class="{ active: surface === 'SCENE' }" @click="routeSurface('SCENE')"><span>Scene Generation</span><span class="v2-nav-arrow">›</span></button>
          <button class="v2-nav-item" :class="{ active: surface === 'BATCH' }" @click="routeSurface('BATCH')"><span>Batch Generation</span><span class="v2-nav-arrow">›</span></button>
        </section>
        <section class="v2-nav-group"><h4>任务 JOBS</h4><button class="v2-nav-item" @click="go('/v2/jobs')"><span>任务队列</span><b>{{ summary?.system.queue_depth ?? 0 }}</b></button><button class="v2-nav-item" @click="go('/v2/jobs/history')"><span>任务历史</span><span class="v2-nav-arrow">›</span></button><button class="v2-nav-item" @click="go('/v2/jobs/failed')"><span>失败 / 重试</span><b>{{ summary?.generation.failed ?? 0 }}</b></button></section>
        <section class="v2-nav-group"><h4>质量 QUALITY</h4><button class="v2-nav-item" @click="go('/qa')"><span>Human Visual Gate</span><b>{{ summary?.qa.pending ?? 0 }}</b></button></section>
        <section class="v2-nav-group"><h4>资产 ASSETS</h4><button class="v2-nav-item" @click="go('/v2/assets')"><span>Piece Assets</span><b>{{ allAssets.length }}</b></button><button class="v2-nav-item" @click="go('/v2/prompts')"><span>Prompt Library</span><span class="v2-nav-arrow">›</span></button></section>
        <section class="v2-nav-group"><h4>证据 EVIDENCE</h4><button class="v2-nav-item" @click="go('/assets')"><span>Archive</span><span class="v2-nav-arrow">›</span></button></section>
        <section class="v2-nav-group"><h4>系统 SYSTEM</h4><button class="v2-nav-item" @click="go('/v2/system')"><span>ComfyUI / Local Engines</span><span class="v2-nav-arrow">›</span></button><button class="v2-nav-item" @click="go('/v2/models')"><span>Model Registry</span><span class="v2-nav-arrow">›</span></button><button class="v2-nav-item" @click="go('/v2/workflows')"><span>Workflow Registry</span><span class="v2-nav-arrow">›</span></button></section>
      </div>
      <div class="v2-sidebar-footer"><label>Site Profile</label><select v-model="currentSite"><option v-for="site in sites" :key="site.site_id" :value="site.site_id">{{ site.display_name_zh || site.display_name }}</option></select><div class="v2-runtime-mini"><span><i :class="{ online: Boolean(summary) }"></i> Core API</span><span><i :class="{ online: comfyOnline }"></i> ComfyUI</span></div></div>
    </aside>

    <main class="v2-main">
      <header class="v2-monitor">
        <div class="v2-today"><span>TODAY</span><b>{{ summary?.day_key ?? '—' }}</b></div>
        <div class="v2-monitor-group"><strong>生成</strong><span>待生成 <b>{{ summary?.generation.queued ?? 0 }}</b></span><span class="warm">生成中 <b>{{ summary?.generation.running ?? 0 }}</b></span><span class="good">已完成 <b>{{ summary?.generation.completed ?? 0 }}</b></span><span class="bad">失败 <b>{{ summary?.generation.failed ?? 0 }}</b></span></div>
        <div class="v2-monitor-group"><strong>QA</strong><span>待审核 <b>{{ summary?.qa.pending ?? 0 }}</b></span><span class="good">通过 <b>{{ summary?.qa.passed ?? 0 }}</b></span><span class="bad">拒绝 <b>{{ summary?.qa.rejected ?? 0 }}</b></span></div>
        <div class="v2-monitor-group compact"><strong>归档</strong><span>Staging <b>{{ summary?.archive.staging ?? 0 }}</b></span><span>待归档 <b>{{ summary?.archive.ready ?? 0 }}</b></span><span class="good">今日归档 <b>{{ summary?.archive.archived ?? 0 }}</b></span></div>
        <div class="v2-monitor-group compact system"><strong>系统</strong><span :class="engineHealth?.overall === 'READY' ? 'good' : 'bad'">● {{ engineHealth?.overall ?? 'UNKNOWN' }}</span><span>{{ summary?.system.worker === 'BUSY' ? 'Worker 忙碌' : 'Worker 空闲' }}</span><span>Queue <b>{{ summary?.system.queue_depth ?? 0 }}</b></span></div>
        <div class="v2-cloud-pill"><span>CLOUD COST</span><b>未启用</b></div>
      </header>

      <div class="v2-toolbar">
        <div class="v2-tabs"><button @click="go('/v2')">首页</button><button @click="go('/workspace')">Production Pieces</button><button class="active">{{ pageTitle }} <span>×</span></button><button @click="go('/v2/jobs')">任务队列</button><button @click="go('/qa')">Human Visual Gate</button></div>
        <div class="v2-search-wrap"><div class="v2-search"><span>⌕</span><input :value="currentSku" readonly placeholder="当前 Exact Piece"/><kbd>V2-E</kbd></div></div>
      </div>

      <section class="v2-content v2e-content">
        <div class="v2-page-head">
          <div><span class="v2-eyebrow">V2-E · PRODUCTION COMPOSER</span><h1>{{ pageTitle }}</h1><p>{{ pageDescription }}</p></div>
          <div class="v2-head-actions"><span class="v2-preview-badge">LOCAL FIRST</span><button @click="refresh">↻ 刷新</button></div>
        </div>

        <div v-if="error" class="v2-alert"><b>Production Composer 数据暂不可用</b><span>{{ error }}</span></div>
        <div v-if="submitMessage" class="v2e-message" :class="{ bad: submitMessage.startsWith('创建失败') }"><span>{{ submitMessage }}</span><button v-if="submitMessage.startsWith('已通过')" @click="go('/v2/jobs')">查看任务队列 →</button></div>

        <div class="v2e-kpis">
          <article><span>Surface</span><strong>{{ surface }}</strong><small>{{ pageTitle }}</small></article>
          <article><span>Capabilities</span><strong>{{ capabilities.length }}</strong><small>{{ capabilities.filter(row => row.submission_adapter).length }} submit adapter</small></article>
          <article><span>Selected Source</span><strong>{{ selectedCount }}</strong><small>{{ currentSku || 'No Exact Piece' }}</small></article>
          <article><span>Cloud Cost</span><strong>$0</strong><small>Cloud disabled / fail-closed</small></article>
        </div>

        <div class="v2e-layout">
          <div class="v2e-pipeline">
            <article class="v2e-step" :class="{ ready: sourceReady }">
              <header><span>01</span><div><b>Exact Piece / Source</b><small>{{ selectedCapability?.required_source_role ?? 'Source role unresolved' }}</small></div><em>{{ sourceReady ? 'READY' : 'REQUIRED' }}</em></header>
              <div v-if="surface !== 'SCENE'" class="v2e-step-body">
                <label>Exact Piece</label>
                <select v-model="currentSku"><option value="" disabled>选择 SKU</option><option v-for="sku in skuOptions" :key="sku" :value="sku">{{ sku }}</option></select>
                <div class="v2e-source-head"><span>RAW Source · {{ skuAssets.length }}</span><button v-if="surface === 'BATCH'" @click="selectAllForSku">选择全部</button></div>
                <div class="v2e-source-list">
                  <button v-for="asset in skuAssets" :key="asset.asset_id" :class="{ selected: selectedAssetIds.includes(asset.asset_id) }" @click="chooseAsset(asset.asset_id)">
                    <span class="v2e-check">{{ selectedAssetIds.includes(asset.asset_id) ? '✓' : '' }}</span><div><b>{{ asset.filename ?? asset.asset_id }}</b><small>{{ asset.asset_id }} · IMMUTABLE</small></div>
                  </button>
                  <div v-if="!skuAssets.length" class="v2e-inline-empty">当前 Site / SKU 没有 journal-referenced RAW Source。</div>
                </div>
              </div>
              <div v-else class="v2e-blocked-note">Scene 首批要求 formal VERIFIED_CUTOUT source projection；当前未绑定，因此不会借用普通 RAW/Generated row 伪装为可用输入。</div>
            </article>

            <article class="v2e-step" :class="{ ready: promptReady }">
              <header><span>02</span><div><b>Prompt / Template</b><small>{{ selectedCapability?.prompt_required ? 'Registry prompt required' : 'Workflow does not require text prompt' }}</small></div><em>{{ promptReady ? 'READY' : 'REQUIRED' }}</em></header>
              <div class="v2e-step-body">
                <template v-if="selectedCapability?.prompt_required">
                  <label>Prompt Registry</label>
                  <select v-model="selectedPromptKey"><option value="">选择兼容 Prompt</option><option v-for="prompt in compatiblePrompts" :key="`${prompt.prompt_key}@${prompt.version}`" :value="`${prompt.prompt_key}@${prompt.version}`">{{ prompt.display_name }} · v{{ prompt.version }}</option></select>
                  <p v-if="!compatiblePrompts.length" class="v2e-helper bad">当前没有兼容 Prompt Registry entry；不会从旧任务历史自动反推生产 Prompt。</p>
                </template>
                <p v-else class="v2e-helper">{{ selectedCapability?.workflow_code || '当前 Workflow' }} 使用冻结 runtime 参数，不要求文本 Prompt。</p>
              </div>
            </article>

            <article class="v2e-step" :class="{ ready: Boolean(selectedCapability?.effective_executable && !selectedCapability?.block_reason) }">
              <header><span>03</span><div><b>Workflow</b><small>Registry-driven capability</small></div><em>{{ selectedCapability?.effective_executable ? 'REGISTRY' : 'BLOCKED' }}</em></header>
              <div class="v2e-workflow-grid">
                <button v-for="capability in capabilities" :key="capability.workflow_code" :class="{ selected: selectedWorkflowCode === capability.workflow_code, blocked: Boolean(capability.block_reason) }" @click="selectedWorkflowCode = capability.workflow_code">
                  <div><b>{{ capability.workflow_code }}</b><span>{{ capability.display_name }}</span></div><small>{{ capability.execution_engine }}</small><em>{{ capability.submission_adapter ? 'SUBMIT READY' : blockReasonText(capability.block_reason || '') }}</em>
                </button>
                <div v-if="!capabilities.length" class="v2e-inline-empty">当前 Surface 没有 Registry capability。</div>
              </div>
            </article>

            <article class="v2e-step" :class="{ ready: engineReady }">
              <header><span>04</span><div><b>Model / Engine</b><small>{{ selectedCapability?.execution_engine ?? 'Unbound' }}</small></div><em>{{ engineReady ? 'ONLINE' : 'NOT READY' }}</em></header>
              <div class="v2e-engine-row">
                <div><span>Engine</span><b>{{ selectedCapability?.execution_engine ?? '—' }}</b><small v-if="selectedCapability?.execution_engine === 'COMFYUI'">ComfyUI {{ engineHealth?.engines.comfyui.status ?? 'UNKNOWN' }}</small></div>
                <div><span>Model Registry</span><b>{{ compatibleModels.map(row => row.display_name).join(', ') || 'No bound model' }}</b><small>{{ compatibleModels.map(row => row.effective_status || row.status).join(', ') || '—' }}</small></div>
                <div><span>Cloud</span><b>DISABLED</b><small>no silent fallback</small></div>
              </div>
            </article>

            <article class="v2e-step ready">
              <header><span>05</span><div><b>Output Parameters</b><small>Business controls only</small></div><em>FROZEN</em></header>
              <div class="v2e-output-grid"><div><span>Mode</span><b>{{ selectedCapability?.mode ?? '—' }}</b></div><div><span>Source role</span><b>{{ selectedCapability?.required_source_role ?? '—' }}</b></div><div><span>Batch max</span><b>{{ selectedCapability?.max_batch ?? '—' }}</b></div><div><span>Prompt</span><b>{{ selectedCapability?.prompt_required ? 'Required' : 'Not required' }}</b></div></div>
            </article>
          </div>

          <aside class="v2e-review-card">
            <div class="v2e-review-head"><span>06 · TRUTH CHECKS</span><h2>Ready to Create Job?</h2><p>只有现有 authoritative mutation 能被调用；V2-E 不新建第二 queue。</p></div>
            <div class="v2e-validation">
              <div v-for="row in validationRows" :key="row.label"><span class="v2e-status-dot" :class="{ ok: row.ok }">{{ row.ok ? '✓' : '!' }}</span><div><b>{{ row.label }}</b><small>{{ row.value }}</small></div></div>
            </div>
            <div class="v2e-cost"><span>Estimated cost</span><strong>$0.00</strong><small>LOCAL · no metered provider</small></div>
            <div v-if="!canSubmit" class="v2e-block-reason"><b>Fail closed</b><span>{{ blockReason }}</span></div>
            <button class="v2e-submit" :disabled="!canSubmit || submitting" @click="submit">{{ submitting ? '正在创建…' : surface === 'BATCH' ? `创建 ${selectedCount} 个任务` : '创建任务' }}</button>
            <small class="v2e-submit-note">Generation success ≠ QA PASS ≠ Archive Ready.</small>
          </aside>
        </div>
      </section>
    </main>
  </div>
</template>
