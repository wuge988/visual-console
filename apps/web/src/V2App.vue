<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

type Site = { site_id: string; display_name: string; display_name_zh: string };
type Job = {
  job_id: string;
  site_id: string;
  item_id: string;
  workflow_code: string;
  state: string;
  created_at: string;
  updated_at: string;
  source_filename?: string;
  generated_filename?: string;
  error?: string;
};
type Summary = {
  ok: boolean;
  site_id: string;
  generated_at: string;
  window: "TODAY";
  day_key: string;
  generation: { queued: number; running: number; completed: number; failed: number };
  qa: { pending: number; passed: number; rejected: number };
  archive: { ready: number; archived: number };
  system: {
    comfyui: "ONLINE" | "OFFLINE";
    worker: "BUSY" | "IDLE";
    queue_depth: number;
    comfy_queue_running: number;
    comfy_queue_pending: number;
  };
  cloud_cost: {
    enabled: boolean;
    currency: string;
    today: number;
    month: number;
    reason?: string;
  };
};

type ProjectedWorkflow = {
  code: string;
  name_en: string;
  name_zh: string;
  asset_key: string;
  scope: string;
  preset_status: string;
  workflow_status: string;
  executable: boolean;
  execution_engine?: string;
  site_enabled: boolean;
  runtime_registered: boolean;
  effective_executable: boolean;
  frozen_runtime?: Record<string, unknown>;
};

type WorkflowRegistryResponse = {
  ok: boolean;
  site_id: string;
  schema_version: string;
  workflows: ProjectedWorkflow[];
};

type ProjectedModel = {
  model_key: string;
  display_name: string;
  provider: string;
  media_type: string;
  capabilities: string[];
  workflow_codes: string[];
  active_workflow_codes: string[];
  status: string;
  effective_status: string;
  cloud: boolean;
  metered_cost: boolean;
  notes?: string;
};

type ModelRegistryResponse = {
  ok: boolean;
  site_id: string;
  schema_version: string;
  models: ProjectedModel[];
};

type EngineHealth = {
  ok: boolean;
  site_id: string;
  generated_at: string;
  overall: "READY" | "DEGRADED";
  engines: {
    core: { status: string };
    local_renderer: { status: string; workflow_codes: string[] };
    comfyui: {
      status: string;
      required_by_current_workflows: boolean;
      queue_running: number;
      queue_pending: number;
      devices: Array<{ name?: string; type?: string; vram_total?: number | null; vram_free?: number | null }>;
      endpoint?: string;
      error?: string;
    };
    cloud: { status: string; fail_closed: boolean; reason: string };
  };
  storage: Array<{ label: string; reachable: boolean; total_bytes: number | null; free_bytes: number | null }>;
};

type NavEntry = {
  label: string;
  href?: string;
  v2Href?: string;
  hint?: string;
  implemented?: boolean;
  badge?: "jobs" | "qa" | "assets";
};

type NavGroup = { label: string; items: NavEntry[] };
type V2View = "dashboard" | "system" | "models" | "workflows";

const P2_API = "http://127.0.0.1:4179";
const sites = ref<Site[]>([]);
const currentSite = ref("drift-curio");
const currentPath = ref(window.location.pathname);
const summary = ref<Summary | null>(null);
const jobs = ref<Job[]>([]);
const qaItems = ref<Job[]>([]);
const coreHealth = ref<any>(null);
const workflowRegistry = ref<WorkflowRegistryResponse | null>(null);
const modelRegistry = ref<ModelRegistryResponse | null>(null);
const engineHealth = ref<EngineHealth | null>(null);
const loading = ref(true);
const lastError = ref("");
const registryError = ref("");
const searchQuery = ref("");
const searchOpen = ref(false);
let pollTimer: number | undefined;

