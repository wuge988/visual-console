<script setup lang="ts">
const steps = [
  ["01", "Capture", "Controlled multi-view capture"],
  ["02", "Frame QC", "Reject blur, reflections and unstable support"],
  ["03", "Wood-only Mask", "Keep reconstruction input piece-scoped"],
  ["04", "Reconstruction", "Replaceable reconstruction Engine Adapter"],
  ["05", "Mesh / Texture Cleanup", "Repair web-facing geometry and texture"],
  ["06", "Scale Calibration", "Bind model scale to measured Exact Piece"],
  ["07", "GLB / Web Asset", "Export a PDP-consumable derivative"],
  ["08", "3D QA", "Human/technical gate independent from execution success"],
  ["09", "Archive", "Register approved lineage before publication"],
] as const;

function go(path: string) {
  window.location.assign(path);
}
</script>

<template>
  <div class="v2-shell">
    <aside class="v2-sidebar">
      <div class="v2-brand">
        <div class="v2-brand-mark">VC</div>
        <div><strong>Visual Console</strong><span>V2 · LOCAL FIRST</span></div>
      </div>
      <button class="v2-dashboard-link active-soft" @click="go('/v2')"><span class="v2-nav-icon">⌂</span><span>首页</span></button>
      <div class="v2-nav-scroll"></div>
      <div class="v2-sidebar-footer">
        <div class="v2-runtime-mini"><span><i></i> 3D workflow</span><span>Not registered</span></div>
      </div>
    </aside>

    <main class="v2-main">
      <div class="v2-toolbar">
        <div class="v2-tabs"><button @click="go('/v2')">首页</button><button class="active">3D Models <span>×</span></button></div>
      </div>

      <section class="v2-content p2-three-d-content">
        <div class="v2-page-head">
          <div>
            <span class="v2-eyebrow">3D MODEL PIPELINE · P3-B PREPARATION</span>
            <h1>3D Models</h1>
            <p>3D is a parallel pipeline under the same Exact Piece / Job / QA / Asset / Archive truth. It is not a PDP release prerequisite.</p>
          </div>
          <div class="v2-head-actions"><span class="v2-preview-badge">NON-BLOCKING</span></div>
        </div>

        <div class="p2-three-d-banner">
          <div>
            <strong>No production 3D workflow is registered yet.</strong>
            <span>This surface is intentionally non-executable until one pilot SKU passes capture, reconstruction, scale and 3D QA gates.</span>
          </div>
          <div class="p2-three-d-badges">
            <span>PLANNED MVP</span>
            <span>PDP NON-BLOCKING</span>
            <span>NO SILENT FALLBACK</span>
          </div>
        </div>

        <div class="p2-three-d-flow">
          <article v-for="step in steps" :key="step[0]" class="p2-three-d-step">
            <small>{{ step[0] }}</small>
            <b>{{ step[1] }}</b>
            <span>{{ step[2] }}</span>
          </article>
        </div>

        <div class="p2-three-d-gate">
          <b>Release boundary</b>
          <p>Execution success cannot promote a model into formal Archive. 3D QA and provenance must pass independently, and approved 2D assets remain sufficient for PDP publication.</p>
        </div>
      </section>
    </main>
  </div>
</template>
