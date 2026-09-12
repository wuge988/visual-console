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
type EngineHealth = { ok: boolean; overall: "READY" | "DEGRADED" };

type LibraryAsset = {
  library_id: string;
  asset_id: string;
  site_id: string;
  item_id: string;
  role: "RAW_SOURCE" | "GENERATED_DERIVATIVE";
  media_type: "image" | "video" | "file" | "unknown";
  filename?: string;
  immutable_source: boolean;
  provenance_source: string;
  related_job_ids: string[];
  workflow_codes: string[];
  generation_state?: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  qa_state?: "NOT_REQUIRED" | "QA_PENDING" | "QA_PASS" | "QA_FAIL";
  archive_state?: "STAGING" | "ARCHIVE_READY" | "VERIFIED_ARCHIVE" | "REJECTED";
  first_seen_at: string;
  last_seen_at: string;
};
type AssetsResponse = {
  ok: boolean;
  site_id: string;
  source: string;
  completeness: string;
  total: number;
  assets: LibraryAsset[];
};
type PromptEntry = {
  prompt_key: string;
  version: string;
  display_name: string;
  scene_type: string;
  status: string;
  body: string;
  negative_constraints: string[];
  exact_piece_constraints: string[];
  compatible_workflows: string[];
  compatible_models: string[];
  site_scope: string[];
  tags: string[];
  notes?: string;
};
type PromptResponse = {
  ok: boolean;
  site_id: string;
  schema_version: string;
  source: string;
  total: number;
  prompts: PromptEntry[];
};
type View = "assets" | "prompts";

const P2_API = "http://127.0.0.1:4179";
const sites = ref<Site[]>([]);
const currentSite = ref("drift-curio");
const currentPath = ref(window.location.pathname);
const summary = ref<Summary | null>(null);
const engineHealth = ref<EngineHealth | null>(null);
const assetsResponse = ref<AssetsResponse | null>(null);
const promptResponse = ref<PromptResponse | null>(null);
const loading = ref(true);
const error = ref("");
const search = ref("");
const roleFilter = ref("ALL");
const promptStatusFilter = ref("ALL");
let pollTimer: number | undefined;

const view = computed<View>(() => currentPath.value.startsWith("/v2/prompts") ? "prompts" : "assets");
const assets = computed(() => assetsResponse.value?.assets ?? []);
const rawCount = computed(() => assets.value.filter((row) => row.role === "RAW_SOURCE").length);
const derivativeCount = computed(() => assets.value.filter((row) => row.role === "GENERATED_DERIVATIVE").length);
const reviewCount = computed(() => assets.value.filter((row) => row.qa_state === "QA_PENDING").length);
const rejectedCount = computed(() => assets.value.filter((row) => row.qa_state === "QA_FAIL").length);
const prompts = computed(() => promptResponse.value?.prompts ?? []);
const activePromptCount = computed(() => prompts.value.filter((row) => row.status.toUpperCase() === "ACTIVE").length);
const promptSceneCount = computed(() => new Set(prompts.value.map((row) => row.scene_type)).size);

const filteredAssets = computed(() => {
  const q = search.value.trim().toLowerCase();
  return assets.value.filter((row) => {
    if (roleFilter.value !== "ALL" && row.role !== roleFilter.value) return false;
    if (!q) return true;
    return [row.asset_id, row.item_id, row.filename ?? "", ...row.workflow_codes, ...row.related_job_ids]
      .some((value) => value.toLowerCase().includes(q));
  });
});

const filteredPrompts = computed(() => {
  const q = search.value.trim().toLowerCase();
  return prompts.value.filter((row) => {
    if (promptStatusFilter.value !== "ALL" && row.status.toUpperCase() !== promptStatusFilter.value) return false;
    if (!q) return true;
    return [row.prompt_key, row.version, row.display_name, row.scene_type, row.body, ...row.tags]
      .some((value) => value.toLowerCase().includes(q));
  });
});

function go(path: string) {
  window.location.assign(path);
}