const navGroups: NavGroup[] = [
  {
    label: "生产 PRODUCTION",
    items: [
      { label: "Production Pieces", href: "/workspace", implemented: true, hint: "现有生产工作台" },
      { label: "图片生成", hint: "V2-E" },
      { label: "场景生成", hint: "V2-E" },
      { label: "批量生成", hint: "V2-E" },
      { label: "创作画布", hint: "V2-F" },
    ],
  },
  {
    label: "任务 JOBS",
    items: [
      { label: "任务队列", href: "/jobs", implemented: true, badge: "jobs" },
      { label: "任务历史", hint: "V2-C" },
      { label: "失败 / 重试", href: "/jobs", implemented: true },
    ],
  },
  {
    label: "质量 QUALITY",
    items: [
      { label: "Automated QA", hint: "V2-C" },
      { label: "Human Visual Gate", href: "/qa", implemented: true, badge: "qa" },
    ],
  },
  {
    label: "资产 ASSETS",
    items: [
      { label: "Piece Assets", href: "/assets", implemented: true, badge: "assets" },
      { label: "Prompt Library", hint: "V2-D" },
      { label: "Material Boards", hint: "V2-D" },
      { label: "Reference Library", hint: "V2-D" },
    ],
  },
  {
    label: "证据 EVIDENCE",
    items: [
      { label: "SKU Manifest", hint: "V2-D" },
      { label: "Evidence Record", hint: "V2-D" },
      { label: "Archive", href: "/assets", implemented: true },
    ],
  },
  {
    label: "系统 SYSTEM",
    items: [
      { label: "ComfyUI / Local Engines", v2Href: "/v2/system", implemented: true },
      { label: "Model Registry", v2Href: "/v2/models", implemented: true },
      { label: "Workflow Registry", v2Href: "/v2/workflows", implemented: true },
      { label: "Budget & Providers", hint: "V2-H" },
      { label: "Storage", hint: "V2-B · included in System" },
      { label: "Settings", hint: "V2-H" },
    ],
  },
];

const currentView = computed<V2View>(() => {
  if (currentPath.value.startsWith("/v2/models")) return "models";
  if (currentPath.value.startsWith("/v2/workflows")) return "workflows";
  if (currentPath.value.startsWith("/v2/system")) return "system";
  return "dashboard";
});

const activeJobs = computed(() =>
  jobs.value.filter((job) => ["READY", "QUEUED", "RUNNING", "GENERATED"].includes(job.state)).slice(0, 5),
);
const failedJobs = computed(() =>
  jobs.value.filter((job) => job.state.startsWith("FAILED_") || job.state === "QA_FAIL").slice(0, 5),
);
const pendingQa = computed(() => qaItems.value.filter((job) => job.state === "QA_PENDING").slice(0, 5));
const assetCount = computed(() => jobs.value.filter((job) => Boolean(job.generated_filename)).length);
const activeGeneration = computed(() => (summary.value?.generation.queued ?? 0) + (summary.value?.generation.running ?? 0));
const effectiveWorkflows = computed(() => workflowRegistry.value?.workflows.filter((row) => row.effective_executable) ?? []);
const siteEnabledWorkflows = computed(() => workflowRegistry.value?.workflows.filter((row) => row.site_enabled) ?? []);
const registeredWorkflows = computed(() => workflowRegistry.value?.workflows.filter((row) => row.runtime_registered) ?? []);

const searchResults = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return [];
  const routeHits = navGroups
    .flatMap((group) => group.items)
    .filter((item) => item.implemented && (item.href || item.v2Href) && item.label.toLowerCase().includes(query))
    .slice(0, 5)
    .map((item) => ({ type: "页面", label: item.label, detail: item.v2Href ?? item.href!, href: item.v2Href ?? item.href! }));
  const workflowHits = (workflowRegistry.value?.workflows ?? [])
    .filter((row) => [row.code, row.name_en, row.name_zh, row.asset_key].some((value) => value.toLowerCase().includes(query)))
    .slice(0, 4)
    .map((row) => ({ type: "工作流", label: row.code, detail: row.name_zh, href: "/v2/workflows" }));
  const modelHits = (modelRegistry.value?.models ?? [])
    .filter((row) => [row.model_key, row.display_name, row.provider].some((value) => value.toLowerCase().includes(query)))
    .slice(0, 3)
    .map((row) => ({ type: "模型", label: row.display_name, detail: row.provider, href: "/v2/models" }));
  const jobHits = jobs.value
    .filter((job) =>
      [job.job_id, job.item_id, job.workflow_code, job.source_filename ?? "", job.generated_filename ?? ""]
        .some((value) => value.toLowerCase().includes(query)),
    )
    .slice(0, 5)
    .map((job) => ({
      type: "任务",
      label: job.item_id,
      detail: `${job.workflow_code} · ${job.state} · ${job.job_id.slice(0, 12)}…`,
      href: "/jobs",
    }));
  return [...routeHits, ...workflowHits, ...modelHits, ...jobHits].slice(0, 10);
});

function stateLabel(state: string) {
  const labels: Record<string, string> = {
    READY: "准备",
    QUEUED: "排队中",
    RUNNING: "运行中",
    GENERATED: "生成完成 · 捕获中",
    CAPTURED: "已捕获",
    QA_PENDING: "待人工审核",
    QA_PASS: "QA 通过",
    QA_FAIL: "QA 未通过",
    FAILED_SUBMIT: "提交失败",
    FAILED_RUNTIME: "运行失败",
    FAILED_CAPTURE: "捕获失败",
    FAILED_QA: "审核失败",
  };
  return labels[state] ?? state;
}

