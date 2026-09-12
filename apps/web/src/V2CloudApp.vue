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
  cloud_cost: { enabled: boolean; currency: string; today: number; month: number; reason?: string };
};
type EngineHealth = { ok: boolean; overall: "READY" | "DEGRADED" };
type ProviderProjection = {
  provider_key: string;
  display_name: string;
  media_types: string[];
  adapter_status: string;
  enabled: boolean;
  pricing_status: string;
  credential_configured: boolean;
  model_count: number;
  enabled_model_count: number;
};
type CloudProjection = {
  ok: boolean;
  generated_at: string;
  authority: string;
  registry: {
    schema_version: string;
    cloud_enabled: boolean;
    currency: string;
    limits: { per_job: number; per_sku: number; daily: number; monthly: number };
    configured_provider_count: number;
    providers: ProviderProjection[];
  };
  default_guard: {
    allowed: boolean;
    fail_closed: boolean;
    currency: string;
    estimated_cost: number | null;
    reasons: string[];
  };
  audit: {
    provider_calls_enabled: boolean;
    paid_generation_adapter: string;
    actual_spend_tracking: string;
  };
};

const P2_API = "http://127.0.0.1:4179";
const sites = ref<Site[]>([]);
const currentSite = ref("drift-curio");
const summary = ref<Summary | null>(null);
const engineHealth = ref<EngineHealth | null>(null);
const cloud = ref<CloudProjection | null>(null);
const loading = ref(true);
const error = ref("");
let pollTimer: number | undefined;

const currency = computed(() => cloud.value?.registry.currency ?? "USD");
const cloudEnabled = computed(() => Boolean(cloud.value?.registry.cloud_enabled));
const guardAllowed = computed(() => Boolean(cloud.value?.default_guard.allowed));
const providerCount = computed(() => cloud.value?.registry.providers.length ?? 0);
const configuredCount = computed(() => cloud.value?.registry.configured_provider_count ?? 0);
const limits = computed(() => cloud.value?.registry.limits ?? { per_job: 0, per_sku: 0, daily: 0, monthly: 0 });

function go(path: string) { window.location.assign(path); }

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
    const [summaryData, healthData, cloudData] = await Promise.all([
      p2Fetch<Summary>(`/api/v2/summary?site_id=${site}`),
      p2Fetch<EngineHealth>(`/api/v2/engines/health?site_id=${site}`),
      p2Fetch<CloudProjection>("/api/v2/cloud"),
    ]);
    summary.value = summaryData;
    engineHealth.value = healthData;
    cloud.value = cloudData;
  } catch (caught: any) {
    error.value = caught?.message ?? String(caught);
  } finally {
    loading.value = false;
  }
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.value, minimumFractionDigits: 2 }).format(value || 0);
}

function statusClass(value: string | boolean) {
  const normalized = String(value).toUpperCase();
  if (["READY", "KNOWN", "ENABLED", "TRUE"].includes(normalized)) return "good";
  if (["UNKNOWN", "NOT_CONFIGURED", "DISABLED", "FALSE"].includes(normalized)) return "bad";
  return "neutral";
}

function reasonLabel(reason: string) {
  const map: Record<string, string> = {
    CLOUD_DISABLED: "Cloud 总开关关闭",
    PROVIDER_REQUIRED: "尚未选择 Provider",
    PROVIDER_NOT_REGISTERED: "Provider 未注册",
    PROVIDER_DISABLED: "Provider 未启用",
    PROVIDER_ADAPTER_NOT_READY: "Provider Adapter 未就绪",
    PROVIDER_PRICING_UNKNOWN: "Provider 价格元数据未知",
    MODEL_NOT_REGISTERED: "Model 未注册",
    MODEL_DISABLED: "Model 未启用",
    MODEL_PRICING_UNKNOWN: "Model 价格元数据未知",
    ESTIMATED_COST_REQUIRED: "缺少可信 estimated cost",
    PER_JOB_LIMIT_NOT_CONFIGURED: "单任务预算上限未配置",
    PER_SKU_LIMIT_NOT_CONFIGURED: "单 SKU 累计预算未配置",
    DAILY_LIMIT_NOT_CONFIGURED: "每日预算未配置",
    MONTHLY_LIMIT_NOT_CONFIGURED: "每月预算未配置",
  };
  return map[reason] ?? reason;
}

watch(currentSite, () => void refresh());

onMounted(async () => {
  await loadSites();
  await refresh();
  pollTimer = window.setInterval(() => void refresh(), 10_000);
});

onUnmounted(() => {
  if (pollTimer) window.clearInterval(pollTimer);
});
</script>