function navigate(path: string) {
  if (window.location.pathname !== path) window.history.pushState({}, "", path);
  currentPath.value = path;
  search.value = "";
  roleFilter.value = "ALL";
  promptStatusFilter.value = "ALL";
  window.scrollTo({ top: 0, behavior: "auto" });
}

async function p2Fetch<T>(path: string): Promise<T> {
  const response = await fetch(`${P2_API}${path}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `HTTP_${response.status}`);
  return body as T;
}

async function loadSites() {
  sites.value = await fetch("/api/sites").then((response) => response.json()).catch(() => []);
  if (sites.value.length && !sites.value.some((site) => site.site_id === currentSite.value)) {
    currentSite.value = sites.value[0].site_id;
  }
}

async function refresh() {
  error.value = "";
  try {
    const site = encodeURIComponent(currentSite.value);
    const [summaryData, healthData, assetData, promptsData] = await Promise.all([
      p2Fetch<Summary>(`/api/v2/summary?site_id=${site}`),
      p2Fetch<EngineHealth>(`/api/v2/engines/health?site_id=${site}`),
      p2Fetch<AssetsResponse>(`/api/v2/assets?site_id=${site}&limit=1000`),
      p2Fetch<PromptResponse>(`/api/v2/registries/prompts?site_id=${site}`),
    ]);
    summary.value = summaryData;
    engineHealth.value = healthData;
    assetsResponse.value = assetData;
    promptResponse.value = promptsData;
  } catch (caught: any) {
    error.value = caught?.message ?? String(caught);
  } finally {
    loading.value = false;
  }
}

function generationLabel(value?: LibraryAsset["generation_state"]) {
  if (!value) return "—";
  return { QUEUED: "待执行", RUNNING: "运行中", SUCCEEDED: "执行成功", FAILED: "执行失败" }[value];
}
function qaLabel(value?: LibraryAsset["qa_state"]) {
  if (!value) return "—";
  return { NOT_REQUIRED: "未进入审核", QA_PENDING: "待人工审核", QA_PASS: "QA 通过", QA_FAIL: "QA 未通过" }[value];
}
function archiveLabel(value?: LibraryAsset["archive_state"]) {
  if (!value) return "—";
  return { STAGING: "Staging", ARCHIVE_READY: "待归档", VERIFIED_ARCHIVE: "已验证归档", REJECTED: "Rejected" }[value];
}
function roleLabel(value: LibraryAsset["role"]) {
  return value === "RAW_SOURCE" ? "RAW Source" : "Generated";
}
function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function handlePopstate() {
  currentPath.value = window.location.pathname;
}

watch(currentSite, () => void refresh());
onMounted(async () => {
  window.addEventListener("popstate", handlePopstate);
  await loadSites();
  await refresh();
  pollTimer = window.setInterval(() => void refresh(), 12_000);
});
onUnmounted(() => {
  window.removeEventListener("popstate", handlePopstate);
  if (pollTimer) window.clearInterval(pollTimer);
});
</script>

<template>
  <div class="v2-shell">
    <aside class="v2-sidebar">
      <div class="v2-brand">
        <div class="v2-brand-mark">VC</div>
        <div><strong>Visual Console</strong><span>V2 · LOCAL FIRST</span></div>
      </div>
      <button class="v2-dashboard-link active-soft" @click="go('/v2')"><span class="v2-nav-icon">⌂</span><span>首页</span></button>
      <div class="v2-nav-scroll">
        <section class="v2-nav-group"><h4>生产 PRODUCTION</h4><button class="v2-nav-item" @click="go('/workspace')"><span>Production Pieces</span><span class="v2-nav-arrow">›</span></button></section>
        <section class="v2-nav-group"><h4>任务 JOBS</h4><button class="v2-nav-item" @click="go('/v2/jobs')"><span>任务队列</span><b>{{ summary?.system.queue_depth ?? 0 }}</b></button><button class="v2-nav-item" @click="go('/v2/jobs/history')"><span>任务历史</span><span class="v2-nav-arrow">›</span></button><button class="v2-nav-item" @click="go('/v2/jobs/failed')"><span>失败 / 重试</span><b>{{ summary?.generation.failed ?? 0 }}</b></button></section>
        <section class="v2-nav-group"><h4>质量 QUALITY</h4><button class="v2-nav-item" @click="go('/qa')"><span>Human Visual Gate</span><b>{{ summary?.qa.pending ?? 0 }}</b></button></section>
        <section class="v2-nav-group"><h4>资产 ASSETS</h4><button class="v2-nav-item" :class="{ active: view === 'assets' }" @click="navigate('/v2/assets')"><span>Piece Assets</span><b>{{ assets.length }}</b></button><button class="v2-nav-item" :class="{ active: view === 'prompts' }" @click="navigate('/v2/prompts')"><span>Prompt Library</span><span class="v2-nav-arrow">›</span></button></section>
        <section class="v2-nav-group"><h4>证据 EVIDENCE</h4><button class="v2-nav-item" @click="go('/assets')"><span>Archive</span><span class="v2-nav-arrow">›</span></button></section>
        <section class="v2-nav-group"><h4>系统 SYSTEM</h4><button class="v2-nav-item" @click="go('/v2/system')"><span>ComfyUI / Local Engines</span><span class="v2-nav-arrow">›</span></button><button class="v2-nav-item" @click="go('/v2/models')"><span>Model Registry</span><span class="v2-nav-arrow">›</span></button><button class="v2-nav-item" @click="go('/v2/workflows')"><span>Workflow Registry</span><span class="v2-nav-arrow">›</span></button></section>
      </div>
      <div class="v2-sidebar-footer">
        <label>Site Profile</label>
        <select v-model="currentSite"><option v-for="site in sites" :key="site.site_id" :value="site.site_id">{{ site.display_name_zh || site.display_name }}</option></select>
        <div class="v2-runtime-mini"><span><i :class="{ online: Boolean(summary) }"></i> Core API</span><span><i :class="{ online: summary?.system.comfyui === 'ONLINE' }"></i> ComfyUI</span></div>
      </div>
    </aside>

    <main class="v2-main">
      <header class="v2-monitor">
        <div class="v2-today"><span>TODAY</span><b>{{ summary?.day_key ?? '—' }}</b></div>
        <div class="v2-monitor-group"><strong>生成</strong><span>待生成 <b>{{ summary?.generation.queued ?? 0 }}</b></span><span class="warm">生成中 <b>{{ summary?.generation.running ?? 0 }}</b></span><span class="good">已完成 <b>{{ summary?.generation.completed ?? 0 }}</b></span><span class="bad">失败 <b>{{ summary?.generation.failed ?? 0 }}</b></span></div>
        <div class="v2-monitor-group"><strong>QA</strong><span>待审核 <b>{{ summary?.qa.pending ?? 0 }}</b></span><span class="good">通过 <b>{{ summary?.qa.passed ?? 0 }}</b></span><span class="bad">拒绝 <b>{{ summary?.qa.rejected ?? 0 }}</b></span></div>
        <div class="v2-monitor-group compact"><strong>归档</strong><span>Staging <b>{{ summary?.archive.staging ?? 0 }}</b></span><span>待归档 <b>{{ summary?.archive.ready ?? 0 }}</b></span><span class="good">今日归档 <b>{{ summary?.archive.archived ?? 0 }}</b></span></div>
        <div class="v2-monitor-group compact system"><strong>系统</strong><span :class="engineHealth?.overall === 'READY' ? 'good' : 'bad'">● {{ engineHealth?.overall ?? 'UNKNOWN' }}</span><span>{{ summary?.system.worker === 'BUSY' ? 'Worker 忙碌' : 'Worker 空闲' }}</span><span>Queue <b>{{ summary?.system.queue_depth ?? 0 }}</b></span></div>
        <div class="v2-cloud-pill" :class="{ enabled: summary?.cloud_cost.enabled }"><span>CLOUD COST</span><b>{{ summary?.cloud_cost.enabled ? `${summary.cloud_cost.currency} ${summary.cloud_cost.today.toFixed(2)}` : '未启用' }}</b></div>
      </header>

      <div class="v2-toolbar">
        <div class="v2-tabs"><button @click="go('/v2')">首页</button><button @click="go('/workspace')">Production Pieces</button><button @click="go('/v2/jobs')">任务队列</button><button @click="go('/qa')">Human Visual Gate</button><button class="active">{{ view === 'assets' ? 'Piece Assets' : 'Prompt Library' }} <span>×</span></button></div>
        <div class="v2-search-wrap"><div class="v2-search"><span>⌕</span><input v-model="search" :placeholder="view === 'assets' ? '搜索 SKU / Asset / Workflow / Job' : '搜索 Prompt / Scene / Tag'"/><kbd>V2-D</kbd></div></div>
      </div>

      <section class="v2-content v2d-content">
        <div class="v2-page-head">
          <div>
            <span class="v2-eyebrow">V2-D · ASSET + PROMPT LIBRARY</span>
            <h1>{{ view === 'assets' ? 'Piece Assets' : 'Prompt Library' }}</h1>
            <p v-if="view === 'assets'">只投影 durable journal 已引用的资产；不会把生成结果误当 Evidence，也不会把 QA PASS 误当正式归档。</p>
            <p v-else>Prompt 是版本化 Registry 对象；当前阶段只读，不从任务历史反推、不自动创建生产 Prompt。</p>
          </div>
          <div class="v2-head-actions"><span class="v2-preview-badge">V2-D PREVIEW</span><button @click="refresh">↻ 刷新</button></div>
        </div>

        <div v-if="error" class="v2-alert"><b>V2-D 数据暂不可用</b><span>{{ error }}</span></div>

        <template v-if="view === 'assets'">
          <div class="v2d-kpis">
            <article><span>Journal Assets</span><strong>{{ assets.length }}</strong><small>当前可证明引用</small></article>
            <article><span>RAW Source</span><strong>{{ rawCount }}</strong><small>Immutable source</small></article>
            <article><span>Generated</span><strong>{{ derivativeCount }}</strong><small>Derivative only</small></article>
            <article><span>Review / Rejected</span><strong>{{ reviewCount + rejectedCount }}</strong><small>{{ reviewCount }} pending · {{ rejectedCount }} rejected</small></article>
          </div>

          <div class="v2d-truth-banner">
            <div><b>Journal-referenced assets only</b><span>这里不是完整磁盘索引。只展示 P2 durable journal 能证明被任务引用的 Source / Generated asset。</span></div>
            <div class="v2d-truth-meta"><span>SOURCE</span><b>{{ assetsResponse?.completeness ?? 'JOURNAL_REFERENCED_ASSETS_ONLY' }}</b></div>
          </div>

          <div class="v2d-filterbar">
            <div class="v2d-view-tabs"><button class="active" @click="navigate('/v2/assets')">Piece Assets</button><button @click="navigate('/v2/prompts')">Prompt Library</button></div>
            <div class="v2d-filters"><select v-model="roleFilter"><option value="ALL">全部角色</option><option value="RAW_SOURCE">RAW Source</option><option value="GENERATED_DERIVATIVE">Generated</option></select><span>{{ filteredAssets.length }} / {{ assets.length }}</span></div>
          </div>

          <article class="v2d-table-card">
            <div class="v2d-asset-head"><span>ASSET / SKU</span><span>ROLE</span><span>MEDIA</span><span>WORKFLOW</span><span>QA</span><span>ARCHIVE</span><span>UPDATED</span></div>
            <div v-if="filteredAssets.length" class="v2d-table-body">
              <div v-for="asset in filteredAssets" :key="asset.library_id" class="v2d-asset-row">
                <div class="v2d-identity"><b>{{ asset.item_id }}</b><small>{{ asset.filename ?? asset.asset_id }}</small><small>{{ asset.asset_id }}</small></div>
                <div><span class="v2d-pill" :data-role="asset.role">{{ roleLabel(asset.role) }}</span><small v-if="asset.immutable_source">IMMUTABLE</small></div>
                <div><b>{{ asset.media_type }}</b><small>{{ generationLabel(asset.generation_state) }}</small></div>
                <div><b>{{ asset.workflow_codes.join(', ') || '—' }}</b><small>{{ asset.related_job_ids.length }} job ref</small></div>
                <div><span v-if="asset.qa_state" class="v2d-pill" :data-state="asset.qa_state">{{ qaLabel(asset.qa_state) }}</span><span v-else class="v2d-muted">—</span></div>
                <div><span v-if="asset.archive_state" class="v2d-pill" :data-state="asset.archive_state">{{ archiveLabel(asset.archive_state) }}</span><span v-else class="v2d-muted">—</span></div>
                <time>{{ formatTime(asset.last_seen_at) }}</time>
              </div>
            </div>
            <div v-else class="v2-empty v2d-empty"><b>{{ loading ? '正在读取 Asset Library…' : '没有匹配的已引用资产' }}</b><span>V2-D 不会为了填充列表而扫描或推断未登记资产。</span></div>
          </article>
          <div class="v2d-footnote"><span>RAW/source immutable.</span><span>Generated derivative ≠ Evidence.</span><span>QA PASS ≠ Archive Ready.</span></div>
        </template>

        <template v-else>
          <div class="v2d-kpis">
            <article><span>Registered</span><strong>{{ prompts.length }}</strong><small>Versioned prompt entries</small></article>
            <article><span>Active</span><strong>{{ activePromptCount }}</strong><small>Registry status only</small></article>
            <article><span>Scene Types</span><strong>{{ promptSceneCount }}</strong><small>当前站点可见</small></article>
            <article><span>Schema</span><strong class="schema">{{ promptResponse?.schema_version ?? '—' }}</strong><small>Read-only registry</small></article>
          </div>

          <div class="v2d-truth-banner">
            <div><b>Prompt Registry ≠ executable capability</b><span>Prompt 只提供版本化上下文。是否可执行仍由 Workflow / Model / Site / Runtime 真值决定。</span></div>
            <div class="v2d-truth-meta"><span>SOURCE</span><b>{{ promptResponse?.source ?? 'PROMPT_REGISTRY_READ_ONLY' }}</b></div>
          </div>

          <div class="v2d-filterbar">
            <div class="v2d-view-tabs"><button @click="navigate('/v2/assets')">Piece Assets</button><button class="active" @click="navigate('/v2/prompts')">Prompt Library</button></div>
            <div class="v2d-filters"><select v-model="promptStatusFilter"><option value="ALL">全部状态</option><option value="ACTIVE">ACTIVE</option><option value="DRAFT">DRAFT</option><option value="FROZEN">FROZEN</option></select><span>{{ filteredPrompts.length }} / {{ prompts.length }}</span></div>
          </div>

          <div v-if="filteredPrompts.length" class="v2d-prompt-grid">
            <article v-for="prompt in filteredPrompts" :key="`${prompt.prompt_key}@${prompt.version}`" class="v2d-prompt-card">
              <header><div><span>{{ prompt.scene_type || 'general' }}</span><h3>{{ prompt.display_name }}</h3><small>{{ prompt.prompt_key }} · v{{ prompt.version }}</small></div><b class="v2d-pill">{{ prompt.status }}</b></header>
              <p>{{ prompt.body }}</p>
              <div class="v2d-prompt-meta"><span>Workflow</span><b>{{ prompt.compatible_workflows.join(', ') || 'Not bound' }}</b><span>Model</span><b>{{ prompt.compatible_models.join(', ') || 'Not bound' }}</b><span>Exact Piece</span><b>{{ prompt.exact_piece_constraints.length }} constraint(s)</b></div>
              <div class="v2d-tags"><span v-for="tag in prompt.tags" :key="tag">{{ tag }}</span></div>
            </article>
          </div>
          <div v-else class="v2d-empty-registry"><b>{{ loading ? '正在读取 Prompt Registry…' : '当前没有已登记 Prompt' }}</b><span>这是有效的空状态。V2-D 不会从旧任务、聊天文本或历史输出自动反推生产 Prompt。</span></div>
        </template>
      </section>
    </main>
  </div>
</template>