function navBadge(item: NavEntry) {
  if (item.badge === "jobs") return summary.value?.system.queue_depth ?? 0;
  if (item.badge === "qa") return summary.value?.qa.pending ?? 0;
  if (item.badge === "assets") return assetCount.value;
  return null;
}

function openLegacy(href?: string) {
  if (!href) return;
  window.location.assign(href);
}

function navigateV2(path: string) {
  if (window.location.pathname !== path) window.history.pushState({}, "", path);
  currentPath.value = path;
  searchOpen.value = false;
  window.scrollTo({ top: 0, behavior: "auto" });
}

function openNav(item: NavEntry) {
  if (item.v2Href) return navigateV2(item.v2Href);
  openLegacy(item.href);
}

function navActive(item: NavEntry) {
  return Boolean(item.v2Href && currentPath.value.startsWith(item.v2Href));
}

async function p2Fetch<T>(path: string): Promise<T> {
  const response = await fetch(`${P2_API}${path}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `HTTP_${response.status}`);
  return body as T;
}

async function refreshOperational() {
  lastError.value = "";
  try {
    const site = encodeURIComponent(currentSite.value);
    const [summaryData, jobData, qaData, healthData] = await Promise.all([
      p2Fetch<Summary>(`/api/v2/summary?site_id=${site}`),
      p2Fetch<Job[]>(`/api/jobs?site_id=${site}`),
      p2Fetch<Job[]>(`/api/qa?site_id=${site}`),
      fetch("/api/health").then((response) => response.json()).catch(() => null),
    ]);
    summary.value = summaryData;
    jobs.value = jobData;
    qaItems.value = qaData;
    coreHealth.value = healthData;
  } catch (error: any) {
    lastError.value = error?.message ?? String(error);
  } finally {
    loading.value = false;
  }
}

async function refreshRegistries() {
  registryError.value = "";
  try {
    const site = encodeURIComponent(currentSite.value);
    const [workflowData, modelData, engineData] = await Promise.all([
      p2Fetch<WorkflowRegistryResponse>(`/api/v2/registries/workflows?site_id=${site}`),
      p2Fetch<ModelRegistryResponse>(`/api/v2/registries/models?site_id=${site}`),
      p2Fetch<EngineHealth>(`/api/v2/engines/health?site_id=${site}`),
    ]);
    workflowRegistry.value = workflowData;
    modelRegistry.value = modelData;
    engineHealth.value = engineData;
  } catch (error: any) {
    registryError.value = error?.message ?? String(error);
  }
}

async function refreshAll() {
  await Promise.all([refreshOperational(), refreshRegistries()]);
}

async function loadSites() {
  sites.value = await fetch("/api/sites").then((response) => response.json()).catch(() => []);
  if (sites.value.length && !sites.value.some((site) => site.site_id === currentSite.value)) {
    currentSite.value = sites.value[0].site_id;
  }
}

function selectSearchResult(href: string) {
  searchOpen.value = false;
  searchQuery.value = "";
  if (href.startsWith("/v2")) navigateV2(href);
  else openLegacy(href);
}

function formatBytes(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 100 || unit === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
}

function workflowEngine(row: ProjectedWorkflow) {
  if (row.execution_engine) return row.execution_engine;
  if (row.code === "SC01") return "COMFYUI";
  return "—";
}

function handlePopstate() {
  currentPath.value = window.location.pathname;
}

watch(currentSite, () => void refreshAll());

onMounted(async () => {
  window.addEventListener("popstate", handlePopstate);
  await loadSites();
  await refreshAll();
  pollTimer = window.setInterval(() => void refreshAll(), 7_500);
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

      <button
        class="v2-dashboard-link"
        :class="currentView === 'dashboard' ? 'active' : 'active-soft'"
        @click="navigateV2('/v2')"
      >
        <span class="v2-nav-icon">⌂</span><span>首页</span>
      </button>

      <div class="v2-nav-scroll">
        <section v-for="group in navGroups" :key="group.label" class="v2-nav-group">
          <h4>{{ group.label }}</h4>
          <button
            v-for="item in group.items"
            :key="item.label"
            class="v2-nav-item"
            :class="{ disabled: !item.implemented, active: navActive(item) }"
            :disabled="!item.implemented"
            @click="openNav(item)"
          >
            <span>{{ item.label }}</span>
            <b v-if="navBadge(item) !== null">{{ navBadge(item) }}</b>
            <small v-else-if="!item.implemented">{{ item.hint }}</small>
            <span v-else class="v2-nav-arrow">›</span>
          </button>
        </section>
      </div>

      <div class="v2-sidebar-footer">
        <label>Site Profile</label>
        <select v-model="currentSite">
          <option v-for="site in sites" :key="site.site_id" :value="site.site_id">
            {{ site.display_name_zh || site.display_name }}
          </option>
        </select>
        <div class="v2-runtime-mini">
          <span><i :class="{ online: coreHealth?.ok }"></i> Core API</span>
          <span><i :class="{ online: engineHealth?.engines.comfyui.status === 'ONLINE' }"></i> ComfyUI</span>
        </div>
      </div>
    </aside>

    <main class="v2-main">
      <header class="v2-monitor">
        <div class="v2-today">
          <span>TODAY</span><b>{{ summary?.day_key ?? '—' }}</b>
        </div>

        <div class="v2-monitor-group">
          <strong>生成</strong>
          <span>待生成 <b>{{ summary?.generation.queued ?? 0 }}</b></span>
          <span class="warm">生成中 <b>{{ summary?.generation.running ?? 0 }}</b></span>
          <span class="good">已完成 <b>{{ summary?.generation.completed ?? 0 }}</b></span>
          <span class="bad">失败 <b>{{ summary?.generation.failed ?? 0 }}</b></span>
        </div>

        <div class="v2-monitor-group">
          <strong>QA</strong>
          <span>待审核 <b>{{ summary?.qa.pending ?? 0 }}</b></span>
          <span class="good">通过 <b>{{ summary?.qa.passed ?? 0 }}</b></span>
          <span class="bad">拒绝 <b>{{ summary?.qa.rejected ?? 0 }}</b></span>
        </div>

        <div class="v2-monitor-group compact">
          <strong>归档</strong>
          <span>待归档 <b>{{ summary?.archive.ready ?? 0 }}</b></span>
          <span class="good">今日归档 <b>{{ summary?.archive.archived ?? 0 }}</b></span>
        </div>

        <div class="v2-monitor-group compact system">
          <strong>系统</strong>
          <span :class="engineHealth?.overall === 'READY' ? 'good' : 'bad'">● {{ engineHealth?.overall ?? 'UNKNOWN' }}</span>
          <span>{{ summary?.system.worker === 'BUSY' ? 'Worker 忙碌' : 'Worker 空闲' }}</span>
          <span>Queue <b>{{ summary?.system.queue_depth ?? 0 }}</b></span>
        </div>

        <div class="v2-cloud-pill" :class="{ enabled: summary?.cloud_cost.enabled }">
          <span>CLOUD COST</span>
          <b>{{ summary?.cloud_cost.enabled ? `${summary.cloud_cost.currency} ${summary.cloud_cost.today.toFixed(2)}` : '未启用' }}</b>
        </div>
      </header>

      <div class="v2-toolbar">
        <div class="v2-tabs">
          <button :class="{ active: currentView === 'dashboard' }" @click="navigateV2('/v2')">首页</button>
          <button @click="openLegacy('/workspace')">Production Pieces</button>
          <button @click="openLegacy('/jobs')">任务队列</button>
          <button @click="openLegacy('/qa')">Human Visual Gate</button>
          <button v-if="currentView === 'system'" class="active">系统状态 <span>×</span></button>
          <button v-if="currentView === 'models'" class="active">Model Registry <span>×</span></button>
          <button v-if="currentView === 'workflows'" class="active">Workflow Registry <span>×</span></button>
        </div>

        <div class="v2-search-wrap">
          <div class="v2-search">
            <span>⌕</span>
            <input
              v-model="searchQuery"
              placeholder="搜索 SKU / Job / Workflow / Model / 页面"
              @focus="searchOpen = true"
              @keydown.esc="searchOpen = false"
            />
            <kbd>⌘ K</kbd>
          </div>
          <div v-if="searchOpen && searchQuery.trim()" class="v2-search-results">
            <button v-for="result in searchResults" :key="`${result.type}-${result.detail}`" @click="selectSearchResult(result.href)">
              <span>{{ result.type }}</span><b>{{ result.label }}</b><small>{{ result.detail }}</small>
            </button>
            <div v-if="!searchResults.length" class="v2-search-empty">没有匹配的当前可用对象</div>
          </div>
        </div>
      </div>

      <section v-if="currentView === 'dashboard'" class="v2-content">
        <div class="v2-page-head">
          <div>
            <span class="v2-eyebrow">VISUAL PRODUCTION CONTROL PLANE</span>
            <h1>生产总览</h1>
            <p>先看运行、失败、人工 Gate、引擎和成本，再决定下一步动作。</p>
          </div>
          <div class="v2-head-actions">
            <span class="v2-preview-badge">V2-B PREVIEW</span>
            <button @click="refreshAll">↻ 刷新</button>
            <button class="primary" @click="openLegacy('/workspace')">进入生产工作台</button>
          </div>
        </div>

        <div v-if="lastError || registryError" class="v2-alert">
          <b>V2 数据暂不可用</b><span>{{ lastError || registryError }}</span>
        </div>

        <div class="v2-kpis">
          <article>
            <div class="v2-kpi-icon purple">↻</div>
            <span>正在处理</span>
            <strong>{{ activeGeneration }}</strong>
            <small>Queued + Running</small>
          </article>
          <article>
            <div class="v2-kpi-icon red">!</div>
            <span>今日失败</span>
            <strong>{{ summary?.generation.failed ?? 0 }}</strong>
            <small>仅生成执行失败</small>
          </article>
          <article>
            <div class="v2-kpi-icon amber">✓</div>
            <span>需要人工审核</span>
            <strong>{{ summary?.qa.pending ?? 0 }}</strong>
            <small>Human Visual Gate</small>
          </article>
          <article>
            <div class="v2-kpi-icon green">$</div>
            <span>今日云成本</span>
            <strong>{{ summary?.cloud_cost.enabled ? summary.cloud_cost.today.toFixed(2) : '0.00' }}</strong>
            <small>{{ summary?.cloud_cost.enabled ? summary.cloud_cost.currency : 'Cloud disabled' }}</small>
          </article>
        </div>

        <div class="v2-dashboard-grid">
          <article class="v2-panel v2-active-panel">
            <div class="v2-panel-head">
              <div><span>ACTIVE JOBS</span><h2>正在运行</h2></div>
              <button @click="openLegacy('/jobs')">全部任务 ›</button>
            </div>
            <div v-if="activeJobs.length" class="v2-job-list">
              <button v-for="job in activeJobs" :key="job.job_id" @click="openLegacy('/jobs')">
                <span class="v2-state-dot" :data-state="job.state"></span>
                <div><b>{{ job.item_id }}</b><small>{{ job.workflow_code }} · {{ job.source_filename ?? job.job_id.slice(0, 14) }}</small></div>
                <span class="v2-job-state">{{ stateLabel(job.state) }}</span>
                <time>{{ new Date(job.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</time>
              </button>
            </div>
            <div v-else class="v2-empty"><b>{{ loading ? '正在读取任务…' : '当前没有运行中的任务' }}</b><span>Worker 空闲时这里保持为空。</span></div>
          </article>

          <article class="v2-panel v2-gate-panel">
            <div class="v2-panel-head">
              <div><span>HUMAN VISUAL GATE</span><h2>待你确认</h2></div>
              <button @click="openLegacy('/qa')">进入审核 ›</button>
            </div>
            <div v-if="pendingQa.length" class="v2-review-list">
              <button v-for="job in pendingQa" :key="job.job_id" @click="openLegacy('/qa')">
                <div class="v2-review-thumb">{{ job.workflow_code }}</div>
                <div><b>{{ job.item_id }}</b><small>{{ job.generated_filename ?? 'Generated derivative' }}</small></div>
                <span>待人工 Gate</span>
              </button>
            </div>
            <div v-else class="v2-empty"><b>没有待人工审核项</b><span>生成成功不会自动视为 QA 通过。</span></div>
          </article>

          <article class="v2-panel v2-health-panel">
            <div class="v2-panel-head">
              <div><span>ENGINE HEALTH</span><h2>本地引擎</h2></div>
              <button @click="navigateV2('/v2/system')">系统状态 ›</button>
            </div>
            <div class="v2-health-row">
              <div><span class="v2-health-dot" :class="{ online: engineHealth?.engines.core.status === 'ONLINE' }"></span><div><b>Visual Console Core</b><small>Local control plane</small></div></div>
              <strong :class="engineHealth?.engines.core.status === 'ONLINE' ? 'good' : 'bad'">{{ engineHealth?.engines.core.status ?? 'UNKNOWN' }}</strong>
            </div>
            <div class="v2-health-row">
              <div><span class="v2-health-dot" :class="{ online: engineHealth?.engines.local_renderer.status === 'ONLINE' }"></span><div><b>Local Renderer</b><small>{{ engineHealth?.engines.local_renderer.workflow_codes.join(', ') || 'No active deterministic workflow' }}</small></div></div>
              <strong>{{ engineHealth?.engines.local_renderer.status ?? 'UNKNOWN' }}</strong>
            </div>
            <div class="v2-health-row">
              <div><span class="v2-health-dot" :class="{ online: engineHealth?.engines.comfyui.status === 'ONLINE' }"></span><div><b>ComfyUI</b><small>{{ engineHealth?.engines.comfyui.required_by_current_workflows ? 'Required by current executable workflow' : 'Optional for current executable set' }}</small></div></div>
              <strong :class="engineHealth?.engines.comfyui.status === 'ONLINE' ? 'good' : (engineHealth?.engines.comfyui.required_by_current_workflows ? 'bad' : '')">{{ engineHealth?.engines.comfyui.status ?? 'UNKNOWN' }}</strong>
            </div>
          </article>

          <article class="v2-panel v2-cost-panel">
            <div class="v2-panel-head">
              <div><span>COST GUARD</span><h2>云模型预算</h2></div>
              <span class="v2-safe-pill">FAIL CLOSED</span>
            </div>
            <div class="v2-cost-hero">
              <strong>{{ summary?.cloud_cost.enabled ? `${summary.cloud_cost.currency} ${summary.cloud_cost.month.toFixed(2)}` : '$0.00' }}</strong>
              <span>本月已记录云成本</span>
            </div>
            <div class="v2-cost-rule"><span>Cloud Provider</span><b>{{ summary?.cloud_cost.enabled ? 'Enabled' : 'Disabled' }}</b></div>
            <div class="v2-cost-rule"><span>未知价格任务</span><b>禁止执行</b></div>
            <div class="v2-cost-rule"><span>自动付费升级</span><b>禁止</b></div>
            <small>V2-H 才会接入 Provider Adapter。当前没有任何付费模型调用能力。</small>
          </article>

          <article class="v2-panel v2-failure-panel wide">
            <div class="v2-panel-head">
              <div><span>ATTENTION</span><h2>失败与未通过</h2></div>
              <button @click="openLegacy('/jobs')">查看任务 ›</button>
            </div>
            <div v-if="failedJobs.length" class="v2-failure-table">
              <div v-for="job in failedJobs" :key="job.job_id" class="v2-failure-row">
                <span class="v2-failure-state">{{ stateLabel(job.state) }}</span>
                <div><b>{{ job.item_id }}</b><small>{{ job.workflow_code }} · {{ job.job_id }}</small></div>
                <p>{{ job.error ?? (job.state === 'QA_FAIL' ? 'Human Visual Gate rejected this derivative.' : 'No detail recorded.') }}</p>
                <button @click="openLegacy(job.state === 'QA_FAIL' ? '/qa' : '/jobs')">查看</button>
              </div>
            </div>
            <div v-else class="v2-empty horizontal"><b>当前没有失败或 QA 未通过记录</b><span>异常会出现在这里，但不会自动触发 Cloud fallback。</span></div>
          </article>
        </div>
      </section>

      <section v-else-if="currentView === 'system'" class="v2-content">
        <div class="v2-page-head">
          <div>
            <span class="v2-eyebrow">V2-B · ENGINE HEALTH</span>
            <h1>系统与本地引擎</h1>
            <p>只展示当前真实可用能力；ComfyUI 是否离线只有在它被当前可执行工作流依赖时才影响整体健康。</p>
          </div>
          <div class="v2-head-actions">
            <span class="v2-preview-badge">V2-B PREVIEW</span>
            <button @click="refreshAll">↻ 刷新</button>
          </div>
        </div>

        <div v-if="registryError" class="v2-alert"><b>Engine Health 暂不可用</b><span>{{ registryError }}</span></div>

        <div class="v2-overall-strip">
          <div>
            <span class="v2-overall-dot" :class="engineHealth?.overall === 'READY' ? 'ready' : 'degraded'"></span>
            <div><b>System {{ engineHealth?.overall ?? 'UNKNOWN' }}</b><small>站点：{{ currentSite }} · V2-B read-only health projection</small></div>
          </div>
          <div class="v2-overall-meta">
            <span>Effective workflows <b>{{ effectiveWorkflows.length }}</b></span>
            <span>Cloud <b>{{ engineHealth?.engines.cloud.status ?? 'DISABLED' }}</b></span>
            <span>Cost Guard <b>FAIL CLOSED</b></span>
          </div>
        </div>

        <div class="v2-system-grid">
          <article class="v2-engine-card">
            <header><div><span>CONTROL PLANE</span><h3>Visual Console Core</h3></div><b class="v2-status-pill good">{{ engineHealth?.engines.core.status ?? 'UNKNOWN' }}</b></header>
            <p>本机 Fastify control plane。V2-B 只读 Registry / Health，不修改 Manifest、Journal 或正式 F 归档。</p>
          </article>
          <article class="v2-engine-card">
            <header><div><span>DETERMINISTIC</span><h3>Local Renderer</h3></div><b class="v2-status-pill" :class="engineHealth?.engines.local_renderer.status === 'ONLINE' ? 'good' : 'muted'">{{ engineHealth?.engines.local_renderer.status ?? 'UNKNOWN' }}</b></header>
            <p>当前有效工作流：{{ engineHealth?.engines.local_renderer.workflow_codes.join(', ') || '无' }}。不依赖生成式推理。</p>
          </article>
          <article class="v2-engine-card">
            <header><div><span>GENERATIVE LOCAL</span><h3>ComfyUI</h3></div><b class="v2-status-pill" :class="engineHealth?.engines.comfyui.status === 'ONLINE' ? 'good' : (engineHealth?.engines.comfyui.required_by_current_workflows ? 'bad' : 'warn')">{{ engineHealth?.engines.comfyui.status ?? 'UNKNOWN' }}</b></header>
            <p>{{ engineHealth?.engines.comfyui.required_by_current_workflows ? '当前存在依赖 ComfyUI 的有效可执行工作流；离线会使系统 DEGRADED。' : '当前有效工作流不强制依赖 ComfyUI；离线不等于整个控制台不可用。' }}</p>
          </article>
          <article class="v2-engine-card">
            <header><div><span>CLOUD ESCALATION</span><h3>Cloud Providers</h3></div><b class="v2-status-pill muted">{{ engineHealth?.engines.cloud.status ?? 'DISABLED' }}</b></header>
            <p>V2-H 前保持关闭。未知价格、未授权 Provider 和自动付费 fallback 均禁止执行。</p>
          </article>
        </div>

        <div class="v2-system-columns">
          <article class="v2-registry-panel">
            <header><div><span>COMFYUI DETAIL</span><h2>运行状态</h2></div><b class="v2-status-pill" :class="engineHealth?.engines.comfyui.status === 'ONLINE' ? 'good' : 'muted'">{{ engineHealth?.engines.comfyui.status ?? 'UNKNOWN' }}</b></header>
            <div class="v2-detail-list">
              <div class="v2-detail-row"><span>Endpoint</span><b>{{ engineHealth?.engines.comfyui.endpoint ?? 'http://127.0.0.1:8188' }}</b></div>
              <div class="v2-detail-row"><span>当前是否必需</span><b>{{ engineHealth?.engines.comfyui.required_by_current_workflows ? 'YES' : 'NO' }}</b></div>
              <div class="v2-detail-row"><span>Native Queue</span><b>{{ engineHealth?.engines.comfyui.queue_running ?? 0 }} running / {{ engineHealth?.engines.comfyui.queue_pending ?? 0 }} pending</b></div>
              <div class="v2-detail-row"><span>GPU / Device</span><b>{{ engineHealth?.engines.comfyui.devices?.[0]?.name ?? '未读取到设备' }}</b></div>
              <div class="v2-detail-row"><span>VRAM</span><b>{{ formatBytes(engineHealth?.engines.comfyui.devices?.[0]?.vram_free) }} free / {{ formatBytes(engineHealth?.engines.comfyui.devices?.[0]?.vram_total) }} total</b></div>
            </div>
          </article>

          <article class="v2-storage-panel">
            <header><div><span>STORAGE TRUTH</span><h2>本地存储</h2></div><b class="v2-status-pill" :class="engineHealth?.storage.every((row) => row.reachable) ? 'good' : 'bad'">{{ engineHealth?.storage.every((row) => row.reachable) ? 'READY' : 'DEGRADED' }}</b></header>
            <div class="v2-storage-list">
              <div v-for="row in engineHealth?.storage ?? []" :key="row.label" class="v2-storage-row">
                <b>{{ row.label }}</b>
                <div><b>{{ row.reachable ? 'Reachable' : 'Unavailable' }}</b><small>{{ row.total_bytes ? `${formatBytes(row.free_bytes)} free / ${formatBytes(row.total_bytes)}` : '容量信息不可用' }}</small></div>
                <span class="v2-status-pill" :class="row.reachable ? 'good' : 'bad'">{{ row.reachable ? 'PASS' : 'FAIL' }}</span>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section v-else-if="currentView === 'models'" class="v2-content">
        <div class="v2-page-head">
          <div>
            <span class="v2-eyebrow">V2-B · MODEL REGISTRY</span>
            <h1>Model Registry</h1>
            <p>模型只是能力声明；是否可执行仍由它关联的 Workflow + Site Profile + Runtime registration 共同决定。</p>
          </div>
          <div class="v2-head-actions">
            <span class="v2-preview-badge">SCHEMA {{ modelRegistry?.schema_version ?? '—' }}</span>
            <button @click="refreshRegistries">↻ 刷新</button>
          </div>
        </div>

        <div v-if="registryError" class="v2-alert"><b>Model Registry 暂不可用</b><span>{{ registryError }}</span></div>

        <div class="v2-truth-note">
          <div><b>模型声明 ≠ 工作流可执行</b><p>V2-B 不把“配置里存在模型”误判成生产能力。Cloud 模型也不会在 Provider Adapter / Cost Guard 完成前提前登记为可执行。</p></div>
          <span class="v2-truth-flow">MODEL → WORKFLOW → SITE → RUNTIME</span>
        </div>

        <div v-if="modelRegistry?.models.length" class="v2-model-grid">
          <article v-for="model in modelRegistry.models" :key="model.model_key" class="v2-model-card">
            <header>
              <div><h3>{{ model.display_name }}</h3><small>{{ model.model_key }}</small></div>
              <span class="v2-status-pill" :class="model.effective_status === 'ACTIVE' ? 'good' : 'warn'">{{ model.effective_status }}</span>
            </header>
            <div class="v2-model-meta">
              <span>Provider</span><b>{{ model.provider }}</b>
              <span>Media</span><b>{{ model.media_type }}</b>
              <span>Cloud</span><b>{{ model.cloud ? 'YES' : 'NO' }}</b>
              <span>Metered cost</span><b>{{ model.metered_cost ? 'YES' : 'NO' }}</b>
              <span>Workflows</span><b>{{ model.workflow_codes.join(', ') || '—' }}</b>
              <span>Active routes</span><b>{{ model.active_workflow_codes.join(', ') || 'None' }}</b>
            </div>
            <div class="v2-chip-row"><span v-for="capability in model.capabilities" :key="capability" class="v2-chip">{{ capability }}</span></div>
            <p v-if="model.notes" class="v2-model-note">{{ model.notes }}</p>
          </article>
        </div>
        <div v-else class="v2-empty-registry">当前没有声明的模型。</div>
      </section>

      <section v-else class="v2-content">
        <div class="v2-page-head">
          <div>
            <span class="v2-eyebrow">V2-B · WORKFLOW REGISTRY</span>
            <h1>Workflow Registry</h1>
            <p>把“站点启用、运行时注册、真正可执行”拆开显示，防止配置存在就被误认为生产能力。</p>
          </div>
          <div class="v2-head-actions">
            <span class="v2-preview-badge">SCHEMA {{ workflowRegistry?.schema_version ?? '—' }}</span>
            <button @click="refreshRegistries">↻ 刷新</button>
          </div>
        </div>

        <div v-if="registryError" class="v2-alert"><b>Workflow Registry 暂不可用</b><span>{{ registryError }}</span></div>

        <div class="v2-registry-summary">
          <article class="v2-registry-card"><span>Registry 总数</span><strong>{{ workflowRegistry?.workflows.length ?? 0 }}</strong><small>声明的 workflow entries</small></article>
          <article class="v2-registry-card"><span>Site Enabled</span><strong>{{ siteEnabledWorkflows.length }}</strong><small>仅代表 Site Profile 允许</small></article>
          <article class="v2-registry-card"><span>Runtime Registered</span><strong>{{ registeredWorkflows.length }}</strong><small>运行时存在真实 binding / renderer</small></article>
          <article class="v2-registry-card"><span>Effective Executable</span><strong>{{ effectiveWorkflows.length }}</strong><small>当前真正允许执行</small></article>
        </div>

        <div class="v2-truth-note">
          <div><b>执行真值链</b><p>例如 SC01 即使出现在 Site Profile 的 enabled_workflows 中，只要真实 workflow binding 不存在，仍必须 fail closed。</p></div>
          <span class="v2-truth-flow">SITE ENABLED ∩ RUNTIME REGISTERED = EFFECTIVE</span>
        </div>

        <article class="v2-registry-panel">
          <header><div><span>WORKFLOW CAPABILITY MAP</span><h2>{{ currentSite }}</h2></div><b class="v2-status-pill purple">READ ONLY</b></header>
          <table class="v2-registry-table">
            <thead><tr><th>Code</th><th>Workflow</th><th>Engine</th><th>Site</th><th>Runtime</th><th>Effective</th><th>Scope</th><th>Registry status</th></tr></thead>
            <tbody>
              <tr v-for="row in workflowRegistry?.workflows ?? []" :key="row.code">
                <td><span class="code">{{ row.code }}</span></td>
                <td class="v2-registry-name"><b>{{ row.name_zh }}</b><small>{{ row.name_en }}</small></td>
                <td><span class="v2-engine-label">{{ workflowEngine(row) }}</span></td>
                <td><span class="v2-status-pill" :class="row.site_enabled ? 'good' : 'muted'">{{ row.site_enabled ? 'ENABLED' : 'OFF' }}</span></td>
                <td><span class="v2-status-pill" :class="row.runtime_registered ? 'good' : 'muted'">{{ row.runtime_registered ? 'REGISTERED' : 'NOT REGISTERED' }}</span></td>
                <td><span class="v2-status-pill" :class="row.effective_executable ? 'good' : 'muted'">{{ row.effective_executable ? 'EXECUTABLE' : 'BLOCKED' }}</span></td>
                <td>{{ row.scope }}</td>
                <td>{{ row.workflow_status }}</td>
              </tr>
            </tbody>
          </table>
        </article>
      </section>
    </main>
  </div>
</template>
