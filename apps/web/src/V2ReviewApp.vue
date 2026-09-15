<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";

type Site = { site_id: string; display_name: string; display_name_zh: string };
type QaJob = {
  job_id: string;
  site_id: string;
  item_id: string;
  workflow_code: string;
  state: "QA_PENDING" | "QA_PASS" | "QA_FAIL";
  generated_asset_id?: string;
  generated_filename?: string;
  qa_note?: string;
  updated_at: string;
};

const P2_API = "http://127.0.0.1:4179";
const sites = ref<Site[]>([]);
const currentSite = ref("drift-curio");
const jobs = ref<QaJob[]>([]);
const loading = ref(true);
const error = ref("");
const busy = ref("");
const notes = ref<Record<string, string>>({});
const filter = ref<"PENDING" | "ALL">("PENDING");

const rows = computed(() => filter.value === "PENDING" ? jobs.value.filter((job) => job.state === "QA_PENDING") : jobs.value);
const pendingCount = computed(() => jobs.value.filter((job) => job.state === "QA_PENDING").length);

function go(path: string) { window.location.assign(path); }
function imageUrl(job: QaJob) {
  if (!job.generated_asset_id) return "";
  return `${P2_API}/api/assets/generated/${encodeURIComponent(job.site_id)}/${encodeURIComponent(job.item_id)}/${encodeURIComponent(job.generated_asset_id)}/content`;
}

async function p2Fetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${P2_API}${path}`, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `HTTP_${res.status}`);
  return body as T;
}

async function loadSites() {
  sites.value = await fetch("/api/sites").then((r) => r.json()).catch(() => []);
  if (sites.value.length && !sites.value.some((site) => site.site_id === currentSite.value)) currentSite.value = sites.value[0].site_id;
}

async function refresh() {
  error.value = "";
  loading.value = true;
  try {
    jobs.value = await p2Fetch<QaJob[]>(`/api/qa?site_id=${encodeURIComponent(currentSite.value)}`);
    for (const job of jobs.value) if (!(job.job_id in notes.value)) notes.value[job.job_id] = job.qa_note ?? "";
  } catch (caught: any) {
    error.value = caught?.message ?? String(caught);
  } finally {
    loading.value = false;
  }
}

async function decide(job: QaJob, decision: "PASS" | "FAIL" | "NOTE") {
  if (!job.generated_asset_id || busy.value) return;
  busy.value = job.job_id;
  error.value = "";
  try {
    await p2Fetch(`/api/qa/${encodeURIComponent(job.generated_asset_id)}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision, note: notes.value[job.job_id] ?? "" }),
    });
    await refresh();
  } catch (caught: any) {
    error.value = caught?.message ?? String(caught);
  } finally {
    busy.value = "";
  }
}

watch(currentSite, () => void refresh());
onMounted(async () => { await loadSites(); await refresh(); });
</script>

<template>
  <div class="v2-shell">
    <aside class="v2-sidebar">
      <div class="v2-brand"><div class="v2-brand-mark">VC</div><div><strong>视觉生产控制台</strong><span>V2 · 本地优先</span></div></div>
      <button class="v2-dashboard-link active-soft" @click="go('/v2')"><span class="v2-nav-icon">⌂</span><span>首页</span></button>
      <div class="v2-nav-scroll"></div>
      <div class="v2-sidebar-footer"><label>站点</label><select v-model="currentSite"><option v-for="site in sites" :key="site.site_id" :value="site.site_id">{{ site.display_name_zh || site.display_name }}</option></select></div>
    </aside>

    <main class="v2-main">
      <div class="v2-toolbar"><div class="v2-tabs"><button class="active">人工视觉审核</button></div></div>
      <section class="v2-content p2-cn-page">
        <div class="v2-page-head">
          <div><span class="v2-eyebrow">审核</span><h1>人工视觉审核</h1><p>生成成功不等于审核通过。只有在这里明确通过的结果，才能继续进入后续归档流程。</p></div>
          <div class="v2-head-actions"><button @click="refresh">↻ 刷新</button><button @click="filter = filter === 'PENDING' ? 'ALL' : 'PENDING'">{{ filter === 'PENDING' ? '查看全部记录' : '只看待审核' }}</button></div>
        </div>
        <div v-if="error" class="v2-alert"><b>审核数据暂不可用</b><span>{{ error }}</span></div>
        <div class="p2-cn-summary"><article><span>待审核</span><strong>{{ pendingCount }}</strong></article><article><span>全部审核记录</span><strong>{{ jobs.length }}</strong></article></div>
        <div v-if="rows.length" class="p2-review-grid">
          <article v-for="job in rows" :key="job.job_id" class="p2-review-card">
            <div class="p2-review-image"><img v-if="imageUrl(job)" :src="imageUrl(job)" :alt="job.generated_filename || job.item_id" /></div>
            <div class="p2-review-body">
              <div class="p2-review-title"><div><small>{{ job.workflow_code }}</small><h2>{{ job.item_id }}</h2></div><span :data-state="job.state">{{ job.state === 'QA_PENDING' ? '待审核' : job.state === 'QA_PASS' ? '已通过' : '未通过' }}</span></div>
              <p>{{ job.generated_filename ?? '生成素材' }}</p>
              <textarea v-model="notes[job.job_id]" rows="3" placeholder="审核备注（可选）"></textarea>
              <div class="p2-review-actions"><button :disabled="Boolean(busy)" @click="decide(job,'NOTE')">保存备注</button><button class="danger" :disabled="Boolean(busy)" @click="decide(job,'FAIL')">不通过</button><button class="primary" :disabled="Boolean(busy)" @click="decide(job,'PASS')">通过</button></div>
            </div>
          </article>
        </div>
        <div v-else class="v2-empty"><b>{{ loading ? '正在读取审核任务…' : '当前没有待审核项目' }}</b><span>新的生成结果进入 QA_PENDING 后会显示在这里。</span></div>
      </section>
    </main>
  </div>
</template>
