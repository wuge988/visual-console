<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

type Site = { site_id: string; display_name: string; display_name_zh: string };
type RawAsset = {
  asset_id: string;
  filename: string;
  kind: "image" | "video" | "file";
  mime: string;
  size_bytes: number;
  modified_at: string;
  content_url: string;
};

const health = ref<any>(null);
const sites = ref<Site[]>([]);
const currentSite = ref("drift-curio");
const sku = ref("DC-ZY-SZ-31001");
const mobileSession = ref<any>(null);
const assets = ref<RawAsset[]>([]);
const creatingSession = ref(false);
const loadingAssets = ref(false);
const trashing = ref(new Set<string>());
const toast = ref("");
let pollTimer: number | undefined;
let toastTimer: number | undefined;

const site = computed(() => sites.value.find((x) => x.site_id === currentSite.value));
const imageAssets = computed(() => assets.value.filter((x) => x.kind === "image"));
const videoAssets = computed(() => assets.value.filter((x) => x.kind === "video"));

function readable(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function showToast(message: string) {
  toast.value = message;
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast.value = ""; }, 2600);
}

async function refreshAssets() {
  if (!sku.value) return;
  loadingAssets.value = true;
  try {
    const url = `/api/items/${encodeURIComponent(currentSite.value)}/${encodeURIComponent(sku.value)}/raw-assets`;
    const r = await fetch(url);
    assets.value = r.ok ? await r.json() : [];
  } finally {
    loadingAssets.value = false;
  }
}

