<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

type Site = { site_id: string; display_name: string; display_name_zh: string };
type Summary = {
  ok: boolean;
  day_key: string;
  generation: { queued: number; running: number; completed: number; failed: number };
  qa: { pending: number; passed: number; rejected: number };
  archive: { ready: number; archived: number };
  system: {
    comfyui: "ONLINE" | "OFFLINE";
    worker: "BUSY" | "IDLE";
    queue_depth: number;
  };
  cloud_cost: { enabled: boolean; currency: string; today: number; month: number };
};

type EngineHealth = {
  ok: boolean;
  overall: "READY" | "DEGRADED";
};

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

type JobsResponse = {
  ok: boolean;
  site_id: string;
  source: string;
  torn_tail_ignored: boolean;
  total: number;
  jobs: UnifiedJob[];
};

type Mode = "queue" | "history" | "failed";

const P2_API = "http://127.0.0.1:4179";
const sites = ref<Site[]>([]);
const currentSite = ref("drift-curio");
const summary = ref<Summary | null>(null);
const engineHealth = ref<EngineHealth | null>(null);
const jobsResponse = ref<JobsResponse | null>(null);
const loading = ref(true);
const error = ref("");
const search = ref("");
const actionFilter = ref("ALL");
const retryingJobId = ref("");
const retryMessage = ref("");
const currentPath = ref(window.location.pathname);
let pollTimer: number | undefined;

const mode = computed<Mode>(() => {
  if (currentPath.value.startsWith("/v2/jobs/failed")) return "failed";
  if (currentPath.value.startsWith("/v2/jobs/history")) return "history";
  return "queue";
});

const allJobs = computed(() => jobsResponse.value?.jobs ?? []);
const queueJobs = computed(() =>
  allJobs.value.filter((job) => ["QUEUED", "RUNNING"].includes(job.generation_state)),
);
const failedJobs = computed(() =>
  allJobs.value.filter((job) => job.generation_state === "FAILED" || job.qa_state === "QA_FAIL"),
);
const historyJobs = computed(() =>
  allJobs.value.filter((job) => !["QUEUED", "RUNNING"].includes(job.generation_state)),
);
const reviewCount = computed(() => allJobs.value.filter((job) => job.qa_state === "QA_PENDING").length);
const retryCount = computed(() => allJobs.value.filter((job) => job.retryable).length);

const baseRows = computed(() => {
  if (mode.value === "failed") return failedJobs.value;
  if (mode.value === "history") return historyJobs.value;
  return queueJobs.value;
});

const rows = computed(() => {
  const q = search.value.trim().toLowerCase();
  return baseRows.value.filter((job) => {
    if (actionFilter.value !== "ALL" && job.action_required !== actionFilter.value) return false;
    if (!q) return true;
    return [
      job.job_id,
      job.item_id,
      job.workflow_code,
      job.source_filename ?? "",
      job.generated_filename ?? "",
      job.legacy_state,
      job.error ?? "",
    ].some((value) => value.toLowerCase().includes(q));
  });
});

const modeTitle = computed(() => {
  if (mode.value === "failed") return "失败 / 重试";
  if (mode.value === "history") return "任务历史";
  return "任务队列";
});

const modeDescription = computed(() => {
  if (mode.value === "failed") return "只处理执行失败或 QA 未通过；重试创建新任务，不覆盖原始记录。";
  if (mode.value === "history") return "查看已完成生成、QA 状态与归档投影；执行成功不等于 QA 或正式归档。";
  return "查看当前排队与运行中的生成任务；Human Visual Gate 保持独立。";
});

function generationLabel(value: UnifiedJob["generation_state"]) {
  return { QUEUED: "待执行", RUNNING: "运行中", SUCCEEDED: "执行成功", FAILED: "执行失败" }[value];
}

function qaLabel(value: UnifiedJob["qa_state"]) {
  return {
    NOT_REQUIRED: "未进入审核",
    QA_PENDING: "待人工审核",
    QA_PASS: "QA 通过",
    QA_FAIL: "QA 未通过",
  }[value];
}

