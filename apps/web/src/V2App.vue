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

type NavEntry = {
  label: string;
  href?: string;
  hint?: string;
  implemented?: boolean;
  badge?: "jobs" | "qa" | "assets";
};

type NavGroup = { label: string; items: NavEntry[] };

const P2_API = "http://127.0.0.1:4179";
const sites = ref<Site[]>([]);
const currentSite = ref("drift-curio");
const summary = ref<Summary | null>(null);
const jobs = ref<Job[]>([]);
const qaItems = ref<Job[]>([]);
const coreHealth = ref<any>(null);
const loading = ref(true);
const lastError = ref("");
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
      { label: "SKU Manifest", hint: "V2-B" },
      { label: "Evidence Record", hint: "V2-B" },
      { label: "Archive", href: "/assets", implemented: true },
    ],
  },
  {
    label: "系统 SYSTEM",
    items: [
      { label: "ComfyUI / Local Engines", href: "/system", implemented: true },
      { label: "Model Registry", hint: "V2-B" },
      { label: "Workflow Registry", href: "/workflows", implemented: true },
      { label: "Budget & Providers", hint: "V2-H" },
      { label: "Storage", href: "/system", implemented: true },
      { label: "Settings", hint: "V2-B" },
    ],
  },
];

const activeJobs = computed(() =>
  jobs.value.filter((job) => ["READY", "QUEUED", "RUNNING", "GENERATED"].includes(job.state)).slice(0, 5),
);
const failedJobs = computed(() =>
  jobs.value.filter((job) => job.state.startsWith("FAILED_") || job.state === "QA_FAIL").slice(0, 5),
);
const pendingQa = computed(() => qaItems.value.filter((job) => job.state === "QA_PENDING").slice(0, 5));
const assetCount = computed(() => jobs.value.filter((job) => Boolean(job.generated_filename)).length);
const activeGeneration = computed(() => (summary.value?.generation.queued ?? 0) + (summary.value?.generation.running ?? 0));

const searchResults = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return [];
  const routeHits = navGroups
    .flatMap((group) => group.items)
    .filter((item) => item.implemented && item.href && item.label.toLowerCase().includes(query))
    .slice(0, 4)
    .map((item) => ({ type: "页面", label: item.label, detail: item.href!, href: item.href! }));
  const jobHits = jobs.value
    .filter((job) =>
      [job.job_id, job.item_id, job.workflow_code, job.source_filename ?? "", job.generated_filename ?? ""]
        .some((value) => value.toLowerCase().includes(query)),
    )
    .slice(0, 6)
    .map((job) => ({
      type: "任务",
      label: job.item_id,
      detail: `${job.workflow_code} · ${job.state} · ${job.job_id.slice(0, 12)}…`,
      href: "/jobs",
    }));
  return [...routeHits, ...jobHits].slice(0, 8);
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

async function p2Fetch<T>(path: string): Promise<T> {
  const response = await fetch(`${P2_API}${path}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `HTTP_${response.status}`);
  return body as T;
}

async function refreshDashboard() {
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

async function loadSites() {
  sites.value = await fetch("/api/sites").then((response) => response.json()).catch(() => []);
  if (sites.value.length && !sites.value.some((site) => site.site_id === currentSite.value)) {
    currentSite.value = sites.value[0].site_id;
  }
}

function selectSearchResult(href: string) {
  searchOpen.value = false;
  searchQuery.value = "";
  openLegacy(href);
}

watch(currentSite, () => void refreshDashboard());

onMounted(async () => {
  await loadSites();
  await refreshDashboard();
  pollTimer = window.setInterval(() => void refreshDashboard(), 5_000);
});

onUnmounted(() => {
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

      <button class="v2-dashboard-link active">
        <span class="v2-nav-icon">⌂</span><span>首页</span>
      </button>

      <div class="v2-nav-scroll">
        <section v-for="group in navGroups" :key="group.label" class="v2-nav-group">
          <h4>{{ group.label }}</h4>
          <button
            v-for="item in group.items"
            :key="item.label"
            class="v2-nav-item"
            :class="{ disabled: !item.implemented }"
            :disabled="!item.implemented"
            @click="openLegacy(item.href)"
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
          <span><i :class="{ online: summary?.system.comfyui === 'ONLINE' }"></i> ComfyUI</span>
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
          <span :class="summary?.system.comfyui === 'ONLINE' ? 'good' : 'bad'">● {{ summary?.system.comfyui === 'ONLINE' ? 'ComfyUI' : 'ComfyUI 离线' }}</span>
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
          <button class="active">首页 <span>×</span></button>
          <button @click="openLegacy('/workspace')">Production Pieces</button>
          <button @click="openLegacy('/jobs')">任务队列</button>
          <button @click="openLegacy('/qa')">Human Visual Gate</button>
        </div>

        <div class="v2-search-wrap">
          <div class="v2-search">
            <span>⌕</span>
            <input
              v-model="searchQuery"
              placeholder="搜索 SKU / Job / Workflow / 页面"
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

      <section class="v2-content">
        <div class="v2-page-head">
          <div>
            <span class="v2-eyebrow">VISUAL PRODUCTION CONTROL PLANE</span>
            <h1>生产总览</h1>
            <p>先看运行、失败、人工 Gate、引擎和成本，再决定下一步动作。</p>
          </div>
          <div class="v2-head-actions">
            <span class="v2-preview-badge">V2-A PREVIEW</span>
            <button @click="refreshDashboard">↻ 刷新</button>
            <button class="primary" @click="openLegacy('/workspace')">进入生产工作台</button>
          </div>
        </div>

        <div v-if="lastError" class="v2-alert">
          <b>V2 summary 暂不可用</b><span>{{ lastError }}</span>
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
              <button @click="openLegacy('/system')">系统状态 ›</button>
            </div>
            <div class="v2-health-row">
              <div><span class="v2-health-dot" :class="{ online: coreHealth?.ok }"></span><div><b>Visual Console Core</b><small>{{ coreHealth?.ok ? 'Core API online' : 'Core API offline' }}</small></div></div>
              <strong :class="coreHealth?.ok ? 'good' : 'bad'">{{ coreHealth?.ok ? 'ONLINE' : 'OFFLINE' }}</strong>
            </div>
            <div class="v2-health-row">
              <div><span class="v2-health-dot" :class="{ online: summary?.system.comfyui === 'ONLINE' }"></span><div><b>ComfyUI</b><small>Native {{ summary?.system.comfy_queue_running ?? 0 }} running / {{ summary?.system.comfy_queue_pending ?? 0 }} pending</small></div></div>
              <strong :class="summary?.system.comfyui === 'ONLINE' ? 'good' : 'bad'">{{ summary?.system.comfyui ?? 'UNKNOWN' }}</strong>
            </div>
            <div class="v2-health-row">
              <div><span class="v2-health-dot" :class="{ online: summary?.system.worker === 'IDLE' }"></span><div><b>Local Worker</b><small>App queue depth {{ summary?.system.queue_depth ?? 0 }}</small></div></div>
              <strong>{{ summary?.system.worker ?? 'UNKNOWN' }}</strong>
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
    </main>
  </div>
</template>