async function createMobileSession() {
  creatingSession.value = true;
  try {
    const r = await fetch("/api/mobile/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ site_id: currentSite.value, item_id: sku.value, sku: sku.value }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "SESSION_FAILED");
    mobileSession.value = j;
  } catch (e: any) {
    alert(`生成手机上传二维码失败：${e?.message ?? e}`);
  } finally {
    creatingSession.value = false;
  }
}

async function trashAsset(asset: RawAsset) {
  if (trashing.value.has(asset.asset_id)) return;
  trashing.value.add(asset.asset_id);
  trashing.value = new Set(trashing.value);
  try {
    const r = await fetch("/trash-api/assets/raw", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        site_id: currentSite.value,
        item_id: sku.value,
        asset_id: asset.asset_id,
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "TRASH_FAILED");
    assets.value = assets.value.filter((x) => x.asset_id !== asset.asset_id);
    showToast(`已移入回收区：${asset.filename}`);
  } catch (e: any) {
    showToast(`删除失败：${e?.message ?? e}`);
  } finally {
    trashing.value.delete(asset.asset_id);
    trashing.value = new Set(trashing.value);
  }
}

onMounted(async () => {
  health.value = await fetch("/api/health").then((r) => r.json()).catch(() => null);
  sites.value = await fetch("/api/sites").then((r) => r.json()).catch(() => []);
  await refreshAssets();
  pollTimer = window.setInterval(refreshAssets, 2500);
});

onUnmounted(() => {
  if (pollTimer) window.clearInterval(pollTimer);
  if (toastTimer) window.clearTimeout(toastTimer);
});
watch([sku, currentSite], () => { mobileSession.value = null; refreshAssets() });
</script>

<template>
  <div class="shell">
    <aside>
      <div class="brand"><strong>视觉生产控制台</strong><span>VISUAL CONSOLE</span></div>
      <nav>
        <button class="active">工作台</button>
        <button>工作流 <b>13</b></button>
        <button>任务队列 <b>0</b></button>
        <button>质量审核 <b>0</b></button>
        <button>素材资产 <b>{{ assets.length }}</b></button>
        <button>系统状态</button>
      </nav>
      <div class="system-card">
        <span>Local API</span><i>{{ health?.ok ? "在线" : "离线" }}</i>
        <span>LAN IP</span><i>{{ health?.lan_ip ?? "—" }}</i>
        <span>LAN 接口</span><i>{{ health?.lan_interface ?? "—" }}</i>
        <span>ComfyUI</span><i>下一阶段接入</i>
      </div>
    </aside>

    <main>
      <header>
        <b>视觉生产控制台</b>
        <div class="chips">
          <span>站点：{{ site?.display_name }} / {{ site?.display_name_zh }}</span>
          <span>{{ sku }}</span>
          <span class="ok">{{ health?.ok ? "● 本地引擎就绪" : "● 本地引擎离线" }}</span>
        </div>
      </header>

      <section>
        <div class="page-title">
          <div><em>生产工作台 · P1</em><h1>iPhone 直接采集到当前 SKU</h1><p>二维码绑定当前 Site + SKU；同一 SKU 当天继续拍摄可复用，切换 SKU 重新生成。</p></div>
        </div>

        <div class="top-grid">
          <article class="card">
            <h3>当前生产上下文</h3>
            <label>站点</label>
            <select v-model="currentSite"><option v-for="s in sites" :key="s.site_id" :value="s.site_id">{{ s.display_name }} / {{ s.display_name_zh }}</option></select>
            <label>当前 SKU / Item</label>
            <input v-model.trim="sku" />
            <div class="hint">手机端不会再次询问 SKU；所有上传会写入这里绑定的商品。</div>
          </article>

          <article class="card capture-card">
            <div class="capture-copy">
              <h3>手机采集</h3>
              <p>iPhone 16e 与电脑连接同一个 Wi‑Fi。默认 Session 有效 12 小时；重新生成同一 SKU 二维码时旧码自动失效。</p>
              <button class="primary" :disabled="creatingSession" @click="createMobileSession">{{ creatingSession ? "生成中…" : "生成手机上传二维码" }}</button>
            </div>
            <div class="qr-slot">
              <template v-if="mobileSession"><img :src="mobileSession.qr_data_url" alt="手机上传二维码" /><small>12 小时有效</small></template>
              <template v-else><div class="qr-empty">QR</div><small>等待生成</small></template>
            </div>
          </article>
        </div>

        <article v-if="mobileSession" class="mobile-link">
          <b>手机上传地址</b><code>{{ mobileSession.mobile_url }}</code><span>{{ mobileSession.lan_interface }} · {{ mobileSession.lan_ip }} · 绑定 {{ mobileSession.item_id }}</span>
        </article>

        <div class="asset-heading">
          <div><h2>当前 SKU · 原始素材</h2><p>单击素材右上角 × 会立即移入站点回收区，不弹确认框。</p></div>
          <div class="summary"><span><b>{{ assets.length }}</b> 全部</span><span><b>{{ imageAssets.length }}</b> 图片</span><span><b>{{ videoAssets.length }}</b> 视频</span></div>
        </div>

        <div v-if="assets.length" class="asset-grid">
          <article v-for="asset in assets" :key="asset.asset_id" class="asset-tile">
            <div class="media">
              <img v-if="asset.kind === 'image' && !/hei[cf]/i.test(asset.mime)" :src="asset.content_url" :alt="asset.filename" />
              <video v-else-if="asset.kind === 'video'" :src="asset.content_url" muted playsinline preload="metadata"></video>
              <div v-else class="placeholder">{{ /hei[cf]/i.test(asset.mime) ? "HEIC" : "FILE" }}</div>
              <span class="kind">{{ asset.kind === "video" ? "VIDEO" : "RAW" }}</span>
              <button
                class="trash-btn"
                :disabled="trashing.has(asset.asset_id)"
                :title="trashing.has(asset.asset_id) ? '正在移入回收区' : '移入回收区'"
                :aria-label="`移入回收区：${asset.filename}`"
                @click.stop="trashAsset(asset)"
              >{{ trashing.has(asset.asset_id) ? "…" : "×" }}</button>
            </div>
            <div class="meta"><b :title="asset.filename">{{ asset.filename }}</b><span>{{ readable(asset.size_bytes) }}</span></div>
          </article>
        </div>

        <div v-else class="empty"><b>{{ loadingAssets ? "正在读取素材…" : "当前 SKU 还没有手机上传素材" }}</b><span>生成二维码后，用 iPhone 拍一张照片测试。</span></div>
      </section>
    </main>
    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>