function archiveLabel(value: UnifiedJob["archive_state"]) {
  return {
    STAGING: "Staging",
    ARCHIVE_READY: "待归档",
    VERIFIED_ARCHIVE: "已验证归档",
    REJECTED: "Rejected",
  }[value];
}

function actionLabel(value: UnifiedJob["action_required"]) {
  return {
    NONE: "无需动作",
    HUMAN_REVIEW: "人工审核",
    RETRY_AVAILABLE: "可重试",
  }[value];
}

function routeMode(next: Mode) {
  const path = next === "queue" ? "/v2/jobs" : `/v2/jobs/${next}`;
  if (window.location.pathname !== path) window.history.pushState({}, "", path);
  currentPath.value = path;
  actionFilter.value = "ALL";
  search.value = "";
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

async function refresh() {
  error.value = "";
  try {
    const site = encodeURIComponent(currentSite.value);
    const [summaryData, healthData, jobData] = await Promise.all([
      p2Fetch<Summary>(`/api/v2/summary?site_id=${site}`),
      p2Fetch<EngineHealth>(`/api/v2/engines/health?site_id=${site}`),
      p2Fetch<JobsResponse>(`/api/v2/jobs?site_id=${site}&limit=500`),
    ]);
    summary.value = summaryData;
    engineHealth.value = healthData;
    jobsResponse.value = jobData;
  } catch (caught: any) {
    error.value = caught?.message ?? String(caught);
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

async function retryJob(job: UnifiedJob) {
  if (!job.retryable || retryingJobId.value) return;
  const accepted = window.confirm(
    `为 ${job.item_id} 创建新的 ${job.workflow_code} 重试任务？\n\n原任务 ${job.job_id} 会保留，不会被覆盖。`,
  );
  if (!accepted) return;
  retryingJobId.value = job.job_id;
  retryMessage.value = "";
  try {
    const site = encodeURIComponent(currentSite.value);
    // Prime the authoritative P2 in-memory job map from its durable journal before
    // calling the existing retry mutation. This keeps V2-C from creating a second
    // queue/write path while still making retry reliable after a server restart.
    await p2Fetch(`/api/jobs?site_id=${site}`);
    const result = await p2Fetch<{ ok: boolean; job: { job_id: string }; retry_of: string }>(
      `/api/jobs/${encodeURIComponent(job.job_id)}/retry`,
      { method: "POST" },
    );
    retryMessage.value = `已创建重试任务 ${result.job.job_id.slice(0, 18)}…`;
    await refresh();
    routeMode("queue");
  } catch (caught: any) {
    retryMessage.value = `重试失败：${caught?.message ?? String(caught)}`;
  } finally {
    retryingJobId.value = "";
  }
}

function handlePopstate() {
  currentPath.value = window.location.pathname;
}

watch(currentSite, () => void refresh());

onMounted(async () => {
  window.addEventListener("popstate", handlePopstate);
  await loadSites();
  await refresh();
  pollTimer = window.setInterval(() => void refresh(), 7_500);
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

      <button class="v2-dashboard-link active-soft" @click="go('/v2')">
        <span class="v2-nav-icon">⌂</span><span>首页</span>
      </button>

      <div class="v2-nav-scroll">
        <section class="v2-nav-group">
          <h4>生产 PRODUCTION</h4>
          <button class="v2-nav-item" @click="go('/workspace')"><span>Production Pieces</span><span class="v2-nav-arrow">›</span></button>
        </section>
        <section class="v2-nav-group">
          <h4>任务 JOBS</h4>
          <button class="v2-nav-item" :class="{ active: mode === 'queue' }" @click="routeMode('queue')"><span>任务队列</span><b>{{ queueJobs.length }}</b></button>
          <button class="v2-nav-item" :class="{ active: mode === 'history' }" @click="routeMode('history')"><span>任务历史</span><span class="v2-nav-arrow">›</span></button>
          <button class="v2-nav-item" :class="{ active: mode === 'failed' }" @click="routeMode('failed')"><span>失败 / 重试</span><b>{{ failedJobs.length }}</b></button>
        </section>
        <section class="v2-nav-group">
          <h4>质量 QUALITY</h4>
          <button class="v2-nav-item" @click="go('/qa')"><span>Human Visual Gate</span><b>{{ reviewCount }}</b></button>
        </section>
        <section class="v2-nav-group">
          <h4>资产 ASSETS</h4>
          <button class="v2-nav-item" @click="go('/assets')"><span>Piece Assets</span><span class="v2-nav-arrow">›</span></button>
        </section>
        <section class="v2-nav-group">
          <h4>证据 EVIDENCE</h4>
          <button class="v2-nav-item" @click="go('/assets')"><span>Archive</span><span class="v2-nav-arrow">›</span></button>
        </section>
        <section class="v2-nav-group">
          <h4>系统 SYSTEM</h4>
          <button class="v2-nav-item" @click="go('/v2/system')"><span>ComfyUI / Local Engines</span><span class="v2-nav-arrow">›</span></button>
          <button class="v2-nav-item" @click="go('/v2/models')"><span>Model Registry</span><span class="v2-nav-arrow">›</span></button>
          <button class="v2-nav-item" @click="go('/v2/workflows')"><span>Workflow Registry</span><span class="v2-nav-arrow">›</span></button>
        </section>
      </div>

      <div class="v2-sidebar-footer">
        <label>Site Profile</label>
        <select v-model="currentSite">
          <option v-for="site in sites" :key="site.site_id" :value="site.site_id">{{ site.display_name_zh || site.display_name }}</option>
        </select>
        <div class="v2-runtime-mini">
          <span><i :class="{ online: Boolean(summary) }"></i> Core API</span>
          <span><i :class="{ online: summary?.system.comfyui === 'ONLINE' }"></i> ComfyUI</span>
        </div>
      </div>
    </aside>

    <main class="v2-main">
      <header class="v2-monitor">
        <div class="v2-today"><span>TODAY</span><b>{{ summary?.day_key ?? '—' }}</b></div>
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
          <span>CLOUD COST</span><b>{{ summary?.cloud_cost.enabled ? `${summary.cloud_cost.currency} ${summary.cloud_cost.today.toFixed(2)}` : '未启用' }}</b>
        </div>
      </header>

      <div class="v2-toolbar">
        <div class="v2-tabs">
          <button @click="go('/v2')">首页</button>
          <button @click="go('/workspace')">Production Pieces</button>
          <button class="active">{{ modeTitle }} <span>×</span></button>
          <button @click="go('/qa')">Human Visual Gate</button>
        </div>
        <div class="v2-search-wrap">
          <div class="v2-search"><span>⌕</span><input v-model="search" placeholder="搜索 SKU / Job / Workflow"/><kbd>V2-C</kbd></div>
        </div>
      </div>

      <section class="v2-content v2c-jobs-content">
        <div class="v2-page-head">
          <div>
            <span class="v2-eyebrow">V2-C · UNIFIED JOBS</span>
            <h1>{{ modeTitle }}</h1>
            <p>{{ modeDescription }}</p>
          </div>
          <div class="v2-head-actions">
            <span class="v2-preview-badge">JOURNAL TRUTH</span>
            <button @click="refresh">↻ 刷新</button>
            <button class="primary" @click="go('/workspace')">进入生产工作台</button>
          </div>
        </div>

        <div v-if="error" class="v2-alert"><b>任务数据暂不可用</b><span>{{ error }}</span></div>
        <div v-if="retryMessage" class="v2c-message" :class="{ bad: retryMessage.startsWith('重试失败') }">{{ retryMessage }}</div>

        <div class="v2c-kpis">
          <button :class="{ active: mode === 'queue' }" @click="routeMode('queue')"><span>Queue</span><strong>{{ queueJobs.length }}</strong><small>Queued + Running</small></button>
          <button :class="{ active: mode === 'history' }" @click="routeMode('history')"><span>History</span><strong>{{ historyJobs.length }}</strong><small>非运行中任务</small></button>
          <button :class="{ active: mode === 'failed' }" @click="routeMode('failed')"><span>Failed / QA Fail</span><strong>{{ failedJobs.length }}</strong><small>可定位异常</small></button>
          <article><span>Human Review</span><strong>{{ reviewCount }}</strong><small>QA_PENDING</small></article>
        </div>

        <div class="v2c-truth-banner">
          <div><b>Generation ≠ QA ≠ Archive</b><span>页面读取 P2 durable job journal，只做状态投影；QA PASS 不会被自动推断为正式 Archive。</span></div>
          <div class="v2c-truth-meta"><span>Source</span><b>{{ jobsResponse?.source ?? 'P2_JOB_JOURNAL_READ_ONLY' }}</b></div>
        </div>

        <div class="v2c-filterbar">
          <div class="v2c-mode-tabs">
            <button :class="{ active: mode === 'queue' }" @click="routeMode('queue')">任务队列</button>
            <button :class="{ active: mode === 'history' }" @click="routeMode('history')">任务历史</button>
            <button :class="{ active: mode === 'failed' }" @click="routeMode('failed')">失败 / 重试</button>
          </div>
          <div class="v2c-filters">
            <select v-model="actionFilter">
              <option value="ALL">全部动作</option>
              <option value="HUMAN_REVIEW">需要人工审核</option>
              <option value="RETRY_AVAILABLE">可重试</option>
              <option value="NONE">无需动作</option>
            </select>
            <span>{{ rows.length }} / {{ baseRows.length }}</span>
          </div>
        </div>

        <div class="v2c-table-card">
          <div class="v2c-table-head">
            <span>SKU / Job</span><span>Workflow</span><span>Generation</span><span>QA</span><span>Archive</span><span>Action</span><span>Updated</span>
          </div>
          <div v-if="rows.length" class="v2c-table-body">
            <article v-for="job in rows" :key="job.job_id" class="v2c-row">
              <div class="v2c-job-identity">
                <b>{{ job.item_id }}</b>
                <small>{{ job.job_id }}</small>
                <small>{{ job.source_filename ?? job.generated_filename ?? 'No filename recorded' }}</small>
              </div>
              <div><b>{{ job.workflow_code }}</b><small>legacy: {{ job.legacy_state }}</small></div>
              <div><span class="v2c-pill" :data-state="job.generation_state">{{ generationLabel(job.generation_state) }}</span></div>
              <div><span class="v2c-pill" :data-state="job.qa_state">{{ qaLabel(job.qa_state) }}</span><small v-if="job.qa_note">{{ job.qa_note }}</small></div>
              <div><span class="v2c-pill" :data-state="job.archive_state">{{ archiveLabel(job.archive_state) }}</span></div>
              <div class="v2c-action-cell">
                <button v-if="job.action_required === 'HUMAN_REVIEW'" @click="go('/qa')">进入审核</button>
                <button v-else-if="job.retryable" class="danger" :disabled="Boolean(retryingJobId)" @click="retryJob(job)">{{ retryingJobId === job.job_id ? '创建中…' : '创建重试任务' }}</button>
                <span v-else>{{ actionLabel(job.action_required) }}</span>
                <small v-if="job.error" class="v2c-error-text" :title="job.error">{{ job.error }}</small>
              </div>
              <time>{{ new Date(job.updated_at).toLocaleString() }}</time>
            </article>
          </div>
          <div v-else class="v2-empty v2c-empty">
            <b>{{ loading ? '正在读取任务…' : '当前筛选条件下没有任务' }}</b>
            <span v-if="!loading && mode === 'queue'">Worker 空闲时这里保持为空。</span>
            <span v-else-if="!loading && mode === 'failed'">没有执行失败或 QA 未通过任务。</span>
            <span v-else-if="!loading">完成后的任务会保留在 durable journal 中。</span>
          </div>
        </div>

        <div class="v2c-footnote">
          <span>Retry available: {{ retryCount }}</span>
          <span v-if="jobsResponse?.torn_tail_ignored" class="bad">Journal torn tail detected and ignored</span>
          <span>Archive projection remains conservative until a formal archive adapter is connected.</span>
        </div>
      </section>
    </main>
  </div>
</template>