<template>
  <div class="v2-shell v2h-shell">
    <aside class="v2-sidebar">
      <div class="v2-brand"><div class="v2-brand-mark">VC</div><div><strong>Visual Console</strong><span>V2 · LOCAL FIRST</span></div></div>
      <button class="v2-dashboard-link" @click="go('/v2')"><span class="v2-nav-icon">⌂</span><span>首页</span></button>
      <div class="v2-nav-scroll">
        <section class="v2-nav-group">
          <h4>生产 PRODUCTION</h4>
          <button class="v2-nav-item" @click="go('/workspace')"><span>Production Pieces</span><span class="v2-nav-arrow">›</span></button>
          <button class="v2-nav-item" @click="go('/v2/production/image')"><span>Image Generation</span><span class="v2-nav-arrow">›</span></button>
          <button class="v2-nav-item" @click="go('/v2/production/scene')"><span>Scene Generation</span><span class="v2-nav-arrow">›</span></button>
          <button class="v2-nav-item" @click="go('/v2/production/batch')"><span>Batch Generation</span><span class="v2-nav-arrow">›</span></button>
          <button class="v2-nav-item" @click="go('/v2/canvas')"><span>Creation Canvas</span><span class="v2-nav-arrow">›</span></button>
          <button class="v2-nav-item" @click="go('/v2/copilot')"><span>Visual Copilot</span><b>LOCAL</b></button>
        </section>
        <section class="v2-nav-group"><h4>任务 JOBS</h4><button class="v2-nav-item" @click="go('/v2/jobs')"><span>任务队列</span><b>{{ summary?.system.queue_depth ?? 0 }}</b></button><button class="v2-nav-item" @click="go('/v2/jobs/history')"><span>任务历史</span><span class="v2-nav-arrow">›</span></button><button class="v2-nav-item" @click="go('/v2/jobs/failed')"><span>失败 / 重试</span><b>{{ summary?.generation.failed ?? 0 }}</b></button></section>
        <section class="v2-nav-group"><h4>质量 QUALITY</h4><button class="v2-nav-item" @click="go('/qa')"><span>Human Visual Gate</span><b>{{ summary?.qa.pending ?? 0 }}</b></button></section>
        <section class="v2-nav-group"><h4>资产 ASSETS</h4><button class="v2-nav-item" @click="go('/v2/assets')"><span>Piece Assets</span><span class="v2-nav-arrow">›</span></button><button class="v2-nav-item" @click="go('/v2/prompts')"><span>Prompt Library</span><span class="v2-nav-arrow">›</span></button></section>
        <section class="v2-nav-group"><h4>证据 EVIDENCE</h4><button class="v2-nav-item" @click="go('/assets')"><span>Archive</span><span class="v2-nav-arrow">›</span></button></section>
        <section class="v2-nav-group">
          <h4>系统 SYSTEM</h4>
          <button class="v2-nav-item" @click="go('/v2/system')"><span>ComfyUI / Local Engines</span><span class="v2-nav-arrow">›</span></button>
          <button class="v2-nav-item" @click="go('/v2/models')"><span>Model Registry</span><span class="v2-nav-arrow">›</span></button>
          <button class="v2-nav-item" @click="go('/v2/workflows')"><span>Workflow Registry</span><span class="v2-nav-arrow">›</span></button>
          <button class="v2-nav-item active"><span>Budget & Providers</span><b>LOCKED</b></button>
        </section>
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
        <div class="v2-cloud-pill"><span>CLOUD COST</span><b>{{ cloudEnabled ? money(summary?.cloud_cost.today ?? 0) : '未启用' }}</b></div>
      </header>

      <div class="v2-toolbar">
        <div class="v2-tabs"><button @click="go('/v2')">首页</button><button @click="go('/workspace')">Production Pieces</button><button @click="go('/v2/canvas')">Creation Canvas</button><button @click="go('/v2/copilot')">Visual Copilot</button><button class="active">Budget & Providers <span>×</span></button></div>
        <div class="v2-search-wrap"><div class="v2-search"><span>⌕</span><input readonly value="Cost Guard / Provider Registry"/><kbd>V2-H</kbd></div></div>
      </div>

      <section class="v2h-content">
        <div class="v2h-head">
          <div><span class="v2-eyebrow">V2-H · CLOUD ESCALATION</span><h1>Budget & Providers</h1><p>先建立 Provider Registry 与 Cost Guard 真值；本阶段不调用任何付费生成 API。</p></div>
          <div class="v2h-head-actions"><span>CLOUD {{ cloudEnabled ? 'ENABLED' : 'DISABLED' }}</span><span>FAIL CLOSED</span><span>READ ONLY</span><button @click="refresh">↻ 刷新</button></div>
        </div>

        <div v-if="error" class="v2h-error">{{ error }}</div>

        <div class="v2h-summary-grid">
          <article><span>Cloud Mode</span><strong :class="cloudEnabled ? 'good-text' : 'bad-text'">{{ cloudEnabled ? 'ENABLED' : 'DISABLED' }}</strong><small>registry truth</small></article>
          <article><span>Configured Providers</span><strong>{{ configuredCount }} / {{ providerCount }}</strong><small>adapter READY + enabled</small></article>
          <article><span>Cost Guard</span><strong :class="guardAllowed ? 'good-text' : 'bad-text'">{{ guardAllowed ? 'ALLOW' : 'BLOCKING' }}</strong><small>{{ cloud?.authority ?? 'COST_GUARD_FAIL_CLOSED' }}</small></article>
          <article><span>Actual Spend</span><strong>UNAVAILABLE</strong><small>{{ cloud?.audit.actual_spend_tracking ?? 'NOT_IMPLEMENTED' }}</small></article>
        </div>

        <div class="v2h-grid">
          <section class="v2h-panel v2h-guard">
            <header><div><span class="v2h-kicker">COST GUARD</span><h2>预算与不可逆调用门槛</h2></div><span class="v2h-state bad">{{ guardAllowed ? 'ALLOW' : 'FAIL CLOSED' }}</span></header>
            <div class="v2h-budget-grid">
              <div><span>Per Job</span><b>{{ money(limits.per_job) }}</b><small>{{ limits.per_job > 0 ? 'configured' : '未配置' }}</small></div>
              <div><span>Per SKU</span><b>{{ money(limits.per_sku) }}</b><small>{{ limits.per_sku > 0 ? 'configured' : '未配置' }}</small></div>
              <div><span>Daily</span><b>{{ money(limits.daily) }}</b><small>{{ limits.daily > 0 ? 'configured' : '未配置' }}</small></div>
              <div><span>Monthly</span><b>{{ money(limits.monthly) }}</b><small>{{ limits.monthly > 0 ? 'configured' : '未配置' }}</small></div>
            </div>
            <div class="v2h-blockers">
              <span>Current blockers</span>
              <div v-if="loading">读取中…</div>
              <ul v-else-if="cloud?.default_guard.reasons.length"><li v-for="reason in cloud.default_guard.reasons" :key="reason"><code>{{ reason }}</code><span>{{ reasonLabel(reason) }}</span></li></ul>
              <div v-else class="v2h-empty-good">当前默认 guard 没有 blocker；仍需具体 Provider / Model / cost request 才能形成任务级授权。</div>
            </div>
          </section>

          <section class="v2h-panel v2h-audit">
            <header><div><span class="v2h-kicker">EXECUTION AUTHORITY</span><h2>付费调用边界</h2></div><span class="v2h-state bad">LOCKED</span></header>
            <div class="v2h-audit-list">
              <div><span>Provider calls</span><b>{{ cloud?.audit.provider_calls_enabled ? 'ENABLED' : 'DISABLED' }}</b></div>
              <div><span>Paid generation adapter</span><b>{{ cloud?.audit.paid_generation_adapter ?? 'NOT_IMPLEMENTED' }}</b></div>
              <div><span>Actual spend tracking</span><b>{{ cloud?.audit.actual_spend_tracking ?? 'NOT_IMPLEMENTED' }}</b></div>
              <div><span>Silent cloud fallback</span><b>FORBIDDEN</b></div>
            </div>
            <p>这个页面目前只有读取权。即使未来 Cost Guard 纯函数返回 ALLOW，也不代表存在可执行的 Provider Adapter。</p>
          </section>
        </div>

        <section class="v2h-panel v2h-providers">
          <header><div><span class="v2h-kicker">PROVIDER REGISTRY</span><h2>候选云能力</h2><p>这里只声明候选 Provider family；价格、模型与 Adapter 未验证前不赋予执行能力。</p></div><span class="v2h-schema">SCHEMA {{ cloud?.registry.schema_version ?? '—' }}</span></header>
          <div class="v2h-provider-grid">
            <article v-for="provider in cloud?.registry.providers ?? []" :key="provider.provider_key" class="v2h-provider-card">
              <div class="v2h-provider-title"><div><span>{{ provider.provider_key }}</span><h3>{{ provider.display_name }}</h3></div><span class="v2h-state" :class="statusClass(provider.adapter_status)">{{ provider.adapter_status }}</span></div>
              <dl>
                <div><dt>Media</dt><dd>{{ provider.media_types.join(' / ') || '—' }}</dd></div>
                <div><dt>Provider enabled</dt><dd :class="statusClass(provider.enabled)">{{ provider.enabled ? 'YES' : 'NO' }}</dd></div>
                <div><dt>Pricing metadata</dt><dd :class="statusClass(provider.pricing_status)">{{ provider.pricing_status }}</dd></div>
                <div><dt>Credential configured</dt><dd :class="provider.credential_configured ? 'good' : 'neutral'">{{ provider.credential_configured ? 'YES' : 'NO' }}</dd></div>
                <div><dt>Models</dt><dd>{{ provider.enabled_model_count }} enabled / {{ provider.model_count }} declared</dd></div>
              </dl>
              <p>凭据值不会返回浏览器；Provider 未同时满足 enabled + adapter READY + known pricing + budget 时保持阻断。</p>
            </article>
            <div v-if="!loading && !(cloud?.registry.providers.length)" class="v2h-empty">Provider Registry 为空。</div>
          </div>
        </section>

        <section class="v2h-boundary">
          <div><span>AUTHORITY</span><b>COST_GUARD_FAIL_CLOSED</b></div>
          <p>V2-H Foundation 只建立 Registry、预算门槛与只读可视化。没有 OpenAI / Seedance 网络请求，没有付费任务提交，没有自动 Cloud escalation，也没有修改 Job / QA / Archive / RAW/source truth。</p>
        </section>
      </section>
    </main>
  </div>
</template>
